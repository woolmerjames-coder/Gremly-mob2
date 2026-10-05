/**
 * The journal's rich text, in the form the editor reads and writes: a small
 * set of tags for paragraphs, line breaks, bold, italics and bulleted or
 * numbered lists.
 *
 * Every other part of the app, and Gremly, reads a journal entry as plain
 * words. These turn the rich text into those words, and turn the plain words
 * of an older entry back into rich text for the page.
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return NAMED[code.toLowerCase()] ?? whole;
    const n = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    try {
      return String.fromCodePoint(n);
    } catch {
      return whole;
    }
  });
}

function encode(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Tags that start and end a line of their own. */
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'codeblock', 'div']);

type ListState = { numbered: boolean; n: number };

/**
 * The words of a piece of rich text, one line per paragraph or list item.
 * List items keep a bullet or their number, unless `markers` is false.
 */
export function htmlToText(
  html: string | null | undefined,
  opts: { markers?: boolean } = {},
): string {
  const source = String(html ?? '');
  if (!source) return '';
  const markers = opts.markers !== false;
  const lines: string[] = [];
  const lists: ListState[] = [];
  let line = '';
  let prefix = '';
  /** Whether anything has been written to the line since it was started */
  let open = false;

  const flush = (always = false) => {
    const words = line.replace(/\s+/g, ' ').trim();
    if (words || always) {
      lines.push(words ? prefix + words : '');
      // a list item's mark goes on its first line only
      prefix = '';
    }
    line = '';
    open = false;
  };

  const tag = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi;
  let at = 0;
  let m: RegExpExecArray | null;
  const write = (text: string) => {
    if (!text) return;
    line += decode(text.replace(/[\r\n]+/g, ' '));
    open = true;
  };
  while ((m = tag.exec(source))) {
    write(source.slice(at, m.index));
    at = tag.lastIndex;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    if (name === 'br') {
      // a break inside a line ends it; one standing alone is an empty line
      flush(!open);
    } else if (name === 'ul' || name === 'ol') {
      flush();
      if (closing) lists.pop();
      else lists.push({ numbered: name === 'ol', n: 0 });
    } else if (name === 'li') {
      flush();
      prefix = '';
      if (!closing) {
        const list = lists[lists.length - 1];
        if (list) list.n += 1;
        if (markers) prefix = list?.numbered ? `${list.n}. ` : '• ';
      }
    } else if (BLOCKS.has(name)) {
      flush();
    }
  }
  write(source.slice(at));
  flush();

  // no more than one empty line in a row, and none at either end
  const out: string[] = [];
  for (const l of lines) {
    if (!l && (!out.length || !out[out.length - 1])) continue;
    out.push(l);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join('\n');
}

/** Plain words as rich text: a paragraph per line, an empty line kept as a break. */
export function textToHtml(text: string | null | undefined): string {
  const words = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!words) return '';
  const body = words
    .split('\n')
    .map((l) => (l.trim() ? `<p>${encode(l.trim())}</p>` : '<br>'))
    .join('');
  return `<html>${body}</html>`;
}

/** Whether there is anything written, beyond empty lines and list marks. */
export function hasWords(html: string | null | undefined): boolean {
  return htmlToText(html, { markers: false }).trim().length > 0;
}

export function countWords(html: string | null | undefined): number {
  const words = htmlToText(html, { markers: false }).trim();
  return words ? words.split(/\s+/).length : 0;
}

/** Two pieces of rich text as one, the second under the first. */
export function joinHtml(a: string, b: string): string {
  const inner = (h: string) =>
    h
      .replace(/^\s*<html>/i, '')
      .replace(/<\/html>\s*$/i, '')
      .trim();
  const parts = [a, b].filter(hasWords).map(inner);
  return parts.length ? `<html>${parts.join('')}</html>` : '';
}
