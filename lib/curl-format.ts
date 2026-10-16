const indentationEntity = /&#(?:x0*20|0*32);|&nbsp;/gi;

function decodeIndentation(source: string): string {
  return source.replace(/(^|\n)(?:[ \t]|&#(?:x0*20|0*32);|&nbsp;)+/gi, (prefix) => prefix.replace(indentationEntity, ' '));
}

function normalizeQuotedValue(value: string, markdownEscaped: boolean, option?: string): string {
  // A copied Markdown URL may escape its colon even inside shell quotes.
  if ((!option || ['--url', '-e', '--referer'].includes(option)) && /^https?\\:\/\//i.test(value)) return value.replace(/^(https?)\\:/i, '$1:');
  if (!markdownEscaped || !option || !['-d', '--data', '--data-raw', '--data-binary', '--json'].includes(option) || !/^\s*[\[{]/.test(value)) return value;
  // Repair line-break escapes only when the result is valid JSON. Valid JSON,
  // backslashes in string values, and non-JSON request bodies remain literal.
  try { JSON.parse(value); return value; } catch { /* try the Markdown form */ }
  const candidate = decodeIndentation(value).replace(/\\+[ \t]*\n/g, '\n');
  try { JSON.parse(candidate); return candidate; } catch { return value; }
}

/** Undo Markdown clipboard formatting without interpreting shell expressions. */
export function normalizeCurlCommand(input: string): string {
  let source = input.replace(/\r\n/g, '\n').trim();
  const fenced = /^(`{3,}|~{3,})(?:curl|bash|sh|shell)?[ \t]*\n([\s\S]*?)\n\1[ \t]*$/i.exec(source);
  if (fenced) source = fenced[2] || '';
  const markdownEscaped = /(?:^|\n)[ \t]*(?:&#(?:x0*20|0*32);|&nbsp;)|https?\\:\/\/|(?:^|\s)\\(?:--[a-z]|\|[ \t]+jq\b)/im.test(source);
  if (!markdownEscaped) return source;

  const outside = (text: string) => decodeIndentation(text)
    .replace(/\\{2,}[ \t]*(?=\n)/g, '\\')
    .replace(/(^|[ \t])\\(?=--[a-z])/gi, '$1')
    .replace(/(^|[ \t])\\\|(?=[ \t]+jq\b)/g, '$1|');

  let result = '';
  let start = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\\') { index++; continue; }
    const quote = source[index];
    if (quote !== "'" && quote !== '"') continue;
    const before = outside(source.slice(start, index));
    const option = /(?:^|\s)(--[\w-]+|-[a-z])(?:\s*=\s*|\s*)$/i.exec(before.replace(/\\\n/g, ' '))?.[1];
    result += before + quote;
    const valueStart = ++index;
    for (; index < source.length; index++) {
      if (quote === '"' && source[index] === '\\') { index++; continue; }
      if (source[index] === quote) break;
    }
    result += normalizeQuotedValue(source.slice(valueStart, index), markdownEscaped, option);
    if (index < source.length) result += quote;
    start = index + 1;
  }
  result += outside(source.slice(start));
  return result.trim();
}
