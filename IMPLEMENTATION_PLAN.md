# WAPilot — Combined Implementation Plan

This document consolidates product rollout, technical architecture, schema/API kickoff scope, permissions, quality gates, and delivery phases for all proposed PRDs.

---

## 1) Program Objective

Build WAPilot into a WhatsApp-first, multi-tenant business operations platform covering:
- Team inbox and customer communication
- AI-assisted sales/support automation
- Booking + CRM + workflows
- Campaign and analytics intelligence
- SaaS billing and monetization
- Governance, role-based controls, and scalable operations

---

## 2) Scope Map (20 Workstreams)

1. Shared Team Inbox (advanced collaboration)
2. AI Agent / Smart Assistant
3. Appointment Booking System
4. Automation Workflows
5. CRM Pipeline / Lead Management
6. Analytics Dashboard
7. Broadcast Campaign System
8. Customer Tags & Segments
9. Smart Notifications Center
10. Mobile App
11. Multi-channel Messaging
12. Subscription & SaaS Billing
13. QR Ordering / Payments
14. AI Knowledge Base
15. Voice Notes AI
16. E-commerce Lite
17. Referral & Affiliate System
18. Staff Performance Tracking
19. Chatbot Flow Builder (No-code)
20. AI Campaign Generator

---

## 3) Delivery Phasing

## Phase 0 — Platform Foundation
**Goal:** harden base architecture for reliable feature velocity.

- finalize role/tenant architecture boundaries
- standardize API contracts and error schema
- introduce websocket + async processing foundation
- baseline observability and deployment workflows

**Exit criteria**
- schema and auth model stable
- CI/CD and environment parity in place
- core monitoring and alerting active

## Phase 1 — Team Inbox + Operational Control
**Workstreams:** 1, 9 (v1), 18 (v1)

- assignment/unassignment
- conversation status (open/pending/closed)
- internal notes + mentions
- SLA timers + overdue flags
- collision detection typing indicators
- in-app notifications for priority events

**Business outcome**
- faster response, fewer duplicate replies, clear ownership

## Phase 2 — AI Layer + Knowledge
**Workstreams:** 2, 14, 15, 19 (v1), 20 (v1)

- assist mode + auto mode
- intent detection and AI summaries
- business knowledge ingestion + retrieval
- voice transcription and summarization
- basic no-code chatbot flows

**Business outcome**
- higher automation and improved response quality

## Phase 3 — Booking + CRM + Automations
**Workstreams:** 3, 4, 5, 8

- booking lifecycle and reminders
- lead pipeline and assignment
- tags/segments for personalization
- trigger-condition-action workflow engine

**Business outcome**
- better conversion and follow-up consistency

## Phase 4 — Campaign Intelligence + Analytics
**Workstreams:** 6, 7, 20 (full), 19 (advanced)

- scheduling/recurring campaigns
- segmentation-driven sends
- campaign analytics and ROI
- AI campaign generation/edit/launch

**Business outcome**
- measurable marketing efficiency and revenue lift

## Phase 5 — Monetization + Channel Expansion
**Workstreams:** 10, 11, 12, 13, 16, 17

- plan gating and usage metrics
- mobile ops MVP
- QR commerce flows
- e-commerce lite order lifecycle
- referral and affiliate attribution
- first multi-channel expansion beyond WhatsApp

**Business outcome**
- stronger monetization and growth channels

---

## 4) Technical Architecture Plan

## 4.1 Backend Structure
- Route layer: HTTP contracts
- Controller layer: validation + orchestration
- Service layer: integration/business logic
- Persistence layer: Prisma + PostgreSQL
- Realtime layer: websocket channels for collaboration
- Async layer: workflows, reminders, notifications, retries

## 4.2 Frontend Structure
- Role-aware route model (`CHIEF_ADMIN`, `OWNER`, `STAFF`)
- Module-level pages (Communications, ChiefAdmin, Settings, User Management, etc.)
- Shared table/form/action patterns
- Tab-scoped data loading to avoid overfetching

## 4.3 Multi-tenant Model
- strict `businessId` scoping in data access
- permission checks in both route and query/update layer
- scoped listing/mutation behavior by role

---

## 5) Data Layer Implementation Plan (Schema Change List)

Below is the DB expansion plan grouped by domain.

## 5.1 Collaboration Inbox
- `ConversationAssignment`
- `ConversationInternalNote`
- `ConversationMeta` (status/priority/SLA fields)
- optional typing-state store (or Redis ephemeral state)

