import { describe, expect, test } from 'bun:test';
import { MarkdownManager } from '@tiptap/markdown';
import { getSchema } from '@tiptap/core';
import { createMarkdownExtensions, findMarkdownImageInput, hasMarkdownSyntax } from '../lib/markdown';

describe('shared Tiptap Markdown schema', () => {
  const manager = new MarkdownManager({ extensions: createMarkdownExtensions(), markedOptions: { gfm: true } });
  const schema = getSchema(createMarkdownExtensions());

  test.each([
    '# 中文标题\n\n**粗体**、*斜体*、~~删除~~ 和 `代码`\n\n[链接](https://example.com/a?q=1)',
    '- 一级\n  - 二级\n    - 三级\n\n1. 第一\n2. 第二',
    '- [ ] 待办\n- [x] 完成\n  - [ ] 子任务',
    '> 引用内容\n>\n> 第二段\n\n```ts\nconst 中文 = "你好";\n  console.log(中文);\n```',
    '| 标题 | 值 |\n| --- | --- |\n| **粗体** | `代码` |\n| 中文 | [链接](https://example.com) |',
    '# 一级\n\n## 二级\n\n### 三级\n\n#### 四级\n\n##### 五级\n\n###### 六级',
    '标题\n===\n\n二级标题\n---\n\n正文\n\n***\n\n后续正文',
    '单反引号 `const x = 1`，双反引号 ``a`b``，反引号本身 `` ` ``。',
    '    const indented = true;\n    console.log(indented);',
    '~~~~python\nprint("中文")\n~~~~',
    '````markdown\n```js\nconst x = 1;\n```\n````',
    '> 第一层引用\n>\n> > 第二层引用\n> >\n> > - 引用中的列表',
    '| 左 | 居中 | 右 |\n| :--- | :---: | ---: |\n| `a \\| b` | **内容** | 值 |',
    '![图片说明](https://example.com/image.png "图片标题")',
    '图前 ![行内图片](https://example.com/inline.png) 图后',
    '- 列表内的图片\n\n  ![截图](https://example.com/screenshot.png)',
    '引用式 [链接][ref] 与 <https://example.com>\n\n[ref]: https://example.com/reference "标题"',
    '前半段  \n强制换行\n\n转义 \\*星号\\* 和 \\`反引号\\`',
    '```curl\ncurl -sS -X POST https://example.com/api | jq -r \'.data\'\n```',
    '````curl\ncurl https://example.com --data \'```literal```\'\n````',
  ])('preserves supported content through parse → serialize → parse: %s', (source) => {
    const document = manager.parse(source);
    expect(() => schema.nodeFromJSON(document).check()).not.toThrow();
    expect(manager.parse(manager.serialize(document))).toEqual(document);
  });

  test('parses inline code as literal text, including Markdown symbols and internal backticks', () => {
    const parsed = manager.parse('`**原样**` 和 ``a`b``');
    expect(parsed.content[0].content).toEqual([
      { type: 'text', text: '**原样**', marks: [{ type: 'code' }] },
      { type: 'text', text: ' 和 ' },
      { type: 'text', text: 'a`b', marks: [{ type: 'code' }] },
    ]);
  });

  test('converts raw curl blocks to portable request cards without consuming surrounding Markdown', () => {
    const command = "curl -sS -X POST \\\n  'https://example.com/api' \\\n  | jq -r '.data'";
    const parsed = manager.parse('# 请求示例\n\n' + command + '\n\n后续正文');
    expect(parsed.content.map((node) => node.type)).toEqual(['heading', 'curlRequest', 'paragraph']);
    expect(parsed.content[1].attrs.command).toBe(command);
    expect(manager.serialize(parsed)).toContain('```curl\n' + command + '\n```');
    expect(manager.parse(manager.serialize(parsed))).toEqual(parsed);
    expect(() => schema.nodeFromJSON(parsed).check()).not.toThrow();
    expect(hasMarkdownSyntax(command, manager)).toBe(true);
  });

  test('preserves curl examples inside ordinary code blocks and inline code', () => {
    expect(manager.parse('```bash\ncurl https://example.com\n```').content[0].type).toBe('codeBlock');
    expect(manager.parse('`curl https://example.com`').content[0].content[0].marks).toEqual([{ type: 'code' }]);
  });

  test.each([
    '![123]([https://example.com/image.png](https://example.com/image.png))',
    '![123]\\([https://example.com/image.png](https://example.com/image.png))',
    '![123]([查看原图](https://example.com/image.png))',
    '![123]\\([https://example.com/image.png](https://example.com/image.png "标题"))',
  ])('recognizes image destinations wrapped in a Markdown link: %s', (source) => {
    const document = manager.parse(source);
    const image = document.content[0].content[0];
    expect(image.type).toBe('image');
    expect(image.attrs.src).toBe('https://example.com/image.png');
    expect(image.attrs.alt).toBe('123');
    expect(() => schema.nodeFromJSON(document).check()).not.toThrow();
    expect(manager.parse(manager.serialize(document))).toEqual(document);
  });

  test('keeps image examples in code and escaped literal images unchanged', () => {
    const source = '![123]\\([https://example.com/image.png](https://example.com/image.png))';
    expect(manager.parse('`' + source + '`').content[0].content).toEqual([
      { type: 'text', text: source, marks: [{ type: 'code' }] },
    ]);
    expect(manager.parse('```md\n' + source + '\n```').content[0].content[0].text).toBe(source);
    expect(manager.parse('    ' + source).content[0].content[0].text).toBe(source);
    expect(manager.parse('\\![123]\\(literal)').content[0].content[0].text).toBe('![123](literal)');
    expect(manager.parse('![123]\\(https://example.com/image.png)').content[0].content.some((node) => node.type === 'image')).toBe(false);
  });

  test('waits for complete image destinations during typing and supports inline images without a space', () => {
    expect(findMarkdownImageInput('![截图](https://example.com/image_(1)', manager)).toBeNull();
    expect(findMarkdownImageInput('![截图]([https://example.com/a.png](https://example.com/a.png)', manager)).toBeNull();
    expect(findMarkdownImageInput('![截图](https://example.com/image_(1).png)', manager).data.src).toBe('https://example.com/image_(1).png');
    expect(findMarkdownImageInput('中文![](https://example.com/a.png)', manager)).toMatchObject({
      index: 2, data: { src: 'https://example.com/a.png', alt: '' },
    });
    expect(findMarkdownImageInput('![截图](https://example.com/a.png "标题(1")', manager).data.title).toBe('标题(1');
    expect(findMarkdownImageInput('`![截图](https://example.com/a.png)`', manager)).toBeNull();
  });

  test.each([
    '# 标题\n\n正文', '**粗体**', '`代码`', '- [ ] 待办',
    '[链接](https://example.com)', '![图片](https://example.com/image.png)',
    '![123]\\([https://example.com/image.png](https://example.com/image.png))',
    '| A | B |\n| --- | --- |\n| 1 | 2 |',
  ])('detects Markdown in clipboard text even when HTML is also present: %s', (source) => {
    expect(hasMarkdownSyntax(source, manager)).toBe(true);
  });

  test.each(['普通文本', '1 + 2 = 3', '价格 * 数量', '\\*原样星号\\*', '<p>普通 HTML</p>'])(
    'preserves the HTML clipboard fallback when text has no Markdown syntax: %s', (source) => {
      expect(hasMarkdownSyntax(source, manager)).toBe(false);
    },
  );
});
