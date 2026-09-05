# Roadmap

Execution sequence remains `D49 -> D50 -> D51 -> D52 -> D53`. Current verified deployment and readiness facts live in [当前状态](01_当前状态与下一步.md), not a duplicated percentage table.

| Priority | Scope | Completion evidence |
| --- | --- | --- |
| D49 | Employees, permissions, attendance and payroll setup | Accepted profiles, stable mappings, authorized self-service and approved rate policy; a one-person pilot is insufficient |
| D50 | PostgreSQL, restore, object storage and runtime | Production configuration, independent recovery validation and persistent runtime evidence |
| D51 | Label/dot-matrix printing and scanning | Real devices, media, output and scan-back evidence |
| D52 | Business trial runs and mobile devices | Persisted real orders, raw-material and delivery evidence across the approved scope |
| D53 | Signoff and controlled production release | Current evidence catalog, named signoffs, immutable commit and verified release lock |

The raw-material-first scope remains authoritative. Deferred attendance integration is a visible nonblocking warning for that approved scope; formal whole-factory payroll remains blocked until its separate readiness contract passes.

The September 5 project audit remediation runs in an isolated branch and does not promote a release. Its [13-item record](docs/reviews/2026-09-05-project-audit-remediation.md) distinguishes fixes, automated verification and field acceptance.

Historical plans and version references are preserved in the [September 5 snapshot](docs/history/audit-2026-09-05/ROADMAP.md), [V8.80 archive](docs/history/status/ROADMAP-through-v8.80.md) and dated development plans. They do not authorize skipping current gates.
