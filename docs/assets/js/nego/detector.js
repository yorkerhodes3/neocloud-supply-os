// Rule-based tactic detector — pure, no DOM. Works on structured synthetic moves
// (offers on public issue axes, equal weights) and on free text from replayed NDJSON.
// Each detection: { rule, tag, label, confidence, rationale, prohibited }.
// When no rule fires it returns an honest placeholder, never a guess.

export const RULES = [
  { rule: 'R1', tag: 'anchoring', label: 'Anchoring — extreme opening' },
  { rule: 'R2', tag: 'large-concession', label: 'Large concession' },
  { rule: 'R3', tag: 'reciprocal-concession', label: 'Reciprocal concession' },
  { rule: 'R4', tag: 'logrolling', label: 'Log-rolling / package deal' },
  { rule: 'R5', tag: 'deadline-pressure', label: 'Deadline pressure' },
  { rule: 'R6', tag: 'batna-reference', label: 'BATNA reference' },
  { rule: 'R7', tag: 'coalition-caucus', label: 'Coalition / caucus' },
  { rule: 'R8', tag: 'information-request', label: 'Information request' },
  { rule: 'R9', tag: 'threat-ultimatum', label: 'Threat / ultimatum' },
  { rule: 'R10', tag: 'false-deadline', label: 'False deadline', prohibited: true },
  { rule: 'R11', tag: 'competing-quote-disclosure', label: 'Competing-quote disclosure', prohibited: true },
  { rule: 'R12', tag: 'stalling', label: 'Stalling / no move' },
];
const BY_ID = Object.fromEntries(RULES.map((r) => [r.rule, r]));

export const PLACEHOLDER_RATIONALE =
  'No rule matched. This placeholder keeps every move tagged for dashboards; it is not evidence that any tactic was used.';

export function placeholder(kind = 'message') {
  return {
    rule: 'R0', tag: 'positional-statement', label: 'Positional statement (placeholder)', confidence: 0.3,
    rationale: `${PLACEHOLDER_RATIONALE} (move.kind=${kind})`, prohibited: false, placeholder: true,
  };
}

