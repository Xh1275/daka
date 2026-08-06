// get-data.js
export async function onRequestGet(context) {
  const { request, env } = context;

  const clientPassword = request.headers.get('X-Sync-Password');
  const serverPassword = env.SYNC_PASSWORD;
  if (serverPassword && clientPassword !== serverPassword) {
    return new Response(JSON.stringify({ error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await env.dk.get('daka_main_data');
    if (data) {
      return new Response(data, {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return jsonResponse({
      tasks: [],
      announcement: '',
      announcementMeta: { updatedAt: 0, deviceId: '' },
      syncLog: [],
      snapshots: [],
      taskDeletionRecords: [],
      historyDeletionRecords: [],
      devices: {},
      deviceMeta: {},
      schemaVersion: 3
    });
  } catch (e) {
    console.error('get-data error:', e);
    return jsonResponse({ error: '服务器处理失败' }, 500);
  }
}
