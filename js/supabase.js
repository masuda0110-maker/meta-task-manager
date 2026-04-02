/* ============================================================
   supabase.js — Supabase 認証 & データ永続化
   ============================================================ */

// config.js の値を使用（デプロイ前に config.js を編集してください）
const SUPABASE_URL      = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL')
  ? APP_CONFIG.SUPABASE_URL
  : localStorage.getItem('sb_url') || '';

const SUPABASE_ANON_KEY = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY')
  ? APP_CONFIG.SUPABASE_ANON_KEY
  : localStorage.getItem('sb_anon_key') || '';

/* ---- 低レベル REST ヘルパー ---- */
const SB = {
  _token: null,
  _userId: null,
  _user: null,

  headers(extra = {}) {
    const h = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      ...extra
    };
    if (this._token) h['Authorization'] = `Bearer ${this._token}`;
    return h;
  },

  /* ---- Auth ---- */
  async signUp(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.msg || data.error_description || data.message || 'サインアップ失敗');
    // メール確認不要の場合はセッションが返ってくる
    if (data.access_token) {
      this._token  = data.access_token;
      this._userId = data.user?.id;
      this._user   = data.user;
      localStorage.setItem('sb_refresh', data.refresh_token || '');
      localStorage.setItem('sb_token',   data.access_token  || '');
      localStorage.setItem('sb_user',    JSON.stringify(data.user || {}));
    } else if (data.session?.access_token) {
      this._token  = data.session.access_token;
      this._userId = data.user?.id;
      this._user   = data.user;
      localStorage.setItem('sb_refresh', data.session.refresh_token || '');
      localStorage.setItem('sb_token',   data.session.access_token  || '');
      localStorage.setItem('sb_user',    JSON.stringify(data.user || {}));
    }
    return data;
  },

  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    console.log('signIn raw response:', r.status, JSON.stringify(data).slice(0,200));
    if (!r.ok) throw new Error(data.error_description || data.msg || data.message || data.error || 'ログイン失敗 (HTTP ' + r.status + ')');
    if (!data.access_token) throw new Error('アクセストークンが取得できませんでした。Supabaseの設定を確認してください');
    this._token  = data.access_token;
    this._userId = data.user?.id;
    this._user   = data.user;
    // リフレッシュトークンを保存
    localStorage.setItem('sb_refresh', data.refresh_token || '');
    localStorage.setItem('sb_token',   data.access_token  || '');
    localStorage.setItem('sb_user',    JSON.stringify(data.user || {}));
    return data;
  },

  async signOut() {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST', headers: this.headers()
      });
    } catch {}
    this._token = null; this._userId = null; this._user = null;
    localStorage.removeItem('sb_refresh');
    localStorage.removeItem('sb_token');
    localStorage.removeItem('sb_user');
  },

  async restoreSession() {
    const token   = localStorage.getItem('sb_token');
    const refresh = localStorage.getItem('sb_refresh');
    const user    = JSON.parse(localStorage.getItem('sb_user') || 'null');
    if (!token || !refresh) return false;

    // アクセストークンを使ってユーザー情報を取得（有効確認）
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: this.headers({ Authorization: `Bearer ${token}` })
      });
      if (r.ok) {
        this._token  = token;
        this._user   = await r.json();
        this._userId = this._user.id;
        return true;
      }
      // アクセストークン期限切れ → リフレッシュ
      return await this.refreshToken(refresh);
    } catch {
      return await this.refreshToken(refresh);
    }
  },

  async refreshToken(refreshToken) {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!r.ok) return false;
      const data = await r.json();
      this._token  = data.access_token;
      this._userId = data.user?.id;
      this._user   = data.user;
      localStorage.setItem('sb_refresh', data.refresh_token || '');
      localStorage.setItem('sb_token',   data.access_token  || '');
      localStorage.setItem('sb_user',    JSON.stringify(data.user || {}));
      return true;
    } catch {
      return false;
    }
  },

  get isLoggedIn() { return !!this._token && !!this._userId; },
  get userId()     { return this._userId; },
  get userEmail()  { return this._user?.email || ''; },

  /* ---- データ CRUD ---- */
  async select(table, filter = '') {
    const url = `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${this._userId}&order=created_at.asc${filter ? '&' + filter : ''}`;
    const r = await fetch(url, { headers: this.headers({ 'Prefer': 'return=representation' }) });
    if (!r.ok) throw new Error(`SB select ${table} failed: ${r.status}`);
    return r.json();
  },

  async insert(table, data) {
    const row = { ...data, user_id: this._userId };
    // id が local_ で始まる場合は除去して Supabase に採番させる
    if (row.id && String(row.id).startsWith('local_')) delete row.id;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: this.headers({ 'Prefer': 'return=representation' }),
      body: JSON.stringify(row)
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(`SB insert ${table} failed: ${JSON.stringify(err)}`);
    }
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result;
  },

  async update(table, id, patch) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&user_id=eq.${this._userId}`,
      {
        method: 'PATCH',
        headers: this.headers({ 'Prefer': 'return=representation' }),
        body: JSON.stringify(patch)
      }
    );
    if (!r.ok) throw new Error(`SB update ${table} failed: ${r.status}`);
    const result = await r.json();
    return Array.isArray(result) ? result[0] : result;
  },

  async delete(table, id) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&user_id=eq.${this._userId}`,
      { method: 'DELETE', headers: this.headers() }
    );
    if (!r.ok) throw new Error(`SB delete ${table} failed: ${r.status}`);
  },

  /* ---- 設定の保存/読み込み ---- */
  async loadSettings() {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_settings?user_id=eq.${this._userId}`,
        { headers: this.headers() }
      );
      if (!r.ok) return null;
      const rows = await r.json();
      return rows[0] || null;
    } catch { return null; }
  },

  async saveSettings(settings) {
    try {
      // upsert
      const r = await fetch(`${SUPABASE_URL}/rest/v1/user_settings`, {
        method: 'POST',
        headers: this.headers({ 'Prefer': 'resolution=merge-duplicates,return=representation' }),
        body: JSON.stringify({ user_id: this._userId, data: settings })
      });
      return r.ok;
    } catch { return false; }
  }
};
