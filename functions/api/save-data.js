export async function onRequestPost(context) {
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
    const body = await request.json();
    // 基础格式校验
    if (!body.tasks || !Array.isArray(body.tasks)) {
      return new Response(JSON.stringify({ error: '数据格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    await env.dk.put('daka_main_data', JSON.stringify(body));
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}