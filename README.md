# Neocloud Supply OS

An AI-native, agent-first operating system for a neocloud's entire supply chain. It
covers GPU and hardware sourcing, data center construction, logistics and deployment,
asset lifecycle, and continuous third-party risk and resilience. It is designed from a
greenfield to replace a ~140-application legacy portfolio with one integrated platform.

**Status:** concept reviewed and signed off. Specification drafted and awaiting human review
(30 open questions, 11 of them blocking). A static demo website is built; no production code
yet.

**Live demo:** <https://yorkerhodes3.github.io/neocloud-supply-os/> (served from `docs/`
once GitHub Pages is enabled; see [Deploying](#deploying-the-site)).

## Start here

➡️ **[CONCEPT-IDEA.md](CONCEPT-IDEA.md)**

| Read | For |
| --- | --- |
| Sections 1–4 | The pitch, the problem, who it's for, and the idea (including two "day in the life" walkthroughs) |
| Sections 5–10 | Success metrics, out of scope, constraints, alternatives, open questions, assumptions |
| Appendix A | Capability map: 80 functions aligned to SCOR DS (Orchestrate, Plan, Order, Source, Transform, Fulfill, Return), plus Build and Risk |
| Appendix B | 36 agent "desks", topology, and desk charters as code |
| Appendix C | Platform architecture: Supply Graph, Ledger, Policy Engine, write path, latency budget |
| Appendix D | Risk and resilience backbone using **Sayari MCP** |
| Appendix E | Agent-first supplier engagement: connectivity tiers, message types, Supplier and Hardware Passports |
| Appendices F–I | Data model, end-to-end flows, human operating model, governance and controls |
| Appendices J–M | Legacy collapse map, resilience scenario library, phased roadmap, sources |

➡️ **[SPECIFICATION.md](SPECIFICATION.md)**: the v1 specification (Roadmap Phases 0–2): user stories, functional and non-functional requirements, data model, controls and open questions. Draft, pending human review.

## The demo website (`docs/`)

A static site with no build step and no tracking. It is built on the Ethical Tech CoLab
design system, and every colour, font and radius is a CSS variable. It renders the
reviewed concept's own tables (`npm run build:data`) instead of paraphrasing them.

| Page | What it shows |
| --- | --- |
| [`index.html`](docs/index.html) | The solution: 80 SCOR-aligned functions, 36 agent desks, platform, Sayari risk backbone, supplier engagement tiers, controls, roadmap |
| [`simulate.html`](docs/simulate.html) | **Agentic simulation**, after the CoLab 3D evacuation sim. A deck.gl globe and campus view where an agent-native operation and a legacy one run side by side on the same seeded world through 16 disruptions, with a live scoreboard, ledger, decisions and desks. `?scenario=8&seed=42` links reproduce a run |
| [`negotiate.html`](docs/negotiate.html) | **Negotiation room**, after the CoLab Diplomacy Table and `diplomatic-simulator`. Four deterministic deals (A–D) run agent to agent inside a signed mandate, with a tactic detector (two prohibited tactics), private caucus channels, human escalation, utility space, ZOPA and Monte Carlo. Table E replays a real recorded CoLab session read-only |
| [`method.html`](docs/method.html) | What is real, modelled, illustrative or fictional; engine assumptions; a live baseline check; limits; lineage |
| [`brand.html`](docs/brand.html) | **Brand kit**: 12 presets (CoLab, CoLab Daylight, CoreWeave, Nebius, OpenAI, Lambda, Crusoe, Together AI, Nscale, Fluidstack, Vultr, Voltage Park), live WCAG checks, and a custom theme builder with JSON and CSS export |

**Swap brands for a demo:** add `?brand=<id>` to any page URL (for example
`simulate.html?brand=coreweave&scenario=8`), or pick a theme from the switcher in the
header. To add a brand permanently, export JSON from the builder into `BRANDS` in
[`docs/assets/js/themes.js`](docs/assets/js/themes.js). `test/theme.test.mjs` then
enforces contrast, provenance and self-hosted fonts.

> **Brand themes are approximations for demo dressing only.** They are not affiliated
> with or endorsed by any company. They use no logos. Proprietary typefaces are
> replaced with open-licensed look-alikes (for example Gramatika → Space Grotesk,
> OpenAI Sans → Inter, Suisse → Archivo). Each preset records its sources and a
> confidence rating; Nscale is low confidence. Swap in the official brand guide before
> showing a theme to that company.

> **All data on the site is simulated.** Suppliers, counterparties and Sayari-style risk
> signals are fictional. The only real record is the CoLab Diplomacy Table session
> replayed in table E, used under its licence (`docs/assets/runs/`).

### Develop

```bash
npm test             # 53 tests: simulation engine, negotiation engine and detector, theme contrast
npm run serve        # http://127.0.0.1:8765/
npm run build:data   # regenerate docs/assets/js/data/concept.js from CONCEPT-IDEA.md
```

No dependencies to install. Node 20+ for the tests, Python 3 for `serve`. deck.gl and
all fonts are vendored under `docs/assets/` with their licences.

### Deploying the site

`.github/workflows/deploy-pages.yml` runs the tests, checks that the site data matches
`CONCEPT-IDEA.md`, then publishes `docs/` on every push to `main`. To turn it on, go to
**Settings → Pages → Source: GitHub Actions**. Or choose **Deploy from a branch → `main` /
`docs`**, which needs no workflow. Pages on a private repository needs a paid GitHub
plan.

## The core idea, in five lines

1. **One graph, one ledger, one policy engine.** Every agent reads from and writes to the
   same source of truth.
2. **Agents are desks with charters and mandates.** Their authority is scoped, capped,
   revocable and audited.
3. **Suppliers are engaged agent to agent** wherever possible, with email and portal
   fallbacks handled by the same agent.
4. **Risk is a continuous signal layer**, not a periodic questionnaire. Sayari supplies the
   entity, ownership and trade graph.
5. **Humans set intent, hold relationships and make the hard calls.** Autonomy is earned
   desk by desk on evidence.

## Method

This repo follows the
[Ethical Tech CoLab project-startup-guide](https://github.com/Ethical-Tech-CoLab/project-startup-guide):
**think in documents, review with a human, then build.**

- [x] `CONCEPT-IDEA.md`: drafted
- [x] Human review of CONCEPT-IDEA (sign-off box in the doc): completed by the author, 2026-11-02
- [x] `SPECIFICATION.md`: drafted (CoLab prompt #2), pending human review
- [ ] Human review of SPECIFICATION (sign-off box in the doc; see §12 for the 11 blocking questions)
- [ ] `PLAN.md`: CoLab prompt #3
- [ ] `BACKLOG.md`: CoLab prompt #4

## Credits

- Startup process and template: Ethical Tech CoLab `project-startup-guide`.
- Sayari MCP usage patterns: the CoLab *Trace the Unseen* build day, especially the
  supplier-risk screening playbook in `isislcn/Hazard-and-Suppliers`.
- Simulation concepts: the CoLab 3D evacuation simulation. Negotiation concepts: the CoLab
  [`diplomatic-simulator`](https://github.com/Ethical-Tech-CoLab/diplomatic-simulator) and
  Diplomacy Table. Site design: the Ethical Tech CoLab website design system.
- Full source list: [CONCEPT-IDEA.md, Appendix M](CONCEPT-IDEA.md#appendix-m--sources-and-materials-used).
