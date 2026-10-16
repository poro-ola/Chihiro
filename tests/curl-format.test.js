import { describe, expect, test } from 'bun:test';
import { normalizeCurlCommand } from '../lib/curl-format';
import { executeCurl, parseCurl } from '../lib/curl';

const escapedJq = String.raw`curl -sS -X POST \\\
&#x20; 'http\://example.com:8080/open/wallet/withdrawLinkTest/v1?uid=1178129' \\\
&#x20; \| jq -r '.data'`;
const escapedWebhook = String.raw`curl --request POST \\\
&#x20; 'http\://example.com/pipeline/webhook/local-fixture' \\\
&#x20; \--header 'Content-Type: application/json' \\\
&#x20; \--data-raw '{\
&#x20;   "ACTIONS_NICKNAME": "poro",\
&#x20;   "NOTIFY_PIPELINE_TAGS": "线上环境"\
&#x20; }'`;

describe('Markdown curl copy compatibility', () => {
  test('normalizes the escaped multiline POST and jq example', () => {
    const normalized = normalizeCurlCommand(escapedJq);
    expect(normalized).not.toContain('&#x20;');
    expect(normalized).not.toContain('http\\:');
    expect(normalized).toContain("| jq -r '.data'");
    const request = parseCurl(escapedJq);
    expect(request).toMatchObject({ method: 'POST', url: 'http://example.com:8080/open/wallet/withdrawLinkTest/v1?uid=1178129', jq: { raw: true, path: ['data'] } });
    expect(normalizeCurlCommand(normalized)).toBe(normalized);
  });

  test('normalizes the escaped JSON webhook example without changing Chinese values', () => {
    const request = parseCurl(escapedWebhook);
    expect(request.method).toBe('POST');
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({ ACTIONS_NICKNAME: 'poro', NOTIFY_PIPELINE_TAGS: '线上环境' });
    expect(normalizeCurlCommand(normalizeCurlCommand(escapedWebhook))).toBe(normalizeCurlCommand(escapedWebhook));
  });

  test.each(['curl', 'bash', 'sh', 'shell', ''])('accepts a single fenced command (%s)', (language) => {
    expect(parseCurl('```' + language + '\n' + escapedJq + '\n```').jq).toEqual({ raw: true, path: ['data'] });
  });

  test('preserves valid JSON escapes and entity-like text inside request values', () => {
    const body = JSON.stringify({ path: 'C:\\folder\\file', text: 'literal &#x20; &amp; \\| jq', line: 'a\nb', url: 'http\\://literal' });
    const command = "curl 'http\\://example.com/api' --header 'Content-Type: application/json' --data-raw '" + body + "'";
    expect(parseCurl(command).body).toBe(body);
    expect(parseCurl("curl 'http\\://example.com' --data-raw 'http\\://literal'").body).toBe('http\\://literal');
    expect(parseCurl("curl 'http\\://example.com' --data-raw 'hello\n&#x20; literal\\\nworld'").body).toBe('hello\n&#x20; literal\\\nworld');
    expect(parseCurl('curl http://example.com -d curl').body).toBe('curl');
  });

  test('leaves ordinary shell quoting and escaped literal pipes unchanged', () => {
    const command = String.raw`curl http://example.com --data-raw 'a|b;$(literal)\n' -H 'X-Test: \--header'`;
    expect(normalizeCurlCommand(command)).toBe(command);
    expect(parseCurl(String.raw`curl http://example.com -d \|`).body).toBe('|');
  });

  test('recognizes decimal and named indentation entities', () => {
    const request = parseCurl(escapedWebhook.replaceAll('&#x20;', '&#32;').replace('&#32;', '&nbsp;'));
    expect(JSON.parse(request.body).NOTIFY_PIPELINE_TAGS).toBe('线上环境');
  });

  test('rejects multiple requests instead of executing one silently', async () => {
    let calls = 0;
    const transport = async () => { calls++; return new Response('unexpected'); };
    const result = await executeCurl('curl -X POST http://example.com/one\n\ncurl -X POST http://example.com/two', transport);
    expect(result.error).toContain('多条 curl');
    expect(calls).toBe(0);
  });
});
