// Third-party risk provider registry. The design names no provider: every mention in the
// documents is the variable RISK_PROVIDER, and every risk call goes through a canonical
// capability that this registry maps to the configured provider's native tool.
//
// Add a provider: copy the `generiq` entry, give it a new key, fill `tools` and `factors`
// with what its public documentation shows, and set `basis` honestly per tool. Nothing else
// changes: the switcher, the provider kit page, the simulation log and the tests pick it up.
// Pure data and functions, no DOM, so Node tests and the simulation engine can import it.

export const TOKEN = 'RISK_PROVIDER';
export const DEFAULT_PROVIDER = 'generiq';
export const CHECKED = '2026-11-04';

// The provider-neutral interface every desk codes against. Verbs follow the convergence
// seen in the two public interfaces (Sayari SDK, Tradeverifyd OpenAPI); see Appendix D0.
export const CAPABILITIES = [
  { id: 'search_entities', label: 'Find candidate records', q: 'Who might this be?', args: 'name, country', desks: 'Scout, Onboarder' },
  { id: 'resolve_entity', label: 'Resolve by identifier', q: 'Who is this, really?', args: 'LEI | registry no. | name+address', desks: 'Onboarder' },
  { id: 'get_entity', label: 'Read a profile', q: 'What do we know?', args: 'entity_id', desks: 'Onboarder, Mapper' },
  { id: 'get_ownership', label: 'Ownership and control', q: 'Who owns and controls it?', args: 'entity_id, depth', desks: 'Onboarder, Screener' },
  { id: 'get_supplier_network', label: 'Supplier tiers', q: 'Who supplies whom?', args: 'entity_id, depth, direction', desks: 'Mapper' },
  { id: 'trace_upstream', label: 'Upstream product chain', q: 'Where does this part come from?', args: 'entity_id, product | HS code', desks: 'Mapper, Provenance' },
  { id: 'search_shipments', label: 'Shipment records', q: 'What actually moved?', args: 'entity_id, period', desks: 'Mapper, Customs' },
  { id: 'screen_entity', label: 'Screen against risk lists', q: 'What risk attaches?', args: 'entity_id, categories', desks: 'Screener' },
  { id: 'get_risk_taxonomy', label: 'Risk catalogue', q: 'What do the flags mean?', args: '—', desks: 'Screener' },
  { id: 'list_risk_events', label: 'Disruption events', q: 'What is happening near them?', args: 'entity_id | region, types, since', desks: 'Watchtower, Resilience' },
  { id: 'subscribe_alerts', label: 'Continuous monitoring', q: 'Tell us when it changes', args: 'entity_ids, categories', desks: 'Watchtower, Screener' },
];
export const CAP = Object.fromEntries(CAPABILITIES.map(c => [c.id, c]));

// Internal signals (CONCEPT-IDEA.md D3). Providers map their own categories onto these.
export const SIGNALS = [
  { id: 'sanctions', label: 'Sanctions exposure' },
  { id: 'export_control', label: 'Export-control proximity' },
  { id: 'forced_labour', label: 'Forced labour' },
  { id: 'opaque_ownership', label: 'Opaque ownership' },
  { id: 'state_influence', label: 'State influence' },
  { id: 'regulatory', label: 'Regulatory history' },
  { id: 'child_labour', label: 'Child labour' },
  { id: 'disruption', label: 'Operational disruption' },
  { id: 'financial', label: 'Financial distress or crime' },
  { id: 'cyber', label: 'Cyber exposure' },
];

// How we know a native name. Shown on every tool so the demo never overstates.
export const BASIS = {
  canonical: { label: 'canonical', tip: 'The neutral interface itself. GenerIQ implements it exactly.' },
  documented: { label: 'documented', tip: 'Verbatim from the provider’s public SDK or OpenAPI file, as checked on ' + CHECKED + '.' },
  reference: { label: 'reference build', tip: 'Seen in the CoLab Trace the Unseen reference build’s MCP connector; not found in public docs on ' + CHECKED + '. Verify (OQ-10).' },
  announced: { label: 'name unpublished', tip: 'The provider has announced the capability, but publishes no tool or endpoint name. The canonical name stands in, marked with ~.' },
  none: { label: 'no public interface', tip: 'No public API or MCP surface was found. Integration would be by contract; the canonical name stands in, marked with ~.' },
};
export const SUPPORT = { full: 'full', partial: 'partial', gap: 'gap', unknown: 'unknown' };

