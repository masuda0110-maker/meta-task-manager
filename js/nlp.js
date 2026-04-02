/* ============================================================
   nlp.js — Natural Language Parser for Quick Task Entry
   ============================================================ */
const NLP = {
  PRIORITY_MAP: { 'p1': 'P1', 'p2': 'P2', 'p3': 'P3', 'p4': 'P4',
                  '最重要': 'P1', '緊急': 'P1', '重要': 'P2' },
  RECUR_MAP: {
    '毎日': 'daily', 'daily': 'daily',
    '平日': 'weekday', '平日毎日': 'weekday', 'weekday': 'weekday',
    '毎週': 'weekly', 'weekly': 'weekly',
    '毎月': 'monthly', 'monthly': 'monthly',
    '毎週月曜': 'weekly_mon', '毎週火曜': 'weekly_tue',
    '毎週水曜': 'weekly_wed', '毎週木曜': 'weekly_thu',
    '毎週金曜': 'weekly_fri',
  },

  parse(text) {
    const result = {
      title: text,
      priority: 'P4',
      due_date: null,
      project_name: null,
      estimated_minutes: null,
      recurrence_rule: null,
      is_recurring: false,
      tags: []
    };

    let t = text;

    // ---- Priority: P1~P4 ----
    const prioMatch = t.match(/\b(p[1-4]|P[1-4]|最重要|緊急|重要)\b/i);
    if (prioMatch) {
      const key = prioMatch[1].toLowerCase();
      result.priority = this.PRIORITY_MAP[key] || this.PRIORITY_MAP[prioMatch[1]] || 'P4';
      t = t.replace(prioMatch[0], '').trim();
    }

    // ---- Project: #名前 ----
    const projMatch = t.match(/#([\w\u3040-\u9fff]+)/);
    if (projMatch) {
      result.project_name = projMatch[1];
      t = t.replace(projMatch[0], '').trim();
    }

    // ---- Estimate: 数字+分/時間 ----
    const estMatch = t.match(/(\d+)\s*(分|時間|h|min|hour)/);
    if (estMatch) {
      let mins = parseInt(estMatch[1]);
      if (estMatch[2] === '時間' || estMatch[2] === 'h' || estMatch[2] === 'hour') mins *= 60;
      result.estimated_minutes = mins;
      t = t.replace(estMatch[0], '').trim();
    }

    // ---- Recurrence ----
    for (const [kw, val] of Object.entries(this.RECUR_MAP)) {
      if (t.includes(kw)) {
        result.recurrence_rule = val;
        result.is_recurring = true;
        t = t.replace(kw, '').trim();
        break;
      }
    }

    // ---- Date/Time ----
    const now = new Date();
    // 今日
    if (/今日|本日|today/i.test(t)) {
      const d = new Date(); d.setHours(9, 0, 0, 0);
      result.due_date = d.toISOString();
      t = t.replace(/今日|本日|today/i, '').trim();
    }
    // 明日
    else if (/明日|あした|tomorrow/i.test(t)) {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
      result.due_date = d.toISOString();
      t = t.replace(/明日|あした|tomorrow/i, '').trim();
    }
    // 来週
    else if (/来週|らいしゅう|next week/i.test(t)) {
      const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0);
      result.due_date = d.toISOString();
      t = t.replace(/来週|らいしゅう|next week/i, '').trim();
    }
    // 月火水木金土日 + 曜日
    const weekdayMatch = t.match(/(月|火|水|木|金|土|日)曜/);
    if (weekdayMatch && !result.due_date) {
      const wdMap = { '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6, '日': 0 };
      const targetWd = wdMap[weekdayMatch[1]];
      const d = new Date();
      const diff = (targetWd - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff); d.setHours(9, 0, 0, 0);
      result.due_date = d.toISOString();
      t = t.replace(weekdayMatch[0], '').trim();
    }
    // HH:MM
    const timeMatch = t.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const base = result.due_date ? new Date(result.due_date) : new Date();
      base.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
      result.due_date = base.toISOString();
      t = t.replace(timeMatch[0], '').trim();
    }
    // N時
    const hourMatch = t.match(/(\d{1,2})時/);
    if (hourMatch && !timeMatch) {
      const base = result.due_date ? new Date(result.due_date) : new Date();
      base.setHours(parseInt(hourMatch[1]), 0, 0, 0);
      result.due_date = base.toISOString();
      t = t.replace(hourMatch[0], '').trim();
    }
    // M月D日
    const mdMatch = t.match(/(\d{1,2})月(\d{1,2})日/);
    if (mdMatch) {
      const d = new Date(now.getFullYear(), parseInt(mdMatch[1]) - 1, parseInt(mdMatch[2]), 9, 0, 0);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      result.due_date = d.toISOString();
      t = t.replace(mdMatch[0], '').trim();
    }

    // ---- Title clean-up ----
    result.title = t.replace(/\s+/g, ' ').trim() || text;

    return result;
  },

  formatPreview(parsed) {
    const tags = [];
    if (parsed.priority && parsed.priority !== 'P4')
      tags.push({ cls: 'priority', icon: 'flag', text: parsed.priority });
    if (parsed.due_date)
      tags.push({ cls: 'date', icon: 'calendar', text: this.formatDate(new Date(parsed.due_date)) });
    if (parsed.project_name)
      tags.push({ cls: 'project', icon: 'folder', text: parsed.project_name });
    if (parsed.estimated_minutes)
      tags.push({ cls: 'time', icon: 'clock', text: parsed.estimated_minutes + '分' });
    if (parsed.is_recurring)
      tags.push({ cls: 'time', icon: 'redo', text: parsed.recurrence_rule });
    return tags;
  },

  formatDate(d) {
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === now.toDateString()) return `今日 ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    if (d.toDateString() === tomorrow.toDateString()) return `明日 ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
};
