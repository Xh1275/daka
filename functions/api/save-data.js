function safeArray(a) {
    return Array.isArray(a) ? a : [];
}

function parseTime(str) {
    if (!str) return 0;
    const ts = Date.parse(String(str).replace('T', ' ').replace(/-/g, '/'));
    return Number.isNaN(ts) ? 0 : ts;
}

function getTaskTombstoneKey(taskId) {
    return `task:${String(taskId)}`;
}

function getHistoryTombstoneKey(taskId, recordStr) {
    return `history:${String(taskId)}|${String(recordStr)}`;
}

function normalizeTask(item) {
    if (!item || item.id === undefined || item.id === null) return null;
    const task = { ...item };
    if (!Array.isArray(task.history)) task.history = [];
    if (!Array.isArray(task.archives)) task.archives = [];
    if (!task.updateAt) task.updateAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return task;
}

function normalizeTaskList(list) {
    return safeArray(list).map(normalizeTask).filter(Boolean);
}

function normalizeTombstoneMap(raw) {
    const map = {};
    const add = (id, deletedAt) => {
        if (id === undefined || id === null) return;
        const key = String(id);
        const ts = Number(deletedAt) || 0;
        if (!ts) return;
        map[key] = Math.max(map[key] || 0, ts);
    };

    if (Array.isArray(raw)) {
        raw.forEach(entry => {
            if (!entry) return;
            add(entry.id, entry.deletedAt ?? entry.at ?? entry.time ?? entry.updateAt);
        });
        return map;
    }

    if (raw && typeof raw === 'object') {
        Object.entries(raw).forEach(([key, value]) => {
            if (value && typeof value === 'object') {
                add(key, value.deletedAt ?? value.at ?? value.time ?? value.updateAt);
            } else {
                add(key, value);
            }
        });
    }

    return map;
}

function mergeTombstoneMaps(baseMap, incomingMap) {
    const merged = { ...(baseMap || {}) };
    Object.entries(incomingMap || {}).forEach(([key, deletedAt]) => {
        const ts = Number(deletedAt) || 0;
        if (!ts) return;
        merged[key] = Math.max(merged[key] || 0, ts);
    });
    return merged;
}

function normalizeSyncPackage(raw) {
    if (Array.isArray(raw)) {
        return {
            tasks: normalizeTaskList(raw),
            announcement: '',
            announcementProvided: false,
            tombstones: {},
            clearAt: 0,
            schemaVersion: 2
        };
    }

    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        tasks: normalizeTaskList(source.tasks),
        announcement: source.announcement !== undefined ? source.announcement : '',
        announcementProvided: Object.prototype.hasOwnProperty.call(source, 'announcement'),
        tombstones: normalizeTombstoneMap(source.tombstones ?? source.deletedTasks ?? source.deletedIds ?? source.tombstoneMap),
        clearAt: Number(source.clearAt ?? source.clearedAt ?? source.deletedAllAt ?? source.resetAt ?? 0) || 0,
        schemaVersion: Number(source.schemaVersion ?? source.version ?? 2) || 2
    };
}

