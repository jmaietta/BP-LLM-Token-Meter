# SS&C Token Usage Measurement Tool Status

## Purpose

This document captures what is currently built in the SS&C AI Gateway repository for token and cost usage measurement, what is not yet implemented, and which remaining items require input from SS&C as the AI Gateway owner.

Date of assessment: March 3, 2026

## Current State Summary

The repository contains a meaningful backend foundation for usage metering, but the feature is not fully wired into the running gateway.

Implemented today:

- Core usage metering domain model and service logic
- Usage normalization for multiple provider response formats
- Cost calculation logic
- Read-side query logic for usage events, summaries, and cost breakdowns
- Database schema for usage metering and pricing
- Sample pricing seed data
- OpenAPI documentation for usage endpoints

Not implemented today:

- Concrete persistence adapters for pricing lookup and usage event inserts
- Integration of metering into the live gateway request/response flow
- Live HTTP route/controller wiring for the documented usage endpoints
- Rollup population process for daily aggregates
- Test coverage
- Production-approved pricing data
- Final metering failure policy

## What Is Built

### 1. Core Metering Logic

The core implementation exists in [src/usage/metering.ts](/home/jon/Desktop/SSNC_projects/SSNC%20AI%20Gateway/src/usage/metering.ts).

This file provides:

- Shared types for endpoint types, usage sources, gateway context, normalized usage, and persisted usage events
- `PricingEngine`, which computes token/audio/image costs from normalized usage and a resolved price card
- `UsageNormalizer`, which selects an adapter and normalizes provider-specific usage payloads into a common model
- `UsageMeteringService`, which coordinates normalization, pricing, and persistence

### 2. Usage Adapters

The following adapters are implemented in [src/usage/metering.ts](/home/jon/Desktop/SSNC_projects/SSNC%20AI%20Gateway/src/usage/metering.ts):

- `OpenAICompatibleAdapter`
- `AnthropicAdapter`
- `BackendReportedAdapter`

These cover provider-reported or backend-reported usage in several common response shapes.

### 3. Read-Side Usage Queries

Read/query logic exists in [src/usage/http.ts](/home/jon/Desktop/SSNC_projects/SSNC%20AI%20Gateway/src/usage/http.ts).

This file provides:

- `UsageReadRepository.listEvents()` for paginated raw usage event reads
- `UsageReadRepository.getSummary()` for aggregated usage reporting from daily rollups
- `UsageReadRepository.getCostBreakdown()` for invoice-style line items
- Query parsing helpers for request parameters
- A response formatter for usage events

### 4. Database Schema

Schema definitions exist in [migrations/001_usage_metering.sql](/home/jon/Desktop/SSNC_projects/SSNC%20AI%20Gateway/migrations/001_usage_metering.sql).

The migration creates:

- `pricing_catalog`
- `tenant_price_override`
- `usage_events`
- `usage_daily_rollups`

This establishes the storage model for pricing, tenant-specific overrides, raw metering events, and aggregated reporting.

### 5. Sample Pricing Seed Data

Example data exists in [migrations/002_seed_sample_pricing_catalog.sql](/home/jon/Desktop/SSNC_projects/SSNC%20AI%20Gateway/migrations/002_seed_sample_pricing_catalog.sql).

It includes sample pricing rows for:

- OpenAI chat
- OpenAI embeddings
- Anthropic chat
- Hosted Llama
- vLLM
- OpenAI audio

It also includes one sample tenant override.

Important: the file explicitly states that this is example-only data and must be replaced before production use.

### 6. API Contract

The OpenAPI spec in [openapi.json](/home/jon/Desktop/SSNC_projects/SSNC%20AI%20Gateway/openapi.json) already documents:

- `GET /v1/usage`
- `GET /v1/usage/summary`
- `GET /v1/usage/cost-breakdown`

This means the intended external contract is already described, even though the repo does not yet show live route/controller wiring for these endpoints.

## What Is Not Yet Built

The following implementation gaps remain:

### 1. No Concrete Pricing Repository

`PricingCatalogRepository` is defined as an interface, but there is no concrete implementation in `src` that resolves pricing rows and tenant overrides from the database.

### 2. No Concrete Usage Event Repository

`UsageEventRepository` is defined as an interface, but there is no concrete implementation in `src` that inserts rows into `usage_events`.

### 3. No Live Gateway Integration

There is no evidence in the repository that `UsageMeteringService.record(...)` is called from the actual gateway request/response path.

The metering engine exists as reusable code, but it does not appear to be connected to runtime traffic yet.

### 4. No Live Route Handlers for Usage APIs

The read-side repository and request parsing code exist, but there is no visible controller/router wiring that exposes the documented `/v1/usage*` endpoints as live application endpoints.

### 5. No Rollup Population Process

The schema includes `usage_daily_rollups`, and the summary query depends on it, but the repository does not include a job, trigger, or batch process that populates or refreshes those rollups.

### 6. No Test Coverage

There are no tests in the repository covering:

