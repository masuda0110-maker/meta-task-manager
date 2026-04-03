/* ============================================================
   tasks.js — Task rendering, CRUD UI, detail modal
   ============================================================ */
const Tasks = {
  currentFilter: 'all',
  currentProjectId: null,
  selectedIds: new Set(),
  bulkMode: false,

  /* ---- Render task list ---- */
  renderList(container, tasks, options = {}) {
    container.innerHTML = '';
    if (!tasks.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-check-circle text-success"></i>
          <p>${options.emptyMsg || 'タスクがありません。上の入力欄から追加しましょう！'}</p>
        </div>`;
      return;
    }
    tasks.forEach(task => {
      const el = this.renderTaskItem(task, options);
      container.appendChild(el);
    });
  },

  renderTaskItem(task, options = {}) {
    const el = document.createElement('div');
    const isSelected = this.bulkMode && this.selectedIds.has(task.id);
    el.className = `task-item${task.is_completed ? ' completed' : ''}${isSelected ? ' bulk-selected' : ''}`;
    el.dataset.id = task.id;

    const project = task.project_id ? Store.getProjectById(task.project_id) : null;
    const prio    = task.priority || 'P4';
    const dueFmt  = task.due_date ? this.formatDueDate(new Date(task.due_date)) : null;

    el.innerHTML = `
      ${this.bulkMode ? `<div class="task-select-check ${isSelected ? 'checked' : ''}">${isSelected ? '<i class="fas fa-check"></i>' : ''}</div>` : ''}
      <div class="task-checkbox ${prio.toLowerCase()} ${task.is_completed ? 'checked' : ''}"
           data-id="${task.id}"></div>
      <div class="task-body">
        <div class="task-title">${this.escHtml(task.title)}</div>
        <div class="task-meta">
          <span class="task-priority-label ${prio}">${prio}</span>
          ${dueFmt ? `<span class="task-due ${dueFmt.cls}"><i class="fas fa-calendar-alt"></i> ${dueFmt.text}</span>` : ''}
          ${project ? `<span class="task-project-tag" style="border-left:3px solid ${project.color||'#7c3aed'}">
            <i class="fas fa-circle" style="font-size:.45rem;color:${project.color||'#7c3aed'}"></i>
            ${this.escHtml(project.name)}</span>` : ''}
          ${task.estimated_minutes ? `<span class="task-est"><i class="fas fa-clock"></i> ${task.estimated_minutes}分</span>` : ''}
          ${task.is_recurring ? `<span class="task-recur"><i class="fas fa-redo"></i></span>` : ''}
        </div>
        ${task.subtasks && task.subtasks.length ? `
          <div class="subtask-list">
            ${task.subtasks.map((s,i) => `
              <div class="subtask-item">
                <div class="subtask-check ${s.done ? 'checked' : ''}" data-task="${task.id}" data-sub="${i}"></div>
                <span style="${s.done ? 'text-decoration:line-through;opacity:.5' : ''}">${this.escHtml(s.title)}</span>
              </div>`).join('')}
          </div>` : ''}
      </div>
      ${!this.bulkMode ? `
      <div class="task-actions">
        <button class="task-action-btn cal"   title="カレンダー登録"  data-action="cal"   data-id="${task.id}"><i class="fas fa-calendar-plus"></i></button>
        <button class="task-action-btn slack" title="Slack通知"       data-action="slack" data-id="${task.id}"><i class="fab fa-slack"></i></button>
        <button class="task-action-btn"       title="詳細"            data-action="detail" data-id="${task.id}"><i class="fas fa-ellipsis-h"></i></button>
        <button class="task-action-btn del"   title="削除"            data-action="del"   data-id="${task.id}"><i class="fas fa-trash"></i></button>
      </div>` : ''}
    `;

    // Checkbox toggle
    el.querySelector('.task-checkbox').addEventListener('click', e => {
      e.stopPropagation();
      if (this.bulkMode) {
        this.toggleSelect(task.id);
      } else {
        this.toggleComplete(task.id, task.is_completed);
      }
    });

    // Subtask checkbox (non-bulk only)
    if (!this.bulkMode) {
      el.querySelectorAll('.subtask-check').forEach(sc => {
        sc.addEventListener('click', e => {
          e.stopPropagation();
          this.toggleSubtask(task.id, parseInt(sc.dataset.sub));
        });
      });

      // Action buttons
      el.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const action = btn.dataset.action;
          const id = btn.dataset.id;
          if (action === 'del')    this.deleteTaskUI(id);
          if (action === 'detail') this.openDetail(id);
          if (action === 'cal')    Integration.openCalendar(id);
          if (action === 'slack')  Integration.openSlack(id);
        });
      });
    }

    // Click handler
    el.addEventListener('click', () => {
      if (this.bulkMode) {
        this.toggleSelect(task.id);
      } else {
        this.openDetail(task.id);
      }
    });

    return el;
  },

  /* ---- Bulk selection ---- */
  enterBulkMode() {
    this.bulkMode = true;
    this.selectedIds.clear();
    App.refreshCurrentView();
    document.querySelectorAll('.bulk-select-btn').forEach(btn => {
      btn.innerHTML = '<i class="fas fa-times"></i> キャンセル';
      btn.classList.add('active');
    });
  },

  exitBulkMode() {
    this.bulkMode = false;
    this.selectedIds.clear();
    this.updateBulkBar();
    App.refreshCurrentView();
    document.querySelectorAll('.bulk-select-btn').forEach(btn => {
      btn.innerHTML = '<i class="fas fa-check-square"></i> 選択';
      btn.classList.remove('active');
    });
  },

  toggleSelect(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    const isSelected = this.selectedIds.has(id);
    const el = document.querySelector(`.task-item[data-id="${id}"]`);
    if (el) {
      el.classList.toggle('bulk-selected', isSelected);
      const check = el.querySelector('.task-select-check');
      if (check) {
        check.classList.toggle('checked', isSelected);
        check.innerHTML = isSelected ? '<i class="fas fa-check"></i>' : '';
      }
    }
    this.updateBulkBar();
  },

  selectAll() {
    const items = [...document.querySelectorAll('.task-item[data-id]')];
    const allSelected = items.length > 0 && items.every(el => this.selectedIds.has(el.dataset.id));
    if (allSelected) {
      this.selectedIds.clear();
    } else {
      items.forEach(el => this.selectedIds.add(el.dataset.id));
    }
    items.forEach(el => {
      const isSelected = this.selectedIds.has(el.dataset.id);
      el.classList.toggle('bulk-selected', isSelected);
      const check = el.querySelector('.task-select-check');
      if (check) {
        check.classList.toggle('checked', isSelected);
        check.innerHTML = isSelected ? '<i class="fas fa-check"></i>' : '';
      }
    });
    this.updateBulkBar();
  },

  updateBulkBar() {
    const bar = document.getElementById('bulkActionBar');
    if (!bar) return;
    const count = this.selectedIds.size;
    bar.querySelector('.bulk-count').textContent = `${count}件選択中`;
    bar.classList.toggle('visible', count > 0);
  },

  async bulkComplete() {
    if (!this.selectedIds.size) return;
    const ids = [...this.selectedIds];
    for (const id of ids) {
      const task = Store.tasks.find(t => t.id === id);
      if (task && !task.is_completed) await Store.completeTask(id);
    }
    const count = ids.length;
    this.exitBulkMode();
    UI.updateBadges();
    UI.toast(`${count}件のタスクを完了しました`, 'success');
  },

  async bulkDelete() {
    if (!this.selectedIds.size) return;
    const count = this.selectedIds.size;
    if (!confirm(`${count}件のタスクを削除しますか？`)) return;
    const ids = [...this.selectedIds];
    for (const id of ids) await Store.deleteTask(id);
    this.exitBulkMode();
    UI.updateBadges();
    UI.toast(`${count}件のタスクを削除しました`, 'info');
  },

  formatDueDate(d) {
    const now = new Date(); now.setHours(0,0,0,0);
    const due = new Date(d); due.setHours(0,0,0,0);
    const diff = Math.round((due - now) / 86400000);
    const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    if (diff < 0)  return { cls: 'overdue', text: `${Math.abs(diff)}日前 ${timeStr}` };
    if (diff === 0) return { cls: 'today', text: `今日 ${timeStr}` };
    if (diff === 1) return { cls: '', text: `明日 ${timeStr}` };
    return { cls: '', text: `${d.getMonth()+1}/${d.getDate()} ${timeStr}` };
  },

  async toggleComplete(id, currentState) {
    if (currentState) {
      await Store.uncompleteTask(id);
    } else {
      await Store.completeTask(id);
      const task = Store.tasks.find(t => t.id === id);
      // Trigger deep reflection modal (MetaCog)
      setTimeout(() => MetaCog.openDeepReflection(task), 400);
    }
    App.refreshCurrentView();
    UI.updateBadges();
  },

  async toggleSubtask(taskId, subIdx) {
    const task = Store.tasks.find(t => t.id === taskId);
    if (!task || !task.subtasks) return;
    const subs = [...task.subtasks];
    subs[subIdx] = { ...subs[subIdx], done: !subs[subIdx].done };
    await Store.updateTask(taskId, { subtasks: subs });
    App.refreshCurrentView();
  },

  async deleteTaskUI(id) {
    if (!confirm('このタスクを削除しますか？')) return;
    await Store.deleteTask(id);
    App.refreshCurrentView();
    UI.updateBadges();
    UI.toast('タスクを削除しました', 'info');
  },

  /* ---- Today View ---- */
  renderTodayView() {
    const container = document.getElementById('todayTaskList');
    let tasks = [...Store.getTodayTasks(), ...Store.getOverdueTasks()];
    // Priority filter
    if (this.currentFilter !== 'all') tasks = tasks.filter(t => t.priority === this.currentFilter);
    // Sort by priority
    const pMap = { P1: 0, P2: 1, P3: 2, P4: 3 };
    tasks.sort((a, b) => (pMap[a.priority] || 3) - (pMap[b.priority] || 3));
    this.renderList(container, tasks);

    const meta = document.getElementById('todayMeta');
    const today = new Date();
    meta.textContent = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日 ・ ${tasks.length}件`;
  },

  /* ---- Upcoming View ---- */
  renderUpcomingView() {
    const container = document.getElementById('upcomingList');
    container.innerHTML = '';
    const tasks = Store.getUpcomingTasks(14);
    const pMap = { P1: 0, P2: 1, P3: 2, P4: 3 };
    tasks.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    // Group by date
    const groups = {};
    tasks.forEach(t => {
      const key = new Date(t.due_date).toDateString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    if (!Object.keys(groups).length) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-check text-success"></i><p>近日予定のタスクはありません</p></div>`;
      return;
    }

    const dayNames = ['日','月','火','水','木','金','土'];
    Object.entries(groups).forEach(([dateStr, grpTasks]) => {
      const d = new Date(dateStr);
      const grp = document.createElement('div');
      grp.className = 'date-group';
      grp.innerHTML = `<div class="date-group-label">
        <i class="fas fa-calendar-day"></i>
        ${d.getMonth()+1}月${d.getDate()}日（${dayNames[d.getDay()]}）
      </div>`;
      grpTasks.sort((a, b) => (pMap[a.priority]||3) - (pMap[b.priority]||3));
      grpTasks.forEach(task => grp.appendChild(this.renderTaskItem(task)));
      container.appendChild(grp);
    });
  },

  /* ---- Project View ---- */
  currentProjectFilter: 'all',

  renderProjectView(projectId) {
    this.currentProjectId = projectId;
    const project = Store.getProjectById(projectId);
    if (!project) return;

    document.getElementById('projectViewTitle').innerHTML =
      `<span class="project-nav-dot" style="background:${project.color||'#7c3aed'};width:14px;height:14px;margin-right:8px"></span>${project.name}`;

    let tasks = Store.getTasksByProject(projectId);
    if (this.currentProjectFilter !== 'all') {
      tasks = tasks.filter(t => t.priority === this.currentProjectFilter);
    }
    const pMap = { P1: 0, P2: 1, P3: 2, P4: 3 };
    tasks.sort((a, b) => (pMap[a.priority]||3) - (pMap[b.priority]||3));
    this.renderList(document.getElementById('projectTaskList'), tasks);
  },

  /* ---- Quick/Inline add ---- */
  async addFromInput(inputId, opts = {}) {
    const input = document.getElementById(inputId);
    const raw = input.value.trim();
    if (!raw) return;

    const parsed = NLP.parse(raw);

    // Resolve project
    let project_id = opts.projectId || null;
    if (parsed.project_name && !project_id) {
      const existing = Store.projects.find(p => p.name === parsed.project_name);
      if (existing) {
        project_id = existing.id;
      } else {
        const newP = await Store.addProject({ name: parsed.project_name, color: UI.randomColor() });
        project_id = newP.id;
        UI.renderProjectNav();
      }
    }

    const task = await Store.addTask({
      title: parsed.title,
      priority: parsed.priority,
      due_date: parsed.due_date,
      project_id,
      estimated_minutes: parsed.estimated_minutes,
      is_recurring: parsed.is_recurring,
      recurrence_rule: parsed.recurrence_rule,
      subtasks: [],
      tags: [],
      description: ''
    });

    input.value = '';
    App.refreshCurrentView();
    UI.updateBadges();
    UI.toast(`「${task.title}」を追加しました`, 'success');
  },

  /* ---- Detail Modal ---- */
  openDetail(id) {
    const task = Store.tasks.find(t => t.id === id);
    if (!task) return;

    const prio = task.priority || 'P4';
    const body = document.getElementById('taskDetailBody');
    const dueDateVal = task.due_date ? new Date(task.due_date).toISOString().slice(0,16) : '';

    body.innerHTML = `
      <div class="field-row">
        <label>タスク名</label>
        <input type="text" id="dtTitle" class="modal-input" value="${this.escHtml(task.title)}" />
      </div>
      <div class="field-row" style="flex-direction:row;gap:1rem">
        <div style="flex:1">
          <label>優先度</label>
          <select id="dtPriority" class="modal-select">
            ${['P1','P2','P3','P4'].map(p => `<option value="${p}" ${prio===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1">
          <label>期日</label>
          <input type="datetime-local" id="dtDue" class="modal-input-sm" style="width:100%" value="${dueDateVal}" />
        </div>
        <div style="flex:1">
          <label>見積もり(分)</label>
          <input type="number" id="dtEst" class="modal-input-sm" style="width:100%" value="${task.estimated_minutes || ''}" />
        </div>
      </div>
      <div class="field-row">
        <label>プロジェクト</label>
        <select id="dtProject" class="modal-select">
          <option value="">なし</option>
          ${Store.projects.map(p => `<option value="${p.id}" ${task.project_id===p.id?'selected':''}>${this.escHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <label>繰り返し</label>
        <select id="dtRecur" class="modal-select">
          <option value="" ${!task.is_recurring?'selected':''}>なし</option>
          <option value="daily" ${task.recurrence_rule==='daily'?'selected':''}>毎日</option>
          <option value="weekday" ${task.recurrence_rule==='weekday'?'selected':''}>平日毎日</option>
          <option value="weekly" ${task.recurrence_rule==='weekly'?'selected':''}>毎週</option>
          <option value="monthly" ${task.recurrence_rule==='monthly'?'selected':''}>毎月</option>
        </select>
      </div>
      <div class="field-row">
        <label>メモ・詳細</label>
        <textarea id="dtDesc" class="modal-textarea">${task.description || ''}</textarea>
      </div>
      <div class="field-row">
        <label>サブタスク</label>
        <div id="dtSubtasks">
          ${(task.subtasks || []).map((s, i) => `
            <div class="kr-input-row" data-sub="${i}">
              <input type="text" class="modal-input sub-input" value="${this.escHtml(s.title)}" placeholder="サブタスク" />
              <button class="btn-ghost kr-del-btn sub-del" data-sub="${i}"><i class="fas fa-times"></i></button>
            </div>`).join('')}
        </div>
        <button class="btn-ghost" id="dtAddSub" style="margin-top:6px;font-size:.8rem"><i class="fas fa-plus"></i> サブタスク追加</button>
      </div>
    `;

    // Subtask add/del
    document.getElementById('dtAddSub').onclick = () => {
      const wrap = document.getElementById('dtSubtasks');
      const idx = wrap.querySelectorAll('.kr-input-row').length;
      const row = document.createElement('div');
      row.className = 'kr-input-row'; row.dataset.sub = idx;
      row.innerHTML = `<input type="text" class="modal-input sub-input" placeholder="サブタスク" />
        <button class="btn-ghost kr-del-btn sub-del" data-sub="${idx}"><i class="fas fa-times"></i></button>`;
      row.querySelector('.sub-del').onclick = () => row.remove();
      wrap.appendChild(row);
    };
    body.querySelectorAll('.sub-del').forEach(b => {
      b.onclick = () => b.closest('.kr-input-row').remove();
    });

    // Save
    document.getElementById('taskSaveBtn').onclick = async () => {
      const subtasks = [...document.querySelectorAll('#dtSubtasks .sub-input')]
        .map(inp => ({ title: inp.value.trim(), done: false })).filter(s => s.title);
      const recur = document.getElementById('dtRecur').value;
      await Store.updateTask(id, {
        title:              document.getElementById('dtTitle').value.trim(),
        priority:           document.getElementById('dtPriority').value,
        due_date:           document.getElementById('dtDue').value ? new Date(document.getElementById('dtDue').value).toISOString() : null,
        estimated_minutes:  parseInt(document.getElementById('dtEst').value) || null,
        project_id:         document.getElementById('dtProject').value || null,
        is_recurring:       !!recur,
        recurrence_rule:    recur || null,
        description:        document.getElementById('dtDesc').value,
        subtasks
      });
      UI.closeModal('taskDetailModal');
      App.refreshCurrentView();
      UI.toast('タスクを保存しました', 'success');
    };

    // Delete
    document.getElementById('taskDeleteBtn').onclick = () => {
      UI.closeModal('taskDetailModal');
      this.deleteTaskUI(id);
    };

    UI.openModal('taskDetailModal');
  },

  escHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
};
