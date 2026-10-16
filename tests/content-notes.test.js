import { describe, expect, test } from 'bun:test';
import { pageHost, selectPageNotes } from '../lib/content-notes';

function bookmark(id, url, note = '备注') {
  return { id, url, note, normalizedUrl: url, title: id, type: 'bookmark', collectionId: 'collection',
    order: 0, createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' };
}

describe('page notes host association', () => {
  test('ignores protocol, path, query and fragment, preserving each bookmark source', () => {
    const records = selectPageNotes([
      bookmark('a', 'http://example.com/docs?a=1#top'),
      bookmark('b', 'https://example.com/other'),
    ], 'https://EXAMPLE.com/current?q=2');
    expect(records.map((record) => record.id)).toEqual(['a', 'b']);
    expect(records[0]).toMatchObject({ title: 'a', url: 'http://example.com/docs?a=1#top' });
  });

  test('distinguishes subdomains, www and non-default ports', () => {
    const items = [bookmark('a', 'https://example.com'), bookmark('b', 'https://www.example.com'),
      bookmark('c', 'https://example.com:8080'), bookmark('d', 'https://sub.example.com')];
    expect(selectPageNotes(items, 'https://example.com/a').map((record) => record.id)).toEqual(['a']);
    expect(selectPageNotes(items, 'https://example.com:8080/a').map((record) => record.id)).toEqual(['c']);
  });

  test('hides an empty or whitespace-only note and keeps Markdown untouched', () => {
    const items = [bookmark('empty', 'https://example.com', ''), bookmark('spaces', 'https://example.com', ' \n '),
      bookmark('code', 'https://example.com', '    code\n')];
    expect(selectPageNotes(items, 'https://example.com')).toEqual([
      { id: 'code', title: 'code', url: 'https://example.com', note: '    code\n' },
    ]);
    expect(selectPageNotes(items.slice(0, 2), 'https://example.com')).toEqual([]);
  });

  test('rejects invalid URLs and unsupported pages', () => {
    expect(pageHost('not a URL')).toBeUndefined();
    expect(pageHost('chrome://newtab')).toBeUndefined();
    expect(selectPageNotes([bookmark('bad', 'invalid')], 'invalid')).toEqual([]);
  });
});
