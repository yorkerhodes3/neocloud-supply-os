// 3D views for the simulation, drawn with deck.gl (vendored global `deck`).
//   Globe  — the supply network: suppliers, lanes, moving shipments, agent messages, sites.
//   Campus — one site in orbit: halls rising as they are built, the substation, the cooling
//            yard and every rack coloured by its state.
// Every colour is read from the active brand's CSS variables, so a theme swap re-dresses the scene.
import { SITES, SUPPLIERS, HQ, supplier, along, slice, densify, gcDistKm } from './world.js';
import { cssVar } from '../theme.js';
import { toRGB } from '../lib/color.js';

const WORLD = [[-180, 90], [0, 90], [180, 90], [180, -90], [0, -90], [-180, -90]];
const GRATICULE = (() => {
  const out = [];
  for (let lon = -180; lon < 180; lon += 30) out.push(densify([[lon, -80], [lon, 0], [lon, 80]], 400));
  for (let lat = -60; lat <= 60; lat += 30) out.push(densify([[-180, lat], [-90, lat], [0, lat], [90, lat], [180, lat]], 400));
  return out;
})();
const lift = (p, z) => [p[0], p[1], z];
const liftPath = (path, z) => path.map(p => lift(p, z));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const KIND_SERIES = { rack: 0, optics: 2, switch: 5, cdu: 1, swgr: 4, xfmr: 3 };
export const RACK_STATES = [
  ['planned', 'Planned (not yet called off)'], ['ordering', 'Sourcing & ordering'], ['making', 'In manufacture'],
  ['transit', 'In transit / customs'], ['dock', 'On dock, waiting for the hall'], ['install', 'Installing'],
  ['burnin', 'Burn-in & acceptance'], ['live', 'Billable'], ['rma', 'Failed / repair'], ['paused', 'Billing paused'],
];

export function readPalette() {
  const c = (n, a = 255) => { try { return toRGB(cssVar(n) || '#888888', a); } catch { return [136, 136, 136, a]; } };
  const dark = document.documentElement.dataset.ground !== 'light';
  const s = [1, 2, 3, 4, 5, 6].map(i => c(`--s${i}`));
  const fam = (cssVar('--font-mono') || 'monospace');
  return {
    dark, s, font: fam,
    ocean: c('--map-ocean'), land: c('--map-land'), landEdge: c('--map-line', 150), grat: c('--fg', dark ? 16 : 22),
    fg: c('--fg'), muted: c('--muted'), accent: c('--accent'), glow: c('--glow'), glow2: c('--glow-2'),
    ok: c('--ok'), warn: c('--warn'), risk: c('--risk'), info: c('--info'), surface: c('--surface'), bg: c('--bg'),
    border: c('--border'),
  };
}
const A = (rgb, a) => [rgb[0], rgb[1], rgb[2], a];

export function rackState(rk, t) {
  const lot = rk.lot, hall = rk.hall;
  if (rk.liveAt != null && rk.liveAt <= t) return hall.pauses.some(([a, b]) => t >= a && t < b) ? 'paused' : 'live';
  if (lot.state === 'live') return 'rma';
  if (lot.state === 'burnin') return 'burnin';
  if (lot.state === 'installing') return 'install';
  if (rk.receivedAt != null && rk.receivedAt <= t) return 'dock';
  const l = lot.rack;
  if (l.done) return 'dock';
  if (['ship', 'clear', 'haul', 'receive'].includes(l.stage)) return 'transit';
  if (l.stage === 'make') return 'making';
  if (['screen', 'source', 'order'].includes(l.stage)) return 'ordering';
  return 'planned';
}
export function rackColor(P, st) {
  switch (st) {
    case 'planned': return A(P.fg, P.dark ? 26 : 34);
    case 'ordering': return A(P.info, 90);
    case 'making': return A(P.info, 150);
    case 'transit': return A(P.glow, 200);
    case 'dock': return A(P.warn, 235);
    case 'install': return A(P.glow2, 245);
    case 'burnin': return A(P.s[4] || P.warn, 245);
    case 'live': return A(P.accent, 255);
    case 'rma': return A(P.risk, 255);
    case 'paused': return A(P.risk, 140);
    default: return A(P.fg, 40);
  }
}
export function lineColor(P, l, a = 255) { return A(P.s[KIND_SERIES[l.kind] ?? 0], a); }

