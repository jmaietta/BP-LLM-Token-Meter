# BP-LLM-Token-Meter

This repository is a focused review package for the SS&C AI Gateway token and cost usage measurement capability.

It contains:

- the current implementation artifacts related to usage metering
- the database schema for pricing and usage tracking
- the current OpenAPI contract for usage endpoints
- a status report describing what is built, what is missing, and what requires SS&C input

## Start Here

Read these files first:

1. `usage-metering-status-report.md`
2. `migrations/001_usage_metering.sql`
3. `migrations/002_seed_sample_pricing_catalog.sql`

Those three files provide the clearest summary of:

- current implementation status
- the intended storage and reporting model
- the pricing structure that still needs SS&C-approved production values

## Included Files

- `usage-metering-status-report.md`
  Summary of what is implemented, what remains, and which next steps depend on SS&C decisions.

- `migrations/001_usage_metering.sql`
  Database schema for pricing catalogs, tenant overrides, raw usage events, and daily rollups.

- `migrations/002_seed_sample_pricing_catalog.sql`
  Sample pricing seed data that demonstrates the expected pricing model. This is example data only, not production-approved pricing.

- `src/usage/metering.ts`
  Core token/cost metering logic, usage normalization, adapters, and metering service orchestration.

- `src/usage/http.ts`
  Read-side reporting queries and request parsing for usage-related APIs.

- `openapi.json`
  The current OpenAPI specification, including `/v1/usage`, `/v1/usage/summary`, and `/v1/usage/cost-breakdown`.

## What SS&C Needs To Review

The most important decisions for SS&C are:

1. Confirm the approved production pricing schedule and versioning rules.
2. Confirm how tenant overrides and markups should work.
3. Confirm which requests are billable, including failed or partial responses.
4. Confirm what should happen if metering fails during a request.
5. Confirm who is allowed to access tenant usage reporting.
6. Confirm whether usage rollups are dashboard-grade or billing-grade.

## Current Status

The implementation is partially built.

The repository already includes:

- core metering logic
- pricing calculation logic
- schema design
- usage reporting query logic
- OpenAPI definitions

The repository does not yet include:

- live gateway integration
- concrete database repository implementations for pricing lookup and event inserts
- rollup population jobs
- full test coverage
- approved production pricing

## Intended Use

This package is meant to support review and decision-making. It is not a standalone deployable service.
