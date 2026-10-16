import { Extension, nodeInputRule } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { Markdown, type MarkdownManager } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import Paragraph from '@tiptap/extension-paragraph';
import { CurlRequest } from './curl-request';

const lowlight = createLowlight(common);

export const CODE_LANGUAGES = [
  ['plaintext', '纯文本'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'],
  ['json', 'JSON'], ['html', 'HTML'], ['css', 'CSS'], ['bash', 'Shell'], ['python', 'Python'],
  ['go', 'Go'], ['java', 'Java'], ['c', 'C'], ['cpp', 'C++'], ['sql', 'SQL'],
  ['yaml', 'YAML'], ['markdown', 'Markdown'], ['diff', 'Diff'],
] as const;

const MarkdownCodeBlock = CodeBlockLowlight.extend({
  renderMarkdown(node, helpers) {
    const content = helpers.renderChildren(node.content || []);
    let fenceLength = 3;
    for (const match of content.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1);
    const fence = '`'.repeat(fenceLength);
    return `${fence}${node.attrs?.language || ''}\n${content}\n${fence}`;
  },
});

// Keep standalone images inside paragraphs as required by the inline image schema.
const MarkdownParagraph = Paragraph.extend({
  parseMarkdown(token, helpers) {
    return helpers.createNode('paragraph', undefined, helpers.parseInline(token.tokens || []));
  },
});

// Marked tolerates an unfinished URL such as "a_(1". While typing, wait for
// the matching destination parenthesis instead of creating an image too early.
function hasClosedImageDestination(source: string): boolean {
  let index = 2;
  let brackets = 1;
  for (; index < source.length && brackets; index++) {
    if (source[index] === '\\') index++;
    else if (source[index] === '[') brackets++;
    else if (source[index] === ']') brackets--;
  }
  if (source[index] === '\\') index++; // clipboard's escaped opening parenthesis
  if (source[index] !== '(') return false;
  let parentheses = 1;
  let quote = '';
  let angle = false;
  for (index++; index < source.length; index++) {
    const char = source[index];
    if (char === '\\') { index++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (angle) { if (char === '>') angle = false; continue; }
    if ((char === '"' || char === "'") && /\s/.test(source[index - 1] || '')) { quote = char; continue; }
    if (char === '<') { angle = true; continue; }
    if (char === '(') parentheses++;
    if (char === ')' && --parentheses === 0) return index === source.length - 1;
  }
  return false;
}

export function findMarkdownImageInput(text: string, manager: MarkdownManager) {
  if (!text.endsWith(')')) return null;
  const marked = manager.instance;
  const image = marked.Lexer.lexInline(text, marked.defaults).at(-1);
  if (image?.type !== 'image' || !image.href || image.href.startsWith('[') || !hasClosedImageDestination(image.raw)) return null;
  return {
    index: text.length - image.raw.length, text: image.raw,
    data: { src: image.href, alt: image.text, title: image.title },
  };
}

const MarkdownImage = Image.extend({
  // Some clipboard producers turn the destination into another Markdown link,
  // e.g. ![alt]\([https://example.com/a.png](https://example.com/a.png)).
  // An inline tokenizer repairs only that form, leaving code and escapes intact.
  markdownTokenizer: {
    name: 'linkedImageDestination',
    level: 'inline',
    start: '![',
    tokenize(source, _tokens, helpers) {
      const prefix = /^!\[((?:\\.|[^\]\\\n])*)\]\\?\(\[/u.exec(source);
      if (!prefix) return undefined;
      const destination = source.slice(prefix[0].length - 1);
      const [link] = helpers.inlineTokens(destination);
      if (link?.type !== 'link' || !link.raw || !/^https?:\/\//i.test(link.href || '') || destination[link.raw.length] !== ')') return undefined;
      return {
        type: 'image', raw: source.slice(0, prefix[0].length - 1 + link.raw.length + 1),
        href: link.href, title: link.title, text: (prefix[1] || '').replace(/\\([\\[\]])/g, '$1'),
      };
    },
  },
  addInputRules() {
    return [nodeInputRule({
      type: this.type,
      find: (text) => this.editor.markdown ? findMarkdownImageInput(text, this.editor.markdown) : null,
      getAttributes: (match) => match.data || {},
    })];
  },
});

/** Prefer Markdown text over a clipboard's HTML fallback only when it has syntax. */
export function hasMarkdownSyntax(source: string, manager: MarkdownManager): boolean {
  const syntax = new Set(['heading', 'hr', 'list', 'taskList', 'blockquote', 'code', 'table', 'image', 'strong', 'em', 'del', 'codespan', 'br', 'link']);
  const containsSyntax = (tokens: ReturnType<MarkdownManager['instance']['lexer']>[number][]): boolean => tokens.some((token) =>
    syntax.has(token.type) || ('tokens' in token && Array.isArray(token.tokens) && containsSyntax(token.tokens)),
  );
  return containsSyntax(manager.instance.lexer(source));
}

/** Shared schema: custom nodes must provide Markdown parsing AND serialization. */
export function createMarkdownExtensions(maxLength = Infinity, placeholder = '写下一条想法、结论或待办…') {
  return [
    StarterKit.configure({
      underline: false,
      codeBlock: false,
      paragraph: false,
      link: { openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
    }),
    MarkdownParagraph,
    CurlRequest,
    MarkdownCodeBlock.configure({ lowlight, defaultLanguage: 'plaintext' }),
    MarkdownImage.configure({ inline: true, allowBase64: true, HTMLAttributes: { loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' } }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
    Markdown.configure({ markedOptions: { gfm: true } }),
    Extension.create({
      name: 'markdownLengthLimit',
      addProseMirrorPlugins() {
        if (!Number.isFinite(maxLength)) return [];
        const editor = this.editor;
        return [new Plugin({
          filterTransaction(transaction, state) {
            if (!transaction.docChanged || transaction.getMeta('markdownSource')) return true;
            const nextLength = editor.markdown?.serialize(transaction.doc.toJSON()).length ?? 0;
            const previousLength = editor.markdown?.serialize(state.doc.toJSON()).length ?? 0;
            return nextLength <= maxLength || nextLength <= previousLength;
          },
        })];
      },
    }),
  ];
}
