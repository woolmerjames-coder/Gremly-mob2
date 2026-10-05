/**
 * The journal page as it is written (lib/journal/page): cards that keep their
 * words whatever page is chosen, the plain words an entry is saved with, and
 * an entry opened again.
 */
import { htmlToText } from '../html';
import {
  LAYOUT_KEY,
  addPrompt,
  addWords,
  applyPage,
  card,
  isEmpty,
  isNewSet,
  newPage,
  pageOfEntry,
  pageText,
  pageWordCount,
  promptsOf,
  readLayout,
  removePrompt,
  setCardHtml,
  setCardPrompt,
  toLayout,
  type JournalPage,
} from '../page';
import { BUILT_IN_PAGES, FREEFORM, allPages, pageById, type JournalPageDef } from '../pages';

const p = (words: string) => `<html><p>${words}</p></html>`;
const def = (id: string) => pageById(id);
/** Each card as "prompt | words", free writing as "(free)" */
const shape = (page: JournalPage) =>
  page.cards.map((c) => `${c.q === null ? '(free)' : c.q} | ${htmlToText(c.html)}`);
const write = (page: JournalPage, q: string | null, words: string): JournalPage => {
  const target = page.cards.find((c) => c.q === q && !htmlToText(c.html));
  if (!target) throw new Error(`no empty card for ${q}`);
  return setCardHtml(page, target.id, p(words));
};

describe('the pages', () => {
  it('start with Freeform, and Proud and grateful asks about gratitude', () => {
    expect(BUILT_IN_PAGES[0].id).toBe(FREEFORM);
    expect(def('proud').prompts).toEqual([
      'What am I proud of today?',
      'What am I grateful for?',
      'What did I notice?',
      'What would have made today better?',
    ]);
  });

  it('give every page its own id and at most four prompts', () => {
    const ids = BUILT_IN_PAGES.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of BUILT_IN_PAGES) expect(x.prompts.length).toBeLessThanOrEqual(4);
  });

  it('put the person’s own pages after the built in ones', () => {
    const own: JournalPageDef[] = [
      { id: 'own-1', name: 'Mine', about: '', prompts: ['Who made me laugh?'], icon: 'own' },
    ];
    const all = allPages(own);
    expect(all[all.length - 1]).toMatchObject({ id: 'own-1', own: true, icon: 'own' });
    expect(pageById('own-1', own).name).toBe('Mine');
  });

  it('fall back to Freeform for a page that is gone', () => {
    expect(pageById('deleted-page').id).toBe(FREEFORM);
    expect(pageById(null).id).toBe(FREEFORM);
  });
});

describe('a new page', () => {
  it('is one free card on Freeform', () => {
    expect(shape(newPage(def(FREEFORM)))).toEqual(['(free) | ']);
  });

  it('is a card per prompt, then free writing', () => {
    expect(shape(newPage(def('rose')))).toEqual([
      'Rose: the best part of today | ',
      'Thorn: the hard part | ',
      'Bud: something with promise | ',
      '(free) | ',
    ]);
  });

  it('counts as empty until something is written', () => {
    const page = newPage(def('proud'));
    expect(isEmpty(page)).toBe(true);
    expect(isEmpty(write(page, 'What did I notice?', 'The light'))).toBe(false);
  });
});