const RX = {
  logroll: /\b(?:in\s+exchange\s+for|if\s+you\s+can|provided\s+(?:that|you)|package\s+deal|trade\s+\w+(?:\s+\w+)?\s+for)\b/i,
  deadline: /\b(?:by\s+(?:end\s+of|the\s+end\s+of|the\s+next)|within\s+\d+\s+(?:hours|days|weeks|months)|no\s+later\s+than|deadline|valid\s+(?:only\s+)?until|expires?|end\s+of\s+round\s+\d+)\b/i,
  batna: /\b(?:alternative\s+(?:supply|supplier|source|vendor|buyer)s?|alternate\s+(?:source|supplier|vendor)s?|second\s+source|other\s+(?:options|buyers?|suppliers?)|another\s+buyer|walk-?away\s+(?:point|option)|BATNA|spot\s+(?:channel|market))\b/i,
  caucus: /\b(?:caucus|side-?bar|coalition|between\s+us|align(?:ed)?\s+with|jointly)\b/i,
  askQ: /\b(?:can|could|would|will)\s+you\b|\b(?:what|which|when|how)\b|\b(?:share|confirm|clarify|tell\s+us|let\s+us\s+know)\b/i,
  threat: /\b(?:final\s+offer|take\s+it\s+or\s+leave\s+it|walk\s+away|leave\s+the\s+table|last\s+chance|non-negotiable|deal\s*breaker|or\s+we\s+(?:will|walk))\b/i,
  expiry: /\b(?:until|by)\s+the\s+end\s+of\s+round\s+(\d+)\b|\bexpires?\s+(?:at\s+)?(?:the\s+)?end\s+of\s+round\s+(\d+)\b/i,
  competitor: /\b(?:another|other|rival|competing|a\s+different)\s+(?:buyer|vendor|supplier|bidder|neocloud|customer|odm)s?\b[^.]{0,80}?\$\s?\d|\bquoted\b[^.]{0,80}?\$\s?\d/i,
  money: /\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|bn|b)?\b/i,
};
const STOP = new Set('about above after again against their there these those which while would could should shall being other under where whose because within between through during before ourselves yours their thank thanks please'.split(' '));
const tokens = (s) => new Set((String(s || '').toLowerCase().match(/[a-z][a-z0-9'-]{4,}/g) || []).filter((t) => !STOP.has(t)));

/** Normalised position (index / (n-1)) of each issue in an offer, on public axes. */
function positions(offer, issues) {
  if (!offer || !issues) return null;
  const p = issues.map((is) => {
    const i = is.levels.indexOf(offer[is.id]);
    return i < 0 ? null : (is.levels.length > 1 ? i / (is.levels.length - 1) : 0);
  });
  return p.some((x) => x == null) ? null : p;
}
const dist = (a, b) => a.reduce((s, x, q) => s + Math.abs(x - b[q]), 0) / a.length;
const r2 = (x) => Math.round(x * 100) / 100;

function hit(rule, confidence, rationale) {
  const r = BY_ID[rule];
  return { rule, tag: r.tag, label: r.label, confidence: r2(Math.min(0.95, confidence)), rationale, prohibited: !!r.prohibited };
}

function moneyOf(text) {
  const m = RX.money.exec(String(text || ''));
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return parseFloat(m[1].replace(/,/g, '')) * mult;
}

/**
 * Detect tactics in one move.
 * move: { id, partyTwin, channelId, roundNumber, kind, text, offer? }
 * ctx:  { issues?, history?: prior moves (same shape), mediators?: [twin ids not treated as counterparts] }
 */
export function detectMove(move, ctx = {}) {
  const out = [];
  const history = ctx.history || [];
  const mediators = new Set(ctx.mediators || []);
  const issues = ctx.issues;
  const me = move.partyTwin;
  const text = String(move.text || '');
  const own = history.filter((m) => m.partyTwin === me);
  const others = history.filter((m) => m.partyTwin !== me && !mediators.has(m.partyTwin));
  const pos = positions(move.offer, issues);
  const lastWithOffer = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (positions(arr[i].offer, issues)) return arr[i]; return null; };

  if (pos && !mediators.has(me)) {
    const ownPrev = lastWithOffer(own);
    const otherLast = lastWithOffer(others.filter((m) => m.channelId === move.channelId || m.channelId === 'plenary'));
    const pPrev = ownPrev && positions(ownPrev.offer, issues);
    const pOther = otherLast && positions(otherLast.offer, issues);
    if (!pPrev) { // R1 anchoring — opening offer
      if (pOther) {
        const d = dist(pos, pOther);
        if (d >= 0.4) out.push(hit('R1', 0.5 + d * 0.6, `Opening package sits ${r2(d)} (normalised, equal weights) from the other side’s position — threshold 0.40.`));
      } else {
        const ends = pos.filter((x) => x === 0 || x === 1).length;
        if (ends / pos.length >= 0.5) out.push(hit('R1', 0.5 + 0.4 * (ends / pos.length), `Opening package puts ${ends} of ${pos.length} issues at the end of their range.`));
      }
    } else if (pOther) {
      const conc = dist(pPrev, pOther) - dist(pos, pOther);
      if (conc >= 0.12) out.push(hit('R2', 0.6 + Math.min(0.3, conc), `Moved ${r2(conc)} toward the other side’s last package in one step (threshold 0.12).`));
      // R3 reciprocal: the other side's previous move also conceded toward us
      const otherOwn = others.filter((m) => m.partyTwin === otherLast.partyTwin);
      const prevIdx = otherOwn.lastIndexOf(otherLast);
      const otherPrev = prevIdx > 0 ? lastWithOffer(otherOwn.slice(0, prevIdx)) : null;
      const pOtherPrev = otherPrev && positions(otherPrev.offer, issues);
      if (conc > 0.015 && pOtherPrev) {
        const theirConc = dist(pOtherPrev, pPrev) - dist(pOther, pPrev);
        if (theirConc > 0.015) out.push(hit('R3', 0.7, `Conceded ${r2(conc)} right after the other side conceded ${r2(theirConc)} — matched movement.`));
      }
      // R4 log-rolling: some issues move toward, others away
      let toward = 0, away = 0;
      pos.forEach((x, q) => {
        const a = Math.abs(pPrev[q] - pOther[q]), b = Math.abs(x - pOther[q]);
        if (b < a - 1e-9) toward++; else if (b > a + 1e-9) away++;
      });
      if (toward >= 1 && away >= 1) out.push(hit('R4', 0.75, `Package trade: moved toward the other side on ${toward} issue(s) while firming on ${away}.`));
      // R12 stalling: identical package
      if (dist(pos, pPrev) === 0 && move.kind !== 'accept') out.push(hit('R12', 0.7, 'Repeated the identical package from its previous turn.'));
    }
  } else if (text) {
    // Text-only heuristics for replayed moves (prices parsed from "$N").
    const price = moneyOf(text);
    const ownPrevText = own.length ? own[own.length - 1] : null;
    if (price != null && (move.kind === 'proposal' || move.kind === 'counter') && !own.some((m) => moneyOf(m.text) != null) && (move.roundNumber || 0) <= 1) {
      out.push(hit('R1', 0.55, `First priced proposal from this party (${'$'}${price.toLocaleString('en-US')}) in round ${move.roundNumber || 1} — treated as an anchor.`));
    }
    const ownPrevPrice = [...own].reverse().map((m) => moneyOf(m.text)).find((x) => x != null);
    const otherPrice = [...others].reverse().map((m) => moneyOf(m.text)).find((x) => x != null);
    if (price != null && ownPrevPrice != null && otherPrice != null) {
      const conc = Math.abs(ownPrevPrice - otherPrice) - Math.abs(price - otherPrice);
      if (conc > 0 && conc / Math.max(1, ownPrevPrice) >= 0.04) out.push(hit('R2', 0.6, `Quoted price moved ${'$'}${conc.toLocaleString('en-US')} toward the other side’s last figure (≥4%).`));
    }
    if (ownPrevText && !/\d/.test(text.replace(/\d+(?:st|nd|rd|th)?\s+round/gi, ''))) {
      const a = tokens(text), b = tokens(ownPrevText.text);
      let shared = 0; for (const t of a) if (b.has(t)) shared++;
      if (shared >= 6) out.push(hit('R12', 0.5, `Shares ${shared} content words with its previous move and states no new figures.`));
    }
    if (RX.logroll.test(text)) out.push(hit('R4', 0.6, 'Conditional or package language (“in exchange for”, “if you can”, “provided that”).'));
  }
  if (pos && RX.logroll.test(text) && !out.some((d) => d.rule === 'R4')) out.push(hit('R4', 0.6, 'Conditional or package language (“in exchange for”, “if you can”, “provided that”).'));

  if (RX.deadline.test(text)) out.push(hit('R5', 0.8, 'Deadline language (“valid until”, “by the end of”, “within N days”, “deadline”).'));
  if (RX.batna.test(text)) out.push(hit('R6', 0.7, 'Refers to an alternative (other buyers, second source, walk-away point).'));
  const ch = String(move.channelId || 'plenary');
  if (ch !== 'plenary' && !ch.startsWith('brief-')) out.push(hit('R7', 0.9, `Made in “${ch}”, a channel that excludes at least one seat.`));
  else if (RX.caucus.test(text)) out.push(hit('R7', 0.6, 'Coalition or side-channel language.'));
  if (/\?/.test(text) && RX.askQ.test(text)) out.push(hit('R8', 0.6, 'Asks the other side for information.'));
  if (RX.threat.test(text)) out.push(hit('R9', 0.75, 'Ultimatum or walk-away threat language.'));

  // R10 false deadline (prohibited): a stated round-based expiry has passed and the party is still negotiating.
  if (move.kind !== 'accept' && move.kind !== 'walk') {
    for (const m of own) {
      const x = RX.expiry.exec(String(m.text || ''));
      if (!x) continue;
      const n = +(x[1] || x[2]);
      const already = own.some((o) => (o.roundNumber || 0) > n && o !== m);
      if ((move.roundNumber || 0) > n && !already) {
        out.push(hit('R10', 0.85, `Said its offer expired at the end of round ${n} (round ${m.roundNumber}); still negotiating in round ${move.roundNumber}. The deadline was not real.`));
        break;
      }
    }
  }
  if (RX.competitor.test(text)) out.push(hit('R11', 0.85, 'Cites another party’s price or terms — breaches the information barrier (FR-ENV-007).'));

  if (!out.length) return [placeholder(move.kind)];
  const seen = new Set();
  return out.filter((d) => (seen.has(d.rule) ? false : seen.add(d.rule)))
    .sort((a, b) => +a.rule.slice(1) - +b.rule.slice(1));
}

/** Text-only detection for replayed records (no structured offers). */
export function detectText(text, ctx = {}) {
  return detectMove({
    id: ctx.id, partyTwin: ctx.party, channelId: ctx.channel || 'plenary', roundNumber: ctx.round || 0,
    kind: ctx.kind || 'message', text,
  }, { history: ctx.history || [], mediators: ctx.mediators });
}

export const ruleInfo = (id) => BY_ID[id] || (id === 'R0' ? { rule: 'R0', tag: 'positional-statement', label: 'Positional statement (placeholder)' } : null);
