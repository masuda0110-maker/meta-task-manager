/* ============================================================
   ui.js — UI utilities: modals, toasts, project nav, integration
   ============================================================ */
const UI = {
  PROJECT_COLORS: ['#2563eb','#d97706','#059669','#dc2626','#7c3aed','#ea580c','#0891b2','#db2777'],

  /* ---- Modal ---- */
  openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); },
  closeModal(id) { document.getElementById(id)?.classList.add('hidden'); },

  /* ---- Toast ---- */
  toast(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' };
    el.innerHTML = `<i class="fas fa-${icons[type]||'info-circle'}" style="color:${type==='success'?'var(--success)':type==='error'?'var(--p1)':'var(--p3)'}"></i><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), duration);
  },

  /* ---- Project Nav ---- */
  renderProjectNav() {
    const list = document.getElementById('projectNavList');
    list.innerHTML = '';
    Store.projects.forEach(p => {
      const li = document.createElement('li');
      const count = Store.getTasksByProject(p.id).length;
      li.innerHTML = `<a href="#" class="nav-item" data-view="project" data-project="${p.id}">
        <span class="project-nav-dot" style="background:${p.color||'#7c3aed'}"></span>
        <span style="flex:1">${Tasks.escHtml(p.name)}</span>
        ${count > 0 ? `<span class="nav-badge" style="background:${p.color||'#7c3aed'}">${count}</span>` : ''}
      </a>`;
      li.querySelector('a').addEventListener('click', e => {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        li.querySelector('a').classList.add('active');
        App.switchView('project', p.id);
      });
      list.appendChild(li);
    });
  },

  updateBadges() {
    const badge = document.getElementById('todayBadge');
    const count = Store.getTodayTasks().length;
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
    document.getElementById('streakCount').textContent = Store.computeStreak();
  },

  randomColor() {
    return this.PROJECT_COLORS[Math.floor(Math.random() * this.PROJECT_COLORS.length)];
  },

  /* ---- Project Modal ---- */
  openProjectModal(editId = null) {
    const project = editId ? Store.getProjectById(editId) : null;
    document.getElementById('projectModalTitle').innerHTML =
      `<i class="fas fa-folder-plus"></i> ${project ? 'プロジェクト編集' : 'プロジェクト作成'}`;
    document.getElementById('pmName').value = project?.name || '';

    // Color picker
    const cp = document.getElementById('pmColorPicker');
    cp.innerHTML = '';
    this.PROJECT_COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = `color-swatch ${(project?.color || this.PROJECT_COLORS[0]) === c ? 'selected' : ''}`;
      sw.style.background = c;
      sw.addEventListener('click', () => {
        cp.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
      });
      cp.appendChild(sw);
    });

    document.getElementById('projectSaveBtn').onclick = async () => {
      const name = document.getElementById('pmName').value.trim();
      if (!name) { this.toast('プロジェクト名を入力してください', 'error'); return; }
      const color = cp.querySelector('.color-swatch.selected')?.style.background || this.PROJECT_COLORS[0];
      if (editId) await Store.updateProject(editId, { name, color });
      else await Store.addProject({ name, color });
      this.closeModal('projectModal');
      this.renderProjectNav();
      this.toast(editId ? 'プロジェクトを更新しました' : 'プロジェクトを作成しました', 'success');
    };

    this.openModal('projectModal');
  },

  /* ---- Quick Add Modal ---- */
  openQuickAdd() {
    const input = document.getElementById('quickAddInput');
    input.value = '';
    document.getElementById('quickParsePreview').innerHTML = '';

    // Priority buttons
    let selectedPriority = 'P3';
    document.querySelectorAll('.qa-prio-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.prio === selectedPriority);
      btn.onclick = () => {
        selectedPriority = btn.dataset.prio;
        document.querySelectorAll('.qa-prio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });

    // Fill selects
    document.getElementById('qaProject').innerHTML =
      '<option value="">なし</option>' + Store.projects.map(p =>
        `<option value="${p.id}">${Tasks.escHtml(p.name)}</option>`).join('');

    input.addEventListener('input', () => {
      const parsed = NLP.parse(input.value);
      const tags = NLP.formatPreview(parsed);
      document.getElementById('quickParsePreview').innerHTML = tags.map(t =>
        `<span class="parse-tag ${t.cls}"><i class="fas fa-${t.icon}"></i> ${t.text}</span>`
      ).join('') || '<span style="color:var(--text-muted);font-size:.78rem">入力すると自動解析します…</span>';
    });

    document.getElementById('quickAddSubmit').onclick = async () => {
      const raw = input.value.trim();
      if (!raw) { this.toast('タスク名を入力してください', 'error'); return; }

      const parsed = NLP.parse(raw);
      let project_id = document.getElementById('qaProject').value || null;
      if (parsed.project_name && !project_id) {
        const existing = Store.projects.find(p => p.name === parsed.project_name);
        if (existing) project_id = existing.id;
        else {
          const np = await Store.addProject({ name: parsed.project_name, color: this.randomColor() });
          project_id = np.id;
          this.renderProjectNav();
        }
      }

      const dueVal = document.getElementById('qaDueDate').value;
      const recurVal = document.getElementById('qaRecur').value;

      await Store.addTask({
        title: parsed.title,
        priority: parsed.priority || selectedPriority,
        due_date: dueVal ? new Date(dueVal).toISOString() : parsed.due_date,
        project_id,
        estimated_minutes: parseInt(document.getElementById('qaEstimate').value) || parsed.estimated_minutes,
        is_recurring: !!recurVal || parsed.is_recurring,
        recurrence_rule: recurVal || parsed.recurrence_rule,
        subtasks: [], tags: [], description: ''
      });

      this.closeModal('quickAddModal');
      App.refreshCurrentView();
      this.updateBadges();
      this.toast('タスクを追加しました', 'success');
      input.value = '';
    };

    this.openModal('quickAddModal');
    setTimeout(() => input.focus(), 100);
  },

  /* ---- Settings Modal ---- */
  openSettings() {
    document.getElementById('slackWebhook').value   = Store.settings.slackWebhook || '';
    document.getElementById('morningTime').value    = Store.settings.morningTime  || '08:00';
    document.getElementById('eveningTime').value    = Store.settings.eveningTime  || '21:00';
    document.getElementById('settingsName').value   = Store.settings.userName    || '';
    document.getElementById('claudeModel').value    = Store.settings.claudeModel || 'claude-sonnet-4-6';

    // 接続テストステータス
    const statusEl = document.getElementById('claudeStatus');
    statusEl.style.display = 'none';

    document.getElementById('settingsSaveBtn').onclick = async () => {
      Store.settings = {
        ...Store.settings,
        slackWebhook: document.getElementById('slackWebhook').value.trim(),
        morningTime:  document.getElementById('morningTime').value,
        eveningTime:  document.getElementById('eveningTime').value,
        userName:     document.getElementById('settingsName').value.trim(),
        claudeModel:  document.getElementById('claudeModel').value,
      };
      await Store.saveSettings();

      // 接続テスト
      statusEl.style.display = '';
      statusEl.style.background = 'rgba(59,130,246,0.12)';
      statusEl.style.color = 'var(--p3)';
      statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Claude APIに接続確認中…';
      const ok = await ClaudeAI.testConnection();
      if (ok) {
        statusEl.style.background = 'rgba(16,185,129,0.12)';
        statusEl.style.color = 'var(--success)';
        statusEl.innerHTML = '<i class="fas fa-check-circle"></i> 接続成功！AIコーチがClaudeで動作します';
      } else {
        statusEl.style.background = 'rgba(233,69,96,0.12)';
        statusEl.style.color = 'var(--p1)';
        statusEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> 接続失敗。Vercelの環境変数を確認してください';
        this.closeModal('settingsModal');
      }

      Briefing.renderGreeting();
      this.toast('設定を保存しました', 'success');
    };

    this.openModal('settingsModal');
  }
};

/* ---- Integration: Calendar / Slack ---- */
const Integration = {
  currentTaskId: null,

  openCalendar(taskId) {
    const task = Store.tasks.find(t => t.id === taskId);
    if (!task) return;
    this.currentTaskId = taskId;

    const title = encodeURIComponent(task.title);
    const start = task.due_date ? new Date(task.due_date) : new Date();
    const end   = new Date(start.getTime() + (task.estimated_minutes || 60) * 60000);
    const fmt   = d => d.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';

    document.getElementById('integrationModalTitle').innerHTML =
      `<i class="fas fa-calendar-plus" style="color:#4285f4"></i> カレンダー連携`;
    document.getElementById('integrationModalBody').innerHTML = `
      <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:1rem">
        <strong>${Tasks.escHtml(task.title)}</strong> をカレンダーに登録します
      </p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(task.description||'')}"
           target="_blank" class="btn-primary" style="justify-content:center;text-decoration:none">
          <i class="fab fa-google"></i> Googleカレンダーに追加
        </a>
        <button class="btn-ghost" id="outlookCalBtn" style="justify-content:center">
          <i class="fas fa-calendar"></i> Outlookに追加（ICS）
        </button>
      </div>
    `;

    document.getElementById('outlookCalBtn').onclick = () => {
      const ics = this.generateICS(task);
      const blob = new Blob([ics], { type: 'text/calendar' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a'); a.href = url; a.download = 'task.ics'; a.click();
      URL.revokeObjectURL(url);
    };

    document.getElementById('integrationConfirmBtn').style.display = 'none';
    UI.openModal('integrationModal');
  },

  generateICS(task) {
    const now   = new Date();
    const start = task.due_date ? new Date(task.due_date) : now;
    const end   = new Date(start.getTime() + (task.estimated_minutes || 60) * 60000);
    const fmt   = d => d.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
    return [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Meta-Task Manager//EN',
      'BEGIN:VEVENT',
      `UID:${task.id}@metatask`,
      `DTSTAMP:${fmt(now)}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${task.title}`,
      `DESCRIPTION:${task.description || ''}`,
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n');
  },

  openSlack(taskId) {
    const task = Store.tasks.find(t => t.id === taskId);
    if (!task) return;
    this.currentTaskId = taskId;

    const webhook = Store.settings.slackWebhook;
    document.getElementById('integrationModalTitle').innerHTML =
      `<i class="fab fa-slack" style="color:#4a154b"></i> Slack通知`;

    if (!webhook) {
      document.getElementById('integrationModalBody').innerHTML = `
        <p style="font-size:.85rem;color:var(--text-secondary)">
          Slack Webhook URLが設定されていません。<br>
          <strong>設定ボタン</strong>からWebhook URLを登録してください。
        </p>
        <button class="btn-primary" id="goToSettingsBtn" style="margin-top:1rem">
          <i class="fas fa-cog"></i> 設定を開く
        </button>`;
      document.getElementById('goToSettingsBtn').onclick = () => {
        UI.closeModal('integrationModal');
        UI.openSettings();
      };
      document.getElementById('integrationConfirmBtn').style.display = 'none';
      UI.openModal('integrationModal');
      return;
    }

    const prio = task.priority || 'P4';
    const prioEmoji = { P1: '🔴', P2: '🟡', P3: '🔵', P4: '⚪' };
    const dueStr = task.due_date ? new Date(task.due_date).toLocaleString('ja-JP') : '未設定';

    document.getElementById('integrationModalBody').innerHTML = `
      <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:1rem">以下のメッセージをSlackに送信します：</p>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:.9rem;font-size:.82rem;line-height:1.6">
        ${prioEmoji[prio]} <strong>${Tasks.escHtml(task.title)}</strong><br>
        優先度: ${prio} | 期日: ${dueStr}
        ${task.estimated_minutes ? ` | 見積もり: ${task.estimated_minutes}分` : ''}
      </div>`;

    document.getElementById('integrationConfirmBtn').style.display = '';
    document.getElementById('integrationConfirmBtn').textContent = '送信';
    document.getElementById('integrationConfirmBtn').onclick = () => {
      this.sendSlackMessage(task);
      UI.closeModal('integrationModal');
    };

    UI.openModal('integrationModal');
  },

  async sendSlackMessage(task) {
    const webhook = Store.settings.slackWebhook;
    if (!webhook) { UI.toast('Webhook URLが未設定です', 'error'); return; }
    const prioEmoji = { P1: '🔴', P2: '🟡', P3: '🔵', P4: '⚪' };
    const prio = task.priority || 'P4';
    const dueStr = task.due_date ? new Date(task.due_date).toLocaleString('ja-JP') : '未設定';
    const text = `${prioEmoji[prio]} *${task.title}*\n優先度: ${prio} | 期日: ${dueStr}${task.estimated_minutes ? ` | 見積もり: ${task.estimated_minutes}分` : ''}`;
    try {
      await fetch(webhook, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      UI.toast('Slackに送信しました', 'success');
    } catch {
      UI.toast('Slack送信に失敗しました', 'error');
    }
  },

  async sendDailyBriefing(type) {
    const webhook = Store.settings.slackWebhook;
    if (!webhook) { UI.toast('Webhook URLが未設定です', 'error'); return; }

    let text = '';
    if (type === 'morning') {
      const p1 = Store.getTodayTasks().filter(t => t.priority === 'P1');
      const overdue = Store.getOverdueTasks();
      text = `☀️ *おはようございます！今日のデイリーブリーフィング*\n\n`;
      if (p1.length) text += `🔴 *P1タスク（${p1.length}件）:*\n${p1.map(t => `• ${t.title}`).join('\n')}\n\n`;
      if (overdue.length) text += `🚨 *期限切れ（${overdue.length}件）:*\n${overdue.slice(0,3).map(t => `• ${t.title}`).join('\n')}\n\n`;
      text += `_Meta-Task Manager より_`;
    } else {
      const done = Store.getTodayCompleted();
      const pending = Store.getTodayTasks();
      text = `🌙 *お疲れ様でした！今日のサマリー*\n\n`;
      text += `✅ 完了: ${done.length}件\n⏳ 持ち越し: ${pending.length}件\n\n`;
      if (done.length) text += `*完了タスク:*\n${done.slice(0,5).map(t => `• ✅ ${t.title}`).join('\n')}\n\n`;
      text += `💭 _今日の振り返りをAIコーチと行いましょう_\n_Meta-Task Manager より_`;
    }

    try {
      await fetch(webhook, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      UI.toast('Slackに送信しました', 'success');
    } catch {
      UI.toast('Slack送信に失敗しました', 'error');
    }
  }
};
