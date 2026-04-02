/* ============================================================
   gemini.js — Gemini API クライアント
   Meta-Task Manager AIコーチ用
   ============================================================ */
const GeminiAI = {

  /* ---- API設定 ---- */
  BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models',

  /* ---- 接続テスト ---- */
  async testConnection(apiKey, model = 'gemini-2.0-flash') {
    try {
      const res = await fetch(
        `${this.BASE_URL}/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'こんにちは' }] }],
            generationConfig: { maxOutputTokens: 10 }
          })
        }
      );
      return res.ok;
    } catch {
      return false;
    }
  },

  /* ---- メインのチャット呼び出し ---- */
  async chat(userMessage, sessionMessages = [], mode = 'free') {
    const apiKey = Store.settings.geminiApiKey;
    const model  = Store.settings.geminiModel || 'gemini-2.0-flash';
    if (!apiKey) return null; // キーなし → ルールベースにフォールバック

    // ---- システムプロンプト ----
    const systemPrompt = this._buildSystemPrompt(mode);

    // ---- 会話履歴を整形 ----
    const history = sessionMessages
      .filter(m => m.role === 'user' || m.role === 'coach')
      .slice(-10) // 直近10件のみ（トークン節約）
      .map(m => ({
        role: m.role === 'coach' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    // ---- コンテキスト情報を付加 ----
    const context = this._buildContext();
    const fullUserMsg = context
      ? `[現在のタスク状況]\n${context}\n\n[ユーザーのメッセージ]\n${userMessage}`
      : userMessage;

    // ---- リクエスト構築 ----
    const contents = [
      // システムプロンプトをユーザーの最初のメッセージとして挿入
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'はい、Meta Coachとして丁寧にサポートします。' }] },
      ...history,
      { role: 'user', parts: [{ text: fullUserMsg }] }
    ];

    try {
      const res = await fetch(
        `${this.BASE_URL}/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              maxOutputTokens: 600,
              temperature: 0.8,
              topP: 0.95,
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
          })
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('Gemini API error:', err);
        return null;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || null;

    } catch (e) {
      console.warn('Gemini fetch error:', e);
      return null;
    }
  },

  /* ---- システムプロンプト構築 ---- */
  _buildSystemPrompt(mode) {
    const modeInstructions = {
      free: `あなたは「Meta Coach」というAIメンタリングコーチです。ユーザーのタスク管理と自己成長をサポートします。
ソクラテス式の問いかけを使い、ユーザーが自分で答えを見つけられるよう促します。
説教や長い説明は避け、1〜2つの鋭い質問で思考を深めましょう。`,

      morning: `あなたは「Meta Coach」です。朝のセッションとして、ユーザーが今日の最重要タスクに集中できるよう支援します。
今日1つだけ達成するとしたら何か、障壁は何か、を具体的に聞きましょう。
エネルギッシュで前向きなトーンで。`,

      evening: `あなたは「Meta Coach」です。夜の振り返りセッションとして、今日の学びを言語化するサポートをします。
Keep（続けること）/ Problem（課題）/ Try（次回試すこと）の観点で振り返りを促しましょう。
自己批判ではなく、学びとして捉えられるよう肯定的なフレーミングを意識してください。`,

      task: `あなたは「Meta Coach」です。タスク完了後の振り返りをサポートします。
このタスクで何を学んだか、次回どう改善するか、を具体的に引き出してください。
短く鋭い問いかけで、ユーザーの気づきを深めましょう。`,

      metacog: `あなたは「Meta Coach」です。メタ認知セッションとして、ユーザーの思考癖・行動パターンを一緒に探ります。
ソクラテス式の深い問いかけを使い、パターンのトリガー・影響・改善実験を段階的に掘り下げてください。
1回の返答は短く（3〜5文程度）、必ず1つの質問で終わること。`,
    };

    const base = modeInstructions[mode] || modeInstructions.free;

    return `${base}

【重要なルール】
- 返答は日本語のみ
- 返答は短く（最大5〜6文）、必ず1つの質問か提案で締めくくる
- Markdownの**太字**は使ってよい
- ユーザーのタスク・感情を否定しない
- 「Meta-Task Manager」のコーチとして、アプリ内のタスク管理と連携した返答を意識する`;
  },

  /* ---- コンテキスト情報（タスク状況）---- */
  _buildContext() {
    try {
      const todayTasks = Store.getTodayTasks();
      const p1 = todayTasks.filter(t => t.priority === 'P1');
      const overdue = Store.getOverdueTasks();
      const recentReflections = Store.reflections.slice(-3);

      let ctx = '';
      if (p1.length)
        ctx += `今日のP1タスク: ${p1.map(t => t.title).join('、')}\n`;
      if (overdue.length)
        ctx += `期限切れタスク: ${overdue.length}件\n`;
      if (todayTasks.length)
        ctx += `今日の残タスク: ${todayTasks.length}件\n`;
      if (recentReflections.length) {
        const last = recentReflections[recentReflections.length - 1];
        if (last?.learning)
          ctx += `直近の気づき: ${last.learning.slice(0, 60)}\n`;
      }
      return ctx;
    } catch {
      return '';
    }
  }
};
