# ERP Production Board Prototype

This repository contains a Vite + React prototype for a packaging factory ERP production board.

The current prototype focuses on production scheduling for:

- 4 silk-screen machines
- 9 bag-making machines
- short-queue small-batch orders
- batching recommendations
- rush order insertion
- transfer between machines
- completion registration with leftover-material tracking

## Scripts

```bash
npm ci
npm run dev
npm run build
```

## Project Notes

- Current project state: `PROJECT_STATUS.md`
- Prioritized backlog: `ROADMAP.md`
- Product and technical decisions: `DECISIONS.md`
- Migrated legacy conversation archive: `docs/conversation/README.md`
- Current product requirements: `docs/product/requirements.md`
- Chinese product fact sheet: `docs/product/requirements.zh-CN.md`
- Visual QA evidence: `design-qa.md`, `audit/`, `screenshots/`

## Source

Migrated on 2026-06-25 from:

`/Users/xu/Documents/Codex/2026-06-25/product-design-plugin-product-design-openai/work/erp-production-prototype`

The migration intentionally excludes generated dependencies, build output, and old local npm cache settings.

The old Codex conversation `设计中小工厂ERP系统` has also been copied into project documentation under `docs/conversation/`. Use `docs/product/requirements.zh-CN.md` as the main Chinese product fact sheet and `docs/product/requirements.md` as the implementation-facing English brief.
