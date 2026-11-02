# Neocloud Supply OS

An AI-native, agent-first operating system for a neocloud's entire supply chain. It
covers GPU and hardware sourcing, data center construction, logistics and deployment,
asset lifecycle, and continuous third-party risk and resilience. It is designed from a
greenfield to replace a ~140-application legacy portfolio with one integrated platform.

**Status:** concept draft, awaiting human review. No code yet.

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
- [ ] Human review of CONCEPT-IDEA (sign-off box in the doc)
- [ ] `SPECIFICATION.md`: CoLab prompt #2
- [ ] `PLAN.md`: CoLab prompt #3
- [ ] `BACKLOG.md`: CoLab prompt #4

## Credits

- Startup process and template: Ethical Tech CoLab `project-startup-guide`.
- Sayari MCP usage patterns: the CoLab *Trace the Unseen* build day, especially the
  supplier-risk screening playbook in `isislcn/Hazard-and-Suppliers`.
- Full source list: [CONCEPT-IDEA.md, Appendix M](CONCEPT-IDEA.md#appendix-m--sources-and-materials-used).
