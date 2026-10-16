import { normalizeCurlCommand } from './curl-format';

const MAX_RESPONSE_BODY_BYTES = 100_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;

const managedHeaderNames = new Set(['accept-encoding', 'connection', 'content-length', 'host', 'keep-alive', 'proxy-connection', 'transfer-encoding']);
const networkHeaderNames = new Set(['origin', 'referer', 'user-agent', 'cookie']);

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
  output?: string;
  bodyTruncated?: boolean;
  durationMs?: number;
  error?: string;
  hint?: string;
};

export interface ParsedCurlRequest {
  url: string;
  method: string;
  headers: Headers;
  networkHeaders: Headers;
  warnings: string[];
  body?: string;
  redirect: RequestRedirect;
  timeoutMs: number;
  jq?: { path: Array<string | number>; raw: boolean };
}

export type CurlFetch = (request: ParsedCurlRequest, init: RequestInit) => Promise<Response>;

/** Read one raw curl block without consuming the prose or next request after it. */
export function readCurlBlock(source: string): { raw: string; command: string } | undefined {
  if (!/^curl(?:[ \t]|$)/.test(source)) return undefined;
  let quote = '';
  let escaping = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (escaping) { escaping = false; continue; }
    if (quote === "'") { if (char === "'") quote = ''; continue; }
    if (char === '\\') {
      if (source[index + 1] === '\r' && source[index + 2] === '\n') { index += 2; continue; }
      escaping = true; continue;
    }
    if (quote === '"') { if (char === '"') quote = ''; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '\n' && !/^[ \t]*\|/.test(source.slice(index + 1))) {
      return { raw: source.slice(0, index + 1), command: source.slice(0, index).trimEnd() };
    }
  }
  return { raw: source, command: source.trimEnd() };
}

export function formatCurlOutput(result: CurlExecutionResult): string {
  if (result.output !== undefined) return result.output;
  if (result.body === undefined) return result.error || '';
  try { return JSON.stringify(JSON.parse(result.body), null, 2); }
  catch { return result.body; }
}

function tokenize(command: string) {
  const tokens: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | undefined;
  let escaping = false;
  let tokenStarted = false;
  let pipeIndex = -1;

  const finishToken = () => {
    if (tokenStarted) tokens.push(current);
    current = '';
    tokenStarted = false;
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (character === undefined) continue;
    if (escaping) {
      if (character !== '\n') { current += character; tokenStarted = true; }
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
      else if (character === '\\' && ['\\', '"', '$', '`', '\n'].includes(command[index + 1] || '')) escaping = true;
      else current += character;
      continue;
    }
    if (character === "'") {
      quote = 'single';
      tokenStarted = true;
    } else if (character === '"') {
      quote = 'double';
      tokenStarted = true;
    } else if (character === '\\') {
      escaping = true;
    } else if (/\s/.test(character)) {
      finishToken();
    } else if (character === '|') {
      finishToken();
      if (pipeIndex < 0) pipeIndex = tokens.length;
      tokens.push('|');
    } else if (';&<>`'.includes(character) || (character === '$' && command[index + 1] === '(')) {
      throw new Error('仅支持 curl 请求和 jq 字段提取，不支持 Shell 命令');
    } else {
      current += character;
      tokenStarted = true;
    }
  }

  if (quote) throw new Error('cURL 中有未闭合的引号');
  if (escaping) current += '\\';
  finishToken();
  return { tokens, pipeIndex };
}

function readOptionValue(tokens: string[], index: number, option: string) {
  const value = tokens[index + 1];
  if (value === undefined) throw new Error(`${option} 缺少参数`);
  return value;
}

