/* ============================================================
   briefing.js — Morning / Evening Briefing Engine
   Task × Challenge × NEXT Task extraction
   ============================================================ */
const Briefing = {
  currentTab: 'morning',

  init() {
    document.getElementById('tabMorning').addEventListener('click', () => this.switchTab('morning'));
    document.getElementById('tabEvening').addEventListener('click', () => this.switchTab('evening'));

    document.getElementById('startMorningCoach').addEventListener('click', () => Coach.openWithMode('morning'));
    document.getElementById('startEveningCoach').addEventListener('click', () => Coach.openWithMode('evening'));

    this.render();
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.brief-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(tab === 'morning' ? 'tabMorning' : 'tabEvening').classList.add('active');
    document.getElementById('panelMorning').classList.toggle('hidden', tab !== 'morning');
    document.getElementById('panelEvening').classList.toggle('hidden', tab !== 'evening');
  },

  render() {
    this.renderGreeting();
    this.renderMorning();
    this.renderEvening();

    // Auto-detect morning/evening
    const hour = new Date().getHours();
    if (hour >= 17) this.switchTab('evening');
    else this.switchTab('morning');
  },

  renderGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const name = Store.settings.userName || 'あなた';
    let greeting = '';
    if (hour < 5)       greeting = `おやすみなさい、${name}さん 🌙`;
    else if (hour < 12) greeting = `おはようございます、${name}さん ☀️`;
    else if (hour < 17) greeting = `こんにちは、${name}さん 🌤`;
    else                greeting = `お疲れ様です、${name}さん 🌇`;

    document.getElementById('briefingGreeting').textContent = greeting;

    const days = ['日','月','火','水','木','金','土'];
    document.getElementById('briefingDate').textContent =
      `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${days[now.getDay()]}）`;

    document.getElementById('streakCount').textContent = Store.computeStreak();
  },

  /* ========== MORNING ========== */
  renderMorning() {
    this.renderMorningP1Tasks();
    this.renderChallenges();
    this.renderMorningNextTasks();
  },

  renderMorningP1Tasks() {
    const el = document.getElementById('morningP1Tasks');
    const overdue = Store.getOverdueTasks().filter(t => t.priority === 'P1');
    const today   = Store.getTodayTasks().filter(t => t.priority === 'P1');
    const tasks   = [...overdue, ...today].slice(0, 5);

    if (!tasks.length) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:.83rem;padding:.4rem 0">
        <i class="fas fa-check-circle text-success"></i> P1タスクはありません（またはまだ設定されていません）
      </div>`;
      return;
    }

    el.innerHTML = tasks.map(t => {
      const isOverdue = t.due_date && new Date(t.due_date) < new Date(new Date().setHours(0,0,0,0));
      return `<div class="brief-task-item P1">
        <span class="p-dot p1"></span>
        <span style="flex:1">${Tasks.escHtml(t.title)}</span>
        ${isOverdue ? '<span style="color:var(--p1);font-size:.7rem">期限切れ</span>' : ''}
        ${t.estimated_minutes ? `<span style="color:var(--text-muted);font-size:.73rem"><i class="fas fa-clock"></i> ${t.estimated_minutes}分</span>` : ''}
      </div>`;
    }).join('');
  },

  renderChallenges() {
    const el = document.getElementById('morningChallenges');
    const challenges = this.analyzeChallenges();

    if (!challenges.length) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:.83rem;padding:.4rem 0">
        <i class="fas fa-thumbs-up text-success"></i> 現在、特に深刻な課題は見当たりません。この調子で！
      </div>`;
      return;
    }

    el.innerHTML = challenges.map(c =>
      `<div class="challenge-item"><i class="fas fa-exclamation-triangle"></i><span>${c}</span></div>`
    ).join('');
  },

  analyzeChallenges() {
    const challenges = [];
    const overdue = Store.getOverdueTasks();
    if (overdue.length > 0)
      challenges.push(`期限切れタスクが <strong>${overdue.length}件</strong> あります。優先して対処しましょう。`);

    const todayTasks = Store.getTodayTasks();
    const p1Count = todayTasks.filter(t => t.priority === 'P1').length;
    if (p1Count > 3)
      challenges.push(`今日のP1タスクが <strong>${p1Count}件</strong> あります。3件以下に絞ることを検討しましょう。`);

    const upcoming3 = Store.getUpcomingTasks(3);
    const nearP1 = upcoming3.filter(t => t.priority === 'P1').length;
    if (nearP1 > 0)
      challenges.push(`3日以内にP1タスクが <strong>${nearP1}件</strong> 期限を迎えます。今から准備を始めましょう。`);

    const allIncomplete = Store.tasks.filter(t => !t.is_completed);
    const p4ratio = allIncomplete.filter(t => t.priority === 'P4').length / (allIncomplete.length || 1);
    if (allIncomplete.length > 5 && p4ratio > 0.5)
      challenges.push(`未完了タスクの半数以上がP4です。優先度を見直し、本当に重要なタスクに集中しましょう。`);

    return challenges.slice(0, 4);
  },

  renderMorningNextTasks() {
    const el = document.getElementById('morningNextTasks');
    const nexts = this.computeNextTasks('morning');
    this.renderNextTaskList(el, nexts);
  },

  /* ========== EVENING ========== */
  renderEvening() {
    this.renderEveningCompleted();
    this.renderEveningPending();
    this.renderEveningNextTasks();
  },

  renderEveningCompleted() {
    const el = document.getElementById('eveningCompleted');
    const tasks = Store.getTodayCompleted();
    if (!tasks.length) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:.83rem">まだ今日の完了タスクはありません</div>`;
      return;
    }
    el.innerHTML = tasks.map(t => {
      const prio = t.priority || 'P4';
      return `<div class="brief-task-item ${prio}">
        <i class="fas fa-check-circle text-success"></i>
        <span style="flex:1">${Tasks.escHtml(t.title)}</span>
        <span class="task-priority-label ${prio}" style="font-size:.68rem">${prio}</span>
      </div>`;
    }).join('');
  },

  renderEveningPending() {
    const el = document.getElementById('eveningPending');
    const today  = Store.getTodayTasks();
    const overdue = Store.getOverdueTasks();
    const tasks = [...overdue, ...today].slice(0, 5);
    if (!tasks.length) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:.83rem">
        <i class="fas fa-check-circle text-success"></i> 今日のタスクはすべて完了しています！
      </div>`;
      return;
    }
    el.innerHTML = tasks.map(t => {
      const isOverdue = t.due_date && new Date(t.due_date) < new Date(new Date().setHours(0,0,0,0));
      const prio = t.priority || 'P4';
      return `<div class="brief-task-item ${prio}">
        <span class="p-dot ${prio.toLowerCase()}"></span>
        <span style="flex:1">${Tasks.escHtml(t.title)}</span>
        ${isOverdue ? '<span style="color:var(--p1);font-size:.7rem">期限切れ</span>' : '<span style="color:var(--text-muted);font-size:.7rem">持ち越し</span>'}
      </div>`;
    }).join('');
  },

  renderEveningNextTasks() {
    const el = document.getElementById('eveningNextTasks');
    const nexts = this.computeNextTasks('evening');
    this.renderNextTaskList(el, nexts);
  },

  /* ---- NEXT Task Engine ---- */
  computeNextTasks(period) {
    const results = [];
    const pMap = { P1: 0, P2: 1, P3: 2, P4: 3 };

    // 1. Overdue P1/P2
    Store.getOverdueTasks()
      .filter(t => t.priority === 'P1' || t.priority === 'P2')
      .slice(0, 2)
      .forEach(t => results.push({ ...t, reason: '期限切れ・最優先' }));

    // 2. Today's pending P1
    if (period === 'evening') {
      Store.getTodayTasks()
        .filter(t => t.priority === 'P1')
        .slice(0, 2)
        .forEach(t => results.push({ ...t, reason: '今日のP1（明日へ）' }));
    }

    // 4. Upcoming high priority
    Store.getUpcomingTasks(3)
      .filter(t => t.priority === 'P1' || t.priority === 'P2')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 2)
      .forEach(t => results.push({ ...t, reason: '期限が近い' }));

    // Deduplicate
    const seen = new Set();
    return results.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id); return true;
    }).slice(0, 4);
  },

  renderNextTaskList(el, tasks) {
    if (!tasks.length) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:.83rem">
        <i class="fas fa-star text-success"></i> 緊急のネクストタスクはありません。近日予定ビューを確認しましょう！
      </div>`;
      return;
    }
    const pColors = { P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)', P4: 'var(--p4)' };
    el.innerHTML = tasks.map(t => `
      <div class="next-task-item">
        <span class="priority-dot" style="background:${pColors[t.priority]||'var(--p4)'}"></span>
        <div style="flex:1">
          <div style="font-size:.85rem;font-weight:500">${Tasks.escHtml(t.title)}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">${t.reason}</div>
        </div>
        <span class="task-priority-label ${t.priority}" style="font-size:.68rem">${t.priority}</span>
      </div>`).join('');
  }
};
