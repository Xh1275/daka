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

  function safeText(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
  }

  function toMs(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function parseJSON(raw, fallback) {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  const DEVICE_STALE_MS = 3 * 24 * 60 * 60 * 1000;

  function normalizeHistory(list) {
    return Array.isArray(list) ? list.filter(v => typeof v === 'string') : [];
  }

  function normalizeArchives(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(item => item && typeof item === 'object' && item.month)
      .map(item => ({ ...item, month: String(item.month) }));
  }

  function normalizeTask(task) {
    const item = task && typeof task === 'object' ? { ...task } : {};
    item.id = Number.isFinite(Number(item.id)) ? Number(item.id) : (Date.now() + Math.floor(Math.random() * 1000));
    item.name = safeText(item.name, '未命名任务').trim() || '未命名任务';
    item.history = normalizeHistory(item.history);
    item.archives = normalizeArchives(item.archives);
    item.updateAt = safeText(item.updateAt, '');
    return item;
  }

  function mergeUniqueStrings(a, b) {
    return Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])).sort();
  }

  function mergeArchives(a, b) {
    const map = new Map();
    [...normalizeArchives(a), ...normalizeArchives(b)].forEach(item => {
      const existed = map.get(item.month);
      if (!existed) {
        map.set(item.month, item);
      } else {
        const leftTs = toMs(existed.ts || existed.updateAt);
        const rightTs = toMs(item.ts || item.updateAt);
        map.set(item.month, rightTs >= leftTs ? item : existed);
      }
    });
    return Array.from(map.values());
  }

  function mergeTask(remoteTask, incomingTask) {
    if (!remoteTask) return incomingTask;
    if (!incomingTask) return remoteTask;

    const remoteTs = toMs(remoteTask.updateAt);
    const incomingTs = toMs(incomingTask.updateAt);
    const base = incomingTs >= remoteTs ? { ...incomingTask } : { ...remoteTask };

    base.history = mergeUniqueStrings(remoteTask.history, incomingTask.history);
    base.archives = mergeArchives(remoteTask.archives, incomingTask.archives);
    base.updateAt = incomingTs >= remoteTs ? incomingTask.updateAt : remoteTask.updateAt;

    const newer = incomingTs >= remoteTs ? incomingTask : remoteTask;
    const older = incomingTs >= remoteTs ? remoteTask : incomingTask;
    for (const key of Object.keys(older)) {
      if (base[key] === undefined || base[key] === null || base[key] === '') {
        base[key] = older[key];
      }
    }
    base.id = Number.isFinite(Number(base.id)) ? Number(base.id) : Number(newer.id);
    base.name = safeText(base.name, '未命名任务').trim() || '未命名任务';
    return base;
  }

  function mergeTasks(remoteList, incomingList) {
    const remote = Array.isArray(remoteList) ? remoteList.map(normalizeTask) : [];
    const incoming = Array.isArray(incomingList) ? incomingList.map(normalizeTask) : [];
    const map = new Map();
    remote.forEach(item => map.set(item.id, item));
    incoming.forEach(item => {
      const existed = map.get(item.id);
      map.set(item.id, mergeTask(existed, item));
    });
    return Array.from(map.values());
  }

  function normalizeTaskDeletionRecord(raw) {
    const item = raw && typeof raw === 'object' ? { ...raw } : {};
    const taskId = Number.isFinite(Number(item.taskId)) ? Number(item.taskId) : Number(item.id);
    if (!Number.isFinite(taskId)) return null;
    const deletedAt = toMs(item.deletedAt);
    const restoredAt = toMs(item.restoredAt);
    const updatedAt = Math.max(deletedAt, restoredAt, toMs(item.updatedAt));
    return {
      taskId,
      deletedAt,
      restoredAt,
      updatedAt,
      deviceId: safeText(item.deviceId).trim()
    };
  }

  function normalizeTaskDeletionList(list) {
    if (!Array.isArray(list)) return [];
    const map = new Map();
    list.forEach(item => {
      const normalized = normalizeTaskDeletionRecord(item);
      if (!normalized) return;
      const existed = map.get(normalized.taskId);
      if (!existed) {
        map.set(normalized.taskId, normalized);
        return;
      }
      map.set(normalized.taskId, {
        taskId: normalized.taskId,
        deletedAt: Math.max(toMs(existed.deletedAt), toMs(normalized.deletedAt)),
        restoredAt: Math.max(toMs(existed.restoredAt), toMs(normalized.restoredAt)),
        updatedAt: Math.max(toMs(existed.updatedAt), toMs(normalized.updatedAt)),
        deviceId: normalized.updatedAt >= existed.updatedAt ? normalized.deviceId : existed.deviceId
      });
    });
    return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (b.taskId || 0) - (a.taskId || 0));
  }

  function mergeTaskDeletionRecords(remoteList, incomingList) {
    return normalizeTaskDeletionList([...(Array.isArray(remoteList) ? remoteList : []), ...(Array.isArray(incomingList) ? incomingList : [])]);
  }

  function getTaskDeletionRecordMap(records) {
    const map = new Map();
    normalizeTaskDeletionList(records).forEach(record => map.set(record.taskId, record));
    return map;
  }

  function isTaskDeletedByLedger(task, recordMap) {
    if (!task || !Number.isFinite(Number(task.id))) return false;
    const record = recordMap.get(Number(task.id));
    if (!record) return false;
    return toMs(record.deletedAt) > toMs(record.restoredAt);
  }

  function applyTaskDeletionLedger(tasks, records) {
    const map = getTaskDeletionRecordMap(records);
    return Array.isArray(tasks) ? tasks.filter(task => !isTaskDeletedByLedger(task, map)) : [];
  }

  function normalizeDeviceEntry(raw, fallbackId) {
    const source = raw && typeof raw === 'object' ? { ...raw } : {};
    const id = safeText(source.deviceId || source.id || fallbackId).trim();
    const now = Date.now();
    const note = safeText(source.note || source.remark || '').trim();
    const firstSeenAt = toMs(source.firstSeenAt) || now;
    const lastSeenAt = toMs(source.lastSeenAt) || firstSeenAt;
    const lastUploadAt = toMs(source.lastUploadAt);
    const noteUpdatedAt = toMs(source.noteUpdatedAt) || (note ? firstSeenAt : 0);
    return { deviceId: id, note, firstSeenAt, lastSeenAt, lastUploadAt, noteUpdatedAt };
  }

  function normalizeDeviceRegistry(raw) {
    const registry = {};
    if (!raw) return registry;
    if (Array.isArray(raw)) {
      raw.forEach(item => {
        const normalized = normalizeDeviceEntry(item, item && (item.deviceId || item.id));
        if (normalized.deviceId) registry[normalized.deviceId] = normalized;
      });
      return registry;
    }
    if (typeof raw !== 'object') return registry;
    Object.keys(raw).forEach(key => {
      const normalized = normalizeDeviceEntry(raw[key], key);
      if (normalized.deviceId) registry[normalized.deviceId] = normalized;
    });
    return registry;
  }

  function mergeDevices(remoteRegistry, incomingRegistry, incomingMeta) {
    const remote = normalizeDeviceRegistry(remoteRegistry);
    const incoming = normalizeDeviceRegistry(incomingRegistry);
    const merged = { ...remote };
    Object.keys(incoming).forEach(id => {
      const a = merged[id];
      const b = incoming[id];
      if (!a) {
        merged[id] = b;
        return;
      }
      const preferIncomingNote = toMs(b.noteUpdatedAt) >= toMs(a.noteUpdatedAt);
      merged[id] = {
        deviceId: id,
        note: preferIncomingNote ? (b.note || a.note || '') : (a.note || b.note || ''),
        firstSeenAt: Math.min(toMs(a.firstSeenAt) || b.firstSeenAt || Date.now(), toMs(b.firstSeenAt) || a.firstSeenAt || Date.now()),
        lastSeenAt: Math.max(toMs(a.lastSeenAt), toMs(b.lastSeenAt)),
        lastUploadAt: Math.max(toMs(a.lastUploadAt), toMs(b.lastUploadAt)),
        noteUpdatedAt: Math.max(toMs(a.noteUpdatedAt), toMs(b.noteUpdatedAt))
      };
    });
    if (incomingMeta && incomingMeta.deviceId) {
      const metaEntry = normalizeDeviceEntry({
        deviceId: incomingMeta.deviceId,
        note: incomingMeta.deviceNote,
        firstSeenAt: incomingMeta.updatedAt,
        lastSeenAt: incomingMeta.updatedAt,
        lastUploadAt: incomingMeta.updatedAt,
        noteUpdatedAt: incomingMeta.updatedAt
      }, incomingMeta.deviceId);
      const current = merged[metaEntry.deviceId];
      merged[metaEntry.deviceId] = current
        ? {
            deviceId: metaEntry.deviceId,
            note: metaEntry.note || current.note || '',
            firstSeenAt: Math.min(toMs(current.firstSeenAt) || metaEntry.firstSeenAt, metaEntry.firstSeenAt),
            lastSeenAt: Math.max(toMs(current.lastSeenAt), metaEntry.lastSeenAt),
            lastUploadAt: Math.max(toMs(current.lastUploadAt), metaEntry.lastUploadAt),
            noteUpdatedAt: Math.max(toMs(current.noteUpdatedAt), metaEntry.noteUpdatedAt)
          }
        : metaEntry;
    }
    return merged;
  }

  function pruneDeviceRegistry(registry, referenceTime = Date.now()) {
    const now = toMs(referenceTime) || Date.now();
    const cutoff = now - DEVICE_STALE_MS;
    const normalized = normalizeDeviceRegistry(registry);
    const pruned = {};
    Object.keys(normalized).forEach(id => {
      const entry = normalized[id];
      const activityAt = Math.max(toMs(entry.lastUploadAt), toMs(entry.lastSeenAt), toMs(entry.firstSeenAt));
      if (id && activityAt >= cutoff) {
        pruned[id] = entry;
      }
    });
    return pruned;
  }

  function normalizeSyncLogItem(item) {
    const source = item && typeof item === 'object' ? { ...item } : {};
    return {
      ...source,
      t: safeText(source.t).trim(),
      ts: toMs(source.ts),
      type: source.type === 'download' ? 'download' : 'upload',
      ok: !!source.ok,
      reason: source.reason === undefined || source.reason === null ? null : safeText(source.reason),
      detail: source.detail ?? null,
      localOnly: !!source.localOnly,
      deviceId: safeText(source.deviceId).trim(),
      deviceNote: safeText(source.deviceNote).trim(),
      deviceLabel: safeText(source.deviceLabel).trim()
    };
  }

  function mergeSyncLogs(remoteLog, incomingLog) {
    const all = [
      ...(Array.isArray(remoteLog) ? remoteLog : []).map(normalizeSyncLogItem),
      ...(Array.isArray(incomingLog) ? incomingLog : []).map(normalizeSyncLogItem)
    ];
    const seen = new Set();
    const merged = [];
    all.sort((a, b) => (b.ts || 0) - (a.ts || 0) || (b.t || '').localeCompare(a.t || ''));
    for (const item of all) {
      const key = `${item.t}_${item.type}_${item.ok}_${item.reason || ''}_${item.deviceId || ''}_${item.deviceNote || ''}_${item.localOnly ? '1' : '0'}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
    return merged.slice(0, 50);
  }

  function normalizeSnapshot(item) {
    const source = item && typeof item === 'object' ? { ...item } : {};
    return {
      ...source,
      date: safeText(source.date).trim(),
      ts: toMs(source.ts) || Date.now(),
      tasks: Array.isArray(source.tasks) ? source.tasks : []
    };
  }

  function mergeSnapshots(remoteSnapshots, incomingSnapshots) {
    const all = [
      ...(Array.isArray(remoteSnapshots) ? remoteSnapshots : []).map(normalizeSnapshot),
      ...(Array.isArray(incomingSnapshots) ? incomingSnapshots : []).map(normalizeSnapshot)
    ];
    const map = new Map();
    for (const snap of all) {
      if (!snap.date) continue;
      const existed = map.get(snap.date);
      if (!existed || toMs(snap.ts) >= toMs(existed.ts)) {
        map.set(snap.date, snap);
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  function chooseAnnouncement(remoteData, existingData) {
    const incomingUpdatedAt = toMs(remoteData?.deviceMeta?.updatedAt);
    const existingUpdatedAt = toMs(existingData?.deviceMeta?.updatedAt);
    if (incomingUpdatedAt >= existingUpdatedAt) {
      return remoteData?.announcement !== undefined ? remoteData.announcement : existingData?.announcement;
    }
    return existingData?.announcement !== undefined ? existingData.announcement : remoteData?.announcement;
  }

  try {
    const body = await request.json();

    if (!body.tasks || !Array.isArray(body.tasks)) {
      return new Response(JSON.stringify({ error: '数据格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const currentRaw = await env.dk.get('daka_main_data');
    const currentData = parseJSON(currentRaw, {});

    const incomingData = {
      ...body,
      tasks: Array.isArray(body.tasks) ? body.tasks : [],
      syncLog: Array.isArray(body.syncLog) ? body.syncLog : [],
      snapshots: Array.isArray(body.snapshots) ? body.snapshots : [],
      taskDeletionRecords: Array.isArray(body.taskDeletionRecords) ? body.taskDeletionRecords : [],
      devices: body.devices && typeof body.devices === 'object' ? body.devices : {},
      deviceMeta: body.deviceMeta && typeof body.deviceMeta === 'object' ? body.deviceMeta : {}
    };

    const mergedTaskDeletionRecords = mergeTaskDeletionRecords(currentData.taskDeletionRecords, incomingData.taskDeletionRecords);
    const mergedTasks = applyTaskDeletionLedger(
      mergeTasks(currentData.tasks, incomingData.tasks),
      mergedTaskDeletionRecords
    );

    const merged = {
      ...currentData,
      ...incomingData,
      tasks: mergedTasks,
      taskDeletionRecords: mergedTaskDeletionRecords,
      syncLog: mergeSyncLogs(currentData.syncLog, incomingData.syncLog),
      snapshots: mergeSnapshots(currentData.snapshots, incomingData.snapshots),
      devices: pruneDeviceRegistry(
        mergeDevices(currentData.devices, incomingData.devices, incomingData.deviceMeta || incomingData.deviceMeta),
        Date.now()
      ),
      deviceMeta: {
        ...(currentData.deviceMeta && typeof currentData.deviceMeta === 'object' ? currentData.deviceMeta : {}),
        ...(incomingData.deviceMeta || {})
      }
    };

    merged.announcement = chooseAnnouncement(incomingData, currentData);

    await env.dk.put('daka_main_data', JSON.stringify(merged));
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
