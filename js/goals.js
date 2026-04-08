/* ============================================================
   goals.js — 目標ダッシュボード（月次・週次目標管理）
   ============================================================ */
const Goals = {

  /* ---- 期間ラベル ---- */
  getMonthLabel() {
    const d = new Date();
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  },

  getWeekLabel() {
    const today = new Date();
    const day = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${fmt(mon)}〜${fmt(sun)}`;
  },

  /* ---- データ取得 ---- */
  getAll()     { return Store.goals || []; },
  getMonthly() { return this.getAll().filter(g => g.type === 'monthly'); },
  getWeekly()  { return this.getAll().filter(g => g.type === 'weekly'); },

  /* ---- CRUD ---- */
  async add(data) {
    const goal = {
      id: 'goal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      title: data.title,
      description: data.description || '',
      type: data.type,
      progress: data.progress || 0,
      status: 'active',
      created_at: new Date().toISOString()
    };
    Store.goals = [...(Store.goals || []), goal];
    await Store.saveGoals();
    return goal;
  },

  async update(id, patch) {
    const idx = (Store.goals || []).findIndex(g => g.id === id);
    if (idx < 0) return;
    Store.goals[idx] = { ...Store.goals[idx], ...patch };
    await Store.saveGoals();
    return Store.goals[idx];
  },

  async remove(id) {
    Store.goals = (Store.goals || []).filter(g => g.id !== id);
    await Store.saveGoals();
  },

  /* ---- メイン描画 ---- */
  render() {
    const monthLabel = document.getElementById('monthlyPeriodLabel');
    const weekLabel  = document.getElementById('weeklyPeriodLabel');
    if (monthLabel) monthLabel.textContent = this.getMonthLabel();
    if (weekLabel)  weekLabel.textContent  = this.getWeekLabel();
    this._renderList('monthlyGoalList', this.getMonthly());
    this._renderList('weeklyGoalList',  this.getWeekly());
    this._renderMetacogLink();
  },

  _renderList(containerId, goals) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!goals.length) {
      container.innerHTML = `<div class="goal-empty"><i class="fas fa-bullseye"></i><p>目標を追加しましょう</p></div>`;
      return;
    }
    container.innerHTML = '';
    goals.forEach(g => container.appendChild(this._renderCard(g)));
  },

  _renderCard(goal) {
    const el = document.createElement('div');
    el.className = `goal-card${goal.status === 'completed' ? ' completed' : ''}`;
    el.dataset.id = goal.id;
    const color = goal.status === 'completed' ? '#059669'
      : goal.type === 'monthly' ? '#7c3aed' : '#2563eb';

    el.innerHTML = `
      <div class="goal-card-header">
        <button class="goal-check-btn ${goal.status === 'completed' ? 'done' : ''}"
          data-id="${goal.id}" title="${goal.status === 'completed' ? '未完了に戻す' : '達成済みにする'}">
          <i class="fas fa-${goal.status === 'completed' ? 'check-circle' : 'circle'}"></i>
        </button>
        <div class="goal-card-title">${this._esc(goal.title)}</div>
        <div class="goal-card-actions">
          <button class="goal-action-btn edit-btn" data-id="${goal.id}"><i class="fas fa-edit"></i></button>
          <button class="goal-action-btn del-btn"  data-id="${goal.id}"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      ${goal.description ? `<div class="goal-card-desc">${this._esc(goal.description)}</div>` : ''}
      <div class="goal-progress-row">
        <div class="goal-progress-bar-wrap">
          <div class="goal-progress-bar-fill" style="width:${goal.progress}%;background:${color}"></div>
        </div>
        <div class="goal-progress-controls">
          <button class="goal-prog-btn" data-id="${goal.id}" data-delta="-10">−</button>
          <span class="goal-progress-pct">${goal.progress}%</span>
          <button class="goal-prog-btn" data-id="${goal.id}" data-delta="10">＋</button>
        </div>
      </div>
    `;

    el.querySelector('.goal-check-btn').addEventListener('click', async () => {
      const newStatus = goal.status === 'completed' ? 'active' : 'completed';
      await this.update(goal.id, {
        status: newStatus,
        progress: newStatus === 'completed' ? 100 : goal.progress
      });
      this.render();
      if (typeof MetaCog !== 'undefined') MetaCog.render();
      UI.toast(newStatus === 'completed' ? '目標を達成しました！' : '目標を再開しました', 'success');
    });

    el.querySelector('.edit-btn').addEventListener('click', () => this.openModal(goal.type, goal));

    el.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm('この目標を削除しますか？')) return;
      await this.remove(goal.id);
      this.render();
      if (typeof MetaCog !== 'undefined') MetaCog.render();
      UI.toast('削除しました', 'info');
    });

    el.querySelectorAll('.goal-prog-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const delta   = parseInt(btn.dataset.delta);
        const newProg = Math.max(0, Math.min(100, (goal.progress || 0) + delta));
        await this.update(goal.id, { progress: newProg });
        this.render();
        if (typeof MetaCog !== 'undefined') MetaCog.render();
      });
    });

    return el;
  },

  /* ---- 目標ビュー下部：メタ認知との紐づき ---- */
  _renderMetacogLink() {
    const el = document.getElementById('goalsMetacogInsight');
    if (!el) return;

    const mStats = this._stats(this.getMonthly());
    const wStats = this._stats(this.getWeekly());
    const recentLogs = [...(Store.reflections || [])].reverse().slice(0, 10);
    const focusScores = recentLogs.map(r => r.focus_score).filter(s => s > 0);
    const avgFocus = focusScores.length
      ? (focusScores.reduce((a, b) => a + b, 0) / focusScores.length).toFixed(1)
      : null;

    let insight = '';
    if (avgFocus && mStats.total && parseFloat(avgFocus) >= 4 && mStats.avgProgress < 50)
      insight = `<div class="goals-mc-insight-box"><i class="fas fa-lightbulb"></i> 集中度は高いですが目標進捗が低めです。目標をタスクに分解してみましょう。</div>`;
    else if (mStats.total && mStats.avgProgress >= 80)
      insight = `<div class="goals-mc-insight-box success"><i class="fas fa-trophy"></i> 今月の目標が順調に進んでいます！この調子を維持しましょう。</div>`;

    el.innerHTML = `
      <div class="goals-mc-stat-row">
        <div class="goals-mc-stat">
          <div class="goals-mc-stat-val" style="color:#7c3aed">
            ${mStats.total ? Math.round(mStats.avgProgress) + '%' : '—'}
          </div>
          <div class="goals-mc-stat-label">今月の目標 平均進捗</div>
          <div class="goals-mc-stat-sub">${mStats.completed}/${mStats.total}件達成</div>
        </div>
        <div class="goals-mc-stat">
          <div class="goals-mc-stat-val" style="color:#2563eb">
            ${wStats.total ? Math.round(wStats.avgProgress) + '%' : '—'}
          </div>
          <div class="goals-mc-stat-label">今週の目標 平均進捗</div>
          <div class="goals-mc-stat-sub">${wStats.completed}/${wStats.total}件達成</div>
        </div>
        <div class="goals-mc-stat">
          <div class="goals-mc-stat-val" style="color:#d97706">${avgFocus ? avgFocus + '/5' : '—'}</div>
          <div class="goals-mc-stat-label">直近の平均集中度</div>
          <div class="goals-mc-stat-sub">${focusScores.length}件の記録</div>
        </div>
      </div>
      ${insight}
      <button class="btn-ghost" id="goalsToMetacogBtn" style="font-size:.82rem;margin-top:.8rem">
        <i class="fas fa-brain"></i> メタ認知ダッシュボードを見る
      </button>
    `;

    document.getElementById('goalsToMetacogBtn')?.addEventListener('click', () => {
      App.switchView('metacog');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector('.nav-item[data-view="metacog"]')?.classList.add('active');
    });
  },

  /* ---- MetaCogダッシュボード内の目標進捗パネル ---- */
  renderForMetacog() {
    const el = document.getElementById('mcGoalsSection');
    if (!el) return;

    const monthly = this.getMonthly();
    const weekly  = this.getWeekly();

    if (!monthly.length && !weekly.length) {
      el.innerHTML = `
        <div class="mc-full-panel">
          <h3 class="mc-card-title"><i class="fas fa-bullseye"></i> 目標進捗</h3>
          <div class="mc-empty">
            <i class="fas fa-bullseye"></i>
            <p>目標が設定されていません</p>
            <button class="btn-primary" id="mcGoToGoalsBtn" style="margin-top:.6rem;font-size:.8rem">
              <i class="fas fa-plus"></i> 目標を追加する
            </button>
          </div>
        </div>`;
      document.getElementById('mcGoToGoalsBtn')?.addEventListener('click', () => {
        App.switchView('goals');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector('.nav-item[data-view="goals"]')?.classList.add('active');
      });
      return;
    }

    const miniList = (goals, color) => goals.map(g => `
      <div class="mc-goal-item">
        <div class="mc-goal-status ${g.status === 'completed' ? 'done' : ''}">
          <i class="fas fa-${g.status === 'completed' ? 'check-circle' : 'circle'}"></i>
        </div>
        <div class="mc-goal-body">
          <div class="mc-goal-title">${this._esc(g.title)}</div>
          <div class="mc-goal-bar-wrap">
            <div class="mc-goal-bar-fill" style="width:${g.progress}%;background:${color}"></div>
          </div>
        </div>
        <div class="mc-goal-pct">${g.progress}%</div>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="mc-goals-panel">
        <div class="mc-goals-header">
          <h3 class="mc-card-title"><i class="fas fa-bullseye"></i> 目標進捗</h3>
          <button class="btn-ghost" id="mcGoToGoalsBtn2" style="font-size:.78rem">
            <i class="fas fa-external-link-alt"></i> 目標ダッシュボード
          </button>
        </div>
        <div class="mc-goals-body">
          ${monthly.length ? `
            <div class="mc-goals-col">
              <div class="mc-goals-col-label"><i class="fas fa-calendar-alt"></i> 今月の目標</div>
              ${miniList(monthly, '#7c3aed')}
            </div>` : ''}
          ${weekly.length ? `
            <div class="mc-goals-col">
              <div class="mc-goals-col-label"><i class="fas fa-calendar-week"></i> 今週の目標</div>
              ${miniList(weekly, '#2563eb')}
            </div>` : ''}
        </div>
      </div>
    `;

    document.getElementById('mcGoToGoalsBtn2')?.addEventListener('click', () => {
      App.switchView('goals');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector('.nav-item[data-view="goals"]')?.classList.add('active');
    });
  },

  /* ---- モーダル ---- */
  openModal(type = 'monthly', editGoal = null) {
    document.getElementById('goalModalTitle').textContent = editGoal
      ? '目標を編集'
      : (type === 'monthly' ? '今月の目標を追加' : '今週の目標を追加');
    document.getElementById('goalTitleInput').value    = editGoal?.title        || '';
    document.getElementById('goalDescInput').value     = editGoal?.description  || '';
    document.getElementById('goalProgressInput').value = editGoal?.progress     ?? 0;
    document.getElementById('goalProgressDisplay').textContent = (editGoal?.progress ?? 0) + '%';
    document.getElementById('goalTypeHidden').value    = editGoal?.type || type;
    document.getElementById('goalEditIdHidden').value  = editGoal?.id   || '';

    const slider = document.getElementById('goalProgressInput');
    slider.oninput = () => {
      document.getElementById('goalProgressDisplay').textContent = slider.value + '%';
    };

    document.getElementById('goalSaveBtn').onclick = async () => {
      const title = document.getElementById('goalTitleInput').value.trim();
      if (!title) { UI.toast('目標名を入力してください', 'error'); return; }

      const data = {
        title,
        description: document.getElementById('goalDescInput').value.trim(),
        progress:    parseInt(document.getElementById('goalProgressInput').value) || 0,
        type:        document.getElementById('goalTypeHidden').value,
      };

      const editId = document.getElementById('goalEditIdHidden').value;
      if (editId) {
        await this.update(editId, data);
        UI.toast('目標を更新しました', 'success');
      } else {
        await this.add(data);
        UI.toast('目標を追加しました', 'success');
      }

      UI.closeModal('goalModal');
      this.render();
      if (typeof MetaCog !== 'undefined') MetaCog.render();
    };

    UI.openModal('goalModal');
  },

  /* ---- 集計ヘルパー ---- */
  _stats(goals) {
    const total     = goals.length;
    const completed = goals.filter(g => g.status === 'completed').length;
    const avgProgress = total
      ? goals.reduce((a, g) => a + (g.progress || 0), 0) / total
      : 0;
    return { total, completed, avgProgress };
  },

  _esc(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
