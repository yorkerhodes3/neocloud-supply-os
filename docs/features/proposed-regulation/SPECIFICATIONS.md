# SPECIFICATIONS: Proposed Regulation simulation

| Field | Value |
| --- | --- |
| Status / version | Draft / 0.1.0 |
| Created / research as-of | 2026-11-14 |
| Feature concept | [CONCEPT-IDEA.md](./CONCEPT-IDEA.md) |
| Parent concept | [Neocloud Supply OS](../../../CONCEPT-IDEA.md) |
| Parent specification | [SPECIFICATION.md](../../../SPECIFICATION.md) |
| Demo | [Proposed Regulation section](../../simulate.html#proposed-regulation) |

## 1. Scope and safety boundary

Implement a browser-only optics proposal overlay on the deterministic simulation,
not an amendment to live compliance policy. All quantities, costs, counterparties,
qualification periods and deployment outcomes remain illustrative. Real company names
appear in source discussion, not as established suppliers of our synthetic racks.

The simulation may model a reported restriction as though it eventually applies, but
must display that assumption. Legal lifecycle and evidence confidence are independent.
Production lifecycle should distinguish `reported`, `published_proposal`, `enacted`,
`effective`, `withdrawn` and `superseded`, with dated, hashed source evidence and human
interpretation. The demo accepts only `reported`, `proposed` and `hypothetical`; none
can promote itself to enacted/effective policy or create `RegulationVersionPublished`
in a production ledger.

## 2. Source register and claim disposition

**Research limitation:** official primary publications were located through indexed
text on November 14, 2026. Direct web and CLI retrieval of government hosts failed
because their names could not be resolved in this environment. No full document
download, source hash or current legal-status certification was obtained. Re-check
complete current text, dates, conditions and legal scope before operational reliance.

| ID | Primary source / date | What the available official text supports | Disposition / limits |
| --- | --- | --- | --- |
| FCC-26-50 | [FCC Third Report and Order and Third Further Notice](https://docs.fcc.gov/public/attachments/FCC-26-50A1.pdf), adopted July 22 / released July 23, 2026 | Devices incorporating Covered List entities' logic-bearing hardware may be prohibited from authorization where the entity making the whole device would itself be prohibited | Corroborated conditional hardware mechanism, not a universal ban on all components or Western brands. Further proposed measures are not automatically final rules. |
| FR-2026-18535 | [Federal Register final rule, 91 FR 57798](https://www.federalregister.gov/documents/2026/09/11/2026-18535/protecting-against-national-security-threats-to-the-communications-supply-chain-through-the), September 11, 2026 | FCC 26-50 final rule effective October 13, 2026 | Corroborated effective date. New authorizations are the scenario focus; full treatment of modifications, permissive changes and previously authorized devices requires reading the rule. Do not assume mandatory installed-base removal. |
| S-5548 | [Official introduced text](https://www.govinfo.gov/content/pkg/BILLS-119s5548is/xhtml/BILLS-119s5548is.html) and [bill details](https://www.govinfo.gov/app/details/BILLS-119s5548is), September 24, 2026 | Names Zhongji InnoLight and Eoptolink, subsidiaries/affiliates/successors and specified connected entities; includes firmware, software and component paths; five years after enactment | Introduced bill, not operative law established by this research. Critical-system and non-critical-system exceptions must be interpreted in amended Section 5949 context. No five-year clock starts at introduction. |
| FR-2026-11571 | [Defense designation notice, 91 FR 35189](https://www.federalregister.gov/documents/2026/06/10/2026-11571/notice-of-availability-of-designation-of-chinese-military-companies), June 10, 2026, DOD-2026-OS-1288 | Lists Zhongji InnoLight under Section 1260H | Corroborates June designation. Does not establish FCC Covered List membership, OFAC sanctions or a universal procurement prohibition. |
| DA-26-278 | [FCC foreign-produced router addition](https://docs.fcc.gov/public/attachments/DA-26-278A1.pdf), March 23, 2026 | Foreign-produced routers except those with DoW/DHS conditional approval | Corroborates router action. Device-class definition matters, not every datacenter switch. |
| DA-26-286 | [FCC router update waiver](https://docs.fcc.gov/public/attachments/DA-26-286A1.pdf), March 23, 2026 | Indexed text references NIST IR 8425A consumer-grade, primarily residential routers; specified software/firmware updates for authorized devices allowed at least until March 1, 2027 | Do not generalize residential router scope to all leaf/spine, OOB or carrier equipment; verify each device and current waiver. |
| FCC-COVERED-LIST | [FCC Covered List and conditional approval table](https://www.fcc.gov/supplychain/coveredlist), indexed November 6, 2026 | Router model/class approvals with 2027-2028 expirations, e.g. Adtran SDG October 1, 2027; eero October 31, 2027; some WNC models March 6, 2028 | Corroborates the expiry concern, not a common expiry for all routers. Capture exact model/class, approver, date range and conditions. The claim that InnoLight, Eoptolink, Dongshan Precision and TFC are all absent from the latest list was not independently established. |
| DA-26-786 | [FCC inverter / advanced robotic device addition](https://docs.fcc.gov/public/attachments/DA-26-786A1.pdf), July 28, 2026 | Foreign-produced power inverters, except those conditionally approved by DoW/DHS | Corroborates inverter action. Identify real inverter subassemblies; no blanket ban on every UPS, transformer or switchgear assembly follows. |
| DA-26-789 | [FCC inverter software/firmware waiver](https://docs.fcc.gov/public/attachments/DA-26-789A1.pdf), July 28, 2026 | Specified functionality/security updates for authorized devices at least until January 1, 2029 | Scope-specific exception, not a universal exclusion of firmware from all regimes. |

**Reported optics terms:** the [ROC Telecom analysis](https://roctelecom.com/insights/chinese-data-center-component-ban/)
is a secondary lead, not an agency publication. A
[Fusion Worldwide discussion](https://www.fusionww.com/insights/chinese-optical-transceiver-ban-what-procurement-should-know)
also discusses reported optics restrictions and substitution concerns, with a different
generation emphasis. No primary corroboration was located for the exact **3.2T
phase-in**, **2028-2029 ramp** or **65% US-sourced BOM-value exemption**. Keep each as
an independent, editable assumption. Failure to locate a source does not prove that
no proposal exists.

**Firmware claim:** the component rule addresses logic-bearing hardware, but the
brief's blanket "does not cover firmware" characterization was not independently
verified from complete text. S. 5548 expressly covers relevant firmware/software paths,
and router/inverter waivers have their own conditions. Record each legal mechanism
separately.

## 3. Functional requirements

| ID | Requirement / acceptance |
| --- | --- |
| FR-REG-001 | Display a Proposed Regulation section linked from the scenario rail, with the source register, feature documents and explicit simulation-only notice. |
| FR-REG-002 | Accept versioned intelligence title, status, planning start, signal/enforcement days, deployment/first-affected generation, US/all-site scope, optional exemption threshold, qualification duration and cost premium. Invalid input shows a persistent error and does not replace the current branch. |
| FR-REG-003 | Compose the overlay with the selected original scenario; preserve the 16 playbooks and their original sweep. Injecting/removing restarts at day 0 and pauses playback, clears prior manual choices, and rebuilds lockstep runs and projections. |
| FR-REG-004 | Use the same seed, materials/physical draws, presets and provider label for with/without comparisons; generation labels change only inside the proposed branch, not the global 800G material definition. |
| FR-REG-005 | Assess optics lots as affected, unknown, exempt or out-of-scope. Existing authorized models and earlier generations must not be blocked. Unknown origin/authorization or needed BOM-value evidence must not silently become clear. Non-US sites remain outside US scope. |
| FR-REG-006 | All-site reach requires `hypothetical` status and is labeled a stress test, not inferred extraterritorial legal effect. |
| FR-REG-007 | At signal arrival, record a simulation-only `ProposedRegulationInjected` event; after modelled detection (native 0.1 day; legacy triangular 3/7/12 days), request a human planning decision. Do not turn proposed intelligence into sanctions or an official list entry. |
| FR-REG-008 | At/after assumed enforcement, gate affected/unknown new-model optics before shipment as an authorization-readiness proxy. Already-dispatched equipment is not recalled. This is not an actual FCC filing/import workflow. |
| FR-REG-009 | Human may approve modelled compliant component redesign or wait for evidence/final text. Approval holds still-pending candidates for qualification, adds a premium per pending optics lot, then releases only the overlay's hold/gate. Existing unrelated holds/gates are preserved. The same distributor can supply a redesigned component; no verified real alternate is claimed. |
| FR-REG-010 | Display affected/unknown/exempt/out-of-scope lot counts; dependent GPUs and optics value; site/part/manufacturer/generation/reason; and with/without day-240 all-billable dates, schedule delta, late rack-days, premium/tariff/expedite delta and revenue delta for both operating models. |
| FR-REG-011 | Label the impact table an auto-resolved, modelled-human projection, not the outcome of manual decisions. Null completion dates show "not by day 240"; do not compute numeric completion deltas from unknown dates. |
| FR-REG-012 | Encode validated assumption-only configuration in the existing run URL, preserving the selected scenario, seed and presets. Reject malformed/oversized configuration explicitly. Rewind and replay remain deterministic. |
| FR-REG-013 | Import sanitized student findings through JSON, preserving identifiers, evidence path, source, as-of and confidence in browser memory. Import replaces fixtures; missing sites become unknown. Reject duplicate site findings instead of choosing one silently. |
| FR-REG-014 | Never persist, transmit or embed imported findings in URLs; disable run sharing and Monte Carlo export while findings are applied. Source URLs are HTTPS without embedded credentials; findings are escaped as text and never treated as instructions. Clear/reload discards findings. |
| FR-REG-015 | Include qualitative network, rack/cooling, inverter/power, device-class, site/customer, qualification, commissioning and commercial review prompts. Only optics delivery/qualification impacts are quantitatively simulated. |

## 4. Assumption contract and model

```json
{
  "version": 1,
  "title": "Reported Chinese optical-transceiver restriction",
  "status": "reported",
  "startDate": "2028-01-01",
  "signalDay": 20,
  "effectiveDay": 60,
  "generation": "3.2T",
  "minimumGeneration": "3.2T",
  "scope": "us",
  "exemptionPct": 65,
  "qualificationDays": 30,
  "premiumPct": 12
}
```

Dates must be valid ISO calendar dates; day offsets are 0-240 and enforcement cannot
precede signal. Qualification is 1-180 days, percentages 0-100; `exemptionPct: null`
disables the assumed exemption. Generation order is 800G, 1.6T, 3.2T.
All dates represent actual days in a 240-day planning window, not compressed years.
There is no predicted enactment date for S. 5548.

The synthetic fixture uses new optics models, Chinese component manufacture and
40% US BOM value at each site; under US scope only TX1 is eligible. Eight TX1 optics
lots support 64 racks / 4,608 GPUs and $8.8M of optics value. The threshold concerns
the transceiver BOM-value assumption, not the rack's total value or supplier address.

Assessment order: jurisdiction -> generation -> existing authorization -> missing
origin/authorization -> non-CN manufacturing -> missing needed US value ->
threshold exemption -> affected. This simplified reported-origin model does **not**
screen ownership or implement FCC 26-50 / S. 5548 legal tests. A student relationship
path is evidence for review, not executable legal reach.

The model does not compute enactment probability. "Wait" leaves the assumed new-model
shipment gate active; this represents a conservative readiness/evidence scenario, not
a compulsory legal hold in the real world. "Redesign" assumes unknown evidence is
resolved and a compliant design is qualified at the chosen duration; this optimistic
mitigation remains labeled as an assumption, never verified evidence.

## 5. Student analysis contract

```json
{
  "analysisId": "student-team-demo",
  "asOf": "2026-11-14",
  "parts": [
    {
      "siteId": "TX1",
      "partNumber": "DEMO-OPT-32",
      "manufacturer": "Synthetic optics manufacturer",
      "provider": "sayari",
      "entityId": "DEMO-ENTITY-NOT-A-REAL-ID",
      "relationship": "component manufacturer -> transceiver -> rack lot",
      "sourceUrl": "https://example.com/student-evidence",
      "confidence": "low",
      "originCountry": "CN",
      "generation": "3.2T",
      "usBomPct": 40,
      "authorization": "new"
    }
  ]
}
```

This template is entirely synthetic, not a real Sayari export or company finding.
Use 1-3 findings, one per existing site (`TX1`, `NO1`, `UK1`). Text fields must be
nonempty and bounded; origin is `CN`, `US`, `other` or `unknown`; confidence is
`low`, `medium` or `high`; authorization is `new`, `existing` or `unknown`;
`usBomPct` is 0-100 or null. Analysis text is limited to 20,000 characters.

One site finding stands for all synthetic optics lots at that site. A real student
handoff must establish exact part/host relationships, actual BOM value denominator,
authorization evidence and permitted reuse of provider fields. The demo does not
resolve entities, fetch cited documents, infer sanctioned ownership, verify BOM
values, or claim student inputs are legally verified. Provider-neutral identifiers
are retained even when the demo's display provider changes. No API keys are accepted.

Imported evidence remains session-local browser memory, is excluded from the URL and
disables sharing and Monte Carlo export. Coordination trials and their chart bands
include the active proposal and local findings, with physical randomness fixed and
human timing resampled; the original playbook sweep still excludes the overlay.
To reproduce a private analysis, reapply its separately authorized
sanitized JSON to the same assumption configuration; reloading alone restores only
the original scenario, not private findings. Production retention, hashing, access
control and provider licensing follow the parent specification and are not delivered
by this static demo.

## 6. Engineering outputs and later integration

Network engineers review form factor, reach, modulation/FEC, host firmware, link
budgets, radix/topology, cable routes, failure domains and spares. Facility engineers
review per-port watts, thermal envelope, rack cooling and power capacity.
Substitution requires actual host/rack interoperability and acceptance evidence.

Power teams identify inverter BOMs in solar/BESS/UPS, management interfaces, exact
authorization, conditional-approval conditions/expiry and support windows. A power
inverter designation does not automatically cover every switchgear or transformer.
Permits, utility reservations, construction sequencing and professional-engineer
sign-off remain part of the deployment decision, not agent-authorized shortcuts.

Compliance/legal separate FCC equipment authorization, Section 1260H designation,
federal critical-system procurement and export/sanctions rules. Scope, entity matches,
subsidiary paths, grandfathering and waivers need legal interpretation. A named
reviewer must approve any eventual production policy change.

Later production work: a source/evidence ingestion Reader; hashed rule versions;
full part/component/serial graph; customer/system applicability; conditional-approval
expiry alerts; independently validated alternate BOMs; realistic qualification and
thermal/network models; evidence-carrying decision records; and controlled promotion
through the parent Policy/Mandate Engine. This remains Phase 5 simulation scope, with
inputs from Phase 1 screening and FR-IBB-004 manufacturer declarations.

## 7. Verification criteria

Focused engine cases cover deterministic branches/replay, unchanged original
baseline, jurisdiction/generation and existing-authorized exemptions, exact 65%
threshold (64.9% affected, 65% exempt), missing evidence and partial import, duplicate/
unsafe input rejection, enforcement timing, wait/redesign effects, late detection
after a shipment is parked, and preservation of unrelated scenario holds/gates.

Browser checks cover injection/removal, visibly changed projection, source links,
manual planning decisions, share-link round trip, invalid input errors, import/privacy/
clear behavior and operation without the 3D renderer. Existing simulation, negotiation,
provider, theme and generated-data checks must still pass.
