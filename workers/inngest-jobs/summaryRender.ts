/**
 * summaryRender (v0.7) — renders simplified shapes.
 *
 * Schema changes from v0.6:
 *   moment   — no headline, no body.context. Quote and attribution only.
 *   question — no headline. Body.question is the visual anchor.
 *   stat     — no headline. The number is the visual anchor.
 *   letter   — 1 to 2 paragraphs (was 2 to 3), each carrying its own sources (not rendered).
 *
 * Sources arrays on each card are functional metadata for validation and traceability; we do
 * not render them in the visual output (they belong in inspection mode, not user mode).
 */

import type {
  Card,
  AdaptiveSummaryContent,
  HeroBody,
  MomentBody,
  PeopleBody,
  PatternBody,
  QuestionBody,
  StatBody,
  TimelineBody,
  LetterBody,
} from './summaryTypes';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MOOD_COLOR: Record<string, string> = {
  positive: '#7BA589',
  negative: '#D89B6A',
  mixed: '#A8C4AC',
  neutral: '#BFD8C0',
  silence: '#EFEAE0',
};

function eyebrowLine(text: string): string {
  if (!text) return '';
  return `<div class="eyebrow">${esc(text)}</div>`;
}

// ── Hero ────────────────────────────────────────────────────────────────────

function renderHero(card: Card): string {
  const b = card.body as HeroBody;
  const moodCells = b.mood_arc
    .map((m) => {
      const color = MOOD_COLOR[(m.valence as string) ?? 'silence'] || MOOD_COLOR.silence;
      return `<div class="mood-cell" style="background:${color};" title="${esc(m.day_of_week)}"></div>`;
    })
    .join('');
  const labels = b.mood_arc.map((m) => `<div>${esc(m.day_label)}</div>`).join('');
  const stats = b.stat_strip
    .map(
      (s, i) =>
        `<div class="stat${i ? ' stat-bordered' : ''}"><div class="stat-value">${esc(s.value)}</div><div class="stat-label">${esc(s.label)}</div></div>`,
    )
    .join('');
  const cols = Math.max(1, Math.min(7, b.mood_arc.length));
  return `
    <div class="hero-classification">${esc(b.classification_chip)}</div>
    <h1 class="hero-headline">${esc(card.headline ?? '')}</h1>
    <p class="hero-subtitle">${esc(b.subtitle)}</p>
    <div class="hero-panel">
      <div class="stat-strip">${stats}</div>
      <div class="mood-arc" style="grid-template-columns:repeat(${cols},1fr);">${moodCells}</div>
      <div class="mood-labels" style="grid-template-columns:repeat(${cols},1fr);">${labels}</div>
    </div>`;
}

// ── Moment (no headline, no context) ───────────────────────────────────────

function renderMoment(card: Card): string {
  const b = card.body as MomentBody;
  return `
    ${eyebrowLine(card.eyebrow)}
    <blockquote class="moment-quote">${esc(b.quote)}</blockquote>
    <div class="moment-attr">${esc(b.attribution)}</div>`;
}

// ── People ─────────────────────────────────────────────────────────────────

function renderPeople(card: Card): string {
  const b = card.body as PeopleBody;
  const chips = b.people
    .map(
      (p) =>
        `<span class="people-chip${p.emphasized ? ' people-chip-emphasized' : ''}" title="${esc(p.relationship ?? '')}">${esc(p.name)}</span>`,
    )
    .join('');
  let beatsHtml = '';
  if (b.beats && b.beats.length > 0) {
    const items = b.beats
      .map(
        (e) =>
          `<li><span class="beat-date">${esc(e.date)}<br><span style="font-size:8px;color:var(--grey-faint);">${esc(e.day_of_week)}</span></span><span class="beat-label">${esc(e.label)}</span></li>`,
      )
      .join('');
    beatsHtml = `<ul class="people-beats">${items}</ul>`;
  }
  return `
    ${eyebrowLine(card.eyebrow)}
    <h2 class="card-headline">${esc(b.headline)}</h2>
    <div class="people-chips">${chips}</div>
    ${beatsHtml}`;
}

// ── Pattern ────────────────────────────────────────────────────────────────