describe('choosing another page', () => {
  it('keeps freeform words on top and adds the prompts under them', () => {
    const page = applyPage(write(newPage(def(FREEFORM)), null, 'Tired but pleased.'), def('proud'));
    expect(page.tpl).toBe('proud');
    expect(shape(page)).toEqual([
      '(free) | Tired but pleased.',
      'What am I proud of today? | ',
      'What am I grateful for? | ',
      'What did I notice? | ',
      'What would have made today better? | ',
      '(free) | ',
    ]);
  });

  it('keeps an answered prompt and drops the ones left empty', () => {
    const answered = write(
      newPage(def('proud')),
      'What am I grateful for?',
      'Priya covering my call.',
    );
    expect(shape(applyPage(answered, def('rose')))).toEqual([
      'What am I grateful for? | Priya covering my call.',
      'Rose: the best part of today | ',
      'Thorn: the hard part | ',
      'Bud: something with promise | ',
      '(free) | ',
    ]);
  });

  it('puts a page’s prompts back in its own order when it is chosen again', () => {
    const answered = write(newPage(def('proud')), 'What did I notice?', 'The light at six.');
    const back = applyPage(applyPage(answered, def('rose')), def('proud'));
    expect(shape(back)).toEqual([
      'What am I proud of today? | ',
      'What am I grateful for? | ',
      'What did I notice? | The light at six.',
      'What would have made today better? | ',
      '(free) | ',
    ]);
  });

  it('leaves free writing under the prompts where it was', () => {
    let page = write(newPage(def('proud')), 'What am I proud of today?', 'The deck.');
    page = write(page, null, 'One more thought.');
    expect(shape(applyPage(page, def('clear')))).toEqual([
      'What am I proud of today? | The deck.',
      'What is still on my mind? | ',
      'What can wait? | ',
      'What comes first tomorrow? | ',
      '(free) | One more thought.',
    ]);
  });

  it('gathers free writing into one card when Freeform is chosen', () => {
    let page = applyPage(write(newPage(def(FREEFORM)), null, 'On top.'), def('rose'));
    page = write(page, null, 'At the end.');
    const free = applyPage(page, def(FREEFORM));
    expect(shape(free)).toEqual(['(free) | On top.\nAt the end.']);
  });

  it('never loses a word, whatever is chosen', () => {
    let page = write(newPage(def(FREEFORM)), null, 'alpha');
    page = write(applyPage(page, def('proud')), 'What did I notice?', 'beta');
    page = write(page, null, 'gamma');
    for (const id of ['rose', FREEFORM, 'review', 'proud', 'clear', 'three-good']) {
      page = applyPage(page, def(id));
      const all = pageText(page);
      expect(all).toContain('alpha');
      expect(all).toContain('beta');
      expect(all).toContain('gamma');
      expect(page.cards[page.cards.length - 1].q).toBeNull();
    }
  });

  it('gives a card whose words were joined a new id, so the editor shows them', () => {
    let page = applyPage(write(newPage(def(FREEFORM)), null, 'On top.'), def('rose'));
    page = write(page, null, 'At the end.');
    const before = page.cards.map((c) => c.id);
    const free = applyPage(page, def(FREEFORM));
    expect(before).not.toContain(free.cards[0].id);
  });

  it('leaves the page it was given alone', () => {
    const page = write(newPage(def('rose')), 'Thorn: the hard part', 'The budget review.');
    const copy = JSON.parse(JSON.stringify(page));
    applyPage(page, def('proud'));
    removePrompt(page, page.cards[0].id);
    addPrompt(page);
    expect(page).toEqual(copy);
  });
});

describe('prompts of your own', () => {
  it('go above the empty free writing at the end, ready to be named', () => {
    const { page, id } = addPrompt(newPage(def('rose')));
    expect(shape(page).slice(-2)).toEqual([' | ', '(free) | ']);
    const added = page.cards.find((c) => c.id === id);
    expect(added).toMatchObject({ q: '', custom: true });
  });

  it('go after free writing that has words, with a new free card under them', () => {
    const { page } = addPrompt(write(newPage(def(FREEFORM)), null, 'Tired.'));
    expect(shape(page)).toEqual(['(free) | Tired.', ' | ', '(free) | ']);
  });

  it('can be named and answered', () => {
    const added = addPrompt(newPage(def(FREEFORM)));
    let page = setCardPrompt(added.page, added.id, 'Who made me laugh?');
    page = setCardHtml(page, added.id, p('Sam, twice.'));
    expect(shape(page)).toEqual(['Who made me laugh? | Sam, twice.', '(free) | ']);
    expect(promptsOf(page)).toEqual(['Who made me laugh?']);
  });

  it('stop being marked as typed by hand once a page has them', () => {
    const added = addPrompt(newPage(def(FREEFORM)));
    let page = setCardPrompt(added.page, added.id, 'Thorn: the hard part');
    page = setCardHtml(page, added.id, p('The budget review.'));
    const rose = applyPage(page, def('rose'));
    expect(rose.cards.find((c) => c.q === 'Thorn: the hard part')?.custom).toBeUndefined();
  });
});