- usage normalization
- pricing math
- repository queries
- endpoint parsing
- billing edge cases

### 7. No Production Pricing

The current pricing data is placeholder/sample data only. Production pricing inputs and governance are not yet present.

### 8. No Final Failure Policy

The repository does not define the operational policy for what should happen if metering fails during a gateway request.

## Recommended Remaining Work

The next implementation items are:

1. Implement a Postgres-backed `PricingCatalogRepository`
2. Implement a Postgres-backed `UsageEventRepository`
3. Wire `UsageMeteringService` into the gateway response lifecycle
4. Add live HTTP handlers/controllers for the usage endpoints
5. Build a rollup process for `usage_daily_rollups`
6. Add tests for metering, pricing, and reporting behavior
7. Replace sample pricing with approved SS&C pricing
8. Define metering failure behavior

## SS&C Dependency Map

This section identifies which remaining items can proceed immediately and which require product, policy, or business input from SS&C.

### Can Build Now

These items are mostly engineering-owned and can proceed immediately:

- `2. UsageEventRepository implementation`
- `6. Tests`

Reasoning:

- The usage event repository is straightforward persistence plumbing against the existing schema.
- Tests can be built now, even if some billing assertions may need later adjustment when final policies are approved.

### Can Scaffold Now, But Need SS&C Signoff Before Finalizing

These items can be built provisionally, but they depend on SS&C policy or product choices before they should be considered final:

- `1. PricingCatalogRepository implementation`
- `3. Wire metering into gateway response path`
- `4. HTTP handlers for usage endpoints`
- `5. Rollup job for usage_daily_rollups`

Reasoning:

- Pricing resolution depends on the source of truth, override precedence, effective dating, and markup rules.
- Gateway integration depends on what traffic must be metered, what is billable, and what payload retention is permitted.
- Usage APIs depend on authorization, intended audience, retention expectations, and whether the OpenAPI contract is externally committed.
- Rollups depend on freshness expectations and whether they are billing-grade or analytics-grade.

### Blocked Pending SS&C Decisions or Inputs

These items should not be finalized until SS&C provides explicit inputs:

- `7. Replace sample pricing with approved SS&C pricing`
- `8. Decide metering failure behavior`

Reasoning:

- Approved pricing, versioning, effective dates, and override policy are business-owned inputs.
- Failure behavior is a product, operational, billing, and compliance policy decision, not just an engineering decision.

## Detailed SS&C Input Needed

Below is the practical detail needed from SS&C for each dependent item.

### Item 1: PricingCatalogRepository

SS&C should define:

- What the authoritative pricing source is
- How tenant overrides should be applied
- Whether markups are tenant-level, business-unit-level, or contract-specific
- Effective date and versioning rules
- Whether historical repricing is allowed

### Item 3: Gateway Integration

SS&C should define:

- Which gateway endpoints must be metered
- Whether failed requests and partial responses are billable
- Which identity dimensions are authoritative for attribution
- What request/response payload data may be stored for audit, support, or compliance

### Item 4: Usage Endpoints

SS&C should define:

- Who is allowed to access usage data
- Whether access is tenant admin only or broader
- Whether the current OpenAPI response contract is acceptable for customers
- Retention and pagination expectations

### Item 5: Rollups

SS&C should define:

- Whether rollups must be near-real-time, hourly, or daily
- Whether rollups are for dashboards only or for billing-grade reporting
- Whether historical backfills and corrections must be supported

### Item 7: Production Pricing

SS&C must provide:

- Approved pricing by provider/model/endpoint
- Effective dates
- Versioning policy
- Customer-specific overrides or markups

### Item 8: Metering Failure Policy

SS&C must define:

- Whether gateway requests may succeed when metering fails
- Whether metering failures require retry
- Whether retroactive billing is allowed for delayed records
- What auditability or reconciliation standard must be met

## Suggested Execution Order

To maximize progress while minimizing rework:

1. Build `UsageEventRepository`
2. Add test coverage for existing metering logic
3. Scaffold `PricingCatalogRepository` behind explicit assumptions
4. Scaffold gateway integration behind non-blocking assumptions
5. Add provisional usage API handlers
6. Implement a provisional rollup job
7. Replace assumptions after SS&C provides pricing and policy decisions

## Recommended Immediate Questions for SS&C

To unblock the highest-risk decisions, ask SS&C to confirm:

1. What is the approved production pricing schedule and versioning policy?
2. Should requests be allowed to succeed if metering persistence fails?
3. Which endpoint families are in scope for billable metering?
4. Are failed and partial requests billable?
5. Who is authorized to access tenant usage reports?
6. Are usage summaries dashboard-grade or billing-grade?

## Bottom Line

The SS&C token usage measurement tool is partially built.

The technical foundation is in place for metering, cost calculation, schema design, and read-side reporting. What remains is mainly the operational wiring, persistence implementations, rollup generation, test coverage, and the business-policy inputs that only SS&C can provide.
