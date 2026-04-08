/* ============================================================
   data.js — データ層
   優先順位: Supabase（ログイン時）> LocalStorage（オフライン/未ログイン）
   ============================================================ */

/* ---- In-memory state ---- */
const Store = {
  tasks:       [],
  projects:    [],
  wbsNodes:    [],
  reflections: [],
  goals:       [],
  settings:    {},

  /* ---- 初期化 ---- */
  async init() {
    // ローカル設定を先に読む（Gemini APIキーなど）
    this.settings = JSON.parse(localStorage.getItem('mtm_settings') || '{}');

    if (SB.isLoggedIn) {
      await this._loadFromSupabase();
      // Supabaseから設定を上書き
      const sbSettings = await SB.loadSettings();
      if (sbSettings?.data) {
        this.settings = { ...this.settings, ...sbSettings.data };
        if (Array.isArray(sbSettings.data.goals)) this.goals = sbSettings.data.goals;
      }
    } else {
      this._loadFromLocal();
    }
  },

  async _loadFromSupabase() {
    try {
      const [tasks, projects, wbsNodes, reflections] = await Promise.all([
        SB.select('tasks'),
        SB.select('projects'),
        SB.select('wbs_nodes'),
        SB.select('reflection_logs')
      ]);
      this.tasks       = tasks       || [];
      this.projects    = projects    || [];
      this.wbsNodes    = wbsNodes    || [];
      this.reflections = reflections || [];
      // ローカルにもキャッシュ
      this._saveLocal();
    } catch (e) {
      console.warn('Supabase読み込みエラー、ローカルにフォールバック:', e);
      this._loadFromLocal();
    }
  },

  _loadFromLocal() {
    this.tasks       = JSON.parse(localStorage.getItem('mtm_tasks')       || '[]');
    this.projects    = JSON.parse(localStorage.getItem('mtm_projects')    || '[]');
    this.wbsNodes    = JSON.parse(localStorage.getItem('mtm_wbs')         || '[]');
    this.reflections = JSON.parse(localStorage.getItem('mtm_reflections') || '[]');
    this.goals       = JSON.parse(localStorage.getItem('mtm_goals')       || '[]');
  },

  _saveLocal() {
    localStorage.setItem('mtm_tasks',       JSON.stringify(this.tasks));
    localStorage.setItem('mtm_projects',    JSON.stringify(this.projects));
    localStorage.setItem('mtm_wbs',         JSON.stringify(this.wbsNodes));
    localStorage.setItem('mtm_reflections', JSON.stringify(this.reflections));
    localStorage.setItem('mtm_goals',       JSON.stringify(this.goals));
    localStorage.setItem('mtm_settings',    JSON.stringify(this.settings));
  },

  // 後方互換のために saveLocal も残す
  saveLocal() { this._saveLocal(); },

  /* ---- Tasks ---- */
  async addTask(taskData) {
    const data = {
      ...taskData,
      is_completed: false,
      subtasks: taskData.subtasks || [],
      tags: taskData.tags || []
    };
    let created;
    if (SB.isLoggedIn) {
      try { created = await SB.insert('tasks', data); }
      catch (e) {
        console.warn('タスク追加エラー:', e);
        created = { ...data, id: 'local_' + Date.now(), created_at: Date.now() };
      }
    } else {
      created = { ...data, id: 'local_' + Date.now(), created_at: Date.now() };
    }
    this.tasks.unshift(created);
    this._saveLocal();
    return created;
  },

  async updateTask(id, patch) {
    const idx = this.tasks.findIndex(t => t.id === id);
    if (idx < 0) return null;
    let updated;
    if (SB.isLoggedIn && !String(id).startsWith('local_')) {
      try { updated = await SB.update('tasks', id, patch); }
      catch { updated = { ...this.tasks[idx], ...patch, updated_at: new Date().toISOString() }; }
    } else {
      updated = { ...this.tasks[idx], ...patch, updated_at: new Date().toISOString() };
    }
    this.tasks[idx] = updated;
    this._saveLocal();
    return updated;
  },

  async deleteTask(id) {
    if (SB.isLoggedIn && !String(id).startsWith('local_')) {
      try { await SB.delete('tasks', id); } catch {}
    }
    this.tasks = this.tasks.filter(t => t.id !== id);
    this._saveLocal();
  },

  async completeTask(id) {
    return this.updateTask(id, { is_completed: true, completed_at: new Date().toISOString() });
  },
  async uncompleteTask(id) {
    return this.updateTask(id, { is_completed: false, completed_at: null });
  },

  /* ---- Projects ---- */
  async addProject(data) {
    let created;
    if (SB.isLoggedIn) {
      try { created = await SB.insert('projects', data); }
      catch { created = { ...data, id: 'local_' + Date.now() }; }
    } else {
      created = { ...data, id: 'local_' + Date.now() };
    }
    this.projects.push(created);
    this._saveLocal();
    return created;
  },

  async updateProject(id, patch) {
    const idx = this.projects.findIndex(p => p.id === id);
    if (idx < 0) return null;
    let updated;
    if (SB.isLoggedIn && !String(id).startsWith('local_')) {
      try { updated = await SB.update('projects', id, patch); }
      catch { updated = { ...this.projects[idx], ...patch }; }
    } else {
      updated = { ...this.projects[idx], ...patch };
    }
    this.projects[idx] = updated;
    this._saveLocal();
    return updated;
  },

  async deleteProject(id) {
    if (SB.isLoggedIn && !String(id).startsWith('local_')) {
      try { await SB.delete('projects', id); } catch {}
    }
    this.projects = this.projects.filter(p => p.id !== id);
    this.tasks    = this.tasks.filter(t => t.project_id !== id);
    this._saveLocal();
  },

  /* ---- WBS Nodes ---- */
  async addWbsNode(data) {
    const maxOrder = this.wbsNodes
      .filter(n => n.project_id === data.project_id)
      .reduce((m, n) => Math.max(m, n.sort_order || 0), 0);
    const nodeData = {
      status: 'not_started', priority: 'P3', progress: 0,
      depth: 0, sort_order: maxOrder + 1, ...data
    };
    let created;
    if (SB.isLoggedIn) {
      try { created = await SB.insert('wbs_nodes', nodeData); }
      catch { created = { ...nodeData, id: 'local_' + Date.now(), created_at: Date.now() }; }
    } else {
      created = { ...nodeData, id: 'local_' + Date.now(), created_at: Date.now() };
    }
    this.wbsNodes.push(created);
    this._saveLocal();
    return created;
  },

  async updateWbsNode(id, patch) {
    const idx = this.wbsNodes.findIndex(n => n.id === id);
    if (idx < 0) return null;
    let updated;
    if (SB.isLoggedIn && !String(id).startsWith('local_')) {
      try { updated = await SB.update('wbs_nodes', id, patch); }
      catch { updated = { ...this.wbsNodes[idx], ...patch, updated_at: new Date().toISOString() }; }
    } else {
      updated = { ...this.wbsNodes[idx], ...patch, updated_at: new Date().toISOString() };
    }
    this.wbsNodes[idx] = updated;
    this._saveLocal();
    return updated;
  },

  async deleteWbsNode(id) {
    const toDelete = this.getWbsDescendants(id).map(n => n.id);
    toDelete.push(id);
    for (const did of toDelete) {
      if (SB.isLoggedIn && !String(did).startsWith('local_')) {
        try { await SB.delete('wbs_nodes', did); } catch {}
      }
    }
    this.wbsNodes = this.wbsNodes.filter(n => !toDelete.includes(n.id));
    this._saveLocal();
  },

  getWbsNodesByProject(projectId) {
    return this.wbsNodes
      .filter(n => n.project_id === projectId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  },
  getWbsDescendants(nodeId) {
    const children = this.wbsNodes.filter(n => n.parent_id === nodeId);
    return children.flatMap(c => [c, ...this.getWbsDescendants(c.id)]);
  },
  getWbsNodeById(id) { return this.wbsNodes.find(n => n.id === id); },

  /* ---- Reflections ---- */
  async addReflection(data) {
    let created;
    if (SB.isLoggedIn) {
      try { created = await SB.insert('reflection_logs', data); }
      catch { created = { ...data, id: 'local_' + Date.now(), created_at: Date.now() }; }
    } else {
      created = { ...data, id: 'local_' + Date.now(), created_at: Date.now() };
    }
    this.reflections.push(created);
    this._saveLocal();
    return created;
  },

  async updateReflection(id, patch) {
    const idx = this.reflections.findIndex(r => r.id === id);
    if (idx < 0) return null;
    let updated;
    if (SB.isLoggedIn && !String(id).startsWith('local_')) {
      try { updated = await SB.update('reflection_logs', id, patch); }
      catch { updated = { ...this.reflections[idx], ...patch }; }
    } else {
      updated = { ...this.reflections[idx], ...patch };
    }
    this.reflections[idx] = updated;
    this._saveLocal();
    return updated;
  },

  async deleteReflection(id) {
    if (SB.isLoggedIn && !String(id).startsWith('local_')) {
      try { await SB.delete('reflection_logs', id); } catch {}
    }
    this.reflections = this.reflections.filter(r => r.id !== id);
    this._saveLocal();
  },

  /* ---- 設定保存 ---- */
  async saveSettings() {
    this._saveLocal();
    if (SB.isLoggedIn) {
      await SB.saveSettings(this.settings).catch(() => {});
    }
  },

  async saveGoals() {
    this._saveLocal();
    if (SB.isLoggedIn) {
      this.settings.goals = this.goals;
      await SB.saveSettings(this.settings).catch(() => {});
    }
  },

  /* ---- Helpers ---- */
  getTasksByProject(pid) {
    return this.tasks.filter(t => t.project_id === pid && !t.is_completed);
  },
  getTodayTasks() {
    const today    = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    return this.tasks.filter(t => {
      if (t.is_completed || !t.due_date) return false;
      const d = new Date(t.due_date);
      return d >= today && d < tomorrow;
    });
  },
  getOverdueTasks() {
    const today = new Date(); today.setHours(0,0,0,0);
    return this.tasks.filter(t =>
      !t.is_completed && t.due_date && new Date(t.due_date) < today
    );
  },
  getUpcomingTasks(days = 7) {
    const today = new Date(); today.setHours(0,0,0,0);
    const end   = new Date(today); end.setDate(today.getDate() + days);
    return this.tasks.filter(t => {
      if (t.is_completed || !t.due_date) return false;
      const d = new Date(t.due_date);
      return d >= today && d < end;
    });
  },
  getTodayCompleted() {
    const today    = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    return this.tasks.filter(t => {
      if (!t.is_completed || !t.completed_at) return false;
      const d = new Date(t.completed_at);
      return d >= today && d < tomorrow;
    });
  },
  getProjectById(id) { return this.projects.find(p => p.id === id); },
  computeStreak() {
    const completedDates = new Set(
      this.tasks
        .filter(t => t.is_completed && t.completed_at)
        .map(t => new Date(t.completed_at).toDateString())
    );
    let streak = 0, d = new Date();
    while (completedDates.has(d.toDateString())) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }
};
