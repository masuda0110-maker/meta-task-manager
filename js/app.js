/* ============================================================
   app.js — Main App Controller (routing, events, init)
   ============================================================ */
const App = {
  currentView: 'briefing',
  currentProjectId: null,

  async init() {
    try {
      this.showSplash();

      // ---- Supabase セッション復元 ----
      let sessionOk = false;
      try { sessionOk = await SB.restoreSession(); } catch(e) { sessionOk = false; }

      if (!sessionOk) {
        // 未ログイン → 認証モーダルを表示
        this.hideSplash();
        Auth.openModal();
        return; // Auth.onLogin() から startApp() が呼ばれる
      }

      await this.startApp();
    } catch(err) {
      console.error('init error:', err);
      this.hideSplash();
      Auth.openModal();
    }
  },

  async startApp() {
    try {
      this.showSplash();

      // サイドバー・メインコンテンツを表示
      const sidebar = document.getElementById('sidebar');
      const main    = document.getElementById('mainContent');
      if (sidebar) sidebar.style.display = '';
      if (main)    main.style.display    = '';

      // モバイルヘッダーを表示し、ハンバーガーを初期化
      const mobileHeader = document.getElementById('mobileHeader');
      if (mobileHeader) mobileHeader.style.display = '';
      this.initMobileMenu();

      await Store.init();
      await this.seedDemoData();
      this.setupEventListeners();
      this.switchView('briefing');
      UI.renderProjectNav();
      UI.updateBadges();
      try { Coach.init(); } catch(e) { console.warn('Coach.init error:', e); }
      try { Briefing.init(); } catch(e) { console.warn('Briefing.init error:', e); }
      try { MetaCog.init(); } catch(e) { console.warn('MetaCog.init error:', e); }
      this.setupSlackScheduler();
      this.updateMetaCogBadge();
      this.updateUserDisplay();
      this.hideSplash();
    } catch(err) {
      console.error('startApp error:', err);
      this.hideSplash();
      // エラーでもUIは表示する
      const sidebar = document.getElementById('sidebar');
      const main    = document.getElementById('mainContent');
      if (sidebar) sidebar.style.display = '';
      if (main)    main.style.display    = '';
    }
  },

  updateUserDisplay() {
    const nameEl   = document.getElementById('userNameDisplay');
    const logoutEl = document.getElementById('logoutBtn');
    const avatarEl = document.getElementById('userAvatar');
    if (SB.isLoggedIn) {
      const email = SB.userEmail;
      const name  = Store.settings.userName || email.split('@')[0];
      if (nameEl)   nameEl.textContent = name;
      if (logoutEl) logoutEl.style.display = '';
      if (avatarEl) avatarEl.style.background = 'linear-gradient(135deg,#2563eb,#7c3aed)';
    } else {
      if (nameEl)   nameEl.textContent = Store.settings.userName || 'あなた';
      if (logoutEl) logoutEl.style.display = 'none';
    }
  },

  showSplash() {
    const splash = document.createElement('div');
    splash.id = 'splash';
    splash.style.cssText = `position:fixed;inset:0;background:#1e2d4e;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;gap:16px`;
    splash.innerHTML = `
      <div style="width:60px;height:60px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;box-shadow:0 8px 24px rgba(37,99,235,0.5)">🧠</div>
      <div style="font-size:1.3rem;font-weight:700;color:#ffffff;letter-spacing:-.3px">Meta-Task Manager</div>
      <div style="font-size:.82rem;color:rgba(255,255,255,0.45)">データを読み込んでいます…</div>
      <div style="width:200px;height:3px;background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;margin-top:8px">
        <div id="splashBar" style="width:0%;height:100%;background:linear-gradient(90deg,#2563eb,#7c3aed);border-radius:2px;transition:width .8s ease"></div>
      </div>`;
    document.body.appendChild(splash);
    setTimeout(() => { const b = document.getElementById('splashBar'); if(b) b.style.width='100%'; }, 100);
  },

  hideSplash() {
    const splash = document.getElementById('splash');
    if (splash) {
      splash.style.opacity = '0'; splash.style.transition = 'opacity .3s';
      setTimeout(() => splash.remove(), 300);
    }
  },

  /* ---- Demo seed (only if empty) ---- */
  async seedDemoData() {
    const hasReflections = Store.reflections.length > 0;
    if (Store.tasks.length) {
      // タスクはあるが振り返りログがない場合はサンプル振り返りのみ追加
      if (!hasReflections) await this._seedDemoReflections();
      return;
    }

    // Projects
    const proj1 = await Store.addProject({ name: '仕事', color: '#3b82f6' });
    const proj2 = await Store.addProject({ name: '営業', color: '#f59e0b' });
    const proj3 = await Store.addProject({ name: '個人', color: '#10b981' });

    // Tasks
    const now = new Date();
    const today = new Date(now); today.setHours(10, 0, 0, 0);
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1); tomorrow.setHours(14,0,0,0);
    const yesterday = new Date(now); yesterday.setDate(now.getDate()-1); yesterday.setHours(9,0,0,0);
    const nextWeek = new Date(now); nextWeek.setDate(now.getDate()+5); nextWeek.setHours(10,0,0,0);

    await Store.addTask({ title: 'MVP機能フレームワーク設計', priority: 'P1', due_date: today.toISOString(), project_id: proj1.id, estimated_minutes: 90, is_recurring: false, recurrence_rule: null, subtasks: [{title:'要件定義書確認',done:true},{title:'技術スタック選定',done:false}], tags: [], description: '' });
    await Store.addTask({ title: '新規顧客へのプレゼン資料作成', priority: 'P1', due_date: today.toISOString(), project_id: proj2.id, estimated_minutes: 120, is_recurring: false, recurrence_rule: null, subtasks: [], tags: [], description: '' });
    await Store.addTask({ title: 'ユーザーインタビュー準備', priority: 'P2', due_date: tomorrow.toISOString(), project_id: proj1.id, estimated_minutes: 60, is_recurring: false, recurrence_rule: null, subtasks: [], tags: [], description: '' });
    await Store.addTask({ title: 'Q2営業戦略MTG', priority: 'P2', due_date: tomorrow.toISOString(), project_id: proj2.id, estimated_minutes: 60, is_recurring: false, recurrence_rule: null, subtasks: [], tags: [], description: '' });
    await Store.addTask({ title: 'ウィークリーレポート送付', priority: 'P2', due_date: yesterday.toISOString(), project_id: proj2.id, estimated_minutes: 30, is_recurring: true, recurrence_rule: 'weekly', subtasks: [], tags: [], description: '' });
    await Store.addTask({ title: 'ドキュメント作成', priority: 'P3', due_date: nextWeek.toISOString(), project_id: proj1.id, estimated_minutes: 180, is_recurring: false, recurrence_rule: null, subtasks: [], tags: [], description: '' });
    await Store.addTask({ title: 'チームミーティング準備', priority: 'P3', due_date: nextWeek.toISOString(), project_id: proj1.id, estimated_minutes: 30, is_recurring: true, recurrence_rule: 'weekly', subtasks: [], tags: [], description: '' });
    await Store.addTask({ title: '読書：「Getting Things Done」', priority: 'P3', due_date: nextWeek.toISOString(), project_id: proj3.id, estimated_minutes: 60, is_recurring: false, recurrence_rule: null, subtasks: [], tags: [], description: '' });

    UI.renderProjectNav();

    // --- メタ認知サンプルデータ（反映ログ） ---
    const daysAgo = (n) => {
      const d = new Date(); d.setDate(d.getDate() - n);
      return d.toISOString().split('T')[0];
    };
    await Store.addReflection({
      type: 'task_complete', date: daysAgo(0),
      task_title: 'MVP機能フレームワーク設計',
      focus_score: 4, time_accuracy: 'ほぼ予定通り', energy_level: 'high',
      blockers: [], learning: '要件定義の段階で技術スタックを絞り込むと後工程が楽になると気づいた',
      intent: '次回は最初にコンポーネント図を描いてから実装に入る',
      insights: ['集中度: ★★★★☆', '時間: ほぼ予定通り', '要件定義の段階で技術スタックを絞り込むと後工程が楽になると気づいた'],
      summary: 'MVP機能フレームワーク設計 — 要件定義の段階で技術スタックを絞り込む',
      messages: [],
    });
    await Store.addReflection({
      type: 'morning', date: daysAgo(0),
      focus_score: null, time_accuracy: null, energy_level: 'high',
      blockers: [],
      learning: '今日の最優先タスクは新規顧客プレゼンの準備。午前中のエネルギーが高い時間帯に集中して取り組む',
      intent: '午前中はプレゼン資料、午後は返信系タスク',
      insights: ['今日の最優先タスクは新規顧客プレゼンの準備。午前中のエネルギーが高い時間帯に集中して取り組む'],
      summary: '朝セッション — 今日の最優先: プレゼン準備',
      messages: [],
    });
    await Store.addReflection({
      type: 'task_complete', date: daysAgo(1),
      task_title: 'ウィークリーレポート送付',
      focus_score: 3, time_accuracy: '少し超えた', energy_level: 'medium',
      blockers: ['割り込みが多かった'],
      learning: 'Slackの通知をオフにすると集中できることを再確認した',
      intent: 'ルーティンタスクは通知をオフにしてから着手する',
      insights: ['集中度: ★★★☆☆', '時間: 少し超えた', 'Slackの通知をオフにすると集中できることを再確認した'],
      summary: 'ウィークリーレポート送付 — 割り込みが多く少し超えた',
      messages: [],
    });
    await Store.addReflection({
      type: 'evening', date: daysAgo(1),
      focus_score: null, time_accuracy: null, energy_level: 'low',
      blockers: ['疲労'],
      learning: '今日はP1タスクを2つ完了できた。ただし疲労でP3タスクは明日に持ち越し',
      intent: '明日は疲労を引きずらないよう睡眠を優先する',
      insights: ['今日はP1タスクを2つ完了できた。ただし疲労でP3タスクは明日に持ち越し'],
      summary: '夜の振り返り — P1完了、疲労あり',
      messages: [],
    });
    await Store.addReflection({
      type: 'task_complete', date: daysAgo(2),
      task_title: 'Q2営業戦略MTG',
      focus_score: 5, time_accuracy: '早く終わった', energy_level: 'high',
      blockers: [],
      learning: 'アジェンダを事前に共有しておくとMTGの質が上がることを学んだ',
      intent: '次回のMTGも前日にアジェンダを送付する',
      insights: ['集中度: ★★★★★', '時間: 早く終わった', 'アジェンダを事前に共有しておくとMTGの質が上がることを学んだ'],
      summary: 'Q2営業戦略MTG — 事前準備で効率UP',
      messages: [],
    });
    await Store.addReflection({
      type: 'task_complete', date: daysAgo(3),
      task_title: 'ユーザーインタビュー準備',
      focus_score: 4, time_accuracy: 'ほぼ予定通り', energy_level: 'medium',
      blockers: ['情報が不足していた'],
      learning: 'インタビュー質問を事前に整理しておくと当日の対話が深まる',
      intent: '次回は質問リストをチームでレビューしてから本番に臨む',
      insights: ['集中度: ★★★★☆', '時間: ほぼ予定通り', 'インタビュー質問を事前に整理しておくと当日の対話が深まる'],
      summary: 'ユーザーインタビュー準備 — 質問整理の重要性',
      messages: [],
    });
    await Store.addReflection({
      type: 'morning', date: daysAgo(3),
      focus_score: null, time_accuracy: null, energy_level: 'medium',
      blockers: [],
      learning: 'ユーザーインタビューが今日のメインタスク。準備に集中する',
      intent: '午前中にインタビューシート完成、午後に練習',
      insights: ['ユーザーインタビューが今日のメインタスク。準備に集中する'],
      summary: '朝セッション — インタビュー準備デー',
      messages: [],
    });
  },

  /* ---- メタ認知サンプル振り返りデータ（既存ユーザー用） ---- */
  async _seedDemoReflections() {
    const daysAgo = (n) => {
      const d = new Date(); d.setDate(d.getDate() - n);
      return d.toISOString().split('T')[0];
    };
    await Store.addReflection({
      type: 'task_complete', date: daysAgo(0),
      task_title: 'タスクのサンプル（サンプルデータ）',
      focus_score: 4, time_accuracy: 'ほぼ予定通り', energy_level: 'high',
      blockers: [], learning: '準備を丁寧にすると作業がスムーズに進むと気づいた',
      intent: '次回は事前にゴールを明確にしてから着手する',
      insights: ['準備を丁寧にすると作業がスムーズに進むと気づいた'],
      summary: 'サンプルタスク完了 — 準備の重要性',
      messages: [],
    });
    await Store.addReflection({
      type: 'morning', date: daysAgo(1),
      focus_score: null, time_accuracy: null, energy_level: 'high',
      blockers: [], learning: '今日の目標を朝に確認すると一日の集中度が上がる',
      intent: '毎朝3つの最重要タスクを決める',
      insights: ['今日の目標を朝に確認すると一日の集中度が上がる'],
      summary: '朝セッション — 今日の最重要タスクを確認',
      messages: [],
    });
    await Store.addReflection({
      type: 'evening', date: daysAgo(1),
      focus_score: null, time_accuracy: null, energy_level: 'medium',
      blockers: ['割り込みが多かった'], learning: '割り込みのパターンを把握して対策を立てる必要がある',
      intent: '集中作業中は「取り込み中」ステータスをSlackに設定する',
      insights: ['割り込みのパターンを把握して対策を立てる必要がある'],
      summary: '夜の振り返り — 割り込みへの対策を検討',
      messages: [],
    });
  },

  /* ---- WBS Panel State ---- */
  currentWbsTab: 'tasks',  // 'tasks' | 'wbs'

  /* ---- View Routing ---- */
  switchView(viewName, projectId = null) {
    if (Tasks.bulkMode) Tasks.exitBulkMode();
    this.currentView = viewName;
    this.currentProjectId = projectId;

    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    // Show target
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden');

    // Nav active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navItem) navItem.classList.add('active');

    // When switching to project view, reset to tasks tab
    if (viewName === 'project') {
      this.currentWbsTab = 'tasks';
      this.applyProjectTab('tasks');
    }

    // Render view content
    this.renderView(viewName, projectId);
  },

  applyProjectTab(tab) {
    this.currentWbsTab = tab;
    const tasksPanel = document.getElementById('projPanelTasks');
    const wbsPanel   = document.getElementById('projPanelWbs');
    document.querySelectorAll('.proj-tab').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.proj-tab[data-ptab="${tab}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (tab === 'tasks') {
      tasksPanel?.classList.remove('hidden');
      wbsPanel?.classList.add('hidden');
    } else {
      tasksPanel?.classList.add('hidden');
      wbsPanel?.classList.remove('hidden');
      if (this.currentProjectId) WBS.render(this.currentProjectId);
    }
  },

  renderView(viewName, projectId) {
    switch (viewName) {
      case 'briefing':
        Briefing.render();
        break;
      case 'today':
        Tasks.renderTodayView();
        break;
      case 'upcoming':
        Tasks.renderUpcomingView();
        break;
      case 'metacog':
        MetaCog.render();
        this.updateMetaCogBadge();
        break;
      case 'coach':
        Coach.renderGrowthChart();
        Coach.renderInsights('week');
        Coach.renderSessionHistory();
        break;
      case 'project':
        if (projectId) {
          Tasks.renderProjectView(projectId);
          // If WBS tab is active, also render WBS
          if (this.currentWbsTab === 'wbs') WBS.render(projectId);
        }
        break;
    }
  },

  refreshCurrentView() {
    this.renderView(this.currentView, this.currentProjectId);
    if (this.currentView === 'briefing') return; // already refreshed
    Briefing.render();
    this.updateMetaCogBadge();
  },

  updateMetaCogBadge() {
    // Show badge if there are new reflections since last visit
    const badge = document.getElementById('metacogBadge');
    if (!badge) return;
    const reflCount = Store.reflections.filter(r => r.type === 'task_complete').length;
    const lastSeen  = parseInt(localStorage.getItem('mtm_metacog_seen') || '0');
    const newCount  = Math.max(0, reflCount - lastSeen);
    if (newCount > 0 && this.currentView !== 'metacog') {
      badge.textContent = newCount;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
      if (this.currentView === 'metacog') {
        localStorage.setItem('mtm_metacog_seen', String(reflCount));
      }
    }
  },

  /* ---- Event Listeners ---- */
  setupEventListeners() {
    // ログアウトボタン
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      if (!confirm('ログアウトしますか？')) return;
      await SB.signOut();
      // ページリロードでログイン画面へ
      location.reload();
    });

    // Nav items
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const view = item.dataset.view;
        if (view === 'project') return;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        this.switchView(view);
      });
    });

    // Quick add
    document.getElementById('quickAddBtn').addEventListener('click', () => UI.openQuickAdd());

    // Add project
    document.getElementById('addProjectBtn').addEventListener('click', () => UI.openProjectModal());

    // Settings
    document.getElementById('settingsBtn').addEventListener('click', () => UI.openSettings());

    // Today task input
    document.getElementById('todayAddBtn').addEventListener('click', () =>
      Tasks.addFromInput('todayTaskInput'));
    document.getElementById('todayTaskInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') Tasks.addFromInput('todayTaskInput');
    });

    // Upcoming task input
    document.getElementById('upcomingAddBtn').addEventListener('click', () =>
      Tasks.addFromInput('upcomingTaskInput'));
    document.getElementById('upcomingTaskInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') Tasks.addFromInput('upcomingTaskInput');
    });

    // Project task input
    document.getElementById('projectAddBtn').addEventListener('click', () =>
      Tasks.addFromInput('projectTaskInput', { projectId: this.currentProjectId }));
    document.getElementById('projectTaskInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') Tasks.addFromInput('projectTaskInput', { projectId: this.currentProjectId });
    });

    // Today priority filter
    document.querySelectorAll('#view-today .pf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#view-today .pf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Tasks.currentFilter = btn.dataset.pf;
        Tasks.renderTodayView();
      });
    });

    // Project priority filter
    document.querySelectorAll('#view-project .pf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#view-project .pf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Tasks.currentProjectFilter = btn.dataset.pjf;
        if (this.currentProjectId) Tasks.renderProjectView(this.currentProjectId);
      });
    });

    // Meta-cognition period selector (mcperiod-btn クラスを使用)
    document.querySelectorAll('.mcperiod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mcperiod-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        MetaCog.currentPeriod = btn.dataset.period;
        MetaCog.render();
      });
    });

    // Meta-cognition export button
    document.getElementById('mcExportBtn')?.addEventListener('click', () => this.exportMetaCogReport());

    // Project tab bar (Tasks / WBS)
    document.querySelectorAll('.proj-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applyProjectTab(btn.dataset.ptab);
      });
    });

    // Edit/Delete project buttons (in project view)
    document.getElementById('editProjectBtn').addEventListener('click', () => {
      if (this.currentProjectId) UI.openProjectModal(this.currentProjectId);
    });
    document.getElementById('deleteProjectBtn').addEventListener('click', async () => {
      if (!this.currentProjectId) return;
      if (!confirm('このプロジェクトを削除しますか？')) return;
      await Store.deleteProject(this.currentProjectId);
      UI.renderProjectNav();
      this.switchView('today');
      UI.toast('プロジェクトを削除しました', 'info');
    });

    // Bulk select buttons
    document.getElementById('todayBulkBtn')?.addEventListener('click', () => {
      if (Tasks.bulkMode) Tasks.exitBulkMode(); else Tasks.enterBulkMode();
    });
    document.getElementById('projectBulkBtn')?.addEventListener('click', () => {
      if (Tasks.bulkMode) Tasks.exitBulkMode(); else Tasks.enterBulkMode();
    });

    // Bulk action bar
    document.getElementById('bulkSelectAllBtn')?.addEventListener('click', () => Tasks.selectAll());
    document.getElementById('bulkCompleteBtn')?.addEventListener('click', () => Tasks.bulkComplete());
    document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => Tasks.bulkDelete());
    document.getElementById('bulkCancelBtn')?.addEventListener('click', () => Tasks.exitBulkMode());

    // Modal close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal(btn.dataset.close));
    });

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) {
          overlay.classList.add('hidden');
          // Save coach session if leaving
          if (overlay.id === 'coachPanel') Coach.saveSession();
        }
      });
    });

    // Integration confirm default hide
    document.getElementById('integrationConfirmBtn').style.display = 'none';

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        UI.openQuickAdd();
      }
    });

    // Save coach session when leaving view
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (this.currentView === 'coach') Coach.saveSession();
      });
    });
  },

  /* ---- MetaCog Report Export ---- */
  exportMetaCogReport() {
    const weekly = MetaCog.generateWeeklyFeedback();
    const allLogs = Store.reflections.filter(r => r.type === 'task_complete');
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    let md = `# Meta-Task Manager — メタ認知レポート\n`;
    md += `**出力日**: ${dateStr}\n\n---\n\n`;

    if (weekly) {
      const { score, fb, patterns } = weekly;
      md += `## メタ認知スコアカード（直近7日）\n\n`;
      md += `| 指標 | スコア |\n|---|---|\n`;
      md += `| 総合 | **${score.total} / 100** |\n`;
      md += `| 集中度 | ${score.focus} |\n`;
      md += `| エネルギー | ${score.energy} |\n`;
      md += `| 時間精度 | ${score.timeAcc} |\n`;
      md += `| 振り返り率 | ${score.reflection}% |\n\n`;

      md += `## 週次フィードバック\n\n`;
      md += `> ${fb.overall}\n\n`;
      if (fb.strengths.length) {
        md += `### ✅ 今週の強み\n${fb.strengths.map(s => `- ${s}`).join('\n')}\n\n`;
      }
      if (fb.improvements.length) {
        md += `### 📈 改善ポイント\n${fb.improvements.map(s => `- ${s}`).join('\n')}\n\n`;
      }
      if (fb.suggestions.length) {
        md += `### 💡 改善アドバイス\n`;
        fb.suggestions.forEach(s => { md += `- **${s.pattern}**: ${s.tip}\n`; });
        md += '\n';
      }

      md += `## 思考パターン分析\n\n`;
      Object.entries(patterns).forEach(([key, val]) => {
        const pt = MetaCog.THOUGHT_PATTERNS[key];
        if (pt) md += `- **${pt.label}**: ${val}% — ${pt.desc}\n`;
      });
      md += '\n';
    }

    md += `## 振り返りログ（${allLogs.length}件）\n\n`;
    allLogs.sort((a,b) => (b.created_at||0)-(a.created_at||0)).slice(0, 30).forEach(r => {
      md += `### ${r.date} — ${r.task_title || r.summary || 'タスク'}\n`;
      if (r.focus_score)   md += `- 集中度: ${'★'.repeat(r.focus_score)}\n`;
      if (r.time_accuracy) md += `- 時間精度: ${r.time_accuracy}\n`;
      if (r.energy_level)  md += `- エネルギー: ${MetaCog.ENERGY_LABELS[r.energy_level]||''}\n`;
      if (r.blockers?.length) md += `- 阻害要因: ${r.blockers.join(', ')}\n`;
      if (r.learning)      md += `- 学び: ${r.learning}\n`;
      if (r.intent)        md += `- 次回の意図: ${r.intent}\n`;
      md += '\n';
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `metacog-report-${dateStr}.md`; a.click();
    URL.revokeObjectURL(url);
    UI.toast('レポートをダウンロードしました', 'success');
  },

  /* ---- Slack Daily Scheduler ---- */
  setupSlackScheduler() {
    const checkTime = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const morningTime = Store.settings.morningTime || '08:00';
      const eveningTime = Store.settings.eveningTime || '21:00';
      const lastRun = JSON.parse(localStorage.getItem('mtm_lastRun') || '{}');
      const today = now.toDateString();

      if (hhmm === morningTime && lastRun.morning !== today && Store.settings.slackWebhook) {
        Integration.sendDailyBriefing('morning');
        localStorage.setItem('mtm_lastRun', JSON.stringify({ ...lastRun, morning: today }));
      }
      if (hhmm === eveningTime && lastRun.evening !== today && Store.settings.slackWebhook) {
        Integration.sendDailyBriefing('evening');
        localStorage.setItem('mtm_lastRun', JSON.stringify({ ...lastRun, evening: today }));
      }
    };

    // Check every minute
    setInterval(checkTime, 60000);
    checkTime();
  },

  /* ---- ハンバーガーメニュー（モバイル） ---- */
  initMobileMenu() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebar      = document.getElementById('sidebar');
    const overlay      = document.getElementById('sidebarOverlay');
    if (!hamburgerBtn || !sidebar || !overlay) return;

    const openSidebar = () => {
      sidebar.classList.add('drawer-open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    };
    const closeSidebar = () => {
      sidebar.classList.remove('drawer-open');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    };

    hamburgerBtn.addEventListener('click', openSidebar);
    overlay.addEventListener('click', closeSidebar);

    // ナビアイテムをクリックしたらサイドバーを閉じる（モバイル時）
    sidebar.querySelectorAll('.nav-item, .add-project-btn').forEach(el => {
      el.addEventListener('click', () => {
        if (window.innerWidth <= 768) closeSidebar();
      });
    });
  }
};

/* ---- Boot ---- */
document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(err => {
    console.error('App init error:', err);
    // フォールバック: 認証モーダルを表示
    try { App.hideSplash(); } catch(e) {}
    try { Auth.openModal(); } catch(e) {
      // Auth もダメなら直接表示
      const m = document.getElementById('authModal');
      if (m) { m.style.display = 'flex'; m.classList.remove('hidden'); }
    }
  });
});
