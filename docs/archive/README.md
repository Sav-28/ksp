# Archived documentation

These files are **superseded**. They are kept as a record of how the project
developed, not as current instructions. Where they disagree with the documents
below, the documents below are correct.

Current documentation lives at the repository root:

| Document | Covers |
|----------|--------|
| [README.md](../../README.md) | What the platform does, architecture, local setup, API, the two measured models |
| [DATABASE.md](../../DATABASE.md) | Persistence: PostgreSQL, the two-schema design, environment variables, deployment config |
| [DEPLOYMENT.md](../../DEPLOYMENT.md) | Deploying to Zoho Catalyst AppSail, wheel vendoring, env vars |
| [DEMO_SCRIPT.md](../../DEMO_SCRIPT.md) | The judge walkthrough |
| [docs/PHASE2_PLAN.md](../PHASE2_PLAN.md) | Internal plan and status for the shortlisted round |

## What's here and why it was retired

| File | Why it was superseded |
|------|----------------------|
| `POSTGRES_SETUP.md` | Replaced by `DATABASE.md`, which reflects the shipped implementation rather than the plan. |
| `QUICK_START.md` | MVP-era setup guide; its content is in README's Getting Started, with current commands and data counts. |
| `TROUBLESHOOTING.md` | Mostly write-ups of bugs that are fixed. Deployment-specific issues moved to `DEPLOYMENT.md`. |
| `PROJECT_STATUS.md` | Point-in-time status from July 2026; replaced by `docs/PHASE2_PLAN.md`. |
| `MVP_COMPLETION_REPORT.md` | Records the first-round MVP milestone. Feature set and metrics have moved on since. |
| `FEATURE_FIR_REGISTRATION.md` | Design note written while building FIR registration; the feature shipped and README documents the result. |

Figures quoted in these files are stale. Notably, the offender-risk model's
ROC-AUC and the dataset counts have both changed, and the forecast is no longer a
moving average. Treat any number here as historical.
