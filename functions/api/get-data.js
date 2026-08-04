export async function onRequestGet(context) {
  const { request, env } = context;

  // 密码验证（设置了环境变量才启用）
  const clientPassword = request.headers.get('X-Sync-Password');
  const serverPassword = env.SYNC_PASSWORD;
  if (serverPassword && clientPassword !== serverPassword) {
    return new Response(JSON.stringify({ error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await env.dk.get('daka_main_data');
    return new Response(data || JSON.stringify({
      tasks: [],
      announcement: '',
      syncLog: [],
      snapshots: [],
      devices: {},
      deviceMeta: {}
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
