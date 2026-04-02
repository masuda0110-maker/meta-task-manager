/* ============================================================
   wbs.js — WBS (Work Breakdown Structure) Engine
   ツリービュー + ガントチャート + インライン編集
   ============================================================ */
const WBS = {
  currentProjectId: null,
  currentView: 'tree',   // 'tree' | 'gantt'
  expandedNodes: new Set(),
  dragSrcId: null,

  STATUS_MAP: {
    not_started: { label: '未着手', color: '#9ca3af', icon: 'circle' },
    in_progress:  { label: '進行中', color: '#2563eb', icon: 'spinner' },
    done:         { label: '完了',   color: '#059669', icon: 'check-circle' },
    blocked:      { label: 'ブロック', color: '#dc2626', icon: 'ban' },
  },
  PRIORITY_COLOR: { P1: '#dc2626', P2: '#d97706', P3: '#2563eb', P4: '#9ca3af' },
  DEPTH_COLORS: ['#2563eb', '#7c3aed', '#059669', '#d97706', '#0891b2'],

  /* ========== INIT / RENDER ========== */
  render(projectId) {
    this.currentProjectId = projectId;
    const nodes = Store.getWbsNodesByProject(projectId);
    nodes.forEach(n => { if (!n.parent_id) this.expandedNodes.add(n.id); });

    this.renderHeader();
    this.renderStats(nodes);
    if (this.currentView === 'tree') {
      this.renderTree(nodes);
    } else {
      this.renderGantt(nodes);
    }
  },

  renderHeader() {
    const header = document.getElementById('wbsHeader');
    if (!header) return;
    header.innerHTML = `
      <div class="wbs-view-toggle">
        <button class="wbs-view-btn ${this.currentView === 'tree' ? 'active' : ''}" data-wview="tree">
          <i class="fas fa-sitemap"></i> ツリー
        </button>
        <button class="wbs-view-btn ${this.currentView === 'gantt' ? 'active' : ''}" data-wview="gantt">
          <i class="fas fa-chart-gantt"></i> ガント
        </button>
      </div>
      <button class="btn-primary wbs-add-root-btn" id="wbsAddRootBtn">
        <i class="fas fa-plus"></i> フェーズ追加
      </button>
    `;
    header.querySelectorAll('.wbs-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentView = btn.dataset.wview;
        this.render(this.currentProjectId);
      });
    });
    document.getElementById('wbsAddRootBtn').addEventListener('click', () => {
      this.openNodeModal(null, null);
    });
  },

  /* ---- Stats Bar ---- */
  renderStats(nodes) {
    const el = document.getElementById('wbsStats');
    if (!el || !nodes.length) { if (el) el.innerHTML = ''; return; }
    const total = nodes.length;
    const done  = nodes.filter(n => n.status === 'done').length;
    const inProg = nodes.filter(n => n.status === 'in_progress').length;
    const blocked = nodes.filter(n => n.status === 'blocked').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const totalEst = nodes.reduce((s, n) => s + (parseFloat(n.estimated_hours) || 0), 0);
    const totalAct = nodes.reduce((s, n) => s + (parseFloat(n.actual_hours) || 0), 0);

    el.innerHTML = `
      <div class="wbs-stat"><span class="wbs-stat-val">${total}</span><span class="wbs-stat-lbl">総タスク</span></div>
      <div class="wbs-stat"><span class="wbs-stat-val" style="color:var(--success)">${done}</span><span class="wbs-stat-lbl">完了</span></div>
      <div class="wbs-stat"><span class="wbs-stat-val" style="color:#3b82f6">${inProg}</span><span class="wbs-stat-lbl">進行中</span></div>
      <div class="wbs-stat"><span class="wbs-stat-val" style="color:var(--p1)">${blocked}</span><span class="wbs-stat-lbl">ブロック</span></div>
      <div class="wbs-stat-progress">
        <div class="wbs-stat-progress-bar">
          <div class="wbs-stat-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="wbs-stat-pct">${pct}%</span>
      </div>
      <div class="wbs-stat"><span class="wbs-stat-val">${totalEst}h</span><span class="wbs-stat-lbl">見積もり</span></div>
      <div class="wbs-stat"><span class="wbs-stat-val ${totalAct > totalEst && totalEst > 0 ? 'text-p1' : ''}">${totalAct}h</span><span class="wbs-stat-lbl">実績</span></div>
    `;
  },

  /* ========== TREE VIEW ========== */
  renderTree(nodes) {
    const container = document.getElementById('wbsTreeBody');
    if (!container) return;
    container.innerHTML = '';

    const roots = nodes.filter(n => !n.parent_id);
    if (!roots.length) {
      container.innerHTML = `
        <div class="wbs-empty">
          <i class="fas fa-sitemap"></i>
          <p>WBSがありません。「フェーズ追加」からプロジェクトの作業分解を始めましょう。</p>
        </div>`;
      return;
    }
    roots.forEach(root => this.renderNodeRow(root, nodes, container, 0));
  },

  renderNodeRow(node, allNodes, container, depth) {
    const children = allNodes.filter(n => n.parent_id === node.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const hasChildren = children.length > 0;
    const isExpanded = this.expandedNodes.has(node.id);
    const st = this.STATUS_MAP[node.status] || this.STATUS_MAP.not_started;
    const color = this.DEPTH_COLORS[depth % this.DEPTH_COLORS.length];
    const pct = node.progress || 0;

    const row = document.createElement('div');
    row.className = `wbs-row depth-${depth}`;
    row.dataset.id = node.id;
    row.draggable = true;

    row.innerHTML = `
      <div class="wbs-row-main" style="padding-left:${depth * 24 + 8}px">
        <div class="wbs-expand-btn ${hasChildren ? '' : 'invisible'}" data-id="${node.id}">
          <i class="fas fa-chevron-${isExpanded ? 'down' : 'right'}"></i>
        </div>
        <div class="wbs-depth-bar" style="background:${color}"></div>
        <div class="wbs-row-content">
          <div class="wbs-row-top">
            <span class="wbs-node-title">${this.esc(node.title)}</span>
            <div class="wbs-row-actions">
              <span class="wbs-status-badge" style="background:${st.color}20;color:${st.color}">
                <i class="fas fa-${st.icon}${node.status === 'in_progress' ? ' fa-spin' : ''}"></i> ${st.label}
              </span>
              ${node.assignee ? `<span class="wbs-assignee"><i class="fas fa-user"></i> ${this.esc(node.assignee)}</span>` : ''}
              ${node.start_date && node.end_date ? `<span class="wbs-dates"><i class="fas fa-calendar"></i> ${this.fmtDate(node.start_date)} → ${this.fmtDate(node.end_date)}</span>` : ''}
              ${node.estimated_hours ? `<span class="wbs-hours"><i class="fas fa-clock"></i> ${node.estimated_hours}h</span>` : ''}
              <span class="wbs-priority-dot" style="background:${this.PRIORITY_COLOR[node.priority] || '#6b7280'}" title="${node.priority || 'P3'}"></span>
              <div class="wbs-action-btns">
                <button class="wbs-btn" data-action="add-child" data-id="${node.id}" title="子タスク追加"><i class="fas fa-plus"></i></button>
                <button class="wbs-btn" data-action="edit" data-id="${node.id}" title="編集"><i class="fas fa-edit"></i></button>
                <button class="wbs-btn danger" data-action="delete" data-id="${node.id}" title="削除"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </div>
          ${pct > 0 || node.status === 'in_progress' ? `
          <div class="wbs-progress-wrap">
            <div class="wbs-progress-bar">
              <div class="wbs-progress-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <span class="wbs-pct-label">${pct}%</span>
          </div>` : ''}
          ${node.description ? `<div class="wbs-desc">${this.esc(node.description)}</div>` : ''}
        </div>
      </div>
    `;

    // Expand toggle
    const expandBtn = row.querySelector('.wbs-expand-btn');
    if (hasChildren) {
      expandBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (this.expandedNodes.has(node.id)) this.expandedNodes.delete(node.id);
        else this.expandedNodes.add(node.id);
        this.render(this.currentProjectId);
      });
    }

    // Action buttons
    row.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'add-child') this.openNodeModal(id, null);
        if (action === 'edit')      this.openNodeModal(null, id);
        if (action === 'delete')    this.deleteNodeUI(id);
      });
    });

    // Drag and drop
    row.addEventListener('dragstart', e => {
      this.dragSrcId = node.id;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', async e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (this.dragSrcId && this.dragSrcId !== node.id) {
        // Move dragged node: update sort_order to appear before this node
        const srcNode = Store.getWbsNodeById(this.dragSrcId);
        if (srcNode && srcNode.project_id === node.project_id) {
          await Store.updateWbsNode(this.dragSrcId, {
            parent_id: node.parent_id || null,
            sort_order: (node.sort_order || 0) - 0.5
          });
          // Re-normalize sort_orders
          const siblings = Store.getWbsNodesByProject(this.currentProjectId)
            .filter(n => (n.parent_id || null) === (node.parent_id || null))
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          for (let i = 0; i < siblings.length; i++) {
            await Store.updateWbsNode(siblings[i].id, { sort_order: i + 1 });
          }
          this.render(this.currentProjectId);
        }
      }
    });

    container.appendChild(row);

    // Render children if expanded
    if (hasChildren && isExpanded) {
      children.forEach(child => this.renderNodeRow(child, allNodes, container, depth + 1));
    }
  },

  /* ========== GANTT VIEW ========== */
  renderGantt(nodes) {
    const container = document.getElementById('wbsTreeBody');
    if (!container) return;
    container.innerHTML = '';

    // Determine date range
    const dated = nodes.filter(n => n.start_date && n.end_date);
    if (!dated.length) {
      container.innerHTML = `
        <div class="wbs-empty">
          <i class="fas fa-chart-gantt"></i>
          <p>開始日・終了日が設定されたタスクがありません。<br>各タスクを編集して日程を設定してください。</p>
        </div>`;
      return;
    }

    const minDate = new Date(Math.min(...dated.map(n => new Date(n.start_date))));
    const maxDate = new Date(Math.max(...dated.map(n => new Date(n.end_date))));
    minDate.setDate(minDate.getDate() - 1);
    maxDate.setDate(maxDate.getDate() + 2);

    const totalDays = Math.ceil((maxDate - minDate) / 86400000);
    const dayW = Math.max(32, Math.floor(900 / totalDays)); // px per day

    // Header: dates
    const gantt = document.createElement('div');
    gantt.className = 'gantt-wrap';

    // Build header
    const headerRow = document.createElement('div');
    headerRow.className = 'gantt-header';
    headerRow.innerHTML = `<div class="gantt-label-col">タスク名</div><div class="gantt-chart-col">`;
    const chartHeader = headerRow.querySelector('.gantt-chart-col');
    chartHeader.style.minWidth = (totalDays * dayW) + 'px';

    // Month grouping
    const monthBar = document.createElement('div');
    monthBar.className = 'gantt-month-bar';
    let cur = new Date(minDate);
    while (cur < maxDate) {
      const monthStart = new Date(cur);
      const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate() - cur.getDate() + 1;
      const span = Math.min(daysInMonth, Math.ceil((maxDate - cur) / 86400000));
      const cell = document.createElement('div');
      cell.className = 'gantt-month-cell';
      cell.style.width = (span * dayW) + 'px';
      cell.textContent = `${cur.getMonth() + 1}月`;
      monthBar.appendChild(cell);
      cur.setDate(cur.getDate() + span);
    }
    chartHeader.appendChild(monthBar);

    // Day bar
    const dayBar = document.createElement('div');
    dayBar.className = 'gantt-day-bar';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(minDate); d.setDate(d.getDate() + i);
      const cell = document.createElement('div');
      cell.className = 'gantt-day-cell';
      cell.style.width = dayW + 'px';
      const isToday = d.toDateString() === today.toDateString();
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (isToday) cell.classList.add('today');
      if (isWeekend) cell.classList.add('weekend');
      cell.textContent = d.getDate();
      dayBar.appendChild(cell);
    }
    chartHeader.appendChild(dayBar);
    gantt.appendChild(headerRow);

    // Rows
    const allNodes = Store.getWbsNodesByProject(this.currentProjectId);
    nodes.forEach(node => {
      const depth = this.calcDepth(node, allNodes);
      const st = this.STATUS_MAP[node.status] || this.STATUS_MAP.not_started;
      const color = this.DEPTH_COLORS[depth % this.DEPTH_COLORS.length];

      const row = document.createElement('div');
      row.className = 'gantt-row';

      const label = document.createElement('div');
      label.className = 'gantt-label-col';
      label.style.paddingLeft = (depth * 14 + 8) + 'px';
      label.innerHTML = `
        <span class="wbs-depth-bar" style="background:${color};height:12px;width:3px;border-radius:2px;flex-shrink:0"></span>
        <span class="gantt-task-name">${this.esc(node.title)}</span>
        <span class="wbs-status-badge" style="background:${st.color}20;color:${st.color};font-size:.65rem">${st.label}</span>
      `;

      const chartCol = document.createElement('div');
      chartCol.className = 'gantt-chart-col';
      chartCol.style.minWidth = (totalDays * dayW) + 'px';
      chartCol.style.position = 'relative';

      // Today line
      const todayOffset = Math.floor((today - minDate) / 86400000);
      if (todayOffset >= 0 && todayOffset < totalDays) {
        const line = document.createElement('div');
        line.className = 'gantt-today-line';
        line.style.left = (todayOffset * dayW + dayW / 2) + 'px';
        chartCol.appendChild(line);
      }

      // Grid columns
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(minDate); d.setDate(d.getDate() + i);
        const cell = document.createElement('div');
        cell.className = 'gantt-grid-cell';
        cell.style.width = dayW + 'px';
        if (d.getDay() === 0 || d.getDay() === 6) cell.classList.add('weekend');
        chartCol.appendChild(cell);
      }

      // Bar
      if (node.start_date && node.end_date) {
        const start = new Date(node.start_date); start.setHours(0, 0, 0, 0);
        const end   = new Date(node.end_date);   end.setHours(0, 0, 0, 0);
        const startOff = Math.floor((start - minDate) / 86400000);
        const duration = Math.max(1, Math.ceil((end - start) / 86400000) + 1);
        const bar = document.createElement('div');
        bar.className = 'gantt-bar';
        bar.style.left   = (startOff * dayW) + 'px';
        bar.style.width  = (duration * dayW - 4) + 'px';
        bar.style.background = color;
        bar.style.opacity = node.status === 'done' ? '0.6' : '1';

        // Progress fill
        const pct = node.progress || 0;
        bar.innerHTML = `
          <div class="gantt-bar-fill" style="width:${pct}%;background:rgba(255,255,255,0.3)"></div>
          <span class="gantt-bar-label">${this.esc(node.title)}</span>
        `;
        bar.title = `${node.title} | ${this.fmtDate(node.start_date)} → ${this.fmtDate(node.end_date)} | ${pct}%`;
        bar.addEventListener('click', () => this.openNodeModal(null, node.id));
        chartCol.appendChild(bar);
      }

      row.appendChild(label);
      row.appendChild(chartCol);
      gantt.appendChild(row);
    });

    container.appendChild(gantt);
  },

  calcDepth(node, allNodes) {
    let d = 0, cur = node;
    while (cur.parent_id) {
      cur = allNodes.find(n => n.id === cur.parent_id);
      if (!cur) break;
      d++;
    }
    return d;
  },

  /* ========== NODE MODAL ========== */
  openNodeModal(parentId, editId) {
    const node = editId ? Store.getWbsNodeById(editId) : null;
    const isEdit = !!node;
    const modal = document.getElementById('wbsNodeModal');
    const title = document.getElementById('wbsNodeModalTitle');
    title.innerHTML = `<i class="fas fa-sitemap"></i> ${isEdit ? 'WBSノード編集' : (parentId ? 'サブタスク追加' : 'フェーズ追加')}`;

    const parentNode = parentId ? Store.getWbsNodeById(parentId) : null;
    const allNodes = Store.getWbsNodesByProject(this.currentProjectId);

    const startVal = node?.start_date ? new Date(node.start_date).toISOString().split('T')[0] : '';
    const endVal   = node?.end_date   ? new Date(node.end_date).toISOString().split('T')[0] : '';

    document.getElementById('wbsNodeModalBody').innerHTML = `
      ${parentNode ? `<div class="wbs-parent-hint"><i class="fas fa-level-up-alt"></i> 親: <strong>${this.esc(parentNode.title)}</strong></div>` : ''}
      <div class="field-row">
        <label>タスク名 <span style="color:var(--p1)">*</span></label>
        <input type="text" id="wnTitle" class="modal-input" placeholder="作業名を入力" value="${this.esc(node?.title || '')}" />
      </div>
      <div class="field-row">
        <label>説明</label>
        <textarea id="wnDesc" class="modal-textarea" placeholder="詳細・メモ">${this.esc(node?.description || '')}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="field-row">
          <label>ステータス</label>
          <select id="wnStatus" class="modal-select">
            ${Object.entries(this.STATUS_MAP).map(([k, v]) =>
              `<option value="${k}" ${(node?.status || 'not_started') === k ? 'selected' : ''}>${v.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field-row">
          <label>優先度</label>
          <select id="wnPriority" class="modal-select">
            ${['P1','P2','P3','P4'].map(p =>
              `<option value="${p}" ${(node?.priority || 'P3') === p ? 'selected' : ''}>${p}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="field-row">
          <label>開始予定日</label>
          <input type="date" id="wnStart" class="modal-input" value="${startVal}" />
        </div>
        <div class="field-row">
          <label>終了予定日</label>
          <input type="date" id="wnEnd" class="modal-input" value="${endVal}" />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem">
        <div class="field-row">
          <label>進捗率 (%)</label>
          <input type="number" id="wnProgress" class="modal-input" min="0" max="100" value="${node?.progress || 0}" />
        </div>
        <div class="field-row">
          <label>見積もり時間 (h)</label>
          <input type="number" id="wnEstH" class="modal-input" min="0" step="0.5" value="${node?.estimated_hours || ''}" placeholder="0" />
        </div>
        <div class="field-row">
          <label>実績時間 (h)</label>
          <input type="number" id="wnActH" class="modal-input" min="0" step="0.5" value="${node?.actual_hours || ''}" placeholder="0" />
        </div>
      </div>
      <div class="field-row">
        <label>担当者</label>
        <input type="text" id="wnAssignee" class="modal-input" placeholder="担当者名" value="${this.esc(node?.assignee || '')}" />
      </div>
      ${isEdit && allNodes.length > 1 ? `
      <div class="field-row">
        <label>親ノード変更</label>
        <select id="wnParent" class="modal-select">
          <option value="">なし（ルート）</option>
          ${allNodes.filter(n => n.id !== editId).map(n =>
            `<option value="${n.id}" ${(node?.parent_id || '') === n.id ? 'selected' : ''}>${'　'.repeat(this.calcDepth(n, allNodes))}${this.esc(n.title)}</option>`
          ).join('')}
        </select>
      </div>` : ''}
      <div class="field-row">
        <label>タスク連携（任意）</label>
        <select id="wnTaskLink" class="modal-select">
          <option value="">なし</option>
          ${Store.tasks.filter(t => t.project_id === this.currentProjectId).map(t =>
            `<option value="${t.id}" ${(node?.task_id || '') === t.id ? 'selected' : ''}>${this.esc(t.title)}</option>`
          ).join('')}
        </select>
      </div>
    `;

    // Save handler
    document.getElementById('wbsSaveNodeBtn').onclick = async () => {
      const titleVal = document.getElementById('wnTitle').value.trim();
      if (!titleVal) { UI.toast('タスク名を入力してください', 'error'); return; }

      const startRaw = document.getElementById('wnStart').value;
      const endRaw   = document.getElementById('wnEnd').value;

      const payload = {
        title:           titleVal,
        description:     document.getElementById('wnDesc').value.trim(),
        status:          document.getElementById('wnStatus').value,
        priority:        document.getElementById('wnPriority').value,
        start_date:      startRaw ? new Date(startRaw).toISOString() : null,
        end_date:        endRaw   ? new Date(endRaw).toISOString()   : null,
        progress:        parseInt(document.getElementById('wnProgress').value) || 0,
        estimated_hours: parseFloat(document.getElementById('wnEstH').value) || null,
        actual_hours:    parseFloat(document.getElementById('wnActH').value) || null,
        assignee:        document.getElementById('wnAssignee').value.trim(),
        task_id:         document.getElementById('wnTaskLink').value || null,
      };

      if (isEdit) {
        const parentSel = document.getElementById('wnParent');
        if (parentSel) payload.parent_id = parentSel.value || null;
        await Store.updateWbsNode(editId, payload);
        UI.toast('更新しました', 'success');
      } else {
        payload.project_id = this.currentProjectId;
        payload.parent_id  = parentId || null;
        payload.depth      = parentId ? (Store.getWbsNodeById(parentId)?.depth || 0) + 1 : 0;
        await Store.addWbsNode(payload);
        if (parentId) this.expandedNodes.add(parentId);
        UI.toast('追加しました', 'success');
      }

      UI.closeModal('wbsNodeModal');
      this.render(this.currentProjectId);
    };

    UI.openModal('wbsNodeModal');
    setTimeout(() => document.getElementById('wnTitle')?.focus(), 100);
  },

  async deleteNodeUI(id) {
    const node = Store.getWbsNodeById(id);
    const children = Store.getWbsDescendants(id);
    const msg = children.length
      ? `「${node?.title}」と配下の${children.length}件を削除しますか？`
      : `「${node?.title}」を削除しますか？`;
    if (!confirm(msg)) return;
    await Store.deleteWbsNode(id);
    this.render(this.currentProjectId);
    UI.toast('削除しました', 'info');
  },

  /* ---- Helpers ---- */
  esc(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
  fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth()+1}/${d.getDate()}`;
  }
};
