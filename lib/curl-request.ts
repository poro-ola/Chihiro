import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CurlRequestCard } from '../components/CurlRequestCard';
import { parseCurl, readCurlBlock } from './curl';

export const CurlRequest = Node.create({
  name: 'curlRequest',
  priority: 110,
  group: 'block',
  atom: true,
  isolating: true,
  addAttributes() { return { command: { default: '' } }; },
  parseHTML() {
    return [{ tag: 'div[data-type="curl-request"]', getAttrs: (element) => ({ command: element.getAttribute('data-command') || '' }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'curl-request', 'data-command': node.attrs.command }), ['pre', node.attrs.command]];
  },
  renderText({ node }) { return String(node.attrs.command || ''); },
  markdownTokenName: 'code',
  parseMarkdown(token, helpers) {
    if (token.lang !== 'curl') return [];
    return helpers.createNode(this.name, { command: token.text || '' });
  },
  renderMarkdown(node) {
    const command = String(node.attrs?.command || '');
    let length = 3;
    for (const match of command.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
    const fence = '`'.repeat(length);
    return `${fence}curl\n${command}\n${fence}`;
  },
  markdownTokenizer: {
    name: 'curlRequest',
    level: 'block',
    // Only start at a block boundary; interrupting a paragraph could split an
    // inline code span such as `curl https://example.com` into a request card.
    start: () => -1,
    tokenize(source) {
      const block = readCurlBlock(source);
      return block ? { type: 'code', lang: 'curl', raw: block.raw, text: block.command } : undefined;
    },
  },
  addNodeView() { return ReactNodeViewRenderer(CurlRequestCard); },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph' || $from.parentOffset !== $from.parent.content.size) return false;
        const command = $from.parent.textBetween(0, $from.parent.content.size, '\n', '\n');
        if (!/^curl\s/.test(command)) return false;
        if (/\\\s*$/.test(command)) return this.editor.commands.setHardBreak();
        try { parseCurl(command); } catch { return false; }
        return this.editor.commands.insertContentAt({ from: $from.before(), to: $from.after() }, { type: this.name, attrs: { command } });
      },
    };
  },
});