## 5.2 AI + Knowledge
- `AiInteractionLog`
- `BusinessAiConfig`
- `KnowledgeDocument`
- `KnowledgeChunk`
- `VoiceTranscription`
- `AiCampaignDraft`

## 5.3 CRM / Booking / Workflows
- extend `Booking` with staff/time/payment fields
- `StaffAvailability`
- `LeadActivity` (+ stage/scoring extensions)
- `Workflow`, `WorkflowStep`, `WorkflowExecution`, `WorkflowStepExecution`
- `Tag`, `CustomerTag`, `Segment`

## 5.4 Campaign / Analytics / Performance
- extend campaign models for schedule/recurrence/variant
- `CampaignRecipient` delivery state
- `MetricDaily`, `StaffMetricDaily`

## 5.5 Billing / Commerce / Growth
- `Plan`, `BusinessPlan`, `UsageCounter`
- `QrLink`, `QrScanEvent`
- commerce entities (`Order`, `OrderItem`, `Cart`, optional `Product` table)
- referral entities (`ReferralCode`, `ReferralAttribution`, `CommissionLedger`)

---

## 6) API Contract Plan (Kickoff Surface)

## 6.1 Inbox APIs
- assignment
- notes + mentions
- status updates
- assignee/status/SLA filters

## 6.2 AI APIs
- suggest reply
- run auto reply
- summarize thread
- generate campaign draft

## 6.3 Booking/CRM APIs
- slot availability
- create/reschedule/cancel booking
- pipeline stage transitions
- lead activities

## 6.4 Campaign/Analytics APIs
- create/schedule/launch campaign
- campaign analytics
- dashboard/metric endpoints

## 6.5 User Governance APIs
- user list scoped by role/business
- create user
- reset password
- delete user
- chiefadmin onboarding/impersonation/return session

## 6.6 Knowledge/Voice APIs
- knowledge upload/list/delete
- voice transcribe/summarize

---

## 7) Role & Permission Model

## CHIEF_ADMIN
- sales-led onboarding
- cross-client governance
- impersonate client + return flow
- broad user administration

## OWNER
- client-scoped operational control
- staff creation/management (within own client)
- configuration, campaigns, analytics

## STAFF
- day-to-day operations (chat, support, execution)
- no destructive governance actions (e.g., user reset/delete)

---

## 8) Security & Reliability Plan

## Security controls
- JWT auth with strict role guards
- business-scope checks for every tenant mutation
- sensitive actions protected with role + scope checks
- clear 413 handling for large upload payloads
- CORS allowlisting

## Reliability controls
- idempotent webhook handlers
- retry strategy for async jobs
- operational logs and traceability
- health checks for service readiness

---

## 9) Quality Plan (QA + Test Strategy)

## Test layers
- API integration tests for role matrix and data boundaries
- UI/e2e tests for key journeys
- regression suite for communications + user governance

## Critical scenarios
- inbox collaboration race conditions
- role-restricted actions (reset/delete/create)
- impersonation and safe return flow
- booking and payment lifecycle consistency
- webhook status -> UI tick correctness
- large media upload and error handling

---

## 10) Deployment Plan

## Environments
- local -> staging -> production

## Build and release
- backend and frontend containerized
- env-var driven runtime configuration
- schema sync + prisma client generation in release checklist

## Operational checklist
- secrets configured
- integrations validated (WhatsApp/Razorpay/storage)
- smoke tests executed post-deploy

---

## 11) Product Positioning + Go-to-market Alignment

## Positioning
WAPilot is a WhatsApp-first operations platform combining CRM, support, campaign automation, booking, and billing controls for SMB teams.

## Commercial narrative
- faster customer response and better conversion
- measurable campaign ROI
- AI-assisted operations without losing human control
- role-governed multi-tenant architecture for SaaS scale

---

## 12) KPI Framework

## Operations
- average response time
- first response SLA %
- duplicate reply incidents

## Growth
- campaign ROI
- CTR and conversion uplift
- lead-to-booking conversion

## Revenue
- MRR growth
- plan upgrades
- wallet recharge behavior

## AI
- suggestion acceptance rate
- auto-resolution rate
- response time reduction

---

## 13) Engineering Kickoff Checklist

- [ ] finalize phase scope and backlog by team
- [ ] lock schema migration sequence
- [ ] freeze API contract v1 for first two phases
- [ ] define feature flags and rollout toggles
- [ ] confirm QA acceptance matrix
- [ ] schedule phase exit review gates

---

This is the single combined implementation plan to execute the full PRD set with phased, technical, and operational alignment.
