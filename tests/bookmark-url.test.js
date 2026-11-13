import { afterEach, describe, expect, test } from 'bun:test';
import { bookmarkTitle, normalizeUrl, prepareUrl } from '../lib/db';
import { openBookmark, openBookmarks } from '../lib/browser-tabs';

const fileUrl = 'file:///Users/poro/Desktop/PartyStar%E4%B8%9A%E5%8A%A1%E6%97%B6%E5%BA%8F%E5%9B%BE-20261112/04-%E4%BB%A3%E5%85%85%E9%A1%B9%E7%9B%AE%E6%80%BB%E8%A7%88/%E5%8D%81%E9%A1%B9%E7%9B%AE%E4%BB%A3%E5%85%85%E4%BB%A3%E7%90%86%E6%9E%B6%E6%9E%84-%E5%88%86%E7%BB%84%E5%9B%BE.html';

describe('local file bookmarks', () => {
  test('accepts the supplied file address and derives its Chinese filename', () => {
    expect(prepareUrl(`  ${fileUrl}  `)).toBe(fileUrl);
    expect(bookmarkTitle(fileUrl)).toBe('十项目代充代理架构-分组图.html');
    expect(prepareUrl('file:///Users/poro/中文 文件.html')).toBe('file:///Users/poro/%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.html');
  });

  test('preserves local file query parameters, case and fragments when deduplicating', () => {
    const url = `${fileUrl}?utm_source=local&gclid=123#SectionA`;
    expect(normalizeUrl(url)).toBe(url);
    expect(normalizeUrl('file:///Users/poro/中文.html')).toBe(normalizeUrl('file:///Users/poro/%E4%B8%AD%E6%96%87.html'));
    expect(normalizeUrl('file:///Users/poro/A.html')).not.toBe(normalizeUrl('file:///Users/poro/a.html'));
  });

  test('handles roots and malformed percent escapes without losing the title', () => {
    expect(bookmarkTitle('file:///')).toBe('本地文件');
    expect(bookmarkTitle('file:///tmp/100%.html')).toBe('100%.html');
  });

  test('preserves web address behavior and rejects executable schemes', () => {
    expect(prepareUrl('example.com')).toBe('https://example.com/');
    expect(bookmarkTitle('https://example.com/docs')).toBe('example.com');
    expect(normalizeUrl('https://EXAMPLE.com:443/docs?utm_source=test&id=1')).toBe('https://example.com/docs?id=1');
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'ftp://example.com']) {
      expect(() => prepareUrl(url)).toThrow('仅支持');
    }
  });

  const originalBrowser = globalThis.browser;
  afterEach(() => {
    if (originalBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = originalBrowser;
  });

  test('opens file bookmarks individually and with a collection through the tabs API', async () => {
    const opened = [];
    globalThis.browser = { tabs: { query() {}, async create(options) { opened.push(options); } } };
    await openBookmark(fileUrl);
    expect(await openBookmarks([fileUrl, fileUrl, 'https://example.com/'])).toBe(2);
    expect(opened).toEqual([
      { url: fileUrl },
      { url: fileUrl, active: false },
      { url: 'https://example.com/', active: false },
    ]);
  });
});