const T = (native, o = {}) => ({ native, via: 'mcp', basis: 'documented', support: 'full', ...o });

export const PROVIDERS = {
  generiq: {
    name: 'GenerIQ', short: 'GenerIQ', ns: 'generiq', kind: 'generic',
    focus: 'Generic third-party risk provider: a neutral demo label for any provider that implements the canonical interface',
    channel: { mcp: 'Canonical MCP server (illustrative)', api: 'Canonical REST mirror (illustrative)' },
    confidence: 'n/a', fictional: true,
    sources: [],
    tools: Object.fromEntries(CAPABILITIES.map(c => [c.id, T(c.id, { basis: 'canonical' })])),
    factors: {
      sanctions: ['sanctioned', 'sanctioned_adjacent'], export_control: ['export_control_adjacent'],
      forced_labour: ['forced_labour_listed', 'forced_labour_adjacent'], opaque_ownership: ['opaque_ownership'],
      state_influence: ['state_owned_adjacent'], regulatory: ['regulatory_action'], child_labour: ['child_labour'],
      disruption: ['hazard', 'logistics', 'shortage'], financial: ['financial_distress'], cyber: ['cyber_incident'],
    },
    notes: ['Use GenerIQ when the audience should not see any vendor name, or as the reference for a new provider entry.'],
  },

  sayari: {
    name: 'Sayari', short: 'Sayari', ns: 'sayari', kind: 'vendor',
    focus: 'Entity, ownership and trade graph across 250+ jurisdictions',
    channel: { mcp: 'Graph MCP used in the CoLab reference build; no public Graph MCP found (a docs-search MCP exists)', api: 'REST API with Python, Node and Go SDKs (beta), OAuth2 client credentials' },
    confidence: 'high (API) · reference (MCP)',
    sources: [
      { label: 'sayari-python SDK (client methods)', url: 'https://github.com/sayari-analytics/sayari-python' },
      { label: 'Sayari API documentation', url: 'https://documentation.sayari.com/' },
      { label: 'CoLab reference build: Hazard-and-Suppliers playbook', url: 'https://github.com/isislcn/Hazard-and-Suppliers/blob/main/docs/supplier-risk-screening-playbook.md' },
    ],
    tools: {
      search_entities: T('search_entities', { basis: 'reference', api: 'search.search_entity', note: 'Run search_entity_facets first for broad names (reference build).' }),
      resolve_entity: T('resolution.resolution', { via: 'api', api: 'resolution.resolution' }),
      get_entity: T('get_entity_profile', { basis: 'reference', api: 'entity.get_entity' }),
      get_ownership: T('traversal.ubo', { via: 'api', api: 'traversal.ubo · traversal.ownership' }),
      get_supplier_network: T('traverse_network', { basis: 'reference', api: 'traversal.traversal', note: 'relationships=["receives_from"]; label the tier on every edge.' }),
      trace_upstream: T('get_upstream_supply_chain', { basis: 'reference', api: 'supply_chain.upstream_trade_traversal', note: 'Timed out unfiltered and HS filters returned nothing over MCP in the reference build: use the API path (FR-RSP-005).' }),
      search_shipments: T('trade.search_shipments', { via: 'api', api: 'trade.search_shipments' }),
      screen_entity: T('traversal.watchlist', { via: 'api', api: 'traversal.watchlist', note: 'Risk factors also arrive on the entity profile.' }),
      get_risk_taxonomy: T('lookup_risk_factors', { basis: 'reference', api: 'ontology.get_risk_factors' }),
      list_risk_events: T('negative_news.negative_news', { via: 'api', api: 'negative_news.negative_news', support: 'partial', note: 'Adverse media only. Hazards come from GDACS.' }),
      subscribe_alerts: T('notifications.project_notifications', { via: 'api', api: 'notifications.*', support: 'partial', note: 'Project-scoped notifications.' }),
    },
    factors: {
      sanctions: ['sanctioned', 'sanctioned_adjacent'], export_control: ['export_controls_adjacent'],
      forced_labour: ['forced_labor_uflpa_*', 'forced_labor_sheffield_hallam_*', 'forced_labor_aspi_*', 'forced_labor_xinjiang_*', 'forced_labor_wro_*', 'exports_ilab_forced_labor', '*_forced_labor_reports_entity_adjacent'],
      opaque_ownership: ['controlled_by_mass_business_registration', 'mass_address_usage', 'owned_by_tcsp_keyword_risk'],
      state_influence: ['soe_adjacent'], regulatory: ['regulatory_action'], child_labour: ['exports_ilab_child_labor'],
      disruption: [], financial: [], cyber: ['reputational_risk_cybercrime'],
    },
    notes: [
      'Count only flags on the entity’s own record; psa_ (“possibly same as”) flags are prompts, never counts.',
      'basel_aml, cpi_score and eu_high_risk_third are country context, not entity flags.',
      'Factories are sometimes typed as “person”; treat supplier type as unconfirmed.',
      'Large groups fragment across trade-name variants: resolve the importer of record.',
    ],
  },

  tradeverifyd: {
    name: 'Tradeverifyd', short: 'Tradeverifyd', ns: 'tradeverifyd', kind: 'vendor',
    focus: 'Trade traceability: entity graph, shipments, risk events and verifiable credentials for customs',
    channel: { mcp: 'No public MCP server found (CoLab builds wrapped the API as an MCP tool)', api: 'REST API, OpenAPI v0.2.0 at api.tradeverifyd.com, subscription-key header' },
    confidence: 'high (API)',
    sources: [
      { label: 'tradeverifyd-api openapi.json (v0.2.0)', url: 'https://github.com/tradeverifyd/tradeverifyd-api' },
      { label: 'CoLab build: The-Forest (Tradeverifyd MCP wrapper)', url: 'https://github.com/zglyn/The-Forest' },
    ],
    tools: {
      search_entities: T('search_entities', { via: 'api', path: 'GET /v1/search/entities' }),
      resolve_entity: T('resolve_entity', { via: 'api', path: 'GET /v1/resolve/entity' }),
      get_entity: T('get_entity', { via: 'api', path: 'GET /v1/entities/{entity_id}' }),
      get_ownership: T('get_entity_graph', { via: 'api', path: 'GET /v1/entities/{entity_id}/graph', support: 'partial', note: 'Ownership edges (IS_MAJORITY_SHAREHOLDER_OF, IS_THE_PARENT_COMPANY_OF…) inside the general graph; no UBO call.' }),
      get_supplier_network: T('get_entity_graph', { via: 'api', path: 'GET /v1/entities/{entity_id}/graph', note: 'IS_SUPPLIER_OF, SHIPS_GOODS_TO, FEEDS_FROM; direction upstream or downstream.' }),
      trace_upstream: T(null, { via: 'api', support: 'gap', fallback: 'graph walk + shipments', note: 'No product or HS-filtered upstream call; walk the graph and filter shipments.' }),
      search_shipments: T('get_shipments', { via: 'api', path: 'GET /v1/shipments' }),
      screen_entity: T('get_entity_graph_flagged_relationships', { via: 'api', path: 'GET /v1/entities/{entity_id}/graph/flagged_relationships', support: 'partial', note: 'Flags on the entity and its relationships; sanctions lists still come from official lists.' }),
      get_risk_taxonomy: T('get_flags_types', { via: 'api', path: 'GET /v1/flags/types' }),
      list_risk_events: T('get_entity_risk_events', { via: 'api', path: 'GET /v1/entities/{entity_id}/risk_events · GET /v1/risk_events' }),
      subscribe_alerts: T(null, { via: 'api', support: 'gap', fallback: 'scheduled re-screen', note: 'No subscription endpoint; schedule our own polling.' }),
    },
    factors: {
      sanctions: ['economic_sanction', 'embargo'], export_control: [], forced_labour: ['forced_labor'],
      opaque_ownership: [], state_influence: [], regulatory: ['regulatory', 'regulatory_compliance_flag'], child_labour: ['child_labor'],
      disruption: ['earthquake', 'flood', 'hurricane', 'wildfire', 'port_congestion', 'strike', 'component_shortage', 'semiconductor_shortage', 'military_conflict', 'political_unrest'],
      financial: ['financial_fraud', 'financial_crimes'], cyber: ['cyber_attack', 'data_breach'],
    },
    notes: ['Risk events are typed (RiskEvent.type) with review_status; DataStatus carries a seven-step confidence scale.', 'Shipments carry supplier information requests and CBP requests: useful evidence for scenario 9 (detention).'],
  },

  resilinc: {
    name: 'Resilinc', short: 'Resilinc', ns: 'resilinc', kind: 'vendor',
    focus: 'Multi-tier supplier, site and part mapping with EventWatch disruption monitoring',
    channel: { mcp: 'MCP and A2A announced with Agent Factory (2026-03-18); Copilot plugin (2026-10-09); no public tool list', api: 'Developer API advertised; no public reference' },
    confidence: 'low (names unpublished)',
    sources: [
      { label: 'Resilinc Developer API page', url: 'https://www.resilinc.ai/solutions/developer-api/' },
      { label: 'Resilinc Microsoft Copilot press release (2026-10-09)', url: 'https://www.resilinc.ai/press-release/resilinc-brings-supply-chain-risk-and-compliance-intelligence-into-microsoft-copilot/' },
    ],
    tools: {
      search_entities: T(null, { basis: 'announced', support: 'unknown' }),
      resolve_entity: T(null, { basis: 'announced', support: 'unknown' }),
      get_entity: T(null, { basis: 'announced' }),
      get_ownership: T(null, { basis: 'announced', support: 'gap', fallback: 'second source', note: 'Ownership and UBO are not a stated focus.' }),
      get_supplier_network: T(null, { basis: 'announced', note: 'Multi-tier supplier and site mapping is the core product.' }),
      trace_upstream: T(null, { basis: 'announced', support: 'partial', note: 'Part-to-site mapping rather than trade records.' }),
      search_shipments: T(null, { basis: 'announced', support: 'gap', fallback: 'trade-data source' }),
      screen_entity: T(null, { basis: 'announced', support: 'partial', note: 'Compliance intelligence; sanctions status from official lists.' }),
      get_risk_taxonomy: T(null, { basis: 'announced', support: 'unknown' }),
      list_risk_events: T(null, { basis: 'announced', note: 'EventWatch: natural, geopolitical, supplier financial and labour events.' }),
      subscribe_alerts: T(null, { basis: 'announced', note: 'Event alerts against mapped sites and parts.' }),
    },
    factors: {
      sanctions: ['compliance (category; ids not public)'], export_control: [], forced_labour: ['compliance (category; ids not public)'],
      opaque_ownership: [], state_influence: [], regulatory: ['compliance (category; ids not public)'], child_labour: [],
      disruption: ['EventWatch event types (not public)'], financial: ['supplier financial risk (not public)'], cyber: [],
    },
    notes: ['Exact tool and endpoint names are available to licensed customers only; confirm them with the account team before mapping (OQ-10).'],
  },

  exiger: {
    name: 'Exiger', short: 'Exiger', ns: 'exiger', kind: 'vendor',
    focus: 'Third-party and supply chain risk (1Exiger, DDIQ): due diligence, mapping, trade compliance, software supply chain',
    channel: { mcp: 'None found', api: 'No public developer portal, API reference or SDK (API-Evangelist profile, 2026-07)' },
    confidence: 'low (no public interface)',
    sources: [
      { label: 'API-Evangelist provider profile: Exiger', url: 'https://providers.apievangelist.com/providers/exiger/' },
    ],
    tools: {
      search_entities: T(null, { via: 'platform', basis: 'none' }),
      resolve_entity: T(null, { via: 'platform', basis: 'none' }),
      get_entity: T(null, { via: 'platform', basis: 'none' }),
      get_ownership: T(null, { via: 'platform', basis: 'none', note: 'DDIQ due diligence covers ownership.' }),
      get_supplier_network: T(null, { via: 'platform', basis: 'none', note: 'Supply chain mapping in 1Exiger.' }),
      trace_upstream: T(null, { via: 'platform', basis: 'none', support: 'unknown' }),
      search_shipments: T(null, { via: 'platform', basis: 'none', support: 'unknown' }),
      screen_entity: T(null, { via: 'platform', basis: 'none', note: 'Sanctions and adverse-media screening (DDIQ).' }),
      get_risk_taxonomy: T(null, { via: 'platform', basis: 'none', support: 'unknown' }),
      list_risk_events: T(null, { via: 'platform', basis: 'none', support: 'partial', note: 'Adverse media.' }),
      subscribe_alerts: T(null, { via: 'platform', basis: 'none', support: 'unknown' }),
    },
    factors: {
      sanctions: ['sanctions screening (DDIQ; ids not public)'], export_control: ['trade compliance (ids not public)'], forced_labour: [],
      opaque_ownership: ['ownership due diligence (ids not public)'], state_influence: [], regulatory: [], child_labour: [],
      disruption: ['adverse media (ids not public)'], financial: [], cyber: ['software supply chain / SBOM (ids not public)'],
    },
    notes: ['Integration would be contractual (batch export or a private API). Until then the connector is a twin plus manual evidence import.'],
  },
};

