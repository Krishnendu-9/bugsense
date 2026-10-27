/*
 * Renders the Markdown a post-mortem is written in: headings, paragraphs,
 * lists (task lists included), quotes, rules, fenced code, and inline bold,
 * italics, code and links.
 *
 * Everything becomes React elements, never HTML, so text from the model or a
 * bug report cannot inject markup: whatever this does not recognise is shown
 * as the text it is. Links open only for http(s) URLs.
 */

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)\s]+\))/;

function Inline({ text }) {
  return String(text).split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith('`')) {
      return <code key={i} className="font-mono text-[0.85em] px-1 py-0.5 rounded bg-track text-fg">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') || part.startsWith('__')) return <strong key={i} className="font-semibold text-fg">{part.slice(2, -2)}</strong>;
    if (part.startsWith('[')) {
      const [, label, href] = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/) || [];
      if (label && /^https?:\/\//i.test(href)) {
        return <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{label}</a>;
      }
      return part;
    }
    return <em key={i}>{part.slice(1, -1)}</em>;
  });
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const TASK = /^\[([ xX])\]\s+/;

// Groups the lines into blocks, then renders each block.
function parseBlocks(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const fence = line.match(/^\s*(`{3,})/);
    if (fence) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) { code.push(lines[i]); i += 1; }
      blocks.push({ type: 'code', text: code.join('\n') });
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); i += 1; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: 'rule' }); i += 1; continue; }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
      blocks.push({ type: 'quote', text: quote.join(' ') });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) { items.push(lines[i].replace(LIST_ITEM, '')); i += 1; }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*>|\s*`{3})/.test(lines[i]) && !LIST_ITEM.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }
  return blocks;
}

const HEADING_CLASSES = {
  1: 'text-lg font-bold text-fg mt-2',
  2: 'text-base font-semibold text-fg mt-5 pb-1 border-b border-hairline',
  3: 'text-sm font-semibold text-fg mt-4',
};

export default function MarkdownView({ markdown }) {
  return (
    <div className="space-y-3 text-sm text-muted leading-relaxed break-words">
      {parseBlocks(markdown).map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const Tag = `h${Math.min(block.level + 1, 6)}`; // the dialog title is the page's h2
            return <Tag key={i} className={HEADING_CLASSES[block.level] || HEADING_CLASSES[3]}><Inline text={block.text} /></Tag>;
          }
          case 'rule':
            return <hr key={i} className="border-hairline" />;
          case 'code':
            return <pre key={i} className="p-3 rounded-lg bg-track border border-hairline font-mono text-xs text-fg overflow-x-auto whitespace-pre">{block.text}</pre>;
          case 'quote':
            return <blockquote key={i} className="border-l-2 border-border pl-3 italic"><Inline text={block.text} /></blockquote>;
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List key={i} className={`space-y-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
                {block.items.map((item, j) => {
                  const task = item.match(TASK);
                  if (!task) return <li key={j}><Inline text={item} /></li>;
                  return (
                    <li key={j} className="list-none -ml-5 flex items-start gap-2">
                      <input type="checkbox" checked={task[1].toLowerCase() === 'x'} readOnly disabled className="mt-1" aria-label={item.replace(TASK, '')} />
                      <span><Inline text={item.replace(TASK, '')} /></span>
                    </li>
                  );
                })}
              </List>
            );
          }
          default:
            return <p key={i}><Inline text={block.text} /></p>;
        }
      })}
    </div>
  );
}
