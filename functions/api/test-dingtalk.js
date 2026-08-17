function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

async function sendDingtalk(env) {
  const webhook = env.DINGTALK_WEBHOOK;
  const secret = env.DINGTALK_SECRET;

  if (!webhook) {
    return {
      ok: false,
      step: "config",
      error: "DINGTALK_WEBHOOK 未配置"
    };
  }

  if (!secret) {
    return {
      ok: false,
      step: "config",
      error: "DINGTALK_SECRET 未配置"
    };
  }

  const timestamp = String(Date.now());
  const stringToSign = timestamp + "\n" + secret;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(stringToSign)
  );

  const sign = btoa(
    String.fromCharCode(...new Uint8Array(signatureBuffer))
  );

  const url =
    webhook +
    "&timestamp=" +
    encodeURIComponent(timestamp) +
    "&sign=" +
    encodeURIComponent(sign);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      msgtype: "text",
      text: {
        content: "【Cloudflare 测试】钉钉机器人连接正常 ✅"
      }
    })
  });

  const body = await response.text();

  let parsed;

  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }

  return {
    ok: response.ok && (!parsed || parsed.errcode === 0),
    httpStatus: response.status,
    dingtalkResponse: parsed || body
  };
}

export async function onRequestGet(context) {
  try {
    const result = await sendDingtalk(context.env);

    return jsonResponse(result, result.ok ? 200 : 502);
  } catch (error) {
    return jsonResponse({
      ok: false,
      step: "exception",
      error: error?.message || String(error)
    }, 500);
  }
}

