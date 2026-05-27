/**
 * summaryRender — stage 5, the SHADOW INSPECTION SURFACE.
 *
 * Pure schema -> HTML. This is NOT the product renderer (that is the native dispatcher rebuilt at
 * Phase 4 cutover). Its only job is to let a human eyeball whether detectors fired correctly and
 * whether FILL prose obeys the schema, tone and no-fabrication rules. It renders all six templates
 * faithfully using the canonical mockup's design tokens so the eyeballing is meaningful.
 */

import type {
  SummaryCard,
  AdaptiveSummaryContent,
  HeroSpineBody,
  ThenNowSplitBody,
  RankListBody,
  ConstellationBody,
  BigNumberBody,
  LetterBody,
  Valence,
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

const ARROW: Record<string, string> = { up: '↗', down: '↘', flat: '→' };

function eyebrow(card: SummaryCard): string {
  if (!card.eyebrow_text) return '';
  return `<div class="lab" style="margin-bottom:8px;">${esc(card.eyebrow_text)} <span style="opacity:.5">· ${esc(card.eyebrow_icon)}</span></div>`;
}
function heroLine(card: SummaryCard): string {
  if (!card.hero_sentence) return '';
  const cont = card.hero_continuation
    ? ` <span style="font-style:italic;color:var(--golden-deep)">${esc(card.hero_continuation)}</span>`
    : '';
  return `<div class="h2" style="margin-bottom:12px;">${esc(card.hero_sentence)}${cont}</div>`;
}
function insightBlock(card: SummaryCard): string {
  if (!card.insight) return '';
  return `<div class="ins" style="margin-bottom:12px;">${esc(card.insight)}</div>`;
}
function recBlock(card: SummaryCard): string {
  if (!card.recommendation) return '';
  const glyph: Record<string, string> = {
    try: '○ Worth trying',
    hold: '○ Worth holding',
    mark: '→ Worth noticing',
    protect: '◇ Worth protecting',
  };
  return `<div class="rec"><div style="font-size:10px;color:var(--moss);font-weight:500;margin-bottom:4px;">${glyph[card.recommendation.kind] || ''}</div><div style="font-size:11px;color:var(--ink);">${esc(card.recommendation.text)}</div></div>`;
}
function foot(card: SummaryCard): string {
  return `<div class="foot">${esc(card.data_lineage_footer)}</div>`;
}

function renderHeroSpine(b: HeroSpineBody, card: SummaryCard): string {
  const stats = b.stats
    .map(
      (s, i) =>
        `<div style="text-align:center;${i ? 'border-left:1px solid #EFEAE0;padding-left:14px;' : ''}"><div style="font-size:16px;font-weight:500;">${esc(s.value)}</div><div style="font-size:9px;color:var(--grey-faint);">${esc(s.label)}</div></div>`,
    )
    .join('');
  const cells = b.mood_arc
    .map((m) => {
      const color = MOOD_COLOR[m.valence ?? 'silence'] || MOOD_COLOR.silence;
      return `<div style="height:32px;background:${color};border-radius:3px;"></div>`;
    })
    .join('');
  const labels = b.mood_arc.map((m) => `<div>${esc(m.day_label)}</div>`).join('');
  const chips = b.world_chips
    .map((w) => {
      const bg =
        w.direction === 'up'
          ? '#EAF1E8'
          : w.direction === 'down'
            ? 'var(--amber-bg)'
            : 'var(--linen)';
      const col = w.direction === 'down' ? '#854F0B' : 'var(--moss)';
      return `<span style="background:${bg};color:${col};font-size:10px;padding:3px 9px;border-radius:9px;">${esc(w.name)} ${ARROW[w.direction]}</span>`;
    })
    .join('');
  return `
    <div style="text-align:center;">
      <div style="width:72px;height:72px;background:var(--sage-mist);border-radius:50%;margin:6px auto 12px;"></div>
      <div class="lab" style="margin-bottom:6px;">${esc(b.vibe_label)}</div>
      <div class="h1" style="margin-bottom:10px;">${esc(card.hero_sentence)}</div>
      <div style="font-size:12px;color:var(--grey-soft);max-width:260px;margin:0 auto 12px;">${esc(b.subtitle)}</div>
      <div style="font-size:11px;color:var(--grey-faint);margin-bottom:14px;">${esc(b.week_range)}</div>
    </div>
    <div style="background:var(--linen);border-radius:12px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-around;padding-bottom:10px;border-bottom:1px solid #EFEAE0;margin-bottom:10px;">${stats}</div>
      <div class="lab" style="margin-bottom:6px;">Mood arc</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">${cells}</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;font-size:9px;color:var(--grey-faint);text-align:center;margin-top:4px;">${labels}</div>
    </div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;">${chips}</div>`;
}

function renderThenNowSplit(b: ThenNowSplitBody, card: SummaryCard): string {
  const side = (s: ThenNowSplitBody['left'] | ThenNowSplitBody['right']) => {
    const bg = s.tone === 'positive' ? '#EAF1E8' : 'var(--amber-bg)';
    const bar = s.tone === 'positive' ? '#7BA589' : 'var(--golden-deep)';
    const ink = s.tone === 'positive' ? 'var(--ink)' : 'var(--amber-ink)';
    return `<div style="background:${bg};border-left:3px solid ${bar};padding:10px 12px;border-radius:0 8px 8px 0;margin-bottom:8px;">
      <div class="lab" style="margin-bottom:4px;">${esc(s.label)}</div>
      <div style="font-size:18px;font-weight:600;color:${ink};">${esc(s.value)}</div>
      <div style="font-size:10px;color:var(--grey-soft);margin-top:3px;">${esc(s.sub)}</div></div>`;
  };
  return `${eyebrow(card)}${heroLine(card)}${side(b.left)}${side(b.right)}${insightBlock(card)}${recBlock(card)}${foot(card)}`;
}

function renderRankList(b: RankListBody, card: SummaryCard): string {
  const tiers = b.tiers
    .map((t) => {
      const items = t.items
        .map(
          (i) =>
            `<div style="display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid #F0ECE2;"><span style="font-size:12px;color:var(--ink);">${esc(i.primary)}</span><span style="font-size:10px;color:var(--grey-soft);white-space:nowrap;">${esc(i.secondary)}</span></div>`,
        )
        .join('');
      return `<div style="margin-bottom:10px;"><div class="lab" style="margin-bottom:4px;">${esc(t.tier_label)}</div>${items}</div>`;
    })
    .join('');
  return `${eyebrow(card)}${heroLine(card)}<div style="background:var(--linen);border-radius:10px;padding:12px;margin-bottom:12px;">${tiers}</div>${insightBlock(card)}${recBlock(card)}${foot(card)}`;
}

function renderConstellation(b: ConstellationBody, card: SummaryCard): string {
  const nodes = b.nodes
    .map(
      (n) =>
        `<div style="background:#EAF1E8;border-radius:10px;padding:10px 12px;text-align:center;"><div style="font-size:12px;font-weight:500;color:var(--moss);">${esc(n.label)}</div><div style="font-size:9px;color:var(--grey-soft);margin-top:3px;">${esc(n.sublabel)}</div></div>`,
    )
    .join('');
  return `${eyebrow(card)}${heroLine(card)}<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">${nodes}</div>${insightBlock(card)}${recBlock(card)}${foot(card)}`;
}

function renderBigNumber(b: BigNumberBody, card: SummaryCard): string {
  return `${eyebrow(card)}${heroLine(card)}
    <div style="text-align:center;padding:18px 0 10px;">
      <div style="font-family:var(--serif);font-size:64px;line-height:1;color:var(--moss);">${esc(b.number)}</div>
      <div class="lab" style="margin-top:6px;">${esc(b.unit)}</div>
      <div style="font-size:11px;color:var(--grey-soft);max-width:240px;margin:10px auto 0;">${esc(b.context_line)}</div>
    </div>${insightBlock(card)}${recBlock(card)}${foot(card)}`;
}

function renderLetter(b: LetterBody, card: SummaryCard): string {
  const paras = b.paragraphs
    .map((p) => `<div class="body" style="color:var(--ink);margin-bottom:12px;">${esc(p)}</div>`)
    .join('');
  return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;"><span style="color:var(--moss);">✉</span><span style="font-size:12px;font-weight:500;color:var(--moss);">A note for Monday-you</span></div>
    ${paras}
    <div style="display:flex;align-items:center;gap:8px;padding-top:12px;border-top:1px solid #C8D8C8;"><div style="width:28px;height:28px;background:var(--sage-mist);border-radius:50%;"></div><span style="font-size:10px;color:var(--grey-soft);"><strong style="color:var(--moss);">${esc(b.signature.name)}</strong> · Level ${esc(b.signature.level)} · ${esc(b.signature.state)}</span></div>`;
}

function renderCardInner(card: SummaryCard): string {
  switch (card.type) {
    case 'hero_spine_v1':
      return renderHeroSpine(card.body as HeroSpineBody, card);
    case 'then_now_split_v1':
      return renderThenNowSplit(card.body as ThenNowSplitBody, card);
    case 'rank_list_v1':
      return renderRankList(card.body as RankListBody, card);
    case 'constellation_v1':
      return renderConstellation(card.body as ConstellationBody, card);
    case 'big_number_v1':
      return renderBigNumber(card.body as BigNumberBody, card);
    case 'letter_v1':
      return renderLetter(card.body as LetterBody, card);
    default:
      return `<div style="color:#b00;">Unknown template: ${esc((card as SummaryCard).type)}</div>`;
  }
}

function renderCardFrame(card: SummaryCard, index: number, total: number): string {
  const isLetter = card.type === 'letter_v1';
  const gcStyle = isLetter ? 'background:#EAF1E8;' : '';
  return `<div class="gph">
    <div class="gnv"><span>${index === 0 ? '&nbsp;' : '‹'}</span><span>${index + 1} of ${total} · ${esc(card.type)}</span><span>✕</span></div>
    <div class="gc" style="${gcStyle}">${renderCardInner(card)}</div>
  </div>`;
}

/** Assemble the full single-document inspection deck for one user. */
export function renderInspectionDeck(label: string, content: AdaptiveSummaryContent): string {
  const cardsHtml = content.cards
    .map((c, i) => renderCardFrame(c, i, content.cards.length))
    .join('\n');
  const logRows = content.metadata.compose_log
    .map(
      (l) =>
        `<tr><td>${esc(l.detector_id)}</td><td>${esc(l.template_id ?? '')}</td><td style="color:${l.accepted ? '#2E5540' : '#b00'}">${l.accepted ? 'accepted' : 'rejected'}</td><td>${esc(l.reason)}</td></tr>`,
    )
    .join('');
  return `
<div class="inspect">
  <h2>${esc(label)} — ${esc(content.cards.length)} cards <span style="font-weight:400;color:var(--grey-soft);">(${esc(content.generated_for_week)}, model ${esc(content.metadata.fill_model)})</span></h2>
  <div class="meta">fired: ${esc(content.metadata.fired_detectors.join(', ') || 'none (floor deck)')}</div>
  <table class="log"><thead><tr><th>detector</th><th>template</th><th>status</th><th>reason</th></tr></thead><tbody>${logRows}</tbody></table>
  <div class="deck-rail">${cardsHtml}</div>
</div>`;
}

/** Wrap one or more user decks in a full HTML document with the canonical design tokens. */
export function renderInspectionDocument(sections: string[]): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gremly — Adaptive Weekly Summary v0.5 · Shadow Inspection</title>
<style>
  :root{--moss:#2E5540;--moss-deep:#1F3A2D;--sage-mist:#BFD8C0;--periwinkle:#9CA6E0;--golden-pear:#E0C47A;--golden-deep:#C68B40;--linen:#F9F6F1;--ink:#1F3A2D;--ink-soft:#3A4A3D;--grey-soft:#6B7C6E;--grey-faint:#8A9B8D;--amber-bg:#FAEEDA;--amber-ink:#5A3A0F;--serif:Georgia,'Times New Roman',serif;}
  *{box-sizing:border-box;} body{margin:0;background:#E8E4DC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--ink);padding:0 0 60px;}
  .inspect{max-width:760px;margin:0 auto;padding:28px 20px;}
  .inspect h2{font-family:var(--serif);font-weight:500;color:var(--moss);}
  .inspect .meta{font-family:'SF Mono',monospace;font-size:11px;color:var(--grey-soft);margin-bottom:10px;}
  table.log{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px;background:#fff;border-radius:8px;overflow:hidden;}
  table.log th,table.log td{text-align:left;padding:6px 10px;border-bottom:1px solid #EFEAE0;}
  table.log th{background:var(--sage-mist);color:var(--moss-deep);}
  .deck-rail{display:flex;flex-direction:column;align-items:center;gap:14px;}
  .gph{background:var(--linen);border-radius:28px;width:340px;padding:12px 12px 16px;box-shadow:0 4px 30px rgba(46,85,64,0.12);}
  .gnv{display:flex;align-items:center;justify-content:space-between;padding:0 4px 10px;font-size:11px;color:var(--grey-soft);}
  .gc{background:white;border-radius:16px;padding:18px 16px;}
  .lab{font-size:9px;letter-spacing:1.5px;color:var(--grey-faint);text-transform:uppercase;font-weight:500;}
  .h1{font-family:var(--serif);font-size:22px;line-height:1.25;font-weight:500;color:var(--moss);}
  .h2{font-family:var(--serif);font-size:18px;line-height:1.3;font-weight:500;color:var(--moss);}
  .body{font-size:13px;line-height:1.6;color:var(--ink-soft);}
  .ins{background:#F4F3FA;border-left:3px solid var(--periwinkle);padding:11px 13px;border-radius:0 8px 8px 0;font-size:12px;line-height:1.55;color:#3A3D5A;font-style:italic;}
  .rec{background:#EAF1E8;border-radius:10px;padding:11px 13px;margin-top:4px;}
  .foot{margin-top:12px;padding-top:10px;border-top:1px solid #EFEAE0;font-size:9px;color:var(--grey-faint);line-height:1.5;}
</style></head><body>
<div class="inspect"><h2 style="border-bottom:3px solid var(--golden-pear);padding-bottom:8px;">Adaptive Weekly Summary v0.5 — Shadow Inspection</h2>
<p class="body">Backend-only proving ground. These are inspection renders of the typed card schemas, not the native product UI. rank_list / constellation / big_number are derived from spec section 5 pending Phase 4 product mockups.</p></div>
${sections.join('\n')}
</body></html>`;
}

// Re-export for callers that only want a single value type reference.
export type { Valence };
