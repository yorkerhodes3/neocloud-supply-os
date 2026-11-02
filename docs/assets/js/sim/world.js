// The simulated world: our sites, a fictional supplier base on real geography,
// gateways (ports, airports, border crossings) and the lanes between them.
// Every counterparty name is invented. Places are real so the map is honest
// about distance; nothing here describes a real company's supply chain.

export const HQ = { id: 'HQ', name: 'Supply OS control plane', short: 'Control plane', lon: -74.0, lat: 40.71 };

/** Our data center sites. One rack = one 72-GPU rack-scale system (illustrative). */
export const SITES = [
  { id: 'TX1', name: 'Prairie-1', region: 'West Texas, US', lon: -99.73, lat: 32.45, halls: 2, racksPerHall: 32,
    air: 'DFW', ocean: 'LGB', energize: 104, needBy: [128, 140], contractDay: 0, contract: 'C-1042' },
  { id: 'NO1', name: 'Fjord-1', region: 'Vestland, Norway', lon: 5.73, lat: 60.62, halls: 1, racksPerHall: 32,
    air: 'BGO', ocean: 'RTM', energize: 112, needBy: [146], contractDay: 6, contract: 'C-1047' },
  { id: 'UK1', name: 'Midland-1', region: 'East Midlands, UK', lon: -1.55, lat: 52.62, halls: 1, racksPerHall: 32,
    air: 'EMA', ocean: 'FXT', energize: 118, needBy: [152], contractDay: 12, contract: 'C-1051' },
];
export const GPUS_PER_RACK = 72;
export const RACKS_PER_LOT = 8;

/**
 * Supplier base. tier = depth in our chain (1 = we buy from them directly).
 * conn = how their side of the conversation runs (see concept §6):
 *   A native agent · B hosted agent we provide · C Envoy over email/portal.
 */
export const SUPPLIERS = [
  { id: 'ACC', name: 'Helion Accelerators', role: 'Accelerator vendor (allocation)', tier: 1, conn: 'A', lon: -121.95, lat: 37.35, cc: 'US' },
  { id: 'FAB', name: 'Formosa Advanced Packaging', role: 'Foundry & advanced packaging', tier: 3, conn: 'B', lon: 120.97, lat: 24.8, cc: 'TW' },
  { id: 'HBM', name: 'Hanbit Memory', role: 'HBM stacks', tier: 3, conn: 'B', lon: 127.44, lat: 37.27, cc: 'KR' },
  { id: 'ODM1', name: 'Kestrel Systems', role: 'Rack-scale ODM (primary)', tier: 1, conn: 'A', lon: 121.3, lat: 24.99, cc: 'TW' },
  { id: 'ODM2', name: 'Northbridge Integration', role: 'Rack-scale ODM (qualified alternate)', tier: 1, conn: 'B', lon: -103.35, lat: 20.67, cc: 'MX' },
  { id: 'OPT1', name: 'Lumen Optics', role: '800G optical transceivers', tier: 1, conn: 'B', lon: 100.33, lat: 5.41, cc: 'MY' },
  { id: 'OPT2', name: 'Coastline Photonics', role: 'Transceivers (qualified alternate)', tier: 1, conn: 'C', lon: 100.52, lat: 13.75, cc: 'TH' },
  { id: 'NET', name: 'Arcspan Networks', role: 'Spine & leaf switches', tier: 1, conn: 'A', lon: -121.89, lat: 37.34, cc: 'US' },
  { id: 'CDU', name: 'Fjordcool', role: 'Coolant distribution units', tier: 1, conn: 'B', lon: 10.2, lat: 56.16, cc: 'DK' },
  { id: 'SWG', name: 'Prairie Switchgear', role: 'MV switchgear & UPS', tier: 1, conn: 'C', lon: -91.67, lat: 41.98, cc: 'US' },
  { id: 'XF1', name: 'Volta Transformers', role: 'Power transformers (slot reserved)', tier: 1, conn: 'C', lon: -100.32, lat: 25.69, cc: 'MX' },
  { id: 'XF2', name: 'Nordkraft Transformers', role: 'Power transformers (EU)', tier: 1, conn: 'B', lon: 21.62, lat: 63.1, cc: 'FI' },
  { id: 'EPC', name: 'Meridian Builders', role: 'EPC & electrical contractor', tier: 1, conn: 'C', lon: -96.8, lat: 32.78, cc: 'US' },
  { id: 'EPCE', name: 'Brightwater Construction', role: 'EPC contractor (Europe)', tier: 1, conn: 'C', lon: -0.13, lat: 51.51, cc: 'GB' },
  { id: 'CAR', name: 'Bluewing Logistics', role: 'Forwarder & carriers', tier: 1, conn: 'A', lon: 4.76, lat: 52.31, cc: 'NL' },
];
export const supplier = (id) => SUPPLIERS.find(s => s.id === id);