describe('taking a prompt off', () => {
  it('removes an empty one', () => {
    const page = newPage(def('rose'));
    expect(shape(removePrompt(page, page.cards[1].id))).toEqual([
      'Rose: the best part of today | ',
      'Bud: something with promise | ',
      '(free) | ',
    ]);
  });

  it('keeps what was written under it, as free writing', () => {
    const page = write(newPage(def('rose')), 'Bud: something with promise', 'The spring trip.');
    const bud = page.cards.find((c) => c.q === 'Bud: something with promise');
    expect(shape(removePrompt(page, bud!.id))).toEqual([
      'Rose: the best part of today | ',
      'Thorn: the hard part | ',
      '(free) | The spring trip.',
    ]);
  });

  it('always leaves free writing at the end', () => {
    let page = newPage(def('rose'));
    for (const c of page.cards.filter((x) => x.q !== null)) page = removePrompt(page, c.id);
    expect(shape(page)).toEqual(['(free) | ']);
  });
});

describe('words from the chat box', () => {
  it('join the free writing at the end', () => {
    const page = write(newPage(def('rose')), null, 'First thought.');
    expect(shape(addWords(page, 'One more.')).slice(-1)).toEqual([
      '(free) | First thought.\nOne more.',
    ]);
  });

  it('fill the empty free card', () => {
    expect(shape(addWords(newPage(def(FREEFORM)), 'A good day.'))).toEqual([
      '(free) | A good day.',
    ]);
  });

  it('change nothing when there are none', () => {
    const page = newPage(def('rose'));
    expect(addWords(page, '   ')).toBe(page);
  });
});

describe('the plain words an entry is saved with', () => {
  it('put each prompt on its own line with its answer under it', () => {
    let page = write(newPage(def('proud')), 'What am I proud of today?', 'Finishing the deck.');
    page = write(page, 'What am I grateful for?', 'The run with Sam.');
    page = write(page, null, 'Tired.');
    expect(pageText(page)).toBe(
      'What am I proud of today?\nFinishing the deck.\n\nWhat am I grateful for?\nThe run with Sam.\n\nTired.',
    );
  });

  it('leave out prompts with no answer', () => {
    const page = write(newPage(def('rose')), 'Thorn: the hard part', 'The budget review.');
    expect(pageText(page)).toBe('Thorn: the hard part\nThe budget review.');
  });

  it('carry lists as marked lines', () => {
    const page = newPage(def(FREEFORM));
    const listed = setCardHtml(
      page,
      page.cards[0].id,
      '<html><p>Today</p><ul><li>Deck</li><li>Mum</li></ul></html>',
    );
    expect(pageText(listed)).toBe('Today\n• Deck\n• Mum');
  });

  it('count the words written, not the prompts', () => {
    const page = write(newPage(def('rose')), 'Thorn: the hard part', 'The budget review.');
    expect(pageWordCount(page)).toBe(3);
  });
});

describe('a set of prompts worth keeping', () => {
  it('is one that no page already has', () => {
    const added = addPrompt(newPage(def('rose')));
    const page = setCardPrompt(added.page, added.id, 'Who made me laugh?');
    expect(isNewSet(page, BUILT_IN_PAGES)).toBe(true);
  });

  it('is not a built in page as it stands, nor a page with no prompts', () => {
    expect(isNewSet(newPage(def('rose')), BUILT_IN_PAGES)).toBe(false);
    expect(isNewSet(newPage(def(FREEFORM)), BUILT_IN_PAGES)).toBe(false);
  });
});

