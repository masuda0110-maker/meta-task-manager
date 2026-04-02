// api/chat.js — Vercel Serverless Function
// Anthropic Claude API へのプロキシ（APIキーをサーバー側で管理）

module.exports = async function handler(req, res) {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY が設定されていません' });
  }

  const { system, messages, max_tokens = 600, model } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages が不正です' });
  }

  // 使用モデル（リクエストで指定がなければ claude-sonnet-4-6 を使用）
  const claudeModel = model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: claudeModel,
        max_tokens,
        system: system || 'あなたは親切なアシスタントです。日本語で返答してください。',
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Claude API error:', err);
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (e) {
    console.error('Fetch error:', e);
    return res.status(500).json({ error: e.message });
  }
};