/** Gateways. kind: air | sea | land. */
export const GATEWAYS = {
  TPE: { name: 'Taoyuan air cargo', kind: 'air', lon: 121.23, lat: 25.08 },
  PEN: { name: 'Penang air cargo', kind: 'air', lon: 100.27, lat: 5.3 },
  BKK: { name: 'Bangkok air cargo', kind: 'air', lon: 100.75, lat: 13.69 },
  SJC: { name: 'San Jose', kind: 'air', lon: -121.93, lat: 37.36 },
  DFW: { name: 'Dallas/Fort Worth air cargo', kind: 'air', lon: -97.04, lat: 32.9 },
  ANC: { name: 'Anchorage (tech stop)', kind: 'air', lon: -150.0, lat: 61.17 },
  BGO: { name: 'Bergen air cargo', kind: 'air', lon: 5.22, lat: 60.29 },
  EMA: { name: 'East Midlands air cargo', kind: 'air', lon: -1.33, lat: 52.83 },
  GDL: { name: 'Guadalajara air cargo', kind: 'air', lon: -103.31, lat: 20.52 },
  KHH: { name: 'Port of Kaohsiung', kind: 'sea', lon: 120.28, lat: 22.6 },
  PKG: { name: 'Port Klang', kind: 'sea', lon: 101.39, lat: 3.0 },
  LGB: { name: 'Port of Long Beach', kind: 'sea', lon: -118.2, lat: 33.75 },
  HOU: { name: 'Port of Houston', kind: 'sea', lon: -95.27, lat: 29.73 },
  RTM: { name: 'Port of Rotterdam', kind: 'sea', lon: 4.14, lat: 51.95 },
  FXT: { name: 'Port of Felixstowe', kind: 'sea', lon: 1.35, lat: 51.96 },
  LRD: { name: 'Laredo crossing', kind: 'land', lon: -99.5, lat: 27.5 },
};

/** Ocean chokepoints used to draw believable sea lanes. */
const VIA = {
  SIN: [103.85, 1.2], MAL: [98.5, 5.5], BAB: [43.3, 12.6], SUZ: [32.55, 30.0], GIB: [-5.6, 36.0],
  CAPE: [18.5, -35.2], DOVER: [1.6, 51.0], LANKA: [80.5, 5.6], USW: [-125, 33], FINW: [19.0, 60.5],
};

const pt = (o) => [o.lon, o.lat];
const GULF = [[-76, 25.5], [-80.5, 24.3], [-85, 25]];

/**
 * Build the legs of a delivery. Returns { mode, outbound: [lon,lat][], gateway, haul: [lon,lat][] }.
 * outbound runs supplier → destination gateway; haul runs gateway → site.
 * opts.cape routes Asia–Europe sea freight via the Cape instead of Suez.
 */
