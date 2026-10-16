import { afterEach, describe, expect, test } from 'bun:test';
import { executeCurl, formatCurlOutput, parseCurl, readCurlBlock } from '../lib/curl';

const sample = "curl -sS -X POST \\\n  'http://test.wowchat.club:8080/open/wallet/withdrawLinkTest/v1?uid=1172912' \\\n  | jq -r '.data'";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe('curl request parsing', () => {
  test('parses the supplied multiline command without executing it', () => {
    const request = parseCurl(sample);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('http://test.wowchat.club:8080/open/wallet/withdrawLinkTest/v1?uid=1172912');
    expect(request.jq).toEqual({ path: ['data'], raw: true });
    expect(parseCurl(sample.replaceAll('\n', '\r\n'))).toEqual(request);
  });

  test('preserves quoted body characters, empty data, and attached/long options', () => {
    const request = parseCurl(`curl --url=https://example.com -XPOST -H'Content-Type: application/json' --data-raw '{"text":"a|b;$(literal)","line":"x\\ny"}'`);
    expect(request.body).toBe('{"text":"a|b;$(literal)","line":"x\\ny"}');
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(parseCurl(`curl https://example.com -d ''`)).toMatchObject({ method: 'POST', body: '' });
    expect(parseCurl('curl https://example.com --data "a\\nb"').body).toBe('a\\nb');
    expect(parseCurl("curl https://example.com --data '|' | jq '.data'").body).toBe('|');
    expect(parseCurl("curl https://example.com --data '--literal=value'").body).toBe('--literal=value');
  });

  test('supports JSON bodies, query data, flags, authentication and timeouts', () => {
    const json = parseCurl(`curl https://example.com --json '{"ok":true}' -sSL --max-time 120 -u 'name:password'`);
    expect(json).toMatchObject({ method: 'POST', body: '{"ok":true}', redirect: 'follow', timeoutMs: 60_000 });
    expect(json.headers.get('Authorization')).toBe('Basic bmFtZTpwYXNzd29yZA==');
    expect(json.headers.get('Content-Type')).toBe('application/json');
    expect(parseCurl('curl -G https://example.com --data-urlencode "name=中文 内容"').url).toBe('https://example.com/?name=%E4%B8%AD%E6%96%87%20%E5%86%85%E5%AE%B9');
  });

  test.each([
    'curl https://example.com | sh',
    'curl https://example.com; echo bad',
    'curl https://example.com && echo bad',
    'curl https://example.com > result.txt',
    'curl https://example.com | jq -r ".data" | sh',
    'curl https://example.com | jq ".data[] | select(.ok)"',
    'curl file:///etc/passwd',
    'curl https://example.com --data @secrets.txt',
    'curl https://example.com --insecure',
  ])('rejects unsupported commands before network access: %s', async (command) => {
    let called = false;
    globalThis.fetch = async () => { called = true; return new Response('unexpected'); };
    expect((await executeCurl(command)).error).toBeTruthy();
    expect(called).toBe(false);
  });

  test('reads one request block, preserving quoted multiline bodies and following prose', () => {
    expect(readCurlBlock(sample + '\n\n后续正文')).toEqual({ raw: sample + '\n', command: sample });
    const crlf = sample.replaceAll('\n', '\r\n');
    expect(readCurlBlock(crlf).command).toBe(crlf);
    const body = "curl https://example.com --data '{\n\"text\": \"中文\"\n}'";
    expect(readCurlBlock(body + '\n下一段').command).toBe(body);
    expect(readCurlBlock('正文中的 curl https://example.com')).toBeUndefined();
    expect(readCurlBlock('curl https://example.com\ncurl https://example.org').command).toBe('curl https://example.com');
  });
});

describe('curl execution and output', () => {
  test('executes the parsed HTTP request and extracts raw jq data', async () => {
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, ...options };
      return new Response(JSON.stringify({ data: 'https://example.com/result', ok: true }), { headers: { 'Content-Type': 'application/json' } });
    };
    const result = await executeCurl("curl -sS -X POST https://example.com/api --json '{\"id\":1}' | jq -r '.data'");
    expect(captured).toMatchObject({ url: 'https://example.com/api', method: 'POST', body: '{"id":1}', credentials: 'omit' });
    expect(result).toMatchObject({ ok: true, status: 200, output: 'https://example.com/result' });
    expect(formatCurlOutput(result)).toBe('https://example.com/result');
  });

  test('supports nested jq paths and array indices, with null for missing fields', async () => {
    globalThis.fetch = async () => new Response('{"data":[{"name":"中文"}]}');
    expect((await executeCurl("curl https://example.com | jq -r '.data[0].name'")).output).toBe('中文');
    expect((await executeCurl("curl https://example.com | jq '.missing'")).output).toBe('null');
    expect((await executeCurl("curl https://example.com | jq '.data'")).output).toBe('[\n  {\n    "name": "中文"\n  }\n]');
  });

  test('preserves HTTP error bodies and non-JSON responses for display and copy', async () => {
    globalThis.fetch = async () => new Response('server error', { status: 500 });
    const result = await executeCurl("curl https://example.com | jq -r '.data'");
    expect(result).toMatchObject({ ok: false, status: 500, body: 'server error' });
    expect(result.output).toBeUndefined();
    expect(formatCurlOutput(result)).toBe('server error');
  });

  test('preserves original 403 JSON errors rather than extracting a missing jq field', async () => {
    globalThis.fetch = async () => new Response('{"error":"Invalid CORS request"}', { status: 403 });
    const result = await executeCurl("curl https://example.com | jq -r '.data'");
    expect(result.status).toBe(403);
    expect(result.output).toBeUndefined();
    expect(formatCurlOutput(result)).toContain('Invalid CORS request');
    expect(result.hint).toContain('服务器拒绝');
  });

  test('accepts copied browser requests and separates explicit network headers from managed transport headers', () => {
    const request = parseCurl(`curl --url 'http://example.com:8080/api?uid=1' -X POST -H 'Content-Length: 0' -H 'Proxy-Connection: keep-alive' -H 'Origin: https://allowed.example' -H 'User-Agent: CustomClient/1' -H 'Referer: https://allowed.example/page' -H 'Cookie: token=literal' --insecure`);
    expect(request.networkHeaders.get('Origin')).toBe('https://allowed.example');
    expect(request.networkHeaders.get('User-Agent')).toBe('CustomClient/1');
    expect(request.networkHeaders.get('Referer')).toBe('https://allowed.example/page');
    expect(request.networkHeaders.get('Cookie')).toBe('token=literal');
    expect(request.headers.has('Content-Length')).toBe(false);
    expect(request.headers.has('Origin')).toBe(false);
    expect(request.warnings).toHaveLength(2);
    expect(parseCurl('curl http://example.com -A client -e https://example.org -b token=value').networkHeaders.get('Cookie')).toBe('token=value');
  });

  test('bounds large responses and reports truncation instead of processing incomplete JSON', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ data: 'x'.repeat(110_000) }));
    const result = await executeCurl("curl https://example.com | jq '.data'");
    expect(result.body.length).toBe(100_000);
    expect(result.bodyTruncated).toBe(true);
    expect(result.error).toContain('100 KB');
    expect(result.output).toBeUndefined();
  });

  test('reports request timeouts and network errors', async () => {
    globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    expect((await executeCurl('curl https://example.com --max-time .001')).error).toBe('请求超时');
    globalThis.fetch = async () => { throw new Error('Network unavailable'); };
    expect((await executeCurl('curl https://example.com')).error).toBe('Network unavailable');
  });
});