export const PROVIDER_ORDER = ['generiq', 'sayari', 'tradeverifyd', 'resilinc', 'exiger'];

/** Add or replace a provider at runtime (for forks and live demos). */
export function registerProvider(id, def) {
  for (const c of CAPABILITIES) def.tools[c.id] ||= T(null, { basis: 'none', support: 'unknown' });
  for (const s of SIGNALS) def.factors[s.id] ||= [];
  PROVIDERS[id] = { kind: 'vendor', ns: id, short: def.name, ...def };
  if (!PROVIDER_ORDER.includes(id)) PROVIDER_ORDER.push(id);
  return PROVIDERS[id];
}

/** A white-label provider: GenerIQ's interface under any display name. */
export function labelProvider(name) {
  const g = PROVIDERS.generiq;
  const ns = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'custom';
  return { ...g, name, short: name, ns, kind: 'custom', focus: `${name}: a white-label provider on the canonical interface` };
}

export const provider = (id) => PROVIDERS[id] || PROVIDERS[DEFAULT_PROVIDER];

/** The tool entry a desk would call, with a display name that never overstates. */
export function tool(p, cap) {
  const t = p.tools[cap];
  const stand = !t.native;
  return { ...t, cap, stand, shown: t.support === 'gap' ? null : (stand ? `~${cap}` : t.native) };
}

/** One log line for a canonical call, e.g. `sayari: search_entities("X", TW)`. */
export function call(p, cap, args = '') {
  const t = tool(p, cap);
  if (t.support === 'gap') return `${p.ns}: no ${cap} → ${t.fallback || 'second source'}`;
  return `${p.ns}: ${t.shown}(${args})`;
}

/** A chain of calls joined the way desks log them. */
export const chain = (p, steps) => steps.map(([cap, args], i) => {
  const s = call(p, cap, args);
  return i ? s.replace(`${p.ns}: `, '') : s;
}).join(' → ');

/** Native factor ids for an internal signal, or a marked gap. */
export function factors(p, signal) {
  const f = p.factors[signal] || [];
  return f.length ? f : null;
}

/** Coverage counts used by the provider kit and the tests. */
export function coverage(p) {
  const out = { full: 0, partial: 0, gap: 0, unknown: 0, named: 0 };
  for (const c of CAPABILITIES) { const t = p.tools[c.id]; out[t.support]++; if (t.native) out.named++; }
  return out;
}

/** Replace the RISK_PROVIDER token in plain text. */
export const fill = (s, p) => String(s ?? '').replaceAll(TOKEN, p.name);
