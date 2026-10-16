import type { Browser } from 'wxt/browser';
import type { CurlFetch, ParsedCurlRequest } from './curl';

type RulesApi = Pick<typeof Browser.declarativeNetRequest, 'getSessionRules' | 'updateSessionRules'>;
const FIRST_RULE_ID = 1_000_000;
const LAST_RULE_ID = 2_000_000;
const browserOnlyHeaders = [
  'origin', 'referer', 'cookie', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user',
  'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
];

function requestUrl(request: ParsedCurlRequest) {
  const url = new URL(request.url);
  url.hash = '';
  return url.toString();
}

export function createCurlHeaderRule(id: number, extensionId: string, request: ParsedCurlRequest): Browser.declarativeNetRequest.Rule {
  const modifications = new Map<string, Browser.declarativeNetRequest.ModifyHeaderInfo>();
  for (const header of browserOnlyHeaders) modifications.set(header, { header, operation: 'remove' });
  for (const [header, value] of request.networkHeaders) {
    modifications.set(header, value ? { header, operation: 'set', value } : { header, operation: 'remove' });
  }
  return {
    id, priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [...modifications.values()] },
    condition: {
      // Match the full URL (including query and port), this extension's
      // background requests only. Ordinary tabs and other origins are excluded.
      regexFilter: `^${requestUrl(request).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      isUrlFilterCaseSensitive: true,
      initiatorDomains: [extensionId],
      tabIds: [-1],
      resourceTypes: ['xmlhttprequest'],
    },
  };
}

/** Install the rule before sending; never retry a request that may have side effects. */
export function createCurlFetch(extensionId: string, api: RulesApi | undefined, fetcher: typeof fetch = globalThis.fetch): CurlFetch {
  let initialized: Promise<void> | undefined;
  let nextRuleId = FIRST_RULE_ID;
  const pending = new Map<string, Promise<void>>();
  const stale = new Set<number>();

  const initialize = () => initialized ??= (async () => {
    if (!api) throw new Error('请求头兼容能力不可用，请在扩展管理页重新加载千寻并检查权限');
    const rules = await api.getSessionRules();
    const owned = rules.filter(({ id }) => id >= FIRST_RULE_ID && id < LAST_RULE_ID).map(({ id }) => id);
    if (owned.length) await api.updateSessionRules({ removeRuleIds: owned });
  })().catch((reason) => { initialized = undefined; throw reason; });

  return async (request, init) => {
    const key = requestUrl(request);
    const previous = pending.get(key) || Promise.resolve();
    let release!: () => void;
    const finished = new Promise<void>((resolve) => { release = resolve; });
    pending.set(key, finished);
    await previous;
    try {
      init.signal?.throwIfAborted();
      try { await initialize(); }
      catch { throw new Error('无法准备请求头兼容规则，请重新加载扩展并确认网络请求权限；请求尚未发送'); }
      init.signal?.throwIfAborted();
      if (nextRuleId >= LAST_RULE_ID) throw new Error('请求规则数量已达上限，请重新加载扩展');
      const id = nextRuleId++;
      const staleIds = [...stale];
      try {
        await api!.updateSessionRules({ removeRuleIds: staleIds, addRules: [createCurlHeaderRule(id, extensionId, request)] });
        // Another URL's cleanup can fail while this update is in flight.
        for (const staleId of staleIds) stale.delete(staleId);
      } catch {
        throw new Error('无法设置请求头兼容规则，请重新加载扩展并检查权限；请求尚未发送');
      }
      try {
        init.signal?.throwIfAborted();
        // The browser must check every execution; a cached response must not
        // disguise either a successful fix or a server rejection.
        return await fetcher(request.url, { ...init, cache: 'no-store' });
      } finally {
        try { await api!.updateSessionRules({ removeRuleIds: [id] }); }
        catch {
          // Do not report an already-completed POST as a failure or retry it.
          // Remove the leftover rule before the next request, or on worker restart.
          stale.add(id);
        }
      }
    } finally {
      release();
      if (pending.get(key) === finished) pending.delete(key);
    }
  };
}
