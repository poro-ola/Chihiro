const MAX_RESPONSE_BODY_BYTES = 100_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;

const forbiddenHeaderNames = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'host',
  'keep-alive',
  'origin',
  'referer',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
]);

export const CURL_MESSAGE = {
  execute: 'chihiro:execute-curl',
} as const;

export type CurlExecutionResult = {
  ok: boolean;
  status?: number;
  statusText?: string;
  finalUrl?: string;
  headers?: Array<[string, string]>;
  body?: string;
  bodyTruncated?: boolean;
  durationMs?: number;
  error?: string;
};

interface ParsedCurlRequest {
  url: string;
  method: string;
  headers: Headers;
  body?: string;
  redirect: RequestRedirect;
  timeoutMs: number;
}

function tokenize(command: string) {
  const tokens: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | undefined;
  let escaping = false;

  const finishToken = () => {
    if (current) tokens.push(current);
    current = '';
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (character === undefined) continue;
    if (escaping) {
      if (character !== '\n') current += character;
      escaping = false;
      continue;
    }
    if (quote === 'single') {
      if (character === "'") quote = undefined;
      else current += character;
      continue;
    }
    if (quote === 'double') {
      if (character === '"') quote = undefined;
      else if (character === '\\') escaping = true;
      else current += character;
      continue;
    }
    if (character === "'") {
      quote = 'single';
    } else if (character === '"') {
      quote = 'double';
    } else if (character === '\\') {
      escaping = true;
    } else if (/\s/.test(character)) {
      finishToken();
    } else {
      current += character;
    }
  }

  if (quote) throw new Error('cURL 中有未闭合的引号');
  if (escaping) current += '\\';
  finishToken();
  return tokens;
}

function readOptionValue(tokens: string[], index: number, option: string) {
  const value = tokens[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${option} 缺少参数`);
  return value;
}

function setHeader(headers: Headers, value: string) {
  const separator = value.indexOf(':');
  if (separator < 1) throw new Error(`无效的请求头：${value}`);
  const name = value.slice(0, separator).trim();
  const headerValue = value.slice(separator + 1).trim();
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
    throw new Error(`无效的请求头名称：${name}`);
  }
  if (forbiddenHeaderNames.has(name.toLocaleLowerCase())) {
    throw new Error(`浏览器不允许设置请求头：${name}`);
  }
  headers.append(name, headerValue);
}

function basicAuthorization(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

export function parseCurl(command: string): ParsedCurlRequest {
  if (command.length > 20_000) throw new Error('cURL 请求最多 20,000 字');
  const tokens = tokenize(command.trim());
  if (tokens[0] !== 'curl') throw new Error('请求需以 curl 开头');

  let method = '';
  let redirect: RequestRedirect = 'manual';
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let sendDataAsQuery = false;
  const headers = new Headers();
  const dataParts: string[] = [];
  const urls: string[] = [];

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    const optionWithValue = (option: string, callback: (value: string) => void) => {
      callback(readOptionValue(tokens, index, option));
      index += 1;
    };

    if (token === '-X' || token === '--request') {
      optionWithValue(token, (value) => { method = value.toUpperCase(); });
    } else if (token.startsWith('-X') && token.length > 2) {
      method = token.slice(2).toUpperCase();
    } else if (token === '-H' || token === '--header') {
      optionWithValue(token, (value) => setHeader(headers, value));
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      optionWithValue(token, (value) => {
        if (value.startsWith('@')) throw new Error('暂不支持从本地文件读取请求体');
        dataParts.push(value);
      });
    } else if (token === '--json') {
      optionWithValue(token, (value) => {
        dataParts.push(value);
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
        if (!headers.has('Accept')) headers.set('Accept', 'application/json');
      });
    } else if (token === '-u' || token === '--user') {
      optionWithValue(token, (value) => headers.set('Authorization', basicAuthorization(value)));
    } else if (token === '-L' || token === '--location') {
      redirect = 'follow';
    } else if (token === '-I' || token === '--head') {
      method = 'HEAD';
    } else if (token === '-G' || token === '--get') {
      sendDataAsQuery = true;
    } else if (token === '--max-time') {
      optionWithValue(token, (value) => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('--max-time 必须是大于 0 的秒数');
        timeoutMs = Math.min(Math.round(seconds * 1_000), MAX_TIMEOUT_MS);
      });
    } else if (token === '-s' || token === '--silent' || token === '-i' || token === '--include') {
      // The card already renders response headers and does not print progress output.
    } else if (token === '--url') {
      optionWithValue(token, (value) => urls.push(value));
    } else if (token.startsWith('-')) {
      throw new Error(`暂不支持 cURL 参数：${token}`);
    } else {
      urls.push(token);
    }
  }

  if (urls.length !== 1) throw new Error('请提供且仅提供一个 http 或 https URL');
  const [urlValue] = urls;
  if (!urlValue) throw new Error('请提供一个 http 或 https URL');
  const url = new URL(urlValue);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('仅支持 http 或 https 请求');

  const data = dataParts.join('&');
  if (sendDataAsQuery && data) {
    url.search += `${url.search ? '&' : ''}${data}`;
  }
  const body = sendDataAsQuery || !data ? undefined : data;
  if (body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded');
  }
  if (!method) method = body ? 'POST' : 'GET';
  if (!/^[A-Z]+$/.test(method)) throw new Error(`无效的请求方法：${method}`);
  if ((method === 'GET' || method === 'HEAD') && body) {
    throw new Error(`${method} 请求不能携带请求体；可使用 -G 将数据放入查询参数`);
  }

  return { url: url.toString(), method, headers, body, redirect, timeoutMs };
}

async function readResponseBody(response: Response) {
  if (!response.body) return { body: '', bodyTruncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let bodyTruncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = MAX_RESPONSE_BODY_BYTES - size;
      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, Math.max(remaining, 0)));
        size += Math.max(remaining, 0);
        bodyTruncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder().decode(merged), bodyTruncated };
}

export async function executeCurl(command: string): Promise<CurlExecutionResult> {
  const startedAt = performance.now();
  try {
    const request = parseCurl(command);
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: request.redirect,
        credentials: 'omit',
        signal: controller.signal,
      });
      const { body, bodyTruncated } = await readResponseBody(response);
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        finalUrl: response.url,
        headers: [...response.headers.entries()],
        body,
        bodyTruncated,
        durationMs: Math.round(performance.now() - startedAt),
      };
    } finally {
      globalThis.clearTimeout(timer);
    }
  } catch (reason) {
    const error = reason instanceof Error ? reason.message : '请求执行失败';
    return {
      ok: false,
      error: error === 'The user aborted a request.' ? '请求超时' : error,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}
