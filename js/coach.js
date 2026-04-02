/* ============================================================
   coach.js — AI Mentoring Coach (rule-based dialogue engine)
   ============================================================ */
const Coach = {
  currentMode: 'free',
  currentSession: null,
  growthChart: null,

  /* ---- Persona responses per mode ---- */
  PERSONAS: {
    free: {
      greeting: `こんにちは！Meta Coachです 🧠\n\n何でも話しかけてください。タスクの壁打ち、思考の整理、自己理解の深化など、あなたの成長をサポートします。\n\n**今、一番気になっていることは何ですか？**`,
      suggestions: ['今日の気分を教えて', '最近の課題を話したい', '自分の思考癖を知りたい', 'モチベーションが低い']
    },
    morning: {
      greeting: `おはようございます！☀️ 今日も一日、意図を持って動きましょう。\n\nまず確認させてください。**今日、絶対に達成したい「1つのこと」は何ですか？**\n\n（P1タスクがある場合、それに対して何が不安・障壁になりそうですか？）`,
      suggestions: ['P1タスクに集中する', '昨日の課題を解決する', '今日の気持ちを整理する', 'リスクを事前に考えたい']
    },
    evening: {
      greeting: `お疲れ様でした 🌙 今日の1日を振り返りましょう。\n\n**今日、一番うまくいったことは何でしたか？**\n\nまた、**もし今日をやり直せるとしたら、何を変えますか？**`,
      suggestions: ['うまくいったことを話す', '改善したいことがある', 'KPTで振り返りたい', '明日の準備をしたい']
    },
    task: {
      greeting: `タスク完了、お疲れ様です！💪\n\n**このタスクを通じて気づいたことはありましたか？**\n\n以下について教えてください：\n・集中できた瞬間はいつ？その要因は？\n・次回同じタスクをやるなら、何を変える？`,
      suggestions: ['想定より時間がかかった', 'スムーズに進んだ', '別の課題が見えた', '集中の質を振り返りたい']
    },
    metacog: {
      greeting: `メタ認知セッションへようこそ 🔬\n\n**自分の思考・行動パターンを一緒に探っていきましょう。**\n\n最近、「なぜかこうなってしまう」と感じていることはありますか？\n例：先延ばし・完璧主義・決断が遅いなど`,
      suggestions: ['先延ばしを改善したい', '完璧主義すぎる', '決断が苦手', '集中力が続かない']
    }
  },

  /* ---- Knowledge base for contextual responses ---- */
  KB: [
    {
      keywords: ['集中', 'フォーカス', '集中できない', '散漫', '気が散る'],
      response: `集中力の課題ですね。少し深掘りしてみましょう。\n\n**まず、「集中できていない」と感じるのは、どんな状況の時ですか？**\n\n例えば：\n• 作業の種類（創造的 vs ルーティン）\n• 時間帯（朝 vs 午後）\n• 環境（場所・音・通知）\n• 心理状態（不安・退屈・疲労）\n\n自分のパターンが見えると、根本的な対策が打てます。どれが一番当てはまりそうですか？`
    },
    {
      keywords: ['モチベーション', 'やる気', 'やりたくない', '気が乗らない', '意欲'],
      response: `モチベーションが落ちているのですね。これは正常な状態です。\n\n**でも、まず確認させてください。**\n\nそのタスク（仕事）が「意味がないから」やりたくないのか、「疲れているから」なのか、「怖いから（失敗・評価が怖い）」なのかで、対策が全然違います。\n\n今のあなたは、どれに近いですか？`
    },
    {
      keywords: ['時間', '時間がない', '忙しい', '詰め込み過ぎ', 'タスクが多い'],
      response: `時間が足りないと感じているんですね。\n\n**ここで逆説的な質問をさせてください：**\n「もし1日2時間しか作業できないとしたら、あなたは今日、何をしますか？」\n\nその答えが、本当のP1です。多くの場合、「時間がない」は「優先度が曖昧」の別の言い方です。今週のタスクを見直してみましょう。`
    },
    {
      keywords: ['目標', '達成', '進捗', '成果'],
      response: () => {
        const allTasks = Store.tasks.filter(t => !t.is_completed);
        const p1 = allTasks.filter(t => t.priority === 'P1');
        const overdue = Store.getOverdueTasks();
        if (!allTasks.length) return `タスクがまだ登録されていません。\n\n「今日」ビューや各プロジェクトからタスクを追加して、今日の目標を明確にしましょう！`;
        let msg = `現在の状況です：\n\n`;
        msg += `📋 残タスク合計: **${allTasks.length}件**\n`;
        msg += `🔴 P1（最重要）: **${p1.length}件**\n`;
        if (overdue.length) msg += `⏰ 期限切れ: **${overdue.length}件**\n`;
        msg += `\nP1タスクを最優先に進めていきましょう。今日、最も重要なタスクは何ですか？`;
        return msg;
      }
    },
    {
      keywords: ['今日', 'タスク', '今日のタスク'],
      response: () => {
        const today = Store.getTodayTasks();
        const p1 = today.filter(t => t.priority === 'P1');
        if (!today.length) return `今日のタスクはまだありません。\n\n「今日」ビューからP1タスクを追加して、フォーカスを決めましょう！`;
        return `今日のタスク: **${today.length}件**\nP1（最重要）: **${p1.length}件**\n\n${p1.map(t => `🔴 ${t.title}`).join('\n')}\n\nP1を1件ずつ着実に進めましょう。まず最初の1件、どれから始めますか？`;
      }
    },
    {
      keywords: ['振り返り', 'レビュー', '反省', 'KPT'],
      response: `振り返りは成長の最大のエンジンです。\n\n**今日の「KPT」を一緒にやってみましょう：**\n\n🟢 **Keep** — 今日、うまくいったことは？続けたいことは？\n🔴 **Problem** — 障壁になったことは？なぜそうなった？\n🔵 **Try** — 次回、1つだけ変えるとしたら何をしますか？\n\n**ポイント：** Problemの「なぜ」を掘り下げると、自分の思考癖が見えてきます。まずどれから話しますか？`
    },
    {
      keywords: ['疲れた', 'つかれた', 'しんどい', '疲労', 'バーンアウト'],
      response: `それは大変でしたね。まず自分を労りましょう。\n\n**少し聞いてもいいですか。**\n今の疲れは：\n\nA. 身体的な疲れ（睡眠不足、体力消耗）\nB. 精神的な疲れ（プレッシャー、不安、感情的消耗）\nC. 意味的な疲れ（「なぜやっているのかわからない」感覚）\n\nどれが一番近いですか？それによって、本当に必要なリカバリー方法が違います。`
    },
    {
      keywords: ['先延ばし', '後回し', 'できない', '始められない'],
      response: `先延ばし、よくある課題ですね。\n\n**先延ばしは「怠け」ではなく、多くは「感情的な回避」です。**\n\nそのタスクを思い浮かべた時、どんな感情が出てきますか？\n\n• 不安（うまくできるか不明）\n• 退屈（単純すぎる）\n• 完璧主義（完璧にやれないなら始めたくない）\n• 意義不明（なぜやるのかわからない）\n\nその感情の根っこが分かると、具体的な対策が見えてきます。どれが近いですか？`
    },
    {
      keywords: ['完璧', '完璧主義', '完全', '100%'],
      response: `完璧主義の傾向があるんですね。\n\n**1つ聞かせてください：**\n「このタスクが80%の完成度で提出されたとして、実際のところ何が起きますか？」\n\n多くの場合、80%でも十分に価値があり、残り20%の磨き込みにかける時間で別のことができます。\n\n**完璧主義の逆説**：完璧を求めるほど、完成にたどり着けなくなります。\n「良い」を「完璧の敵」にしていませんか？`
    },
    {
      keywords: ['思考癖', 'パターン', 'くせ', '習慣', '自分の傾向'],
      response: () => {
        const logs = Store.reflections;
        const allText = logs.flatMap(r => [
          r.summary || '',
          ...(r.insights || []),
          ...(r.messages || []).filter(m => m.role === 'user').map(m => m.content || '')
        ]).join(' ');

        const patterns = [
          { name: '先延ばし', kws: ['後で', 'あとで', '明日', '後回し'] },
          { name: '完璧主義', kws: ['完璧', 'ちゃんと', '全部', '完全'] },
          { name: '過多引き受け', kws: ['詰め込み', '多い', '忙しい', '時間がない'] },
          { name: '考えすぎ', kws: ['迷う', '悩む', '決められない', '考える'] },
        ];
        const found = patterns.filter(p => p.kws.some(kw => allText.includes(kw)));

        if (!found.length) {
          return `まだ振り返りログが少ないため、パターン分析が十分にできません。\n\nコーチとの会話を続けると、**メタ認知ダッシュボード**で自動的に思考癖が可視化されます。\n\n今、自分で気になっている「繰り返してしまう行動パターン」はありますか？`;
        }
        return `振り返りログから、いくつかの傾向が見えています：\n\n${found.map(p => `• **${p.name}**`).join('\n')}\n\n**メタ認知ダッシュボード**でより詳しく確認できます。\n\nこの中で、今一番改善したいのはどれですか？`;
      }
    },
    {
      keywords: ['振り返り', 'レビュー', '反省'],
      response: `振り返りは成長の最大のエンジンです。\n\n**今日の「KPT」を一緒にやってみましょう：**\n\n🟢 **Keep** — 今日、うまくいったことは？\n🔴 **Problem** — 障壁になったことは？\n🔵 **Try** — 次回、1つだけ変えるとしたら？\n\nどれか1つから話してみてください。`
    },
    {
      keywords: ['疲れた', 'つかれた', 'しんどい', '疲労'],
      response: `それは大変でしたね。まず休息が最優先です。\n\n**生産性の基盤は身体と心の健康です。**\n\n今日はここで一区切りにして、明日スッキリした状態で再スタートする方が長期的に見て賢い選択かもしれません。\n\n明日の朝、最初に取り組む「1つのタスク」だけ決めて休みましょう。何にしますか？`
    },
    {
      keywords: ['次', 'next', 'ネクストタスク', '何をする'],
      response: () => {
        const overdue = Store.getOverdueTasks();
        const today = Store.getTodayTasks().filter(t => t.priority === 'P1');
        let msg = `**NEXTタスクの推薦** 🎯\n\n`;
        if (overdue.length) msg += `🚨 期限切れ: **${overdue[0].title}**（まず対処を）\n`;
        if (today.length)   msg += `🔴 今日P1: **${today[0].title}**\n`;
        if (!overdue.length && !today.length) msg += `期限切れ・今日P1はありません。近日予定ビューを確認してみてください。\n`;
        msg += `\nこの中でどれから始めますか？`;
        return msg;
      }
    }
  ],

  DEFAULT_RESPONSES: [
    `なるほど、もう少し詳しく教えてもらえますか？**具体的にどんな状況**ですか？`,
    `それは興味深いですね。その背景にある**本当の課題**は何だと思いますか？`,
    `理解しました。その状況を改善するために、今すぐできる**最小のアクション**は何でしょう？`,
    `そうなんですね。**なぜ、そうなったと思いますか？** 原因を1〜2つ挙げてみてください。`,
    `その気持ちはよくわかります。**同じ状況が繰り返されているとしたら**、何が共通の原因として考えられますか？`,
    `面白い視点ですね。**「理想の自分」だったら、この状況にどう対応していると思いますか？**`,
    `それを聞いて思ったのですが、**今のあなたが一番大切にしている価値観**は何ですか？それと今の行動は一致していますか？`,
    `少し視点を変えてみましょう。**もしこれを「問題」ではなく「情報」として見たら**、何が見えてきますか？`,
  ],

  /* ---- メタ認知モード専用応答 ---- */
  metacogFollowUp(msg) {
    const steps = [
      `そのパターンに気づけていること自体、大きな第一歩です。\n\n**次の質問です：** そのパターンはいつ頃から始まったと思いますか？また、それが「役に立っている面」はありますか？\n\n思考癖には、かつては有効だったから身についたという側面があります。`,
      `なるほど。では**「そのパターンが出てきやすいトリガー」**は何ですか？\n\n特定の人・状況・感情・時間帯など、パターンが発動しやすい条件があると、予防策が立てやすくなります。`,
      `深い洞察ですね。**では、このパターンを1週間で10%だけ改善するとしたら、どんな小さな実験ができますか？**\n\n大きな変化は必要ありません。「気づいた瞬間に一呼吸おく」「判断を24時間後に先送りする」など、小さな実験から始めましょう。`,
      `素晴らしい内省です。この気づきを**メタ認知ダッシュボード**に記録しておきましょう。\n\n自分の思考癖を「知っている」から「観察できる」へ、そして「選択できる」へ。これがメタ認知の深化のプロセスです。`,
    ];
    const userCount = this.currentSession.messages.filter(m => m.role === 'user').length;
    return steps[Math.min(userCount - 1, steps.length - 1)];
  },

  /* ---- Init ---- */
  init() {
    document.getElementById('coachSendBtn').addEventListener('click', () => this.sendMessage());
    document.getElementById('coachInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });
    document.getElementById('coachInput').addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // Mode selector
    document.getElementById('coachModeSelector').querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setMode(btn.dataset.mode);
      });
    });

    // Insight tabs
    document.querySelectorAll('.insight-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.insight-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderInsights(tab.dataset.itab);
      });
    });

    this.initSession('free');
    this.renderInsights('week');
    this.renderSessionHistory();
    this.renderGrowthChart();
  },

  setMode(mode) {
    this.currentMode = mode;
    this.initSession(mode);
  },

  initSession(mode) {
    const persona = this.PERSONAS[mode] || this.PERSONAS.free;
    const msgs = document.getElementById('coachMessages');
    msgs.innerHTML = '';
    this.currentSession = {
      id: 'sess_' + Date.now(),
      type: mode,
      date: new Date().toISOString().split('T')[0],
      messages: [],
      insights: []
    };
    this.appendMessage('coach', persona.greeting);
    this.renderSuggestions(persona.suggestions);
  },

  sendMessage(text = null) {
    const input = document.getElementById('coachInput');
    const msg = text || input.value.trim();
    if (!msg) return;
    input.value = ''; input.style.height = 'auto';
    document.getElementById('coachSuggestions').innerHTML = '';

    this.appendMessage('user', msg);
    this.currentSession.messages.push({ role: 'user', content: msg, timestamp: Date.now() });

    // Claude API（サーバー側で設定）があればAI応答、なければルールベース
    if (window.ClaudeAI) {
      this._sendWithClaude(msg);
    } else {
      const typingId = this.showTyping();
      setTimeout(() => {
        this.hideTyping(typingId);
        const response = this.generateResponse(msg);
        this._finalizeResponse(response, msg);
      }, 800 + Math.random() * 600);
    }
  },

  async _sendWithClaude(msg) {
    const typingId = this.showTyping();
    try {
      const response = await ClaudeAI.chat(
        msg,
        this.currentSession.messages.slice(0, -1), // 直前のユーザーメッセージは除く（既に含まれているため）
        this.currentMode
      );
      this.hideTyping(typingId);
      if (response) {
        this._finalizeResponse(response, msg);
      } else {
        // フォールバック：ルールベース
        const fallback = this.generateResponse(msg);
        this._finalizeResponse(fallback, msg);
      }
    } catch {
      this.hideTyping(typingId);
      const fallback = this.generateResponse(msg);
      this._finalizeResponse(fallback, msg);
    }
  },

  _finalizeResponse(response, userMsg) {
    this.appendMessage('coach', response);
    this.currentSession.messages.push({ role: 'coach', content: response, timestamp: Date.now() });
    if (this.currentSession.messages.length >= 4) {
      this.extractInsight();
    }
    this.renderSuggestions(this.getFollowUpSuggestions(userMsg));
  },

  generateResponse(userMsg) {
    const lower = userMsg.toLowerCase();
    // KB matching
    for (const entry of this.KB) {
      if (entry.keywords.some(kw => lower.includes(kw))) {
        return typeof entry.response === 'function' ? entry.response() : entry.response;
      }
    }
    // Mode-specific follow-ups
    if (this.currentMode === 'morning')  return this.morningFollowUp(userMsg);
    if (this.currentMode === 'evening')  return this.eveningFollowUp(userMsg);
    if (this.currentMode === 'task')     return this.taskFollowUp(userMsg);
    if (this.currentMode === 'metacog') return this.metacogFollowUp(userMsg);
    // Default
    return this.DEFAULT_RESPONSES[Math.floor(Math.random() * this.DEFAULT_RESPONSES.length)];
  },

  morningFollowUp(msg) {
    const steps = [
      `素晴らしいですね！その目標を達成するために、**今日の最初の30分**で何をしますか？`,
      `具体的で良いですね。それを邪魔しそうな**リスク**はありますか？対策を考えておきましょう。`,
      `完璧な準備です！**夜の振り返りで「できた」と言えるように**頑張りましょう。応援しています！☀️`
    ];
    const idx = Math.min(
      Math.floor(this.currentSession.messages.filter(m => m.role === 'user').length / 1),
      steps.length - 1
    );
    return steps[idx] || steps[steps.length - 1];
  },

  eveningFollowUp(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes('できた') || lower.includes('達成') || lower.includes('成功')) {
      return `素晴らしい！何がうまくいった要因だったと思いますか？\nその成功パターンを**明日以降も再現**するために、何を意識しますか？`;
    }
    if (lower.includes('できなかった') || lower.includes('失敗') || lower.includes('うまくいかない')) {
      return `正直に振り返れているのは大きな強みです。\n**「できなかった」原因**を3つ挙げるとしたら、何ですか？\n外部要因 / 自分の行動 / 仕組みの問題、どれが最も大きかったですか？`;
    }
    return `なるほど。**明日の自分へのアドバイス**を一言で言うとしたら、何と伝えますか？`;
  },

  taskFollowUp(msg) {
    const responses = [
      `その気づきは貴重です！**次回同じタスクを効率化するとしたら**、何を変えますか？`,
      `良い振り返りですね。この経験から**次に活かせることは何ですか？**プロジェクトのWBSを更新しておきましょう。`,
      `その経験を**ナレッジとして残しておく**価値があります。簡単なメモをタスクの説明欄に書いておきましょう。`
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  },

  getFollowUpSuggestions(msg) {
    if (msg.includes('目標') || msg.includes('成果')) return ['進捗を確認する', 'タスクを追加する', '課題を話す'];
    if (msg.includes('集中') || msg.includes('フォーカス')) return ['環境を整える', 'ポモドーロを試す', '今日のP1を確認'];
    if (msg.includes('先延ばし') || msg.includes('後回し')) return ['原因を深掘りする', '小さな一歩を考える', '2分ルールを試す'];
    if (msg.includes('完璧') || msg.includes('完全')) return ['80%基準を試す', '期限を決める', '完成を優先する'];
    if (msg.includes('疲れ') || msg.includes('しんどい')) return ['休憩の種類を考える', '優先度を下げる', '明日の準備だけする'];
    if (this.currentMode === 'morning')  return ['今日の目標を言語化', 'リスクを考える', 'P1タスクを確認'];
    if (this.currentMode === 'evening')  return ['良かったことを話す', '改善点を整理', 'KPTで振り返る'];
    if (this.currentMode === 'metacog') return ['パターンを深掘りする', 'トリガーを特定する', '改善の実験を考える'];
    return ['もっと詳しく話す', '次のアクションを考える', '思考癖を探ってみる'];
  },

  extractInsight() {
    const userMsgs = this.currentSession.messages.filter(m => m.role === 'user');
    if (!userMsgs.length) return;
    const lastMsg = userMsgs[userMsgs.length - 1].content;
    const insight = `[${new Date().toLocaleDateString('ja-JP')}] ${lastMsg.substring(0, 60)}${lastMsg.length > 60 ? '…' : ''}`;
    if (!this.currentSession.insights.includes(insight)) {
      this.currentSession.insights.push(insight);
    }
  },

  /* ---- Message rendering ---- */
  appendMessage(role, text) {
    const msgs = document.getElementById('coachMessages');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
      <div class="message-avatar"><i class="fas ${role === 'coach' ? 'fa-brain' : 'fa-user'}"></i></div>
      <div>
        <div class="message-bubble">${this.formatMarkdown(text)}</div>
        <div class="message-time">${time}</div>
      </div>
    `;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  },

  formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  },

  showTyping() {
    const id = 'typing_' + Date.now();
    const msgs = document.getElementById('coachMessages');
    const div = document.createElement('div');
    div.className = 'message coach'; div.id = id;
    div.innerHTML = `
      <div class="message-avatar"><i class="fas fa-brain"></i></div>
      <div class="message-bubble" style="padding:.6rem .9rem">
        <div class="typing-indicator">
          <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
        </div>
      </div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return id;
  },

  hideTyping(id) {
    document.getElementById(id)?.remove();
  },

  renderSuggestions(suggestions) {
    const el = document.getElementById('coachSuggestions');
    el.innerHTML = suggestions.map(s =>
      `<button class="suggestion-chip" data-msg="${s}">${s}</button>`
    ).join('');
    el.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => this.sendMessage(chip.dataset.msg));
    });
  },

  /* ---- Insights ---- */
  renderInsights(period) {
    const el = document.getElementById('insightList');
    const now = new Date();
    const cutoff = new Date(now);
    if (period === 'week') cutoff.setDate(now.getDate() - 7);
    else cutoff.setMonth(now.getMonth() - 1);

    const insights = Store.reflections
      .filter(r => r.insights && new Date(r.date) >= cutoff)
      .flatMap(r => r.insights || [])
      .slice(-6);

    // Also add current session insights
    const allInsights = [...(this.currentSession?.insights || []), ...insights].slice(-6);

    if (!allInsights.length) {
      el.innerHTML = `<div class="empty-state" style="padding:1rem 0"><i class="fas fa-lightbulb text-muted"></i><p style="font-size:.75rem">コーチとの会話を重ねると洞察が蓄積されます</p></div>`;
      return;
    }

    el.innerHTML = allInsights.reverse().map(ins =>
      `<div class="insight-item"><i class="fas fa-lightbulb"></i><span>${Tasks.escHtml(ins)}</span></div>`
    ).join('');
  },

  /* ---- Session History ---- */
  renderSessionHistory() {
    const el = document.getElementById('sessionHistory');
    const sessions = Store.reflections.slice(-5).reverse();
    if (!sessions.length) {
      el.innerHTML = `<div style="font-size:.75rem;color:var(--text-muted);padding:.5rem 0">セッション履歴がありません</div>`;
      return;
    }
    const typeLabel = { morning: '☀️ 朝', evening: '🌙 夜', task_complete: '✅ タスク', chat: '💬 相談' };
    el.innerHTML = sessions.map(s => `
      <div class="session-item">
        <div class="session-item-type">${typeLabel[s.type] || '💬 相談'}</div>
        <div class="session-item-date">${s.date}</div>
        <div class="session-item-summary">${Tasks.escHtml(s.summary || 'セッション記録')}</div>
      </div>`).join('');
  },

  /* ---- Growth Chart ---- */
  renderGrowthChart() {
    const ctx = document.getElementById('growthChart');
    if (!ctx) return;
    if (this.growthChart) this.growthChart.destroy();

    const labels = [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      labels.push(`${d.getMonth()+1}/${d.getDate()}`);
      const dayStr = d.toDateString();
      const count = Store.tasks.filter(t => t.is_completed && t.completed_at && new Date(t.completed_at).toDateString() === dayStr).length;
      data.push(count);
    }

    this.growthChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '完了タスク数',
          data,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.08)',
          borderWidth: 2,
          pointBackgroundColor: '#2563eb',
          pointRadius: 3,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
          y: { ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { color: 'rgba(0,0,0,0.04)' }, beginAtZero: true }
        }
      }
    });
  },

  /* ---- Save session ---- */
  async saveSession() {
    if (!this.currentSession || this.currentSession.messages.length < 2) return;
    const userMsgs = this.currentSession.messages.filter(m => m.role === 'user');
    const summary = userMsgs.map(m => m.content.substring(0, 30)).join(' / ');
    await Store.addReflection({
      type: this.currentSession.type,
      messages: this.currentSession.messages,
      insights: this.currentSession.insights,
      summary,
      date: this.currentSession.date,
      task_id: null, okr_id: null
    });
    this.renderSessionHistory();
    this.renderInsights('week');
    this.renderGrowthChart();
  },

  /* ---- Open with context (from briefing buttons) ---- */
  openWithMode(mode) {
    App.switchView('coach');
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-btn[data-mode="${mode}"]`)?.classList.add('active');
    this.setMode(mode);
  }
};

/* ---- Reflection (task complete quick modal) ---- */
const Reflection = {
  currentTaskId: null,
  ratings: {},

  openTaskReflection(task) {
    if (!task) return;
    this.currentTaskId = task.id;
    this.ratings = {};

    const body = document.getElementById('reflectionBody');
    body.innerHTML = `
      <div style="margin-bottom:1rem;font-size:.88rem;color:var(--text-secondary)">
        <strong>「${Tasks.escHtml(task.title)}」</strong> お疲れ様です！
      </div>
      <div class="reflection-q">
        <label>集中度はどうでしたか？</label>
        <div class="reflection-stars" data-key="focus">
          ${[1,2,3,4,5].map(i => `<span class="reflection-star" data-val="${i}">★</span>`).join('')}
        </div>
      </div>
      <div class="reflection-q">
        <label>想定時間と実際の差は？</label>
        <div style="display:flex;gap:8px;margin-top:4px">
          ${['早く終わった','ほぼ予定通り','少し超えた','大幅に超えた'].map(v =>
            `<button class="pf-btn time-opt" data-val="${v}" style="font-size:.75rem">${v}</button>`
          ).join('')}
        </div>
      </div>
      <div class="reflection-q">
        <label>一言コメント（任意）</label>
        <textarea class="modal-textarea" id="reflComment" placeholder="気づきや学びを残しておきましょう…" style="min-height:60px"></textarea>
      </div>
    `;

    // Star rating
    body.querySelectorAll('.reflection-stars').forEach(starsEl => {
      const key = starsEl.dataset.key;
      starsEl.querySelectorAll('.reflection-star').forEach(star => {
        star.addEventListener('click', () => {
          const val = parseInt(star.dataset.val);
          this.ratings[key] = val;
          starsEl.querySelectorAll('.reflection-star').forEach((s, i) => {
            s.classList.toggle('active', i < val);
          });
        });
        star.addEventListener('mouseenter', () => {
          const val = parseInt(star.dataset.val);
          starsEl.querySelectorAll('.reflection-star').forEach((s, i) => s.classList.toggle('active', i < val));
        });
      });
      starsEl.addEventListener('mouseleave', () => {
        const val = this.ratings[key] || 0;
        starsEl.querySelectorAll('.reflection-star').forEach((s, i) => s.classList.toggle('active', i < val));
      });
    });

    // Time option buttons
    body.querySelectorAll('.time-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('.time-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.ratings.time = btn.dataset.val;
      });
    });

    // Submit => open coach
    document.getElementById('reflectionSubmit').onclick = async () => {
      const comment = document.getElementById('reflComment').value.trim();
      const insights = [];
      if (this.ratings.focus) insights.push(`集中度: ${'★'.repeat(this.ratings.focus)}`);
      if (this.ratings.time)  insights.push(`時間: ${this.ratings.time}`);
      if (comment) insights.push(comment);

      await Store.addReflection({
        type: 'task_complete',
        task_id: this.currentTaskId,
        messages: [],
        insights,
        summary: `タスク完了: ${task.title}`,
        date: new Date().toISOString().split('T')[0]
      });

      UI.closeModal('reflectionModal');
      Coach.openWithMode('task');
      Coach.renderInsights('week');
    };

    UI.openModal('reflectionModal');
  }
};
