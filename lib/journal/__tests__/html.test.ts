/**
 * The journal's rich text (lib/journal/html): what the editor writes, turned
 * into the plain words the rest of the app reads, and back.
 */
import { countWords, hasWords, htmlToText, joinHtml, textToHtml } from '../html';

describe('the plain words of rich text', () => {
  it('gives a line per paragraph and drops the bold and italics', () => {
    expect(
      htmlToText('<html><p>Tired but <b>pleased</b>.</p><p>A <i>good</i> day.</p></html>'),
    ).toBe('Tired but pleased.\nA good day.');
  });

  it('keeps an empty line between paragraphs, but never two', () => {
    expect(htmlToText('<html><p>One</p><br><br><p>Two</p><br></html>')).toBe('One\n\nTwo');
  });

  it('ends a line at a break inside a paragraph', () => {
    expect(htmlToText('<html><p>One<br>Two</p></html>')).toBe('One\nTwo');
  });

  it('marks bullets and numbers', () => {
    expect(
      htmlToText(
        '<html><p>Today</p><ul><li>Deck done</li><li>Called mum</li></ul><ol><li>Run</li><li>Read</li></ol></html>',
      ),
    ).toBe('Today\n• Deck done\n• Called mum\n1. Run\n2. Read');
  });

  it('starts numbers again in each list', () => {
    expect(htmlToText('<html><ol><li>A</li></ol><p>and</p><ol><li>B</li></ol></html>')).toBe(
      '1. A\nand\n1. B',
    );
  });

  it('keeps the mark on a list item whose words sit in a paragraph', () => {
    expect(htmlToText('<ul><li><p>Deck done</p></li></ul>')).toBe('• Deck done');
  });

  it('leaves the marks off when asked', () => {
    expect(htmlToText('<html><ul><li>Deck done</li></ul></html>', { markers: false })).toBe(
      'Deck done',
    );
  });

  it('reads the characters the editor escapes', () => {
    expect(
      htmlToText('<html><p>Sam &amp; I, 3 &lt; 4, it&#39;s &quot;fine&quot;&nbsp;now</p></html>'),
    ).toBe('Sam & I, 3 < 4, it\'s "fine" now');
  });

  it('keeps the words of a link and of tags it does not know', () => {
    expect(
      htmlToText('<html><p>See <a href="https://x.test">the page</a> <u>now</u></p></html>'),
    ).toBe('See the page now');
  });

  it('is empty for nothing, and for text with no words in it', () => {
    expect(htmlToText(null)).toBe('');
    expect(htmlToText('')).toBe('');
    expect(htmlToText('<html><br><p> </p></html>')).toBe('');
  });

  it('takes plain words as they are', () => {
    expect(htmlToText('Just words')).toBe('Just words');
  });
});

describe('plain words as rich text', () => {
  it('makes a paragraph per line and a break for an empty line', () => {
    expect(textToHtml('One\n\nTwo')).toBe('<html><p>One</p><br><p>Two</p></html>');
  });

  it('escapes what would read as a tag', () => {
    expect(textToHtml('3 < 4 & 5 > 2')).toBe('<html><p>3 &lt; 4 &amp; 5 &gt; 2</p></html>');
  });

  it('comes back as the same words', () => {
    const words = 'Tired but pleased.\n\n3 < 4 & "fine"\nLast line';
    expect(htmlToText(textToHtml(words))).toBe(words);
  });

  it('is empty for nothing', () => {
    expect(textToHtml('')).toBe('');
    expect(textToHtml('  \n ')).toBe('');
    expect(textToHtml(undefined)).toBe('');
  });
});

describe('whether anything is written', () => {
  it('needs more than an empty paragraph or an empty list item', () => {
    expect(hasWords('<html><p></p></html>')).toBe(false);
    expect(hasWords('<html><ul><li></li></ul></html>')).toBe(false);
    expect(hasWords('<html><br></html>')).toBe(false);
    expect(hasWords('')).toBe(false);
  });

  it('counts anything typed, words or not', () => {
    expect(hasWords('<html><p>ok</p></html>')).toBe(true);
    expect(hasWords('<html><p>🙂</p></html>')).toBe(true);
  });

  it('counts words without the list marks', () => {
    expect(countWords('<html><p>Tired but pleased</p><ol><li>Deck done</li></ol></html>')).toBe(5);
    expect(countWords('')).toBe(0);
  });
});

describe('two pieces as one', () => {
  it('puts the second under the first', () => {
    const joined = joinHtml('<html><p>One</p></html>', '<html><ul><li>Two</li></ul></html>');
    expect(joined).toBe('<html><p>One</p><ul><li>Two</li></ul></html>');
    expect(htmlToText(joined)).toBe('One\n• Two');
  });

  it('is just the written one when the other is empty', () => {
    expect(joinHtml('', '<html><p>Two</p></html>')).toBe('<html><p>Two</p></html>');
    expect(joinHtml('<html><p>One</p></html>', '<html><br></html>')).toBe(
      '<html><p>One</p></html>',
    );
    expect(joinHtml('', '')).toBe('');
  });
});
