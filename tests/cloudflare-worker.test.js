import { describe, expect, test } from 'bun:test';
import worker from '../cloudflare/worker.js';

class FakeBucket {
  objects = new Map();
  sequence = 0;

  async get(key) {
    return this.objects.get(key) || null;
  }

  async put(key, body, options = {}) {
    const current = this.objects.get(key);
    const etagMatches = options.onlyIf?.etagMatches;
    const ifMatch = options.onlyIf?.get?.('if-match');
    const ifNoneMatch = options.onlyIf?.get?.('if-none-match');
    if (etagMatches && current?.etag !== etagMatches) return null;
    if (ifMatch && current?.httpEtag !== ifMatch) return null;
    if (ifNoneMatch === '*' && current) return null;
    const etag = `etag-${++this.sequence}`;
    const value = {
      key,
      body,
      etag,
      httpEtag: `"${etag}"`,
      uploaded: new Date(),
    };
    this.objects.set(key, value);
    return value;
  }

  async list({ prefix }) {
    return {
      objects: [...this.objects.values()].filter((entry) => entry.key.startsWith(prefix)),
    };
  }

  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}

const envelope = JSON.stringify({
  format: 'chihiro-sync-encrypted',
  formatVersion: 1,
  algorithm: 'AES-GCM',
  keyDerivation: 'PBKDF2-SHA-256',
  iterations: 210000,
  salt: 'salt',
  iv: 'iv',
  contentHash: 'hash',
  ciphertext: 'ciphertext',
});

function env() {
  return {
    SYNC_BUCKET: new FakeBucket(),
    SYNC_TOKEN: 'a-secure-test-token-with-24-characters',
    BACKUP_RETENTION: '30',
  };
}

describe('Cloudflare sync Worker', () => {
  test('keeps the health endpoint public without exposing data', async () => {
    const response = await worker.fetch(new Request('https://sync.example/health'), env());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'chihiro-sync' });
  });

  test('rejects snapshot access without the Worker secret', async () => {
    const response = await worker.fetch(new Request('https://sync.example/v1/snapshot'), env());
    expect(response.status).toBe(401);
  });

  test('stores encrypted snapshots and updates them with the current R2 version', async () => {
    const testEnv = env();
    const headers = {
      Authorization: `Bearer ${testEnv.SYNC_TOKEN}`,
      'Content-Type': 'application/json',
      'If-None-Match': '*',
    };
    const created = await worker.fetch(new Request('https://sync.example/v1/snapshot', {
      method: 'PUT',
      headers,
      body: envelope,
    }), testEnv);
    expect(created.status).toBe(200);
    expect(created.headers.get('etag')).toBe('"etag-1"');

    const downloaded = await worker.fetch(new Request('https://sync.example/v1/snapshot', {
      headers: { Authorization: `Bearer ${testEnv.SYNC_TOKEN}` },
    }), testEnv);
    expect(downloaded.status).toBe(200);
    expect(await downloaded.text()).toBe(envelope);
    expect(downloaded.headers.get('x-chihiro-version')).toBe('etag-1');

    const updatedEnvelope = envelope.replace('"contentHash":"hash"', '"contentHash":"updated-hash"');
    const updated = await worker.fetch(new Request('https://sync.example/v1/snapshot', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${testEnv.SYNC_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Chihiro-Version': 'etag-1',
      },
      body: updatedEnvelope,
    }), testEnv);
    expect(updated.status).toBe(200);
    expect(updated.headers.get('x-chihiro-version')).toBe('etag-3');

    const conflict = await worker.fetch(new Request('https://sync.example/v1/snapshot', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${testEnv.SYNC_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Chihiro-Version': 'etag-1',
      },
      body: envelope,
    }), testEnv);
    expect(conflict.status).toBe(412);
  });
});