describe('the layout kept on an entry', () => {
  const saved = () => {
    let page = write(newPage(def('proud')), 'What am I proud of today?', 'Finishing the deck.');
    page = write(page, null, 'Tired.');
    return page;
  };

  it('holds the written cards, the page and the plain words', () => {
    expect(toLayout(saved())).toEqual({
      v: 1,
      tpl: 'proud',
      cards: [
        { q: 'What am I proud of today?', html: p('Finishing the deck.') },
        { q: null, html: p('Tired.') },
      ],
      text: 'What am I proud of today?\nFinishing the deck.\n\nTired.',
    });
  });

  it('treats an answer under a prompt with no name as free writing', () => {
    const added = addPrompt(newPage(def(FREEFORM)));
    const page = setCardHtml(added.page, added.id, p('No question yet.'));
    expect(toLayout(page).cards).toEqual([{ q: null, html: p('No question yet.') }]);
  });

  it('is read back only when it is whole', () => {
    const layout = toLayout(saved());
    expect(readLayout({ [LAYOUT_KEY]: layout })).toEqual(layout);
    expect(readLayout({})).toBeNull();
    expect(readLayout(null)).toBeNull();
    expect(readLayout({ [LAYOUT_KEY]: { ...layout, v: 2 } })).toBeNull();
    expect(readLayout({ [LAYOUT_KEY]: { ...layout, cards: [{ q: 3, html: '' }] } })).toBeNull();
    expect(readLayout({ [LAYOUT_KEY]: { ...layout, cards: 'no' } })).toBeNull();
  });
});

describe('an entry opened again', () => {
  const pages = allPages();
  const layout = () => {
    let page = write(newPage(def('proud')), 'What am I proud of today?', 'Finishing the deck.');
    page = write(page, null, 'Tired.');
    return toLayout(page);
  };

  it('comes back as its cards when it was written on the page', () => {
    const l = layout();
    const page = pageOfEntry({ body: l.text, views: { [LAYOUT_KEY]: l } }, pages);
    expect(page.tpl).toBe('proud');
    expect(shape(page)).toEqual([
      'What am I proud of today? | Finishing the deck.',
      '(free) | Tired.',
    ]);
  });

  it('gets free writing at the end when it is opened to write on', () => {
    const l = toLayout(write(newPage(def('rose')), 'Thorn: the hard part', 'The budget review.'));
    const entry = { body: l.text, views: { [LAYOUT_KEY]: l } };
    expect(shape(pageOfEntry(entry, pages))).toEqual(['Thorn: the hard part | The budget review.']);
    expect(shape(pageOfEntry(entry, pages, { toWrite: true }))).toEqual([
      'Thorn: the hard part | The budget review.',
      '(free) | ',
    ]);
  });

  it('opens as free writing when it was written before the page', () => {
    const page = pageOfEntry(
      { body: 'A good day.\n\nCalm and focused.', views: { sweep_reflection: true } },
      pages,
    );
    expect(page.tpl).toBe(FREEFORM);
    expect(shape(page)).toEqual(['(free) | A good day.\n\nCalm and focused.']);
  });

  it('opens as free writing, with the newer words, when it was changed elsewhere', () => {
    const l = layout();
    const page = pageOfEntry(
      { body: 'Rewritten in another screen.', views: { [LAYOUT_KEY]: l } },
      pages,
    );
    expect(shape(page)).toEqual(['(free) | Rewritten in another screen.']);
  });

  it('marks a prompt no page has as the person’s own', () => {
    const added = addPrompt(newPage(def(FREEFORM)));
    let page = setCardPrompt(added.page, added.id, 'Who made me laugh?');
    page = setCardHtml(page, added.id, p('Sam.'));
    const l = toLayout(page);
    const back = pageOfEntry({ body: l.text, views: { [LAYOUT_KEY]: l } }, pages);
    expect(back.cards[0]).toMatchObject({ q: 'Who made me laugh?', custom: true });
  });

  it('falls back to Freeform when its page has since been deleted, keeping the cards', () => {
    const l = { ...layout(), tpl: 'own-gone' };
    const page = pageOfEntry({ body: l.text, views: { [LAYOUT_KEY]: l } }, pages);
    expect(page.tpl).toBe(FREEFORM);
    expect(page.cards).toHaveLength(2);
  });

  it('is one empty free card for an entry with no words, such as moods alone', () => {
    expect(shape(pageOfEntry({ body: null, views: {} }, pages))).toEqual(['(free) | ']);
  });

  it('makes cards afresh each time', () => {
    const made = card(null, p('x'));
    expect(card(null, p('x')).id).not.toBe(made.id);
  });
});
