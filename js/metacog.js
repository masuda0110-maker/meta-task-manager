/* ============================================================
   metacog.js — メタ認知ダッシュボード エンジン
   集中度トレンド / 時間精度 / 思考癖 / レーダーチャート
   ============================================================ */
const MetaCog = {
  currentPeriod: 'week',
  focusChart: null,
  radarChart: null,
  accuracyChart: null,
  currentLogFilter: 'all',

  /* ---- テーマカラー ---- */
  COLORS: {
    accent:  '#2563eb',
    accent2: '#7c3aed',
    p2:      '#d97706',
    p3:      '#2563eb',
    success: '#059669',
    muted:   '#9ca3af',
  },

  /* ---- 思考癖パターン定義 ---- */
  PATTERNS: [
    {
      id: 'perfectionism',
      label: '完璧主義',
      icon: 'fa-gem',
      color: '#8b5cf6',
      keywords: ['完璧', 'ちゃんと', '全部', '完全', 'きちんと', '細かい', '細部'],
      desc: '品質へのこだわりが強い。細部に時間がかかる傾向がある。',
      advice: '「80%でリリースして残り20%を改善」というアプローチを試してみましょう。',
    },
    {
      id: 'overcommit',
      label: '過多引き受け',
      icon: 'fa-layer-group',
      color: '#dc2626',
      keywords: ['詰め込み', '多い', '忙しい', '時間がない', 'タスクが', '全部やる'],
      desc: '多くのことを引き受けすぎる傾向がある。',
      advice: '「やらないことリスト」を作り、P3/P4タスクを積極的に削減しましょう。',
    },
    {
      id: 'procrastination',
      label: '先延ばし',
      icon: 'fa-hourglass-half',
      color: '#f59e0b',
      keywords: ['後で', 'あとで', '明日', 'いずれ', '後回し', 'まだ', 'そのうち'],
      desc: '重要だが緊急でないタスクを先送りしやすい傾向がある。',
      advice: '「2分ルール」: 2分以内で終わることは今すぐやる。それ以外はスケジュールに入れましょう。',
    },
    {
      id: 'analysis_paralysis',
      label: '考えすぎ',
      icon: 'fa-brain',
      color: '#3b82f6',
      keywords: ['どうすれば', 'どう', '迷う', '決められない', '悩む', '考える', 'わからない'],
      desc: '分析や計画に時間をかけすぎて行動が遅れる傾向がある。',
      advice: '「タイムボックス決断法」: 重要度に応じて5分・30分・1時間で決断期限を設けましょう。',
    },
    {
      id: 'energy_aware',
      label: 'エネルギー管理',
      icon: 'fa-battery-half',
      color: '#10b981',
      keywords: ['疲れた', 'しんどい', '休憩', 'エネルギー', '集中できない', 'だるい', '眠い'],
      desc: '自分のエネルギー状態を意識している。回復の重要性を理解している。',
      advice: 'エネルギーのピーク時間に最重要タスクを配置するウルトラディアンリズムを活用しましょう。',
    },
    {
      id: 'growth_mindset',
      label: '成長志向',
      icon: 'fa-seedling',
      color: '#f97316',
      keywords: ['学んだ', '気づき', '改善', '成長', 'うまくなる', '次回', '反省', '工夫'],
      desc: '失敗や困難から積極的に学ぼうとする傾向がある。',
      advice: '素晴らしい傾向です！「学習ログ」としてタスクのメモに気づきを残す習慣を続けましょう。',
    },
  ],

  /* ---- renderDashboard alias ---- */
  renderDashboard() { this.render(); },

  /* ---- 初期化 ---- */
  init() {
    // 期間セレクター
    document.querySelectorAll('.mcperiod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mcperiod-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentPeriod = btn.dataset.period;
        this.render();
      });
    });

    // ログフィルター
    document.querySelectorAll('.mc-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mc-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentLogFilter = btn.dataset.lf;
        this.renderLogList();
      });
    });

    // 「記録する」ボタン
    document.getElementById('mcAddEntryBtn')?.addEventListener('click', () => {
      this.openEntryModal();
    });
  },

  /* ---- エントリーモーダルの状態 ---- */
  _entryState: {
    type: 'task_complete',
    focusScore: 0,
    timeAccuracy: null,
    blockers: [],
    energyLevel: null,
  },

  openEntryModal() {
    // 状態リセット
    this._entryState = { type: 'task_complete', focusScore: 0, timeAccuracy: null, blockers: [], energyLevel: null };

    // タイプボタン
    document.querySelectorAll('.mc-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mtype === 'task_complete');
      btn.onclick = () => {
        document.querySelectorAll('.mc-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._entryState.type = btn.dataset.mtype;
        const taskFields = document.getElementById('mcFieldsTaskComplete');
        if (taskFields) taskFields.style.display = btn.dataset.mtype === 'task_complete' ? '' : 'none';
      };
    });

    // フィールドリセット
    const tTitle = document.getElementById('mcTaskTitle');
    if (tTitle) tTitle.value = '';
    const mcLearning = document.getElementById('mcLearning');
    if (mcLearning) mcLearning.value = '';
    const mcIntent = document.getElementById('mcIntent');
    if (mcIntent) mcIntent.value = '';

    // タスク完了フィールド表示リセット
    const taskFields = document.getElementById('mcFieldsTaskComplete');
    if (taskFields) taskFields.style.display = '';

    // 集中度スター
    document.querySelectorAll('#mcFocusStars .mc-star').forEach(star => {
      star.classList.remove('active');
      star.onclick = () => {
        const val = parseInt(star.dataset.val);
        this._entryState.focusScore = val;
        document.querySelectorAll('#mcFocusStars .mc-star').forEach((s, i) => {
          s.classList.toggle('active', i < val);
        });
      };
    });

    // 時間精度ボタン
    document.querySelectorAll('#mcTimeOptions .mc-opt-btn').forEach(btn => {
      btn.classList.remove('active');
      btn.onclick = () => {
        document.querySelectorAll('#mcTimeOptions .mc-opt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._entryState.timeAccuracy = btn.dataset.opt;
      };
    });

    // 阻害要因ボタン（複数選択）
    document.querySelectorAll('#mcBlockerOptions .mc-opt-btn').forEach(btn => {
      btn.classList.remove('active');
      btn.onclick = () => {
        btn.classList.toggle('active');
        const opt = btn.dataset.opt;
        if (btn.classList.contains('active')) {
          if (!this._entryState.blockers.includes(opt)) this._entryState.blockers.push(opt);
        } else {
          this._entryState.blockers = this._entryState.blockers.filter(b => b !== opt);
        }
      };
    });

    // エネルギーボタン
    document.querySelectorAll('#mcEnergyOptions .mc-opt-btn').forEach(btn => {
      btn.classList.remove('active');
      btn.onclick = () => {
        document.querySelectorAll('#mcEnergyOptions .mc-opt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._entryState.energyLevel = btn.dataset.opt;
      };
    });

    // 保存ボタン
    document.getElementById('metacogEntrySaveBtn').onclick = () => this.saveEntry();

    UI.openModal('metacogEntryModal');
  },

  async saveEntry() {
    const type        = this._entryState.type;
    const taskTitle   = document.getElementById('mcTaskTitle')?.value.trim() || '';
    const learning    = document.getElementById('mcLearning')?.value.trim() || '';
    const intent      = document.getElementById('mcIntent')?.value.trim() || '';
    const focusScore  = this._entryState.focusScore;
    const timeAcc     = this._entryState.timeAccuracy;
    const blockers    = this._entryState.blockers;
    const energyLevel = this._entryState.energyLevel;

    // バリデーション
    if (!learning && !intent && !taskTitle && focusScore === 0) {
      UI.toast('何か記録してから保存してください', 'error');
      return;
    }

    // insights 配列に集中度・時間精度を埋め込む（既存フォーマットとの互換）
    const insights = [];
    if (focusScore > 0) insights.push(`集中度: ${'★'.repeat(focusScore)}${'☆'.repeat(5 - focusScore)}`);
    if (timeAcc)        insights.push(`時間: ${timeAcc}`);
    if (learning)       insights.push(learning);
    if (intent)         insights.push(`意図: ${intent}`);

    const today = new Date().toISOString().split('T')[0];
    const summary = taskTitle
      ? `${taskTitle}${learning ? ' — ' + learning.slice(0, 40) : ''}`
      : (learning ? learning.slice(0, 60) : (intent ? intent.slice(0, 60) : `${type} 記録`));

    const data = {
      type,
      date: today,
      task_title:   taskTitle  || null,
      learning:     learning   || null,
      intent:       intent     || null,
      focus_score:  focusScore || null,
      time_accuracy: timeAcc   || null,
      energy_level: energyLevel|| null,
      blockers:     blockers.length ? blockers : null,
      insights,
      summary,
      messages: [],
    };

    await Store.addReflection(data);
    UI.closeModal('metacogEntryModal');
    this.render();
    App.updateMetaCogBadge();
    UI.toast('メタ認知を記録しました 🧠', 'success');
  },

  /* ---- ログ詳細モーダル ---- */
  openLogDetail(id) {
    const r = Store.reflections.find(r => r.id === id);
    if (!r) return;

    const typeInfo = {
      task_complete: { label: 'タスク完了', icon: 'fa-check-circle', color: 'var(--success)' },
      morning:       { label: '朝セッション', icon: 'fa-sun', color: 'var(--p2)' },
      evening:       { label: '夜の振り返り', icon: 'fa-moon', color: 'var(--accent2)' },
      chat:          { label: 'フリー相談', icon: 'fa-comments', color: 'var(--p3)' },
    };
    const info = typeInfo[r.type] || typeInfo.chat;
    const energyLabel = { high: '⚡ 高い', medium: '🟡 普通', low: '😓 低い' };

    document.getElementById('metacogDetailBody').innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.2rem">
        <i class="fas ${info.icon}" style="color:${info.color};font-size:1.2rem"></i>
        <div>
          <div style="font-weight:700;font-size:.95rem">${info.label}</div>
          <div style="color:var(--text-muted);font-size:.78rem">${r.date}</div>
        </div>
      </div>
      ${r.task_title ? `<div class="mc-detail-row"><label>タスク名</label><span>${this.esc(r.task_title)}</span></div>` : ''}
      ${r.focus_score ? `<div class="mc-detail-row"><label>集中度</label><span style="color:var(--p2)">${'★'.repeat(r.focus_score)}${'☆'.repeat(5-r.focus_score)}</span></div>` : ''}
      ${r.time_accuracy ? `<div class="mc-detail-row"><label>時間精度</label><span>${r.time_accuracy}</span></div>` : ''}
      ${r.energy_level ? `<div class="mc-detail-row"><label>エネルギー</label><span>${energyLabel[r.energy_level] || r.energy_level}</span></div>` : ''}
      ${r.blockers?.length ? `<div class="mc-detail-row"><label>阻害要因</label><span>${r.blockers.join('、')}</span></div>` : ''}
      ${r.learning ? `<div class="mc-detail-row"><label>学んだこと・気づき</label><p>${this.esc(r.learning)}</p></div>` : ''}
      ${r.intent ? `<div class="mc-detail-row"><label>次回への意図</label><p>${this.esc(r.intent)}</p></div>` : ''}
      ${r.summary && r.summary !== r.learning ? `<div class="mc-detail-row"><label>サマリー</label><p>${this.esc(r.summary)}</p></div>` : ''}
    `;

    document.getElementById('metacogDetailDeleteBtn').onclick = async () => {
      if (!confirm('このログを削除しますか？')) return;
      await Store.deleteReflection(id);
      UI.closeModal('metacogDetailModal');
      this.render();
      UI.toast('削除しました', 'info');
    };

    UI.openModal('metacogDetailModal');
  },

  /* ---- メイン描画 ---- */
  render() {
    const logs = this.getFilteredLogs(this.currentPeriod);
    this.renderScoreRow(logs);
    this.renderFocusTrendChart(logs);
    this.renderRadarChart(logs);
    this.renderTimeAccuracyChart(logs);
    if (typeof Goals !== 'undefined') Goals.renderForMetacog();
    this.renderThinkingPatterns(logs);
    this.renderInsightsList(logs);
    this.renderLogList();
  },

  /* ---- 期間フィルタリング ---- */
  getFilteredLogs(period) {
    const now = new Date();
    const cutoff = new Date(now);
    if (period === 'week')       cutoff.setDate(now.getDate() - 7);
    else if (period === 'month') cutoff.setMonth(now.getMonth() - 1);
    else                         cutoff.setFullYear(2000);
    return Store.reflections.filter(r => new Date(r.date) >= cutoff);
  },

  /* ---- スコアサマリー行 ---- */
  renderScoreRow(logs) {
    const el = document.getElementById('mcScoreRow');
    if (!el) return;

    const taskLogs = logs.filter(r => r.type === 'task_complete');
    const sessionLogs = logs.filter(r => r.type === 'morning' || r.type === 'evening' || r.type === 'chat');

    // 平均集中度
    const focusScores = taskLogs
      .map(r => this.extractFocusScore(r))
      .filter(s => s !== null);
    const avgFocus = focusScores.length
      ? (focusScores.reduce((a, b) => a + b, 0) / focusScores.length).toFixed(1)
      : '—';

    // 時間見積もり精度
    const timeAccs = taskLogs.map(r => this.extractTimeAccuracy(r)).filter(v => v !== null);
    const accuracyLabel = this.computeAccuracyLabel(timeAccs);

    // セッション数
    const sessionCount = sessionLogs.length + taskLogs.length;

    // 連続振り返り日数
    const streakDays = this.computeReflectionStreak();

    // メタ認知スコア（総合）
    const metaScore = this.computeMetaScore(logs);

    el.innerHTML = `
      <div class="mc-score-card">
        <div class="mc-score-icon" style="background:linear-gradient(135deg,#2563eb,#7c3aed)">
          <i class="fas fa-brain"></i>
        </div>
        <div class="mc-score-val">${metaScore}<span class="mc-score-unit">/100</span></div>
        <div class="mc-score-label">メタ認知スコア</div>
        <div class="mc-score-sub">${this.getMetaScoreComment(metaScore)}</div>
      </div>
      <div class="mc-score-card">
        <div class="mc-score-icon" style="background:linear-gradient(135deg,#f59e0b,#f97316)">
          <i class="fas fa-star"></i>
        </div>
        <div class="mc-score-val">${avgFocus}<span class="mc-score-unit">/5</span></div>
        <div class="mc-score-label">平均集中度</div>
        <div class="mc-score-sub">${focusScores.length}件の記録</div>
      </div>
      <div class="mc-score-card">
        <div class="mc-score-icon" style="background:linear-gradient(135deg,#0891b2,#2563eb)">
          <i class="fas fa-clock"></i>
        </div>
        <div class="mc-score-val" style="font-size:1.1rem">${accuracyLabel}</div>
        <div class="mc-score-label">時間見積もり精度</div>
        <div class="mc-score-sub">${timeAccs.length}件の記録</div>
      </div>
      <div class="mc-score-card">
        <div class="mc-score-icon" style="background:linear-gradient(135deg,#059669,#0891b2)">
          <i class="fas fa-comments"></i>
        </div>
        <div class="mc-score-val">${sessionCount}</div>
        <div class="mc-score-label">振り返りセッション</div>
        <div class="mc-score-sub">期間内合計</div>
      </div>
      <div class="mc-score-card">
        <div class="mc-score-icon" style="background:linear-gradient(135deg,#d97706,#ea580c)">
          <i class="fas fa-fire"></i>
        </div>
        <div class="mc-score-val">${streakDays}</div>
        <div class="mc-score-label">振り返り連続日数</div>
        <div class="mc-score-sub">日間ストリーク</div>
      </div>
    `;
  },

  /* ---- 集中度トレンドチャート ---- */
  renderFocusTrendChart(logs) {
    const ctx = document.getElementById('focusTrendChart');
    if (!ctx) return;
    if (this.focusChart) { this.focusChart.destroy(); this.focusChart = null; }

    const days = this.currentPeriod === 'week' ? 7 : this.currentPeriod === 'month' ? 30 : 14;
    const labels = [];
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      labels.push(`${d.getMonth()+1}/${d.getDate()}`);
      const dayStr = d.toISOString().split('T')[0];
      const dayLogs = logs.filter(r => r.date === dayStr && r.type === 'task_complete');
      const scores = dayLogs.map(r => this.extractFocusScore(r)).filter(s => s !== null);
      data.push(scores.length ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : null);
    }

    this.focusChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '集中度',
          data,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.10)',
          borderWidth: 2,
          pointBackgroundColor: '#2563eb',
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.4,
          spanGaps: true,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => `集中度: ${ctx.parsed.y}/5` }
        }},
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
          y: { min: 0, max: 5, ticks: { color: '#9ca3af', font: { size: 9 }, stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.04)' } }
        }
      }
    });
  },

  /* ---- メタ認知レーダーチャート ---- */
  renderRadarChart(logs) {
    const ctx = document.getElementById('metacogRadarChart');
    if (!ctx) return;
    if (this.radarChart) { this.radarChart.destroy(); this.radarChart = null; }

    const allText = this.collectAllText(logs);
    const dims = [
      { label: '自己認識',   score: this.scoreKeywords(allText, ['気づい', '感じ', '思った', '自分', '自覚']) },
      { label: '計画性',     score: this.scoreKeywords(allText, ['計画', '準備', 'スケジュール', '段取り', '優先']) },
      { label: '適応力',     score: this.scoreKeywords(allText, ['変更', '対応', '柔軟', '調整', '切り替え']) },
      { label: '内省力',     score: this.scoreKeywords(allText, ['振り返り', '反省', '学んだ', '原因', '改善']) },
      { label: '集中管理',   score: this.avgFocusScore(logs) },
      { label: '時間感覚',   score: this.timeAccuracyScore(logs) },
    ];

    this.radarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: dims.map(d => d.label),
        datasets: [{
          label: 'メタ認知力',
          data: dims.map(d => d.score),
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124,58,237,0.12)',
          borderWidth: 2,
          pointBackgroundColor: '#7c3aed',
          pointRadius: 3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0, max: 5,
            ticks: { display: false, stepSize: 1 },
            pointLabels: { color: '#6b7280', font: { size: 9 } },
            grid: { color: 'rgba(0,0,0,0.08)' },
            angleLines: { color: 'rgba(0,0,0,0.06)' },
          }
        }
      }
    });
  },

  /* ---- 時間見積もり精度チャート ---- */
  renderTimeAccuracyChart(logs) {
    const ctx = document.getElementById('timeAccuracyChart');
    if (!ctx) return;
    if (this.accuracyChart) { this.accuracyChart.destroy(); this.accuracyChart = null; }

    const taskLogs = logs.filter(r => r.type === 'task_complete');
    const counts = { '早く終わった': 0, 'ほぼ予定通り': 0, '少し超えた': 0, '大幅に超えた': 0 };
    taskLogs.forEach(r => {
      const acc = this.extractTimeAccuracy(r);
      if (acc && counts[acc] !== undefined) counts[acc]++;
    });

    this.accuracyChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(counts),
        datasets: [{
          data: Object.values(counts),
          backgroundColor: ['#059669','#2563eb','#d97706','#dc2626'],
          borderWidth: 0,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#6b7280', font: { size: 9 }, boxWidth: 10, padding: 8 }
          }
        },
        cutout: '65%',
      }
    });
  },

  /* ---- 思考癖パターン分析 ---- */
  renderThinkingPatterns(logs) {
    const el = document.getElementById('mcPatternList');
    if (!el) return;
    const allText = this.collectAllText(logs);
    if (!allText) {
      el.innerHTML = `<div class="mc-empty"><i class="fas fa-lightbulb"></i><p>振り返りログが溜まると思考癖を分析できます</p></div>`;
      return;
    }

    const detected = this.PATTERNS.map(p => {
      const count = p.keywords.filter(kw => allText.includes(kw)).length;
      return { ...p, count, pct: Math.min(100, count * 18) };
    }).filter(p => p.count > 0).sort((a, b) => b.count - a.count);

    if (!detected.length) {
      el.innerHTML = `<div class="mc-empty"><i class="fas fa-lightbulb"></i><p>まだ傾向が検出されていません。コーチとの会話を続けましょう</p></div>`;
      return;
    }

    el.innerHTML = detected.slice(0, 5).map(p => `
      <div class="mc-pattern-item">
        <div class="mc-pattern-header">
          <div class="mc-pattern-icon" style="background:${p.color}22;color:${p.color}">
            <i class="fas ${p.icon}"></i>
          </div>
          <div class="mc-pattern-info">
            <div class="mc-pattern-name">${p.label}</div>
            <div class="mc-pattern-desc">${p.desc}</div>
          </div>
          <div class="mc-pattern-strength">
            <div class="mc-pattern-bar-wrap">
              <div class="mc-pattern-bar" style="width:${p.pct}%;background:${p.color}"></div>
            </div>
          </div>
        </div>
        <div class="mc-pattern-advice">
          <i class="fas fa-lightbulb"></i> ${p.advice}
        </div>
      </div>
    `).join('');
  },

  /* ---- 蓄積された気づき ---- */
  renderInsightsList(logs) {
    const el = document.getElementById('mcInsightsList');
    if (!el) return;
    const insights = logs
      .flatMap(r => r.insights || [])
      .filter(Boolean)
      .reverse()
      .slice(0, 8);

    if (!insights.length) {
      el.innerHTML = `<div class="mc-empty"><i class="fas fa-star"></i><p>コーチとの会話やタスク完了後の振り返りから気づきが蓄積されます</p></div>`;
      return;
    }

    el.innerHTML = insights.map((ins, i) => `
      <div class="mc-insight-item">
        <span class="mc-insight-num">${i + 1}</span>
        <span class="mc-insight-text">${this.esc(ins)}</span>
      </div>
    `).join('');
  },

  /* ---- 振り返りログ一覧 ---- */
  renderLogList() {
    const el = document.getElementById('mcLogList');
    if (!el) return;
    const allLogs = this.getFilteredLogs(this.currentPeriod);
    const filtered = this.currentLogFilter === 'all'
      ? allLogs
      : allLogs.filter(r => r.type === this.currentLogFilter);
    const sorted = [...filtered].reverse().slice(0, 20);

    if (!sorted.length) {
      el.innerHTML = `<div class="mc-empty"><i class="fas fa-history"></i><p>この期間の振り返りログはありません</p></div>`;
      return;
    }

    const typeInfo = {
      task_complete: { label: 'タスク完了', icon: 'fa-check-circle', color: 'var(--success)' },
      morning:       { label: '朝セッション', icon: 'fa-sun', color: 'var(--p2)' },
      evening:       { label: '夜の振り返り', icon: 'fa-moon', color: 'var(--accent2)' },
      chat:          { label: 'フリー相談', icon: 'fa-comments', color: 'var(--p3)' },
    };

    el.innerHTML = sorted.map(r => {
      const info = typeInfo[r.type] || typeInfo.chat;
      const focusScore = r.focus_score || this.extractFocusScore(r);
      const timeAcc    = r.time_accuracy || this.extractTimeAccuracy(r);
      const energyLabel = { high: '⚡ 高い', medium: '🟡 普通', low: '😓 低い' };
      const insights   = (r.insights || []).filter(i => !i.startsWith('集中度:') && !i.startsWith('時間:') && !i.startsWith('意図:')).slice(0, 2);

      return `
        <div class="mc-log-item" data-id="${r.id}" style="cursor:pointer">
          <div class="mc-log-left">
            <div class="mc-log-type-icon" style="color:${info.color}">
              <i class="fas ${info.icon}"></i>
            </div>
          </div>
          <div class="mc-log-body">
            <div class="mc-log-top">
              <span class="mc-log-type-label" style="color:${info.color}">${info.label}</span>
              <span class="mc-log-date">${r.date}</span>
              ${focusScore !== null && focusScore > 0 ? `<span class="mc-log-tag"><i class="fas fa-star" style="color:var(--p2)"></i> ${focusScore}/5</span>` : ''}
              ${timeAcc ? `<span class="mc-log-tag"><i class="fas fa-clock"></i> ${timeAcc}</span>` : ''}
              ${r.energy_level ? `<span class="mc-log-tag">${energyLabel[r.energy_level] || r.energy_level}</span>` : ''}
            </div>
            ${r.task_title ? `<div class="mc-log-task-title"><i class="fas fa-tasks"></i> ${this.esc(r.task_title)}</div>` : ''}
            ${r.summary ? `<div class="mc-log-summary">${this.esc(r.summary)}</div>` : ''}
            ${r.learning ? `<div class="mc-log-summary" style="color:var(--success)"><i class="fas fa-lightbulb"></i> ${this.esc(r.learning.slice(0,80))}${r.learning.length > 80 ? '…' : ''}</div>` : ''}
            ${insights.length ? `
              <div class="mc-log-insights">
                ${insights.map(i => `<span class="mc-log-insight-chip"><i class="fas fa-lightbulb"></i> ${this.esc(i)}</span>`).join('')}
              </div>` : ''}
          </div>
          <div class="mc-log-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>
      `;
    }).join('');

    // クリックで詳細モーダル
    el.querySelectorAll('.mc-log-item').forEach(item => {
      item.addEventListener('click', () => this.openLogDetail(item.dataset.id));
    });
  },

  /* ============================================================
     ヘルパー関数群
     ============================================================ */

  extractFocusScore(r) {
    // 直接フィールドを優先参照（新形式）
    if (r.focus_score != null && r.focus_score > 0) return r.focus_score;
    // 旧形式: insights配列からパース
    if (!r.insights) return null;
    const focusInsight = r.insights.find(i => typeof i === 'string' && i.startsWith('集中度:'));
    if (!focusInsight) return null;
    const stars = (focusInsight.match(/★/g) || []).length;
    return stars || null;
  },

  extractTimeAccuracy(r) {
    // 直接フィールドを優先参照（新形式）
    if (r.time_accuracy) return r.time_accuracy;
    // 旧形式: insights配列からパース
    if (!r.insights) return null;
    const timeInsight = r.insights.find(i => typeof i === 'string' && i.startsWith('時間:'));
    return timeInsight ? timeInsight.replace('時間:', '').trim() : null;
  },

  collectAllText(logs) {
    return logs
      .flatMap(r => [
        r.summary || '',
        ...(r.insights || []),
        ...(r.messages || []).filter(m => m.role === 'user').map(m => m.content || '')
      ])
      .join(' ');
  },

  scoreKeywords(text, keywords) {
    if (!text) return 0;
    const count = keywords.filter(kw => text.includes(kw)).length;
    return Math.min(5, count * 1.2);
  },

  avgFocusScore(logs) {
    const scores = logs
      .filter(r => r.type === 'task_complete')
      .map(r => this.extractFocusScore(r))
      .filter(s => s !== null);
    return scores.length ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : 2.5;
  },

  timeAccuracyScore(logs) {
    const accs = logs
      .filter(r => r.type === 'task_complete')
      .map(r => this.extractTimeAccuracy(r))
      .filter(Boolean);
    if (!accs.length) return 2.5;
    const scoreMap = { '早く終わった': 4, 'ほぼ予定通り': 5, '少し超えた': 3, '大幅に超えた': 1 };
    const total = accs.reduce((s, a) => s + (scoreMap[a] || 2), 0);
    return parseFloat((total / accs.length).toFixed(1));
  },

  computeAccuracyLabel(timeAccs) {
    if (!timeAccs.length) return '記録なし';
    const counts = {};
    timeAccs.forEach(a => { counts[a] = (counts[a] || 0) + 1; });
    return Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
  },

  computeMetaScore(logs) {
    if (!logs.length) return 0;
    let score = 0;

    // セッション数ボーナス（最大30点）
    score += Math.min(30, logs.length * 5);

    // 平均集中度ボーナス（最大25点）
    const avgFocus = this.avgFocusScore(logs);
    score += Math.round(avgFocus / 5 * 25);

    // 時間精度ボーナス（最大20点）
    const timeScore = this.timeAccuracyScore(logs);
    score += Math.round(timeScore / 5 * 20);

    // 気づき記録ボーナス（最大15点）
    const insightCount = logs.flatMap(r => r.insights || []).filter(Boolean).length;
    score += Math.min(15, insightCount * 3);

    // 多様な振り返り種別ボーナス（最大10点）
    const types = new Set(logs.map(r => r.type)).size;
    score += Math.min(10, types * 3);

    return Math.min(100, Math.round(score));
  },

  getMetaScoreComment(score) {
    if (score >= 80) return '卓越したメタ認知力 🌟';
    if (score >= 60) return '優れた自己認識 ✨';
    if (score >= 40) return '着実に成長中 📈';
    if (score >= 20) return '振り返りを続けよう 🌱';
    return 'まず記録から始めよう 💡';
  },

  computeReflectionStreak() {
    const dates = new Set(Store.reflections.map(r => r.date));
    let streak = 0;
    const d = new Date();
    while (true) {
      const key = d.toISOString().split('T')[0];
      if (!dates.has(key)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  },

  esc(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  /* ---- 期間切り替え（app.js互換エイリアス） ---- */
  switchPeriod(days) {
    if (days === 7)  this.currentPeriod = 'week';
    else if (days === 30) this.currentPeriod = 'month';
    else this.currentPeriod = 'all';
    // ボタンのactive状態を同期
    document.querySelectorAll('.mcperiod-btn, .mc-period-btn').forEach(b => {
      const p = b.dataset.period;
      const match = (p === 'week' && days === 7) ||
                    (p === 'month' && days === 30) ||
                    (p === 'all' && days !== 7 && days !== 30);
      b.classList.toggle('active', match);
    });
    this.render();
  },

  /* ---- エネルギーラベル（app.js互換） ---- */
  ENERGY_LABELS: { high: '⚡ 高い', medium: '🟡 普通', low: '😓 低い' },

  /* ---- 思考パターン（app.js互換エイリアス） ---- */
  get THOUGHT_PATTERNS() {
    const map = {};
    this.PATTERNS.forEach(p => { map[p.id] = p; });
    return map;
  },

  /* ---- 週次フィードバック生成（app.js exportMetaCogReport用） ---- */
  generateWeeklyFeedback() {
    const logs = this.getFilteredLogs('week');
    if (!logs.length) return null;

    const taskLogs = logs.filter(r => r.type === 'task_complete');
    const focusScores = taskLogs.map(r => this.extractFocusScore(r)).filter(s => s !== null);
    const avgFocus = focusScores.length
      ? parseFloat((focusScores.reduce((a,b)=>a+b,0)/focusScores.length).toFixed(1)) : 0;

    // エネルギースコア
    const energyMap = { high: 5, medium: 3, low: 1 };
    const energyVals = logs.map(r => energyMap[r.energy_level]).filter(Boolean);
    const avgEnergy = energyVals.length
      ? parseFloat((energyVals.reduce((a,b)=>a+b,0)/energyVals.length).toFixed(1)) : 0;

    // 時間精度スコア
    const timeAccScore = parseFloat(this.timeAccuracyScore(logs).toFixed(1));

    // 振り返り率（期間内の日数に対する記録日数）
    const dates = new Set(logs.map(r => r.date));
    const reflectionRate = Math.round((dates.size / 7) * 100);

    const totalScore = this.computeMetaScore(logs);

    const score = {
      total: totalScore,
      focus: avgFocus,
      energy: avgEnergy,
      timeAcc: timeAccScore,
      reflection: reflectionRate,
    };

    // フィードバック文章生成
    const strengths = [];
    const improvements = [];
    if (avgFocus >= 4) strengths.push('高い集中度を維持しています');
    else if (avgFocus > 0 && avgFocus < 3) improvements.push('集中度向上のためポモドーロ法を試してみましょう');
    if (timeAccScore >= 4) strengths.push('時間見積もりが正確です');
    else if (timeAccScore > 0 && timeAccScore < 3) improvements.push('タスク完了後に実際の所要時間を振り返りましょう');
    if (reflectionRate >= 80) strengths.push('継続的に振り返りを行っています');
    else if (reflectionRate < 50) improvements.push('毎日少し振り返る習慣をつけましょう');

    let overallComment = '';
    if (totalScore >= 70) overallComment = '素晴らしい週でした！高いメタ認知力を発揮しています。';
    else if (totalScore >= 40) overallComment = '着実に成長しています。記録を続けることで洞察が深まります。';
    else overallComment = '振り返りを始めたばかりですね。まず記録の習慣をつけましょう。';

    const fb = { overall: overallComment, strengths, improvements, suggestions: [] };

    // 思考パターン分析
    const allText = this.collectAllText(logs);
    const patterns = {};
    this.PATTERNS.forEach(p => {
      const count = p.keywords.filter(kw => allText.includes(kw)).length;
      if (count > 0) patterns[p.id] = Math.min(100, count * 18);
    });

    return { score, fb, patterns };
  },
};