/** Position and trail of a line in transit at time t, or null. */
export function shipmentAt(l, t) {
  if (l.done || !['ship', 'clear', 'haul'].includes(l.stage) || !l.out) return null;
  const f = l.t1 > l.t0 ? clamp01((t - l.t0) / (l.t1 - l.t0)) : 1;
  if (l.stage === 'ship') return { pos: along(l.out, f), trail: slice(l.out, Math.max(0, f - 0.14), f), f };
  if (l.stage === 'clear') { const p = l.out.path[l.out.path.length - 1]; return { pos: p, trail: slice(l.out, 0.9, 1), f, atGate: true }; }
  return { pos: along(l.haul, f), trail: slice(l.haul, Math.max(0, f - 0.4), f), f };
}

function hallProgress(hall, t) {
  if (hall.shellAt != null && hall.shellAt <= t) return 1;
  const b = hall.build;
  if (b.stage === 'build' && b.t1 > b.t0) return clamp01((t - b.t0) / (b.t1 - b.t0));
  return 0;
}

// ---------- campus geometry (metres → lon/lat around the site) ----------
const HALL_W = 64, HALL_D = 36, HALL_GAP = 18;
function campusFrame(site) {
  const k = Math.cos(site.lat * Math.PI / 180);
  const ll = (x, y, z = 0) => [site.lon + x / (111320 * k), site.lat + y / 110540, z];
  const n = site.halls.length;
  const total = n * HALL_W + (n - 1) * HALL_GAP;
  const hallX = (i) => -total / 2 + HALL_W / 2 + i * (HALL_W + HALL_GAP) + 14;
  const sub = { x: -total / 2 - 30, y: 4 };
  return { ll, hallX, sub, total };
}
const rect = (ll, cx, cy, w, d) => [ll(cx - w / 2, cy - d / 2), ll(cx + w / 2, cy - d / 2), ll(cx + w / 2, cy + d / 2), ll(cx - w / 2, cy + d / 2)];

// Fixed glyph set: 'auto' regrows the SDF atlas mid-run and can garble labels in deck.gl 9.0.
const CHARSET = (() => { let c = ''; for (let i = 32; i < 127; i++) c += String.fromCharCode(i); return c + '·→←–—…°±×éèêëáàâäåãçíìîïñóòôöøõúùûüýÿßæœÉÅÖÜØÆ'; })();

export function siteCentre(site) { return [site.lon, site.lat]; }

/**
 * Create the renderer. Returns an object with update(), setView(), flyTo(), resize(), destroy().
 * `onHover(info)` is optional; tooltips are rendered by deck with themed styles.
 */
