import { describe, expect, test } from 'bun:test';
import { createCurlFetch, createCurlHeaderRule } from '../lib/curl-transport';
import { executeCurl, parseCurl } from '../lib/curl';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
function rulesApi(initial = []) {
  const rules = new Map(initial.map((rule) => [rule.id, rule]));
  const changes = [];
  return {
    rules, changes,
    async getSessionRules() { return [...rules.values()]; },
    async updateSessionRules(change) {
      changes.push(change);
      for (const id of change.removeRuleIds || []) rules.delete(id);
      for (const rule of change.addRules || []) rules.set(rule.id, rule);
    },
  };
}
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

describe('curl browser header compatibility', () => {
  test('limits the rule to the full destination URL and this extension background, preserving explicit headers', () => {
    const rule = createCurlHeaderRule(1_000_000, extensionId, parseCurl(`curl 'http://example.com:8080/API?uid=1#fragment' -H 'Origin: https://allowed.example' -H 'Cookie: token=literal' -A client`));
    expect(rule.condition).toMatchObject({ initiatorDomains: [extensionId], tabIds: [-1], resourceTypes: ['xmlhttprequest'], isUrlFilterCaseSensitive: true });
    const matches = new RegExp(rule.condition.regexFilter);
    expect(matches.test('http://example.com:8080/API?uid=1')).toBe(true);
    expect(matches.test('http://example.com:8080/API?uid=12')).toBe(false);
    expect(matches.test('http://example.com:8081/API?uid=1')).toBe(false);
    expect(matches.test('http://other.example/API?uid=1')).toBe(false);
    expect(rule.action.requestHeaders).toContainEqual({ header: 'origin', operation: 'set', value: 'https://allowed.example' });
    expect(rule.action.requestHeaders).toContainEqual({ header: 'cookie', operation: 'set', value: 'token=literal' });
    expect(rule.action.requestHeaders).toContainEqual({ header: 'user-agent', operation: 'set', value: 'client' });
  });

  test('installs rules before fetch, removes browser-only headers, and cleans up without changing credentials', async () => {
    const api = rulesApi();
    let calls = 0;
    const transport = createCurlFetch(extensionId, api, async (_url, init) => {
      calls++;
      expect(init.credentials).toBe('omit');
      expect(init.cache).toBe('no-store');
      expect(api.rules.size).toBe(1);
      const modifications = [...api.rules.values()][0].action.requestHeaders;
      expect(modifications).toContainEqual({ header: 'origin', operation: 'remove' });
      expect(modifications).toContainEqual({ header: 'sec-fetch-site', operation: 'remove' });
      return new Response('{"data":"ok"}');
    });
    expect((await executeCurl('curl -X POST https://example.com', transport)).status).toBe(200);
    expect(calls).toBe(1);
    expect(api.rules.size).toBe(0);
  });

  test('serializes requests to the same URL so custom headers cannot cross between cards', async () => {
    const api = rulesApi();
    const started = deferred(), finishFirst = deferred();
    const origins = [];
    const transport = createCurlFetch(extensionId, api, async () => {
      origins.push([...api.rules.values()][0].action.requestHeaders.find(({ header }) => header === 'origin').value);
      if (origins.length === 1) { started.resolve(); await finishFirst.promise; }
      return new Response('ok');
    });
    const first = executeCurl('curl https://example.com -H "Origin: https://one.example"', transport);
    await started.promise;
    const second = executeCurl('curl https://example.com -H "Origin: https://two.example"', transport);
    expect(origins).toEqual(['https://one.example']);
    finishFirst.resolve();
    await Promise.all([first, second]);
    expect(origins).toEqual(['https://one.example', 'https://two.example']);
    expect(api.rules.size).toBe(0);
  });

  test('fails before sending if permission or rule installation is unavailable', async () => {
    let calls = 0;
    const fetcher = async () => { calls++; return new Response('unexpected'); };
    expect((await executeCurl('curl https://example.com', createCurlFetch(extensionId, undefined, fetcher))).error).toContain('请求尚未发送');
    const api = rulesApi();
    api.updateSessionRules = async () => { throw new Error('permission denied'); };
    expect((await executeCurl('curl https://example.com', createCurlFetch(extensionId, api, fetcher))).error).toContain('请求尚未发送');
    expect(calls).toBe(0);
  });

  test('cleans rules after a failed fetch and never retries POST', async () => {
    const api = rulesApi();
    let calls = 0;
    const result = await executeCurl('curl -X POST https://example.com', createCurlFetch(extensionId, api, async () => { calls++; throw new Error('connection reset'); }));
    expect(result.error).toBe('connection reset');
    expect(calls).toBe(1);
    expect(api.rules.size).toBe(0);
  });

  test('cleans leftover owned rules on restart while preserving unrelated rules', async () => {
    const api = rulesApi([{ id: 1_000_012 }, { id: 42 }]);
    const transport = createCurlFetch(extensionId, api, async () => {
      expect(api.rules.has(1_000_012)).toBe(false);
      expect(api.rules.has(42)).toBe(true);
      return new Response('ok');
    });
    await executeCurl('curl https://example.com', transport);
    expect([...api.rules.keys()]).toEqual([42]);
  });

  test('does not turn a successful POST into a retry when cleanup fails, and clears the leftover before the next call', async () => {
    const api = rulesApi();
    const update = api.updateSessionRules;
    let failCleanup = true, calls = 0;
    api.updateSessionRules = async (change) => {
      if (!change.addRules && failCleanup) { failCleanup = false; throw new Error('temporary failure'); }
      return update(change);
    };
    const transport = createCurlFetch(extensionId, api, async () => { calls++; expect(api.rules.size).toBe(1); return new Response('ok'); });
    expect((await executeCurl('curl -X POST https://example.com', transport)).status).toBe(200);
    expect(calls).toBe(1);
    expect((await executeCurl('curl -X POST https://example.com', transport)).status).toBe(200);
    expect(calls).toBe(2);
    expect(api.rules.size).toBe(0);
  });
});
