// contact.js — 反馈表单中转：同时推送到 Telegram 与钉钉
// 密钥请配置在 Cloudflare Pages → Settings → Environment variables (Secrets)：
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
//   DINGTALK_WEBHOOK
//   DINGTALK_SECRET   （可选；机器人开启「加签」时必填）

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function clip(str, max) {
  const s = String(str || '').trim();
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

async function sendTelegram(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { skipped: true, reason: 'telegram not configured' };

  const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      disable_web_page_preview: true
    })
  });
  const body = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: body.slice(0, 300) };
  }
  return { ok: true };
}

async function sendDingtalk(env, text) {
  const webhook = env.DINGTALK_WEBHOOK;
  if (!webhook) return { skipped: true, reason: 'dingtalk not configured' };

  let url = webhook;
  const secret = env.DINGTALK_SECRET;
  if (secret) {
    const timestamp = String(Date.now());
    const stringToSign = timestamp + '\n' + secret;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stringToSign));
    const sign = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
    const sep = webhook.includes('?') ? '&' : '?';
    url = webhook + sep + 'timestamp=' + timestamp + '&sign=' + encodeURIComponent(sign);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: { content: text }
    })
  });
  const body = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: body.slice(0, 300) };
  }
  try {
    const j = JSON.parse(body);
    if (j.errcode && j.errcode !== 0) {
      return { ok: false, status: 200, body: body.slice(0, 300) };
    }
  } catch (e) {}
  return { ok: true };
}

export async function onRequestOptions() {
  return jsonResponse({ ok: true });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    let payload = {};
    try {
      payload = await request.json();
    } catch (e) {
      return jsonResponse({ error: '无效的请求内容' }, 400);
    }

    const contact = clip(payload.contact, 80);
    const message = clip(payload.message, 1000);
    if (!message) {
      return jsonResponse({ error: '请填写意见内容' }, 400);
    }

    const page = clip(payload.page, 200);
    const ua = clip(payload.ua, 180);
    const time = new Date().toISOString();

    const text = [
      '【羊毛打卡管家 · 用户反馈】',
      '时间: ' + time,
      '联系方式: ' + (contact || '（未填）'),
      '意见:',
      message,
      page ? ('页面: ' + page) : '',
      ua ? ('UA: ' + ua) : ''
    ].filter(Boolean).join('\n');

    const [tg, dt] = await Promise.all([
      sendTelegram(env, text).catch(function (e) {
        return { ok: false, body: String(e && e.message || e) };
      }),
      sendDingtalk(env, text).catch(function (e) {
        return { ok: false, body: String(e && e.message || e) };
      })
    ]);

    const tgOk = tg.ok === true || tg.skipped === true;
    const dtOk = dt.ok === true || dt.skipped === true;
    const anyConfigured = !(tg.skipped && dt.skipped);
    if (!anyConfigured) {
      return jsonResponse({ error: '服务端未配置通知渠道' }, 503);
    }
    if (!tgOk && !dtOk) {
      return jsonResponse({ error: '发送失败，请稍后重试' }, 502);
    }

    return jsonResponse({
      ok: true,
      telegram: tg.skipped ? 'skipped' : (tg.ok ? 'ok' : 'fail'),
      dingtalk: dt.skipped ? 'skipped' : (dt.ok ? 'ok' : 'fail')
    });
  } catch (e) {
    return jsonResponse({ error: '服务器错误' }, 500);
  }
}
