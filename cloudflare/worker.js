const CURRENT_KEY = 'current/snapshot.json';
const HISTORY_PREFIX = 'history/';
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const VERSION_HEADER = 'x-chihiro-version';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': `authorization, content-type, if-match, if-none-match, ${VERSION_HEADER}`,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Expose-Headers': `etag, ${VERSION_HEADER}`,
    'Cache-Control': 'no-store',
    ...extra,
  };
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...headers }),
  });
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function tokenMatches(request, expected) {
  const authorization = request.headers.get('authorization') || '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const [providedDigest, expectedDigest] = await Promise.all([digest(provided), digest(expected || '')]);
  let difference = provided.length === (expected || '').length ? 0 : 1;
  for (let index = 0; index < providedDigest.length; index += 1) {
    difference |= (providedDigest[index] || 0) ^ (expectedDigest[index] || 0);
  }
  return Boolean(expected) && difference === 0;
}

function assertEnvelope(value) {
  if (!value || typeof value !== 'object') throw new Error('invalid envelope');
  if (
    value.format !== 'chihiro-sync-encrypted' ||
    value.formatVersion !== 1 ||
    value.algorithm !== 'AES-GCM' ||
    value.keyDerivation !== 'PBKDF2-SHA-256' ||
    typeof value.contentHash !== 'string' ||
    typeof value.ciphertext !== 'string' ||
    typeof value.salt !== 'string' ||
    typeof value.iv !== 'string'
  ) {
    throw new Error('invalid envelope');
  }
}

async function pruneHistory(bucket, retentionValue) {
  const retention = Math.min(Math.max(Number.parseInt(retentionValue || '30', 10) || 30, 1), 100);
  const objects = await bucket.list({ prefix: HISTORY_PREFIX, limit: 1_000 });
  const stale = objects.objects
    .sort((left, right) => right.uploaded.getTime() - left.uploaded.getTime())
    .slice(retention);
  if (stale.length) await bucket.delete(stale.map((entry) => entry.key));
}

async function handleGet(env) {
  const object = await env.SYNC_BUCKET.get(CURRENT_KEY);
  if (!object) return json({ error: 'snapshot_not_found' }, 404);
  return new Response(object.body, {
    status: 200,
    headers: corsHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      ETag: object.httpEtag,
      [VERSION_HEADER]: object.etag,
    }),
  });
}

async function handlePut(request, env) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'snapshot_too_large' }, 413);
  const requestedVersion = request.headers.get(VERSION_HEADER) ||
    request.headers.get('if-match')?.replace(/^W\//, '').replace(/^"|"$/g, '');
  if (!requestedVersion && !request.headers.has('if-none-match')) {
    return json({ error: 'precondition_required' }, 428);
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return json({ error: 'snapshot_too_large' }, 413);
  try {
    assertEnvelope(JSON.parse(body));
  } catch {
    return json({ error: 'invalid_snapshot' }, 400);
  }

  let onlyIf;
  const ifNoneMatch = request.headers.get('if-none-match');
  if (requestedVersion) {
    onlyIf = { etagMatches: requestedVersion };
  } else {
    const conditions = new Headers();
    conditions.set('if-none-match', ifNoneMatch || '*');
    onlyIf = conditions;
  }

  const stored = await env.SYNC_BUCKET.put(CURRENT_KEY, body, {
    onlyIf,
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
  });
  if (!stored) return json({ error: 'snapshot_conflict' }, 412);

  const timestamp = new Date().toISOString().replaceAll(':', '-');
  await env.SYNC_BUCKET.put(HISTORY_PREFIX + timestamp + '-' + stored.etag + '.json', body, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  await pruneHistory(env.SYNC_BUCKET, env.BACKUP_RETENTION);
  return json({ ok: true }, 200, {
    ETag: stored.httpEtag,
    [VERSION_HEADER]: stored.etag,
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'chihiro-sync' });
    }
    if (url.pathname !== '/v1/snapshot') return json({ error: 'not_found' }, 404);
    if (!(await tokenMatches(request, env.SYNC_TOKEN))) return json({ error: 'unauthorized' }, 401);

    try {
      if (request.method === 'GET') return handleGet(env);
      if (request.method === 'PUT') return handlePut(request, env);
      return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, PUT, OPTIONS' });
    } catch {
      return json({ error: 'internal_error' }, 500);
    }
  },
};