function setHeader(headers: Headers, networkHeaders: Headers, warnings: string[], value: string) {
  const separator = value.indexOf(':');
  if (separator < 1) throw new Error(`无效的请求头：${value}`);
  const name = value.slice(0, separator).trim();
  const headerValue = value.slice(separator + 1).trim();
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
    throw new Error(`无效的请求头名称：${name}`);
  }
  const normalized = name.toLowerCase();
  // DevTools copies these transport headers too. Let the browser recalculate
  // them, especially Content-Length, rather than rejecting the whole command.
  if (managedHeaderNames.has(normalized)) {
    warnings.push(`${name} 由浏览器管理，已忽略命令中的值`);
    return;
  }
  if (networkHeaderNames.has(normalized) || normalized.startsWith('sec-')) {
    networkHeaders.set(name, headerValue);
    return;
  }
  if (forbiddenHeaderNames.has(normalized)) {
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

function parseJq(tokens: string[]): ParsedCurlRequest['jq'] {
  if (tokens[0] !== 'jq') throw new Error('管道仅支持 jq 字段提取，例如 jq -r \'.data\'');
  let raw = false;
  let filter = '';
  for (const token of tokens.slice(1)) {
    if (token === '-r' || token === '--raw-output') raw = true;
    else if (!filter && !token.startsWith('-')) filter = token;
    else throw new Error('jq 支持 .、.data、.data.name、.data[0] 等字段路径，以及 -r');
  }
  if (!/^\.(?:[A-Za-z_$][\w$]*)?(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[\d+\]))*$/.test(filter)) {
    throw new Error('jq 支持 .、.data、.data.name、.data[0] 等字段路径');
  }
  const path = [...filter.matchAll(/([A-Za-z_$][\w$]*)|\[(\d+)\]/g)].map((match) => match[2] === undefined ? match[1]! : Number(match[2]));
  return { path, raw };
}

export function parseCurl(command: string): ParsedCurlRequest {
  const { tokens, pipeIndex } = tokenize(normalizeCurlCommand(command));
  if (tokens[0] !== 'curl') throw new Error('请求需以 curl 开头');
  const jq = pipeIndex < 0 ? undefined : parseJq(tokens.splice(pipeIndex).slice(1));

  let method = '';
  let redirect: RequestRedirect = 'manual';
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let sendDataAsQuery = false;
  let insecure = false;
  const headers = new Headers();
  const networkHeaders = new Headers();
  const warnings: string[] = [];
  const dataParts: string[] = [];
  const urls: string[] = [];

  for (let index = 1; index < tokens.length; index += 1) {
    let token = tokens[index];
    if (token === undefined) continue;
    const equals = token.startsWith('--') ? token.indexOf('=') : -1;
    if (equals > 2) {
      tokens.splice(index, 1, token.slice(0, equals), token.slice(equals + 1));
      token = tokens[index]!;
    }
    const optionWithValue = (option: string, callback: (value: string) => void) => {
      callback(readOptionValue(tokens, index, option));
      index += 1;
    };

    if (token === '-X' || token === '--request') {
      optionWithValue(token, (value) => { method = value.toUpperCase(); });
    } else if (token.startsWith('-X') && token.length > 2) {
      method = token.slice(2).toUpperCase();
    } else if (token === '-H' || token === '--header') {
      optionWithValue(token, (value) => setHeader(headers, networkHeaders, warnings, value));
    } else if (token.startsWith('-H') && token.length > 2) {
      setHeader(headers, networkHeaders, warnings, token.slice(2));
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      optionWithValue(token, (value) => {
        if (value.startsWith('@')) throw new Error('暂不支持从本地文件读取请求体');
        dataParts.push(value);
      });
    } else if (token.startsWith('-d') && token.length > 2) {
      if (token[2] === '@') throw new Error('暂不支持从本地文件读取请求体');
      dataParts.push(token.slice(2));
    } else if (token === '--data-urlencode') {
      optionWithValue(token, (value) => {
        if (value.startsWith('@') || !value.includes('=') && value.includes('@')) throw new Error('暂不支持从本地文件读取请求体');
        const equals = value.indexOf('=');
        dataParts.push(equals < 0 ? encodeURIComponent(value) : `${value.slice(0, equals)}=${encodeURIComponent(value.slice(equals + 1))}`);
      });
    } else if (token === '--json') {
      optionWithValue(token, (value) => {
        dataParts.push(value);
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
        if (!headers.has('Accept')) headers.set('Accept', 'application/json');
      });
    } else if (token === '-u' || token === '--user') {
      optionWithValue(token, (value) => headers.set('Authorization', basicAuthorization(value)));
    } else if (token === '-A' || token === '--user-agent') {
      optionWithValue(token, (value) => networkHeaders.set('User-Agent', value));
    } else if (token === '-e' || token === '--referer') {
      optionWithValue(token, (value) => networkHeaders.set('Referer', value));
    } else if (token === '-b' || token === '--cookie') {
      optionWithValue(token, (value) => {
        if (value && !value.includes('=')) throw new Error('Cookie 请使用 name=value 格式，暂不支持本地 Cookie 文件');
        networkHeaders.set('Cookie', value);
      });
    } else if (token === '--insecure') {
      insecure = true;
    } else if (/^-[sSifvLIGk]+$/.test(token)) {
      if (token.includes('L')) redirect = 'follow';
      if (token.includes('I')) method = 'HEAD';
      if (token.includes('G')) sendDataAsQuery = true;
      if (token.includes('k')) insecure = true;
    } else if (token === '--location') {
      redirect = 'follow';
    } else if (token === '--head') {
      method = 'HEAD';
    } else if (token === '--get') {
      sendDataAsQuery = true;
    } else if (token === '--max-time') {
      optionWithValue(token, (value) => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('--max-time 必须是大于 0 的秒数');
        timeoutMs = Math.min(Math.round(seconds * 1_000), MAX_TIMEOUT_MS);
      });
    } else if (['--silent', '--show-error', '--include', '--compressed', '--fail', '--fail-with-body', '--verbose'].includes(token)) {
      // The card already renders response headers and does not print progress output.
    } else if (token === '--url') {
      optionWithValue(token, (value) => urls.push(value));
    } else if (token.startsWith('-')) {
      throw new Error(`暂不支持 cURL 参数：${token}`);
    } else {
      urls.push(token);
    }
  }

  if (urls.length !== 1) throw new Error(urls.includes('curl') ? '检测到多条 curl，请分别保存为独立的工作流请求' : '请提供且仅提供一个 http 或 https URL');
  const [urlValue] = urls;
  if (!urlValue) throw new Error('请提供一个 http 或 https URL');
  const url = new URL(urlValue);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('仅支持 http 或 https 请求');
  if (insecure && url.protocol === 'https:') throw new Error('浏览器无法通过 --insecure/-k 忽略 HTTPS 证书校验；请使用有效或已信任的证书');

  const data = dataParts.join('&');
  if (sendDataAsQuery && data) {
    url.search += `${url.search ? '&' : ''}${data}`;
  }
  const body = sendDataAsQuery || !dataParts.length ? undefined : data;
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded');
  }
  if (!method) method = body !== undefined ? 'POST' : 'GET';
  if (!/^[A-Z]+$/.test(method)) throw new Error(`无效的请求方法：${method}`);
  if ((method === 'GET' || method === 'HEAD') && body !== undefined) {
    throw new Error(`${method} 请求不能携带请求体；可使用 -G 将数据放入查询参数`);
  }

  return { url: url.toString(), method, headers, networkHeaders, warnings, body, redirect, timeoutMs, jq };
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