function renderPattern(card: Card): string {
  const b = card.body as PatternBody;
  const items = b.items
    .map(
      (it) => `
      <li>
        <span class="pattern-label">${esc(it.label)}</span>
        ${it.meta ? `<span class="pattern-meta">${esc(it.meta)}</span>` : ''}
      </li>`,
    )
    .join('');
  const footer = b.footer ? `<p class="pattern-footer">${esc(b.footer)}</p>` : '';
  return `
    ${eyebrowLine(card.eyebrow)}
    <h2 class="card-headline">${esc(b.headline)}</h2>
    <ul class="pattern-list">${items}</ul>
    ${footer}`;
}

// ── Question (no headline; question is the anchor) ─────────────────────────

function renderQuestion(card: Card): string {
  const b = card.body as QuestionBody;
  return `
    ${eyebrowLine(card.eyebrow)}
    <h2 class="question-headline">${esc(b.question)}</h2>
    <p class="question-grounding">${esc(b.grounding)}</p>`;
}

// ── Stat (no headline; number is the anchor) ───────────────────────────────

function renderStat(card: Card): string {
  const b = card.body as StatBody;
  return `
    ${eyebrowLine(card.eyebrow)}
    <div class="stat-block">
      <div class="stat-big-number">${esc(b.number)}</div>
      <div class="stat-big-unit">${esc(b.unit)}</div>
    </div>
    <p class="stat-context">${esc(b.context)}</p>`;
}

// ── Timeline ───────────────────────────────────────────────────────────────

function renderTimeline(card: Card): string {
  const b = card.body as TimelineBody;
  const items = b.events
    .map(
      (e) => `
      <li>
        <span class="tl-date">${esc(e.date)}<br><span style="font-size:8px;color:var(--grey-faint);">${esc(e.day_of_week)}</span></span>
        <span class="tl-label">${esc(e.label)}</span>
      </li>`,
    )
    .join('');
  const footer = b.footer ? `<p class="tl-footer">${esc(b.footer)}</p>` : '';
  return `
    ${eyebrowLine(card.eyebrow)}
    <h2 class="card-headline">${esc(b.headline)}</h2>
    <ol class="timeline">${items}</ol>
    ${footer}`;
}

// ── Letter (shorter) ───────────────────────────────────────────────────────

function renderLetter(card: Card): string {
  const b = card.body as LetterBody;
  const paras = b.paragraphs.map((p) => `<p class="letter-para">${esc(p.text)}</p>`).join('');
  const sig = b.signature;
  return `
    <div class="letter-eyebrow"><span>✉</span><span>${esc(card.eyebrow || 'A note for Monday-you')}</span></div>
    ${paras}
    <div class="letter-sig">
      <div class="letter-sig-avatar"></div>
      <span><strong>${esc(sig?.name ?? 'Your Gremly')}</strong> · L${esc(sig?.level ?? 1)} · ${esc(sig?.state ?? '')}</span>
    </div>`;
}

// ── Dispatch ───────────────────────────────────────────────────────────────

function renderCard(card: Card, index: number, total: number): string {
  let inner: string;
  switch (card.shape) {
    case 'hero':
      inner = renderHero(card);
      break;
    case 'moment':
      inner = renderMoment(card);
      break;
    case 'people':
      inner = renderPeople(card);
      break;
    case 'pattern':
      inner = renderPattern(card);
      break;
    case 'question':
      inner = renderQuestion(card);
      break;
    case 'stat':
      inner = renderStat(card);
      break;
    case 'timeline':
      inner = renderTimeline(card);
      break;
    case 'letter':
      inner = renderLetter(card);
      break;
    default:
      inner = `<p>Unsupported shape: ${esc((card as unknown as { shape: string }).shape)}</p>`;
  }
  const extraStyle = card.shape === 'letter' ? ' style="background:#EAF1E8;"' : '';
  return `<div class="gph">
    <div class="gnv"><span>${index === 0 ? '&nbsp;' : '‹'}</span><span>${index + 1} of ${total} · ${esc(card.shape)}</span><span>✕</span></div>
    <div class="gc"${extraStyle}>${inner}</div>
  </div>`;
}

