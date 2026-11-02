# Recorded runs

| File | Source | Licence |
|---|---|---|
| `supply-10round-operator.ndjson` | Ethical Tech CoLab, [diplomacy-table-live](https://github.com/Ethical-Tech-CoLab/diplomacy-table-live) `runs/` @ `fd0e708` | MIT (`LICENSE-diplomacy-table-live`) |
| `supply-10round-aurora-view.ndjson` | Same run, exported from Aurora's seat (perspective-filtered) | MIT |

Aurora–Borealis supply agreement: 10 rounds, three seats (Aurora buyer, Borealis seller,
Charlie consortium broker), all AI on `gemma3:12b`. After round 4 Borealis and Charlie caucus
without Aurora. The operator export contains that caucus; the Aurora export does not, and the
tick numbers are left as they are, so the gaps show where the redaction happened.

The files are byte-for-byte copies. One known defect in the source: Charlie's `displayName`
in the header is a template that was never filled in, so the replayer falls back to the twin name.
The negotiation room on `negotiate.html` replays these files read-only and can load any other
diplomacy-table v1 NDJSON export.
