import { describe, expect, test } from 'bun:test';
import { AutosaveController } from '../lib/autosave';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Markdown autosave sessions', () => {
  test('debounces typing and preserves Markdown indentation and trailing newlines', async () => {
    const writes = [];
    const save = new AutosaveController('', async (value) => { writes.push(value); }, 10);
    save.change('first');
    save.change('    indented code\n\n');
    await Bun.sleep(40);
    expect(writes).toEqual(['    indented code\n\n']);
    expect(save.getSnapshot().status).toBe('saved');
  });

  test('closing immediately flushes the last keystroke exactly once', async () => {
    const writes = [];
    const save = new AutosaveController('', async (value) => { writes.push(value); });
    save.change('最后一次输入');
    expect(await save.flush()).toBe(true);
    expect(await save.flush()).toBe(true);
    expect(writes).toEqual(['最后一次输入']);
  });

  test('serializes slow writes and saves undo back to the original value', async () => {
    const writes = [];
    const firstWrite = deferred();
    const save = new AutosaveController('original', async (value) => {
      writes.push(value);
      if (value === 'older') await firstWrite.promise;
    });
    save.change('older');
    const older = save.flush();
    await Promise.resolve();
    save.change('original');
    const latest = save.flush();
    expect(writes).toEqual(['older']);
    firstWrite.resolve();
    expect(await older).toBe(false);
    expect(await latest).toBe(true);
    expect(writes).toEqual(['older', 'original']);
  });

  test('does not close over new input that arrives during an in-flight save', async () => {
    const pending = deferred();
    const save = new AutosaveController('', async () => pending.promise);
    save.change('first');
    const first = save.flush();
    const close = save.flush();
    save.change('latest');
    pending.resolve();
    expect(await first).toBe(false);
    expect(await close).toBe(false);
    expect(await save.flush()).toBe(true);
  });

  test('keeps failed drafts, allows retry, and isolates different records', async () => {
    let fail = true;
    const writes = [];
    const first = new AutosaveController('a', async (value) => {
      if (fail) throw new Error('磁盘写入失败');
      writes.push(value);
    });
    const second = new AutosaveController('b', async (value) => { writes.push(value); });
    first.change('a edited');
    expect(await first.flush()).toBe(false);
    expect(first.getSnapshot()).toMatchObject({ value: 'a edited', status: 'error', error: '磁盘写入失败' });
    second.change('b edited');
    expect(await second.flush()).toBe(true);
    fail = false;
    expect(await first.flush()).toBe(true);
    expect(writes).toEqual(['b edited', 'a edited']);
  });
});