export async function executeCurl(command: string, requestFetch: CurlFetch = (request, init) => fetch(request.url, init)): Promise<CurlExecutionResult> {
  const startedAt = performance.now();
  try {
    const request = parseCurl(command);
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await requestFetch(request, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: request.redirect,
        credentials: 'omit',
        signal: controller.signal,
      });
      const { body, bodyTruncated } = await readResponseBody(response);
      let output: string | undefined;
      let error: string | undefined;
      // Error responses need to remain inspectable; jq '.data' could otherwise
      // turn a useful 403 JSON error into an unhelpful "null".
      if (request.jq && response.ok) {
        try {
          if (bodyTruncated) throw new Error('响应超过 100 KB，无法对截断内容提取 jq 字段');
          let value: unknown = JSON.parse(body);
          for (const key of request.jq.path) {
            value = value !== null && typeof value === 'object' && Object.hasOwn(value, key)
              ? (value as Record<string | number, unknown>)[key] : null;
          }
          output = request.jq.raw && typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        } catch (reason) {
          error = reason instanceof SyntaxError ? 'jq 需要 JSON 响应；下方展示原始响应' : reason instanceof Error ? reason.message : 'jq 字段提取失败';
        }
      }
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        finalUrl: response.url,
        headers: [...response.headers.entries()],
        body,
        bodyTruncated,
        output,
        error,
        hint: response.status === 403
          ? '服务器拒绝了请求。下方保留原始响应；请结合响应头检查鉴权、来源校验或网关规则。'
            + (request.networkHeaders.get('origin') ? '命令中显式指定了 Origin，仍按该值发送；若来自浏览器抓包且接口不需要此头，请从命令中移除。' : '')
          : response.type === 'opaqueredirect' ? '服务器返回了重定向，浏览器未开放其响应内容；可在命令中添加 -L 跟随跳转。' : undefined,
        durationMs: Math.round(performance.now() - startedAt),
      };
    } finally {
      globalThis.clearTimeout(timer);
    }
  } catch (reason) {
    const error = reason instanceof Error ? reason.message : '请求执行失败';
    return {
      ok: false,
      error: reason instanceof Error && reason.name === 'AbortError' ? '请求超时' : error,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}