function mergeTaskRecords(baseList, incomingList, tombstones = {}, clearAt = 0) {
    const mergedMap = new Map();
    const tombstoneMap = normalizeTombstoneMap(tombstones);
    const clearTs = Number(clearAt) || 0;

    const getTaskDeletedAt = (taskId) => tombstoneMap[getTaskTombstoneKey(taskId)] || 0;
    const isHistoryDeleted = (taskId, recordStr) => !!tombstoneMap[getHistoryTombstoneKey(taskId, recordStr)];

    const shouldKeep = (task) => {
        const normalized = normalizeTask(task);
        if (!normalized) return null;
        const taskTs = parseTime(normalized.updateAt);
        if (clearTs && taskTs <= clearTs) return null;
        const deletedAt = getTaskDeletedAt(normalized.id);
        if (deletedAt && taskTs <= deletedAt) return null;
        return normalized;
    };

    const filterHistory = (taskId, list) => safeArray(list)
        .filter(record => typeof record === 'string' && !isHistoryDeleted(taskId, record));

    const mergeTwo = (existing, incoming) => {
        const existingTime = parseTime(existing.updateAt);
        const incomingTime = parseTime(incoming.updateAt);
        const newer = incomingTime >= existingTime ? incoming : existing;
        const older = incomingTime >= existingTime ? existing : incoming;

        const history = Array.from(new Set([
            ...filterHistory(existing.id, existing.history),
            ...filterHistory(incoming.id, incoming.history)
        ])).sort();

        const archivesMap = new Map();
        [...safeArray(existing.archives), ...safeArray(incoming.archives)].forEach(a => {
            if (a && a.month && !archivesMap.has(a.month)) {
                archivesMap.set(a.month, a);
            }
        });

        const merged = { ...older, ...newer };
        merged.history = history;
        merged.archives = Array.from(archivesMap.values()).sort((a, b) => String(a.month || '').localeCompare(String(b.month || ''), 'zh-CN', { numeric: true, sensitivity: 'base' }));
        merged.updateAt = newer.updateAt || older.updateAt || new Date().toISOString().replace('T', ' ').slice(0, 19);
        return merged;
    };

    [...safeArray(baseList), ...safeArray(incomingList)].forEach(rawTask => {
        const task = shouldKeep(rawTask);
        if (!task) return;
        const key = String(task.id);
        if (!mergedMap.has(key)) {
            mergedMap.set(key, task);
        } else {
            mergedMap.set(key, mergeTwo(mergedMap.get(key), task));
        }
    });

    return {
        tasks: Array.from(mergedMap.values()),
        tombstones: tombstoneMap,
        clearAt: clearTs,
        schemaVersion: 2
    };
}

function mergePayloads(baseRaw, incomingRaw) {
    const base = normalizeSyncPackage(baseRaw);
    const incoming = normalizeSyncPackage(incomingRaw);
    const merged = mergeTaskRecords(
        base.tasks,
        incoming.tasks,
        mergeTombstoneMaps(base.tombstones, incoming.tombstones),
        Math.max(base.clearAt || 0, incoming.clearAt || 0)
    );

    return {
        tasks: merged.tasks,
        announcement: incoming.announcementProvided ? incoming.announcement : base.announcement,
        tombstones: merged.tombstones,
        clearAt: merged.clearAt,
        schemaVersion: 2
    };
}

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
    return new Response(data || '{"tasks": [], "announcement": "", "tombstones": [], "clearAt": 0, "schemaVersion": 2}', {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

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
    if (!body || (typeof body !== 'object')) {
      return new Response(JSON.stringify({ error: '数据格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (!Array.isArray(body.tasks)) {
      return new Response(JSON.stringify({ error: '数据格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 关键修复：写入前先读一次云端当前数据，与本次上传的数据合并后再写，
    // 而不是直接整体覆盖——避免多设备并发时后保存的一方覆盖掉另一方的变更。
    let existing = null;
    try {
      const existingRaw = await env.dk.get('daka_main_data');
      if (existingRaw) existing = JSON.parse(existingRaw);
    } catch (e) {
      existing = null;
    }

    const mergedPayload = existing ? mergePayloads(existing, body) : normalizeSyncPackage(body);
    const payloadStr = JSON.stringify({
      tasks: mergedPayload.tasks,
      announcement: mergedPayload.announcement,
      tombstones: mergedPayload.tombstones,
      clearAt: mergedPayload.clearAt,
      schemaVersion: mergedPayload.schemaVersion
    });

    await env.dk.put('daka_main_data', payloadStr);

    // 每日快照备份：同一天只写一次，不额外消耗写入额度（一天最多多1次写）
    try {
      const todayKey = `daka_backup_${new Date().toISOString().slice(0, 10)}`;
      const backupExists = await env.dk.get(todayKey);
      if (!backupExists) {
        await env.dk.put(todayKey, payloadStr);
      }
    } catch (e) {
      // 备份失败不影响主数据保存
    }

    return new Response(JSON.stringify({
      success: true,
      tasks: mergedPayload.tasks,
      announcement: mergedPayload.announcement,
      tombstones: mergedPayload.tombstones,
      clearAt: mergedPayload.clearAt,
      schemaVersion: mergedPayload.schemaVersion
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
