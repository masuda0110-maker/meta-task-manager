/* ============================================================
   auth.js — ログイン / サインアップ UI コントローラー
   ============================================================ */
const Auth = {
  _mode: 'login', // 'login' | 'signup'

  openModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
    this._bindEvents();
    this._setMode('login');
    this._clearMessages();

    // APIキーが有効か確認
    const keyWarning = document.getElementById('authKeyWarning');
    const savedKey = localStorage.getItem('sb_anon_key') || '';
    const hardKey  = 'sb_publishable_WAUcaUGA9wMo3pr_DzlTtg_pX-dV8ph';
    const currentKey = savedKey.startsWith('eyJ') ? savedKey : (hardKey.startsWith('eyJ') ? hardKey : '');
    if (!currentKey) {
      if (keyWarning) keyWarning.style.display = 'block';
      // キー保存ボタン
      const saveKeyBtn = document.getElementById('authSaveKeyBtn');
      if (saveKeyBtn) {
        saveKeyBtn.onclick = () => {
          const newKey = document.getElementById('authAnonKey')?.value.trim();
          if (newKey && newKey.startsWith('eyJ')) {
            localStorage.setItem('sb_anon_key', newKey);
            location.reload();
          } else {
            alert('正しい形式のキーを入力してください（eyJh... で始まる文字列）');
          }
        };
      }
    } else {
      if (keyWarning) keyWarning.style.display = 'none';
    }

    setTimeout(() => document.getElementById('authEmail')?.focus(), 100);
  },

  closeModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  },

  _bindEvents() {
    // 重複登録防止: onclickで上書き
    const loginTab  = document.getElementById('authTabLogin');
    const signupTab = document.getElementById('authTabSignup');
    const submitBtn = document.getElementById('authSubmitBtn');
    const skipBtn   = document.getElementById('authSkipBtn');
    const emailEl   = document.getElementById('authEmail');
    const passEl    = document.getElementById('authPassword');

    if (loginTab)  loginTab.onclick  = () => this._setMode('login');
    if (signupTab) signupTab.onclick = () => this._setMode('signup');
    if (submitBtn) submitBtn.onclick = () => this._submit();
    if (skipBtn)   skipBtn.onclick   = () => { this.closeModal(); App.startApp(); };
    if (emailEl)   emailEl.onkeydown = e => { if (e.key === 'Enter') this._submit(); };
    if (passEl)    passEl.onkeydown  = e => { if (e.key === 'Enter') this._submit(); };
  },

  _setMode(mode) {
    this._mode = mode;
    const isLogin = mode === 'login';

    // タブの見た目（classList + インラインスタイル両方更新）
    const loginTab  = document.getElementById('authTabLogin');
    const signupTab = document.getElementById('authTabSignup');

    if (loginTab) {
      loginTab.classList.toggle('active', isLogin);
      loginTab.style.background   = isLogin ? '#fff' : 'transparent';
      loginTab.style.color        = isLogin ? '#111827' : '#9ca3af';
      loginTab.style.boxShadow    = isLogin ? '0 1px 4px rgba(0,0,0,.08)' : 'none';
      loginTab.style.borderRadius = '6px';
    }
    if (signupTab) {
      signupTab.classList.toggle('active', !isLogin);
      signupTab.style.background   = !isLogin ? '#fff' : 'transparent';
      signupTab.style.color        = !isLogin ? '#111827' : '#9ca3af';
      signupTab.style.boxShadow    = !isLogin ? '0 1px 4px rgba(0,0,0,.08)' : 'none';
      signupTab.style.borderRadius = '6px';
    }

    // ボタンラベル更新
    const labelEl = document.getElementById('authSubmitLabel');
    const iconEl  = document.getElementById('authSubmitBtn')?.querySelector('i');
    if (labelEl) labelEl.textContent = isLogin ? 'ログイン' : 'アカウント作成';
    if (iconEl)  iconEl.className    = isLogin ? 'fas fa-sign-in-alt' : 'fas fa-user-plus';

    this._clearMessages();
  },

  async _submit() {
    const email    = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const btn      = document.getElementById('authSubmitBtn');

    if (!email || !password) {
      this._showError('メールアドレスとパスワードを入力してください');
      return;
    }
    if (password.length < 6) {
      this._showError('パスワードは6文字以上で入力してください');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 処理中…';
    this._clearMessages();

    try {
      if (this._mode === 'login') {
        const result = await SB.signIn(email, password);
        console.log('signIn result:', result);
        this._showSuccess('ログインしました！データを読み込んでいます…');
        setTimeout(() => {
          this.closeModal();
          SB.startAutoRefresh();
          App.startApp();
        }, 800);
      } else {
        const result = await SB.signUp(email, password);
        // メール確認不要の場合（confirm disabled）は即ログイン
        if (result?.session?.access_token || result?.access_token) {
          this._showSuccess('登録完了！データを読み込んでいます…');
          setTimeout(() => { this.closeModal(); App.startApp(); }, 800);
        } else {
          // メール確認が必要な場合
          this._showSuccess('✅ 登録しました！確認メールを送信しました。\nメール内のリンクをクリックしてから「ログイン」タブでログインしてください。');
          this._setMode('login');
        }
      }
    } catch (e) {
      let msg = e.message || 'エラーが発生しました';
      console.error('Auth error (full):', e);
      console.error('Auth error msg:', msg);
      // 日本語化
      if (msg.includes('Invalid login credentials'))   msg = 'メールアドレスまたはパスワードが正しくありません';
      if (msg.includes('Email not confirmed'))         msg = 'メール確認が未完了です。届いたメールのリンクをクリックしてからログインしてください';
      if (msg.includes('User already registered'))    msg = 'このメールアドレスはすでに登録済みです。ログインタブからログインしてください';
      if (msg.includes('Password should be'))         msg = 'パスワードは6文字以上で入力してください';
      if (msg.includes('signup is disabled'))         msg = 'サインアップが無効化されています。Supabase の Authentication → Settings → Enable sign-ups をオンにしてください';
      if (msg.includes('email rate limit'))           msg = '短時間に多くのリクエストが送信されました。しばらく待ってから再試行してください';
      if (msg.includes('For security purposes'))      msg = 'セキュリティのため、しばらく待ってから再試行してください';
      if (msg.includes('already been registered'))    msg = 'このメールアドレスはすでに登録済みです。ログインタブからログインしてください';
      this._showError(msg);
    } finally {
      btn.disabled = false;
      const isLogin = this._mode === 'login';
      btn.innerHTML = `<i class="fas fa-${isLogin ? 'sign-in-alt' : 'user-plus'}"></i> <span id="authSubmitLabel">${isLogin ? 'ログイン' : 'アカウント作成'}</span>`;
    }
  },

  _showError(msg) {
    const el = document.getElementById('authError');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      el.style.color = '#dc2626';
      el.style.fontSize = '.82rem';
      el.style.marginTop = '.6rem';
      el.style.padding = '.5rem .75rem';
      el.style.background = 'rgba(220,38,38,.06)';
      el.style.borderRadius = '6px';
      el.style.border = '1px solid rgba(220,38,38,.2)';
    }
    const ok = document.getElementById('authSuccess');
    if (ok) ok.style.display = 'none';
  },

  _showSuccess(msg) {
    const el = document.getElementById('authSuccess');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      el.style.color = '#059669';
      el.style.fontSize = '.82rem';
      el.style.marginTop = '.6rem';
      el.style.padding = '.5rem .75rem';
      el.style.background = 'rgba(5,150,105,.06)';
      el.style.borderRadius = '6px';
      el.style.border = '1px solid rgba(5,150,105,.2)';
    }
    const err = document.getElementById('authError');
    if (err) err.style.display = 'none';
  },

  _clearMessages() {
    ['authError', 'authSuccess'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
};