export function createRenderer(parent, { land, onInteract, onPick } = {}) {
  const D = window.deck;
  let P = readPalette(), rev = 1;
  let view = 'globe', siteId = 'TX1';
  const GLOBE_HOME = { longitude: -38, latitude: 34, zoom: 1.05, pitch: 0, bearing: 0 };
  let vs = { ...GLOBE_HOME }, savedGlobe = null;
  const campusVS = (s) => ({ longitude: s.lon + 0.0002, latitude: s.lat - 0.0001, zoom: 17.7, pitch: 56, bearing: -24, maxPitch: 75 });
  let orbit = true, lastInteract = 0, tween = null;
  let frameState = null;
  let laneMemo = { sig: '', data: [] };

  const lighting = new D.LightingEffect({
    ambient: new D.AmbientLight({ color: [255, 255, 255], intensity: 1.05 }),
    key: new D.DirectionalLight({ color: [255, 255, 255], intensity: 1.7, direction: [-3, -8, -9] }),
    rim: new D.DirectionalLight({ color: [255, 255, 255], intensity: 0.5, direction: [4, 6, -2] }),
  });

  const makeView = () => view === 'globe'
    ? new D._GlobeView({ id: 'globe', controller: { inertia: 400, scrollZoom: { speed: 0.01, smooth: true } }, resolution: 10 })
    : new D.MapView({ id: 'campus', controller: { inertia: 400, dragRotate: true }, repeat: false });

  const deckgl = new D.Deck({
    parent,
    views: makeView(),
    viewState: vs,
    effects: [lighting],
    useDevicePixels: Math.min(2, window.devicePixelRatio || 1),
    onViewStateChange: ({ viewState, interactionState }) => {
      vs = { ...viewState };
      if (interactionState && (interactionState.isDragging || interactionState.isZooming || interactionState.isPanning || interactionState.isRotating)) {
        orbit = false; tween = null; lastInteract = performance.now(); onInteract?.();
      }
      deckgl.setProps({ viewState: vs });
    },
    getTooltip: (info) => tooltip(info),
    onClick: (info) => onPick?.(info),
    getCursor: ({ isDragging, isHovering }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'),
    layers: [],
  });

  function tooltip({ object, layer }) {
    if (!object || !layer) return null;
    const base = { className: 'deck-tip' };
    const id = layer.id;
    if (id === 'suppliers') {
      const s = object, st = frameState?.sim?.sup?.[s.id] || {};
      const conn = { A: 'native agent (A2A)', B: 'hosted agent we provide', C: 'Envoy over email/portal' }[s.conn];
      return { ...base, html: `<b>${s.name}</b><span>${s.role}</span><span>Tier ${s.tier} · ${s.cc} · ${conn}</span>${st.flag ? `<span class="${st.flag}">⚑ ${st.note || st.flag}</span>` : ''}${st.hold ? '<span class="risk">Payments on hold</span>' : ''}<em>fictional counterparty</em>` };
    }
    if (id === 'ships' || id === 'ship-halo') {
      const l = object.l, s = supplier(l.supId);
      const eta = frameState?.sim?.eta ? Math.round(frameState.sim.eta(l)) : null;
      return { ...base, html: `<b>${l.M.label} · ${l.lot ? `${l.hall.id} lot ${l.lot.i + 1}` : l.hall ? l.hall.id : l.site.id}</b><span>${l.M.unit}</span><span>${s.name} → ${l.site.name} · ${l.mode}${l.gateway ? ' via ' + l.gateway : ''}</span><span>Stage: ${l.stage}${l.state === 'held' ? ' (held)' : ''}${eta ? ` · in stock ≈ day ${eta}` : ''}</span>` };
    }
    if (id === 'sites' || id === 'site-cols') {
      const s = object.site || object, sim = frameState?.sim;
      const ss = sim?.sites.find(x => x.id === s.id);
      const live = sim ? sim.racks.filter(r => r.hall.site.id === s.id && r.liveAt != null && r.liveAt <= frameState.t).length : 0;
      const tot = s.halls * s.racksPerHall;
      return { ...base, html: `<b>${s.name}</b><span>${s.region} · ${s.contract}</span><span>${live}/${tot} racks billable · ${(live * 72).toLocaleString('en-US')} GPUs</span><span>Need-by day ${s.needBy.join(' / ')} · utility day ${Math.round(ss?.utilityAt ?? s.energize)}</span><em>click to open the campus view</em>` };
    }
    if (id === 'racks') {
      const r = object.rk;
      return { ...base, html: `<b>${r.id}</b><span>${RACK_STATES.find(x => x[0] === object.st)?.[1] || object.st}</span><span>72 GPUs · need-by day ${r.hall.needBy}</span>${r.liveAt != null && r.liveAt <= frameState.t ? `<span class="ok">Billable since day ${r.liveAt.toFixed(1)}</span>` : ''}` };
    }
    if (id === 'halls') return { ...base, html: `<b>${object.hall.id}</b><span>${object.status}</span>` };
    if (id === 'alerts') return { ...base, html: `<b>${object.label}</b><span>Active alert</span>` };
    if (id === 'hq') return { ...base, html: `<b>${HQ.name}</b><span>Agents, graph and ledger run here.</span>` };
    return null;
  }

  function facing(lonlat) {
    return gcDistKm(lonlat, [vs.longitude, vs.latitude]) < 7600;
  }

  function lanes(sim, t) {
    const groups = new Map();
    for (const l of sim.lines) {
      if (l.kind === 'build' || !l.out) continue;
      const key = `${l.supId}>${l.site.id}>${l.mode}>${l.gateway}`;
      let g = groups.get(key);
      if (!g) { g = { key, l, hot: false, mode: l.mode }; groups.set(key, g); }
      if (!l.done && ['ship', 'clear', 'haul'].includes(l.stage)) g.hot = true;
    }
    const sig = [...groups.values()].map(g => g.key + (g.hot ? '*' : '')).join('|') + '#' + rev;
    if (sig === laneMemo.sig) return laneMemo.data;
    const data = [...groups.values()].map(g => {
      const path = g.l.out.path.length > 1 ? g.l.out.path.concat(g.l.haul.path.slice(1)) : g.l.haul.path;
      return { path: liftPath(path, 9000), hot: g.hot, mode: g.mode };
    });
    laneMemo = { sig, data };
    return data;
  }

  function globeLayers(st) {
    const { sim, t, show, wall } = st;
    const L = [];
    L.push(new D.SolidPolygonLayer({ id: 'ocean', data: [WORLD], getPolygon: d => d, filled: true, getFillColor: P.ocean, updateTriggers: { getFillColor: rev } }));
    if (land) L.push(new D.GeoJsonLayer({ id: 'land', data: land, filled: true, stroked: true, getFillColor: P.land, getLineColor: P.landEdge, lineWidthUnits: 'pixels', getLineWidth: 0.7, updateTriggers: { getFillColor: rev, getLineColor: rev } }));
    L.push(new D.PathLayer({ id: 'graticule', data: GRATICULE, getPath: d => d, getColor: P.grat, widthUnits: 'pixels', getWidth: 0.7, updateTriggers: { getColor: rev } }));

    if (show.lanes) {
      L.push(new D.PathLayer({
        id: 'lanes', data: lanes(sim, t), getPath: d => d.path, widthUnits: 'pixels', getWidth: d => (d.hot ? 1.7 : 1), jointRounded: true, capRounded: true,
        getColor: d => A(d.mode === 'sea' ? P.info : d.mode === 'air' ? P.glow : P.s[4], d.hot ? 150 : 55), updateTriggers: { getColor: rev },
      }));
    }
    const ships = [];
    if (show.ships) for (const l of sim.lines) { const s = shipmentAt(l, t); if (s) ships.push({ l, ...s }); }
    if (show.ships) {
      L.push(new D.PathLayer({ id: 'trails', data: ships, getPath: d => liftPath(d.trail, 16000), widthUnits: 'pixels', getWidth: 2.4, capRounded: true, jointRounded: true, getColor: d => lineColor(P, d.l, 170) }));
      L.push(new D.ScatterplotLayer({ id: 'ship-halo', data: ships, getPosition: d => lift(d.pos, 20000), radiusUnits: 'pixels', getRadius: d => (d.atGate ? 9 + 4 * Math.sin(wall * 5) : 8), getFillColor: d => (d.l.state === 'held' || d.atGate ? A(P.warn, 60) : lineColor(P, d.l, 50)), pickable: true, updateTriggers: { getRadius: wall } }));
      L.push(new D.ScatterplotLayer({ id: 'ships', data: ships, getPosition: d => lift(d.pos, 22000), radiusUnits: 'pixels', getRadius: 3.6, stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1, getLineColor: A(P.bg, 220), getFillColor: d => (d.l.state === 'held' ? P.warn : lineColor(P, d.l, 255)), pickable: true }));
    }
    if (show.msgs) {
      const msgs = sim.msgs.filter(m => t - m.t >= 0 && t - m.t < 1.4);
      L.push(new D.ArcLayer({
        id: 'msgs', data: msgs, greatCircle: true, getSourcePosition: d => d.from, getTargetPosition: d => d.to, getHeight: 0.32, widthUnits: 'pixels', getWidth: d => (d.ch === 'email' ? 1.1 : 1.6),
        getSourceColor: d => A(d.dir === 'out' ? P.accent : P.glow, Math.round(230 * (1 - (t - d.t) / 1.4))),
        getTargetColor: d => A(d.dir === 'out' ? P.accent : P.glow, Math.round(110 * (1 - (t - d.t) / 1.4))),
        updateTriggers: { getSourceColor: [t, rev], getTargetColor: [t, rev] },
      }));
    }
    // sites: ghost target column + live column
    const siteRows = SITES.map(s => {
      const live = sim.racks.filter(r => r.hall.site.id === s.id && r.liveAt != null && r.liveAt <= t).length;
      return { site: s, live, total: s.halls * s.racksPerHall };
    });
    L.push(new D.ColumnLayer({ id: 'site-ghost', data: siteRows, getPosition: d => [d.site.lon, d.site.lat], diskResolution: 6, radius: 90000, extruded: true, wireframe: true, filled: false, getElevation: d => d.total * 72 * 120, getLineColor: A(P.fg, 70), updateTriggers: { getLineColor: rev } }));
    L.push(new D.ColumnLayer({ id: 'site-cols', data: siteRows, getPosition: d => [d.site.lon, d.site.lat], diskResolution: 6, radius: 82000, extruded: true, pickable: true, getElevation: d => Math.max(1, d.live) * 72 * 120, getFillColor: d => A(d.live ? P.accent : P.fg, d.live ? 235 : 40), updateTriggers: { getElevation: t, getFillColor: [t, rev] }, material: { ambient: 0.6, diffuse: 0.6, shininess: 40 } }));
    L.push(new D.ScatterplotLayer({ id: 'sites', data: SITES, getPosition: d => lift([d.lon, d.lat], 3000), radiusUnits: 'pixels', getRadius: 6, stroked: true, filled: true, getFillColor: A(P.accent, 90), getLineColor: P.accent, lineWidthUnits: 'pixels', getLineWidth: 1.5, pickable: true, updateTriggers: { getFillColor: rev, getLineColor: rev } }));
    // suppliers
    if (show.sups) {
      L.push(new D.ScatterplotLayer({
        id: 'sup-halo', data: SUPPLIERS.filter(s => sim.sup[s.id].flag || sim.sup[s.id].sanctioned), getPosition: d => lift([d.lon, d.lat], 6000), radiusUnits: 'pixels',
        getRadius: () => 10 + 6 * (0.5 + 0.5 * Math.sin(wall * 3.2)), getFillColor: d => A(sim.sup[d.id].sanctioned || sim.sup[d.id].flag === 'risk' ? P.risk : P.warn, 55), updateTriggers: { getRadius: wall, getFillColor: [t, rev] },
      }));
      L.push(new D.ScatterplotLayer({
        id: 'suppliers', data: SUPPLIERS, getPosition: d => lift([d.lon, d.lat], 8000), radiusUnits: 'pixels', pickable: true,
        getRadius: d => 4.2 + Math.min(sim.sup[d.id].active, 6) * 0.7, stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1.4,
        getFillColor: d => (d.tier > 1 ? A(P.s[1], 230) : A(P.fg, 210)),
        getLineColor: d => { const s = sim.sup[d.id]; return s.sanctioned || s.flag === 'risk' ? P.risk : s.flag === 'warn' ? P.warn : A(P.bg, 230); },
        updateTriggers: { getRadius: t, getLineColor: [t, rev], getFillColor: rev },
      }));
    }
    L.push(new D.ScatterplotLayer({ id: 'hq', data: [HQ], getPosition: d => lift([d.lon, d.lat], 6000), radiusUnits: 'pixels', getRadius: 6.5, stroked: true, getFillColor: A(P.glow, 160), getLineColor: P.fg, lineWidthUnits: 'pixels', getLineWidth: 1.4, pickable: true, updateTriggers: { getFillColor: rev, getLineColor: rev } }));
    // alerts
    if (show.risk) {
      const al = sim.alerts.filter(a => a.at && t >= a.t && t < a.until);
      L.push(new D.ScatterplotLayer({
        id: 'alerts', data: al, getPosition: d => lift(d.at, 12000), radiusUnits: 'pixels', stroked: true, filled: true, pickable: true,
        getRadius: d => 16 + 22 * ((wall * 0.7 + d.id * 0.37) % 1), getFillColor: d => A(d.sev === 'warn' ? P.warn : P.risk, 22), getLineColor: d => A(d.sev === 'warn' ? P.warn : P.risk, 210),
        lineWidthUnits: 'pixels', getLineWidth: 1.6, updateTriggers: { getRadius: wall, getFillColor: rev, getLineColor: rev },
      }));
    }
    // labels (front-facing only)
    const labels = [];
    for (const s of SITES) if (facing([s.lon, s.lat])) labels.push({ p: [s.lon, s.lat], text: s.name, kind: 'site' });
    if (facing([HQ.lon, HQ.lat])) labels.push({ p: [HQ.lon, HQ.lat], text: 'Control plane', kind: 'hq' });
    if (show.sups && vs.zoom > 1.25) for (const s of SUPPLIERS) if (facing([s.lon, s.lat])) labels.push({ p: [s.lon, s.lat], text: s.name, kind: 'sup' });
    if (show.risk) for (const a of sim.alerts) if (a.at && t >= a.t && t < a.until && facing(a.at)) labels.push({ p: a.at, text: a.label, kind: 'alert', sev: a.sev });
    L.push(new D.TextLayer({
      id: 'labels', data: labels, getPosition: d => lift(d.p, 40000), getText: d => d.text, characterSet: CHARSET, fontFamily: P.font, fontWeight: 700,
      getSize: d => (d.kind === 'site' ? 12.5 : d.kind === 'alert' ? 12 : 10.5), sizeUnits: 'pixels',
      getColor: d => (d.kind === 'alert' ? (d.sev === 'warn' ? P.warn : P.risk) : d.kind === 'sup' ? A(P.fg, 175) : P.fg),
      getPixelOffset: d => (d.kind === 'alert' ? [0, -30] : [12, 0]), getTextAnchor: d => (d.kind === 'alert' ? 'middle' : 'start'), getAlignmentBaseline: 'center',
      outlineWidth: 3, outlineColor: A(P.bg, 230), fontSettings: { sdf: true, fontSize: 56, buffer: 12, radius: 12 },
      updateTriggers: { getColor: rev },
    }));
    return L;
  }

  function campusLayers(st) {
    const { sim, t, wall } = st;
    const site = sim.sites.find(s => s.id === siteId) || sim.sites[0];
    const F = campusFrame(site), ll = F.ll;
    const L = [];
    const padW = F.total + 150, padD = 150;
    // pad + survey grid
    L.push(new D.SolidPolygonLayer({ id: 'pad', data: [rect(ll, 0, 0, padW, padD)], getPolygon: d => d, getFillColor: A(P.land, 255), updateTriggers: { getFillColor: rev } }));
    const grid = [];
    for (let x = -padW / 2; x <= padW / 2; x += 10) grid.push([ll(x, -padD / 2, 0.05), ll(x, padD / 2, 0.05)]);
    for (let y = -padD / 2; y <= padD / 2; y += 10) grid.push([ll(-padW / 2, y, 0.05), ll(padW / 2, y, 0.05)]);
    L.push(new D.PathLayer({ id: 'survey', data: grid, getPath: d => d, widthUnits: 'pixels', getWidth: 0.6, getColor: A(P.fg, P.dark ? 16 : 22), updateTriggers: { getColor: rev } }));
    const fence = [ll(-padW / 2 + 6, -padD / 2 + 6, 0.1), ll(padW / 2 - 6, -padD / 2 + 6, 0.1), ll(padW / 2 - 6, padD / 2 - 6, 0.1), ll(-padW / 2 + 6, padD / 2 - 6, 0.1), ll(-padW / 2 + 6, -padD / 2 + 6, 0.1)];
    L.push(new D.PathLayer({ id: 'fence', data: [fence], getPath: d => d, widthUnits: 'pixels', getWidth: 1.2, getColor: A(P.glow, 120), updateTriggers: { getColor: rev } }));

    // power: substation (transformer) + feeders to each hall's switchgear
    const xf = site.xfmr, energised = site.energizedAt != null && site.energizedAt <= t;
    const xfIn = xf.stockAt != null && xf.stockAt <= t;
    const boxes = [];
    boxes.push({ id: 'xfmr', x: F.sub.x, y: F.sub.y, r: 5.5, h: xfIn ? 6.5 : 0.6, c: energised ? P.ok : xfIn ? P.s[3] : A(P.fg, 40), label: `Substation · 60 MVA` });
    const feeders = [];
    const rows = [];
    const hallPolys = [];
    const labels = [];
    site.halls.forEach((hall, i) => {
      const cx = F.hallX(i);
      const prog = hallProgress(hall, t);
      const swIn = hall.swgr.stockAt != null && hall.swgr.stockAt <= t;
      const cduIn = hall.cdu.stockAt != null && hall.cdu.stockAt <= t;
      const cooled = hall.cooledAt != null && hall.cooledAt <= t;
      const ready = hall.readyAt != null && hall.readyAt <= t;
      boxes.push({ id: `${hall.id}-swgr`, x: cx - HALL_W / 2 + 7, y: -HALL_D / 2 - 7, r: 3.4, h: swIn ? 3.4 : 0.4, c: energised ? P.ok : swIn ? P.s[4] : A(P.fg, 40) });
      for (let k = 0; k < 8; k++) boxes.push({ id: `${hall.id}-cdu${k}`, x: cx - 24 + k * 6.8, y: HALL_D / 2 + 9, r: 2.2, h: cduIn ? 2.6 : 0.3, c: cooled ? A(P.info, 255) : cduIn ? P.s[1] : A(P.fg, 36), spin: cooled });
      feeders.push({ path: [ll(F.sub.x, F.sub.y, 0.3), ll(F.sub.x, -HALL_D / 2 - 7, 0.3), ll(cx - HALL_W / 2 + 7, -HALL_D / 2 - 7, 0.3)], on: energised });
      const live = hall.lots.flatMap(l => l.racks).filter(r => r.liveAt != null && r.liveAt <= t).length;
      const status = ready ? `READY · ${live}/32 billable` : prog < 1 ? (prog > 0 ? `Shell ${Math.round(prog * 100)}%` : 'Ground prep') : [!energised && 'awaiting power', !cooled && 'cooling commissioning'].filter(Boolean).join(' · ') || 'commissioning';
      hallPolys.push({ hall, poly: rect(ll, cx, 0, HALL_W, HALL_D), h: 9 * Math.max(0.03, prog), prog, ready, status });
      labels.push({ p: ll(cx, -HALL_D / 2 - 15, 12), text: `${hall.id}`, kind: 'hall' }, { p: ll(cx, -HALL_D / 2 - 15, 12), text: status, kind: 'status', ready });
      hall.lots.forEach((lot, li) => lot.racks.forEach((rk, k) => {
        const stt = rackState(rk, t);
        if (prog < 1 && (stt === 'planned' || stt === 'ordering' || stt === 'making')) return;
        rows.push({ rk, st: stt, pos: ll(cx - 24.5 + k * 7, -11.5 + li * 7.6), h: stt === 'planned' || stt === 'ordering' ? 0.25 : stt === 'making' || stt === 'transit' ? 0.9 : 2.4 });
      }));
    });
    // dock: racks received but not installed are drawn as crates in the yard
    L.push(new D.PathLayer({ id: 'feeders', data: feeders, getPath: d => d.path, widthUnits: 'pixels', getWidth: d => (d.on ? 2.6 : 1.2), getColor: d => (d.on ? A(P.ok, 220) : A(P.fg, 50)), updateTriggers: { getColor: [t, rev], getWidth: t } }));
    L.push(new D.ColumnLayer({ id: 'racks', data: rows, getPosition: d => d.pos, diskResolution: 4, angle: 45, radius: 1.75, extruded: true, pickable: true, getElevation: d => d.h, getFillColor: d => rackColor(P, d.st), updateTriggers: { getFillColor: [t, rev], getElevation: t }, material: { ambient: 0.55, diffuse: 0.7, shininess: 24 } }));
    L.push(new D.SolidPolygonLayer({ id: 'boxes', data: boxes, getPolygon: d => rect(ll, d.x, d.y, d.r * 2, d.r * (d.id === 'xfmr' ? 1.5 : 2)), extruded: true, getElevation: d => d.h, getFillColor: d => d.c, updateTriggers: { getFillColor: [t, rev], getElevation: t }, material: { ambient: 0.5, diffuse: 0.75, shininess: 30 } }));
    L.push(new D.SolidPolygonLayer({
      id: 'halls', data: hallPolys, getPolygon: d => d.poly, extruded: true, wireframe: true, pickable: true, getElevation: d => d.h,
      getFillColor: d => A(d.ready ? P.accent : P.glow, d.prog < 1 ? 46 : 30), getLineColor: d => A(d.ready ? P.accent : P.glow, 210),
      updateTriggers: { getElevation: t, getFillColor: [t, rev], getLineColor: [t, rev] }, material: { ambient: 0.8, diffuse: 0.3 },
    }));
    // a gentle sweep on halls under construction
    const cranes = hallPolys.filter(h => h.prog > 0 && h.prog < 1).map(h => ({ p: h.poly[0], h }));
    L.push(new D.ScatterplotLayer({ id: 'crane', data: cranes, getPosition: d => [d.p[0], d.p[1], d.h.h + 1], radiusUnits: 'pixels', getRadius: 3 + 2 * Math.sin(wall * 4), getFillColor: P.warn, updateTriggers: { getRadius: wall, getFillColor: rev } }));
    labels.push({ p: ll(F.sub.x, F.sub.y - 12, 8), text: energised ? 'Substation · energised' : xfIn ? 'Substation · transformer set' : 'Substation · awaiting transformer', kind: 'yard', ok: energised });
    labels.push({ p: ll(F.hallX(0) - 10, HALL_D / 2 + 18, 4), text: 'Cooling yard', kind: 'yard' });
    L.push(new D.TextLayer({
      id: 'campus-labels', data: labels, getPosition: d => d.p, getText: d => d.text, characterSet: CHARSET, fontFamily: P.font, fontWeight: 700, sizeUnits: 'pixels',
      getSize: d => (d.kind === 'hall' ? 14 : 11), getPixelOffset: d => (d.kind === 'status' ? [0, 16] : [0, 0]),
      getColor: d => (d.kind === 'status' ? (d.ready ? P.accent : A(P.fg, 190)) : d.kind === 'yard' ? (d.ok ? P.ok : A(P.fg, 170)) : P.fg),
      outlineWidth: 3, outlineColor: A(P.bg, 235), fontSettings: { sdf: true, fontSize: 56, buffer: 12, radius: 12 }, updateTriggers: { getColor: [t, rev] },
    }));
    return L;
  }

  function step(dt) {
    if (tween) {
      tween.k = Math.min(1, tween.k + dt / tween.dur);
      const e = tween.k < 0.5 ? 4 * tween.k ** 3 : 1 - (-2 * tween.k + 2) ** 3 / 2;
      const next = { ...vs };
      for (const key of Object.keys(tween.to)) {
        let a = tween.from[key], b = tween.to[key];
        if (key === 'longitude' || key === 'bearing') { let d = ((b - a + 540) % 360) - 180; b = a + d; }
        next[key] = a + (b - a) * e;
      }
      vs = next;
      if (tween.k >= 1) tween = null;
    } else if (orbit) {
      if (view === 'globe') vs = { ...vs, longitude: ((vs.longitude + dt * 2.2 + 540) % 360) - 180 };
      else vs = { ...vs, bearing: vs.bearing + dt * 3.2 };
    }
  }

  return {
    deck: deckgl,
    update(st, dt = 0) {
      frameState = st;
      step(dt);
      const layers = view === 'globe' ? globeLayers(st) : campusLayers(st);
      deckgl.setProps({ layers, viewState: vs });
    },
    setView(v, site) {
      if (site) siteId = site;
      const changed = v !== view;
      tween = null;
      if (v === 'campus') {
        const s = SITES.find(x => x.id === siteId) || SITES[0];
        if (changed) { savedGlobe = { ...vs }; vs = campusVS(s); }
        else tween = { from: { ...vs }, to: { longitude: s.lon + 0.0002, latitude: s.lat - 0.0001 }, k: 0, dur: 1.2 };
      } else if (changed) vs = savedGlobe || { ...GLOBE_HOME };
      view = v;
      if (changed) deckgl.setProps({ views: makeView(), viewState: vs });
      parent.dataset.view = v;
    },
    get view() { return view; },
    get site() { return siteId; },
    flyTo(lonlat, zoom = 1.9) {
      if (view !== 'globe' || !lonlat) return;
      tween = { from: { ...vs }, to: { longitude: lonlat[0], latitude: Math.max(-50, Math.min(62, lonlat[1] * 0.85)), zoom }, k: 0, dur: 1.8 };
      orbit = false;
    },
    home() { if (view === 'globe') tween = { from: { ...vs }, to: { longitude: GLOBE_HOME.longitude, latitude: GLOBE_HOME.latitude, zoom: GLOBE_HOME.zoom }, k: 0, dur: 1.4 }; else tween = { from: { ...vs }, to: { pitch: 56, bearing: -24, zoom: 17.7 }, k: 0, dur: 1.2 }; },
    set orbit(v) { orbit = v; if (v) tween = null; },
    get orbit() { return orbit; },
    get lastInteract() { return lastInteract; },
    retheme() { P = readPalette(); rev++; laneMemo.sig = ''; },
    /** Lower the backing-store resolution on devices that cannot keep up (software GL, weak iGPUs). */
    setPixelRatio(r) { deckgl.setProps({ useDevicePixels: r }); },
    destroy() { deckgl.finalize(); },
  };
}

/** Feature test: can we draw WebGL at all? */
export function webglOK() {
  if (!window.deck) return false;
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
