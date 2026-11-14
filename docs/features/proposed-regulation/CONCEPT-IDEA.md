# CONCEPT-IDEA: Proposed Regulation simulation

| Field | Value |
| --- | --- |
| Status | Draft; feature proposal, not a reviewed compliance determination |
| Created / research as-of | 2026-11-14 |
| Parent concept | [Neocloud Supply OS](../../../CONCEPT-IDEA.md) |
| Parent specification | [SPECIFICATION.md](../../../SPECIFICATION.md) |
| Feature specification | [SPECIFICATIONS.md](./SPECIFICATIONS.md) |
| Demo | [Proposed Regulation section](../../simulate.html#proposed-regulation) |

> Think in documents, review with a human, then build. This demo makes a proposal
> testable; it does not promote either this concept or regulatory intelligence into
> approved production policy.

## 1. One-sentence pitch

Turn a new piece of regulatory intelligence into an evidence-carrying, isolated
deployment scenario before it becomes a supply-chain surprise.

## 2. The problem

New regulation often matters before it becomes law: equipment qualification,
allocation, design freezes and utility commitments happen years before a hall opens.
A new optics restriction could strand an otherwise complete GPU rack. A familiar
Western equipment brand says little about who made its internal components.

There is also a different failure mode: treating a report, introduced bill or supplier
risk signal as an operative ban. The system must separate **legal lifecycle**,
**evidence confidence**, **manufacturing origin**, **ownership**, **equipment
authorization** and **customer/system scope**, rather than collapse them into a
single "Chinese = blocked" flag.

## 3. Who it is for

Supply-chain planners compare sourcing and schedule choices; network and facility
engineers assess redesign; compliance and legal verify scope and authorities; the
exception desk approves modelled mitigation. Students investigate actual parts and
entity/component paths with Sayari or another configured RISK_PROVIDER and return
sanitized, attributable findings that can replace the demo's synthetic inputs.

## 4. The idea

Add a **Proposed Regulation** section to the existing simulation. An analyst records
intelligence and its sources, makes uncertain terms explicit, chooses a planning
window, and injects a versioned branch over the selected disruption. The branch and
its no-proposal comparator share the same seed, sites and physical assumptions.

The first demo uses the supplied concern about Chinese optical transceivers:

1. Start with a **reported**, not enacted, restriction on **new 3.2T models** in
   US deployments, with an **assumed 65% US BOM-value exemption**.
2. Set day 0 to January 1, 2028, signal arrival to day 20, and assumed enforcement
   to day 60. These dates and the 30-day qualification / 12% cost premium are
   illustrative; they are not predictions of a 2028-2029 regulatory timetable.
3. Model all optics lots at the US site as new models with a synthetic Chinese
   component maker and 40% US BOM value. The Malaysian distributor's location does
   not determine manufacturing origin. Other sites are outside the US assumption.
4. Compare affected and unknown lots, dependent GPUs, optics value, all-billable
   dates, late rack-days, cost and revenue. Either approve a simulated compliant
   component redesign with qualification, or wait for evidence/final text.
5. Replace fixtures with student findings. Preserve exact part number, provider
   entity ID, component path, source, as-of date and confidence; label unknowns.

The future-generation branch does not overwrite the original 800G demo inventory.
The 16 existing disruption playbooks remain intact; their sweep excludes this overlay.
Nothing calls a live provider, releases a real PO, creates production holds or changes
official-list membership.

## 5. What is known, and what is not

Primary sources exist for FCC 26-50 and its effective date, S. 5548 as introduced,
the June 2026 InnoLight Section 1260H notice, and the router/inverter actions.
The [specification's source register](./SPECIFICATIONS.md#2-source-register-and-claim-disposition)
records what each source supports and what must still be checked.

No primary source was located for the exact **3.2T / 2028-2029 / 65%** reported
optics proposal. A military-company designation is not itself an FCC designation
or an OFAC sanction. S. 5548 is a bill, not current law, and its five-year clock is
conditional on enactment. Its introduced text includes firmware/software/component
paths, so a hardware-rule limitation must not become a universal firmware exemption.

Research used indexed official text because direct retrieval of government hosts
was unavailable. "Source located" is not full-text legal validation or proof of the
latest status. Students and reviewers must re-check the actual authorities.

## 6. Datacenter design and deployment implications

| Area | Decision this intelligence should inform |
| --- | --- |
| Optics and network | Generation, reach, connector, lane/FEC support, optical link budget, port/radix count, compatibility matrix, cabling and qualified spares |
| Rack-scale design | GPU/NIC/switch/optic BOM paths across an integrator bundle; host branding is insufficient; factory and rack validation must be repeated after a material substitution |
| Cooling and power envelope | Transceiver watts, cooling method, airflow, thermal headroom and power per port; do not assume faster optics or alternate modules are drop-in equivalents |
| Power equipment | Actual inverter subassemblies in BESS, solar and UPS; manufacturing origin, communications controls, conditional approvals and expiry; do not blacklist all transformers or switchgear |
| Management and network access | Consumer-router scope versus datacenter switches, out-of-band access, firmware support and approval renewal before refresh |
| Sites and customers | US/non-US distinction, federal critical-system procurement, new authorizations versus installed base, commissioning windows, maintenance and spare lifecycle |
| Commercial and project controls | Dual-source qualification, allocation, lead times, redesign premium, construction/utility float, contracts, warranty and permit/engineer sign-offs |

These are design-review prompts, not computed electrical/thermal engineering or
legal conclusions. The initial executable model changes only optics delivery and
qualification; network, power and construction reviews remain explicit qualitative
outputs until actual parts, quantities and engineering analysis exist.

## 7. Success and non-goals

Success means an analyst can inject and remove a branch, reproduce its assumption-only
run by link, inspect source/evidence gaps, and explain the delta from the selected
scenario without the proposal. An authorized existing model and an earlier generation
must not be blocked by this new-model assumption; a missing BOM must not be cleared.

Not in this demo: legal advice; automatic production-policy promotion; a live Sayari
integration; confidential/provider-licensed data redistribution; serial-level BOM
ingestion; a full five-year federal procurement simulator; network/thermal design
optimization; assumed bans on every Chinese part; or removal of installed equipment.

## 8. Student workflow

Students identify exact module and host part numbers, resolve manufacturers and
affiliates by identifiers in Sayari, corroborate component paths with actual BOMs
and documents, and distinguish evidence from inference. Country of incorporation,
shipment origin, manufacturer location and BOM-value origin are different fields.

Return a sanitized site-level optics finding in the
[specified JSON shape](./SPECIFICATIONS.md#5-student-analysis-contract). The demo uses
that finding as an assumption for all optics lots at that site, not as a claim about
the synthetic suppliers or a completed investigation of the named real companies.
Missing sites become unknown. Compliance/legal and engineers review any real finding
before an operational decision. Imported findings stay in browser memory and cannot
be shared through the run-link control.

## 9. Open questions for human review

Which authority and final wording will actually govern optics? What is the legally
defined US-value numerator and denominator? What evidence establishes authorization
and device-class scope? Which real parts and end-use/customer systems are in scope?
How long does qualified substitution take for the actual architecture? What provider
fields may be retained or exported under the student's license?

## 10. Relationship to the main system

This extends the parent concept's **G8 regulation-change flow**, **Appendix K scenario
library**, versioned `Regulation` / `Evidence` model, and **FR-FND-007**, **FR-IBB-004**,
**FR-IBP-001 / FR-IBP-004** in the parent specification. The demo is available now;
production integration remains later-phase scope and requires a reviewed feature
specification, legal interpretation and the existing mandate/policy controls.