export function renderInspectionDeck(label: string, content: AdaptiveSummaryContent): string {
  const cardsHtml = content.cards.map((c, i) => renderCard(c, i, content.cards.length)).join('\n');
  return `
<div class="inspect">
  <h2>${esc(label)} · ${esc(content.cards.length)} cards <span style="font-weight:400;color:var(--grey-soft);">(${esc(content.generated_for_week)}, ${esc(content.metadata.fill_model)}, ${esc(content.metadata.fill_attempts)} attempt(s))</span></h2>
  <div class="meta">classification: ${esc(content.classification)}</div>
  <div class="meta">through_line: ${esc(content.through_line)}</div>
  <div class="meta">card_shapes: ${esc(content.metadata.card_shapes.join(' → '))}</div>
  <div class="meta">tenure: ${esc(content.metadata.user_tenure_days)}d · first_weekly: ${esc(content.metadata.is_first_weekly)} · fed in window: ${esc(content.metadata.fed_days_in_window)}/7</div>
  ${content.metadata.fill_errors.length > 0 ? `<div class="meta" style="color:#b00;">errors: ${esc(content.metadata.fill_errors.join(' | '))}</div>` : ''}
  <div class="deck-rail">${cardsHtml}</div>
</div>`;
}

export function renderInspectionDocument(sections: string[]): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gremly · Adaptive Weekly Summary v0.7 · Shadow Inspection</title>
<style>
  :root{
    --moss:#2E5540; --moss-deep:#1F3A2D; --sage-mist:#BFD8C0; --sage-deep:#7BA589;
    --periwinkle:#9CA6E0; --periwinkle-bg:#F4F3FA;
    --golden-pear:#E0C47A; --golden-deep:#C68B40;
    --linen:#F9F6F1; --cream:#FBF8F2;
    --ink:#1F3A2D; --ink-soft:#3A4A3D;
    --grey-soft:#6B7C6E; --grey-faint:#8A9B8D;
    --amber-bg:#FAEEDA; --amber-ink:#5A3A0F;
    --serif:Georgia,'Times New Roman',serif;
    --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  }
  *{box-sizing:border-box;}
  body{margin:0;background:#E8E4DC;font-family:var(--sans);color:var(--ink);padding:0 0 60px;}
  .inspect{max-width:760px;margin:0 auto;padding:28px 20px;}
  .inspect h2{font-family:var(--serif);font-weight:500;color:var(--moss);}
  .meta{font-family:'SF Mono',monospace;font-size:11px;color:var(--grey-soft);margin-bottom:4px;}
  .deck-rail{display:flex;flex-direction:column;gap:32px;align-items:center;margin-top:24px;}
  .gph{width:100%;max-width:380px;background:#fff;border-radius:18px;box-shadow:0 4px 16px rgba(0,0,0,0.06);overflow:hidden;}
  .gnv{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--linen);font-size:10px;color:var(--grey-soft);font-family:'SF Mono',monospace;border-bottom:1px solid #EFEAE0;}
  .gc{padding:24px 22px;background:#fff;}
  .eyebrow{font-family:'SF Mono',monospace;font-size:10px;color:var(--grey-soft);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px;}
  .card-headline{font-family:var(--serif);font-size:19px;line-height:1.3;color:var(--ink);font-weight:500;margin:0 0 14px 0;}
  .hero-classification{display:inline-block;font-family:'SF Mono',monospace;font-size:10px;color:var(--moss);background:var(--sage-mist);padding:4px 10px;border-radius:11px;letter-spacing:0.5px;margin-bottom:14px;}
  .hero-headline{font-family:var(--serif);font-size:24px;line-height:1.25;color:var(--moss);font-weight:500;margin:0 0 10px 0;}
  .hero-subtitle{font-size:13px;line-height:1.5;color:var(--grey-soft);margin:0 0 18px 0;}
  .hero-panel{background:var(--linen);border-radius:14px;padding:14px;}
  .stat-strip{display:flex;justify-content:space-around;padding-bottom:12px;border-bottom:1px solid #EFEAE0;margin-bottom:12px;}
  .stat{text-align:center;flex:1;}
  .stat-bordered{border-left:1px solid #EFEAE0;}
  .stat-value{font-size:16px;font-weight:500;color:var(--ink);}
  .stat-label{font-size:9px;color:var(--grey-faint);font-family:'SF Mono',monospace;text-transform:uppercase;letter-spacing:0.4px;margin-top:2px;}
  .mood-arc{display:grid;gap:4px;margin-bottom:5px;}
  .mood-cell{height:32px;border-radius:3px;}
  .mood-labels{display:grid;gap:4px;font-size:9px;color:var(--grey-faint);text-align:center;font-family:'SF Mono',monospace;}
  .moment-quote{font-family:var(--serif);font-size:22px;line-height:1.35;color:var(--moss);font-style:italic;margin:8px 0 14px 0;border-left:3px solid var(--periwinkle);padding:6px 0 6px 16px;}
  .moment-attr{font-family:'SF Mono',monospace;font-size:10px;color:var(--grey-soft);text-transform:uppercase;letter-spacing:0.5px;}
  .people-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 16px 0;}
  .people-chip{display:inline-block;font-size:12px;color:var(--moss);background:var(--linen);padding:6px 14px;border-radius:14px;font-weight:500;}
  .people-chip-emphasized{background:var(--sage-mist);color:var(--moss-deep);font-weight:600;}
  .people-beats{list-style:none;padding:0;margin:14px 0 0 0;}
  .people-beats li{display:flex;align-items:baseline;gap:10px;padding:6px 0;border-bottom:1px solid #F0ECE2;}
  .people-beats li:last-child{border-bottom:none;}
  .beat-date{font-family:'SF Mono',monospace;font-size:10px;color:var(--grey-faint);min-width:60px;line-height:1.2;}
  .beat-label{font-size:12px;color:var(--ink);}
  .pattern-list{list-style:none;padding:0;margin:10px 0 14px 0;}
  .pattern-list li{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:8px 0;border-bottom:1px solid #F0ECE2;}
  .pattern-list li:last-child{border-bottom:none;}
  .pattern-label{font-size:13px;color:var(--ink);}
  .pattern-meta{font-family:'SF Mono',monospace;font-size:10px;color:var(--grey-faint);white-space:nowrap;}
  .pattern-footer{font-size:11px;color:var(--grey-soft);font-style:italic;margin:8px 0 0 0;line-height:1.5;}
  .question-headline{font-family:var(--serif);font-size:22px;line-height:1.3;color:var(--moss);font-weight:500;margin:14px 0 18px 0;}
  .question-grounding{font-size:13px;line-height:1.55;color:var(--ink-soft);margin:0;}
  .stat-block{text-align:center;padding:22px 0 12px 0;}
  .stat-big-number{font-family:var(--serif);font-size:72px;line-height:1;color:var(--moss);font-weight:500;}
  .stat-big-unit{font-family:'SF Mono',monospace;font-size:11px;color:var(--grey-soft);text-transform:uppercase;letter-spacing:0.6px;margin-top:8px;}
  .stat-context{font-size:12px;color:var(--ink-soft);margin:14px 0 0 0;line-height:1.5;text-align:center;max-width:280px;margin-left:auto;margin-right:auto;}
  .timeline{list-style:none;padding:0;margin:14px 0 14px 0;}
  .timeline li{display:flex;align-items:baseline;gap:12px;padding:10px 0;border-bottom:1px solid #F0ECE2;position:relative;padding-left:18px;}
  .timeline li:before{content:'●';position:absolute;left:0;top:11px;font-size:9px;color:var(--sage-deep);}
  .timeline li:last-child{border-bottom:none;}
  .tl-date{font-family:'SF Mono',monospace;font-size:10px;color:var(--grey-faint);min-width:76px;line-height:1.2;}
  .tl-label{font-size:13px;color:var(--ink);line-height:1.45;}
  .tl-footer{font-size:11px;color:var(--grey-soft);font-style:italic;margin:8px 0 0 18px;line-height:1.5;}
  .letter-eyebrow{display:flex;align-items:center;gap:8px;margin-bottom:16px;font-family:'SF Mono',monospace;font-size:10px;color:var(--moss);text-transform:uppercase;letter-spacing:0.6px;}
  .letter-para{font-size:13px;line-height:1.65;color:var(--ink);margin:0 0 12px 0;}
  .letter-sig{display:flex;align-items:center;gap:10px;padding-top:14px;border-top:1px solid #C8D8C8;font-size:10px;color:var(--grey-soft);}
  .letter-sig-avatar{width:28px;height:28px;background:var(--sage-mist);border-radius:50%;}
  .letter-sig strong{color:var(--moss);}
</style>
</head><body>${sections.join('\n<hr style="border:none;border-top:1px solid #d4cfc4;margin:50px 0;">\n')}</body></html>`;
}