export function lane(sup, site, mode, opts = {}) {
  const s = typeof sup === 'string' ? supplier(sup) : sup;
  const from = pt(s);
  const eu = site.id !== 'TX1';
  const asia = ['TW', 'MY', 'TH', 'KR'].includes(s.cc);
  const americas = ['US', 'MX'].includes(s.cc);
  if (mode === 'air') {
    const og = s.cc === 'TW' || s.cc === 'KR' ? 'TPE' : s.cc === 'MY' ? 'PEN' : s.cc === 'TH' ? 'BKK' : s.cc === 'MX' ? 'GDL' : 'SJC';
    const dg = site.air;
    const out = [from, pt(GATEWAYS[og])];
    if (!eu && asia) out.push(pt(GATEWAYS.ANC));
    out.push(pt(GATEWAYS[dg]));
    return { mode, gateway: dg, outbound: out, haul: [pt(GATEWAYS[dg]), pt(site)] };
  }
  if (mode === 'sea') {
    if (asia && !eu) {
      const og = s.cc === 'MY' || s.cc === 'TH' ? 'PKG' : 'KHH';
      return { mode, gateway: 'LGB', outbound: [from, pt(GATEWAYS[og]), [150, 35], VIA.USW, pt(GATEWAYS.LGB)], haul: [pt(GATEWAYS.LGB), [-112, 33.4], pt(site)] };
    }
    if (asia && eu) {
      const og = s.cc === 'MY' || s.cc === 'TH' ? 'PKG' : 'KHH';
      const west = opts.cape ? [VIA.LANKA, VIA.CAPE, [-10, 0], [-12, 36]] : [VIA.LANKA, VIA.BAB, VIA.SUZ, [20, 34.5], VIA.GIB];
      const dg = site.ocean;
      return { mode, gateway: dg, outbound: [from, pt(GATEWAYS[og]), VIA.SIN, VIA.MAL, ...west, [-9.5, 43.5], VIA.DOVER, pt(GATEWAYS[dg])], haul: [pt(GATEWAYS[dg]), pt(site)] };
    }
    if (!americas && !eu) { // Europe → Texas
      const out = [from];
      if (s.cc === 'FI') out.push(VIA.FINW, [12.5, 56.2]);
      out.push(pt(GATEWAYS.RTM), VIA.DOVER, [-30, 40], ...GULF, pt(GATEWAYS.HOU));
      return { mode, gateway: 'HOU', outbound: out, haul: [pt(GATEWAYS.HOU), pt(site)] };
    }
    if (americas && eu) {
      return { mode, gateway: site.ocean, outbound: [from, pt(GATEWAYS.HOU), ...GULF.slice().reverse(), [-30, 40], VIA.DOVER, pt(GATEWAYS[site.ocean])], haul: [pt(GATEWAYS[site.ocean]), pt(site)] };
    }
  }
  // land (truck), possibly with a border crossing or a short sea/ferry leg
  if (s.cc === 'MX' && !eu) return { mode: 'land', gateway: 'LRD', outbound: [from, pt(GATEWAYS.LRD)], haul: [pt(GATEWAYS.LRD), pt(site)] };
  if (americas && !eu) return { mode: 'land', gateway: null, outbound: [from], haul: [from, pt(site)] };
  if (!americas && eu) return { mode: 'land', gateway: null, outbound: [from], haul: [from, pt(site)] };
  return lane(s, site, 'sea', opts);
}

// ---------- geometry ----------
const R = Math.PI / 180;
export function gcDistKm(a, b) {
  const [l1, p1] = [a[0] * R, a[1] * R], [l2, p2] = [b[0] * R, b[1] * R];
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Slerp between two lon/lat points. */
function slerp(a, b, f) {
  const [l1, p1] = [a[0] * R, a[1] * R], [l2, p2] = [b[0] * R, b[1] * R];
  const v1 = [Math.cos(p1) * Math.cos(l1), Math.cos(p1) * Math.sin(l1), Math.sin(p1)];
  const v2 = [Math.cos(p2) * Math.cos(l2), Math.cos(p2) * Math.sin(l2), Math.sin(p2)];
  const dot = Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
  const w = Math.acos(dot);
  if (w < 1e-9) return [a[0], a[1]];
  const s1 = Math.sin((1 - f) * w) / Math.sin(w), s2 = Math.sin(f * w) / Math.sin(w);
  const x = s1 * v1[0] + s2 * v2[0], y = s1 * v1[1] + s2 * v2[1], z = s1 * v1[2] + s2 * v2[2];
  return [Math.atan2(y, x) / R, Math.atan2(z, Math.hypot(x, y)) / R];
}
/** Densify a polyline along great circles so it hugs the globe. */
export function densify(points, stepKm = 220) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const n = Math.max(1, Math.ceil(gcDistKm(a, b) / stepKm));
    for (let k = 1; k <= n; k++) out.push(slerp(a, b, k / n));
  }
  return out;
}
/** Cumulative fractional distance along a polyline, for moving things along it. */
export function measure(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + gcDistKm(path[i - 1], path[i]));
  const total = cum[cum.length - 1] || 1;
  return { path, cum: cum.map(c => c / total), km: total };
}
export function along(m, f) {
  const { path, cum } = m;
  if (path.length === 1 || f <= 0) return path[0];
  if (f >= 1) return path[path.length - 1];
  let i = 1;
  while (i < cum.length - 1 && cum[i] < f) i++;
  const seg = (f - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
  return slerp(path[i - 1], path[i], seg);
}
/** Sub-path between fractions f0..f1 (used for trails). */
export function slice(m, f0, f1) {
  const { path, cum } = m;
  const out = [along(m, Math.max(0, f0))];
  for (let i = 0; i < path.length; i++) if (cum[i] > f0 && cum[i] < f1) out.push(path[i]);
  out.push(along(m, Math.min(1, f1)));
  return out;
}
