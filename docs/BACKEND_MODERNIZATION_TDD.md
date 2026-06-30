# Vartalap Backend — Enterprise Modernization Technical Design Document

> **Version:** 1.0 · **Date:** 2026-06-07 · **Status:** Draft  
> **Authors:** Architecture Review Board  
> **Scope:** Full backend modernization from current Node.js/Express monolith to a production-grade, enterprise-ready platform

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Proposed High-Level Architecture](#2-proposed-high-level-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [Database Architecture](#4-database-architecture)
5. [Authentication & Security Architecture](#5-authentication--security-architecture)
6. [API Design Standards](#6-api-design-standards)
7. [Performance Optimization Strategy](#7-performance-optimization-strategy)
8. [Event-Driven Architecture](#8-event-driven-architecture)
9. [Observability Architecture](#9-observability-architecture)
10. [DevOps Architecture](#10-devops-architecture)
11. [Database Migration Plan](#11-database-migration-plan)
12. [Scalability Roadmap](#12-scalability-roadmap)
13. [Disaster Recovery Plan](#13-disaster-recovery-plan)
14. [Backend Coding Standards](#14-backend-coding-standards)
15. [Testing Strategy](#15-testing-strategy)
16. [AI-Ready Architecture](#16-ai-ready-architecture)
17. [Cost Optimization](#17-cost-optimization)
18. [Step-by-Step Implementation Plan](#18-step-by-step-implementation-plan)
19. [Master AI Coding Agent Prompt](#19-master-ai-coding-agent-prompt)

---

## 1. Executive Summary

### 1.1 Current Architecture Assessment

Vartalap is a **multi-tenant SaaS WhatsApp business platform** delivering:
- AI-powered WhatsApp inbox and bot (OpenAI/Groq)
- Appointment scheduling with staff, services, locations, calendar sync (Google, Outlook, Apple)
- Bulk communication campaigns with wallet billing
- Razorpay payment processing (subscriptions, appointment advances, customer payments)
- Real-time WebSocket inbox with Redis pub/sub fan-out

**Current stack:**
| Layer | Technology |
|-------|------------|
| Runtime | Node.js ≥20, ESM modules |
| Framework | Express 4.x (JavaScript, no types) |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Database | PostgreSQL (Neon cloud serverless) |
| Cache / Pub-Sub | Redis (ioredis, optional) |
| Queue | RabbitMQ (optional) / in-process `setInterval` polling |
| Auth | JWT (HS256, single secret) + bcryptjs |
| AI | OpenAI SDK (gpt-4o-mini) + Groq (llama-3.3-70b) |
| Storage | AWS S3 + Supabase Storage (presigned) |
| Payments | Razorpay |
| WebSocket | `ws` library |
| Notifications | Nodemailer (SMTP), Twilio (SMS), Meta Graph API (WhatsApp) |
| Deployment | Render.yaml — single PaaS process |

### 1.2 Major Risks

| Risk | Severity | Impact |
|------|----------|--------|
| No TypeScript — runtime type errors reach production | **CRITICAL** | Data corruption, 500s |
| No request body validation (no Zod/Joi) | **CRITICAL** | Injection, bad data in DB |
| JWT without refresh token rotation | **HIGH** | Impossible token revocation, session hijack |
| OAuth tokens stored in plaintext in DB | **HIGH** | Credential theft if DB exfiltrated |
| Background workers co-located with HTTP process | **HIGH** | Worker crash kills HTTP, OOM kills both |
| Inline Prisma queries in route handlers | **HIGH** | Business logic bleed, impossible to unit-test |
| No audit log for sensitive mutations | **HIGH** | Compliance failure |
| No API versioning — breaking changes silently break clients | **MEDIUM** | Client disruption |
| In-process polling workers (`setInterval`) — no back-pressure | **MEDIUM** | Thundering herd under load |
| No distributed tracing / correlation IDs | **MEDIUM** | Impossible root-cause analysis |
| Dual DB (Neon + Supabase) — unclear source of truth | **MEDIUM** | Data inconsistency |
| `BusinessConfig.schedulingSettings` is an untyped JSON blob | **MEDIUM** | Silent misconfiguration |
| No connection pooler between app and DB | **MEDIUM** | Connection exhaustion at scale |
| No rate limiting on most authenticated endpoints | **MEDIUM** | Abuse, DDoS |

### 1.3 Technical Debt Analysis

```
┌─────────────────────────────────────────────────────────────────┐
│ DEBT CATEGORY             SEVERITY    FILES AFFECTED             │
├─────────────────────────────────────────────────────────────────┤
│ No TypeScript              Critical    All 80+ JS files          │
│ No input validation        Critical    All controllers           │
│ Business logic in routes   High        api.routes.js             │
│ No refresh tokens          High        auth.service.js           │
│ Plaintext OAuth tokens     High        CalendarConnection model  │
│ Legacy Booking model       Medium      booking + appointment     │
│ 30+ flat service files     Medium      scheduling/               │
│ No audit trail             High        All mutation paths        │
│ No correlation IDs         Medium      All routes                │
│ setInterval-based workers  Medium      workers.registry.js       │
│ Supabase dual-DB           Medium      supabase.service.js       │
└─────────────────────────────────────────────────────────────────┘
```

### 1.4 Scalability Concerns

- **Single process**: HTTP + WebSocket + background workers run in one Node.js process. One OOM kills all three.
- **No connection pool layer**: Direct Prisma → Neon serverless with no PgBouncer means connection exhaustion under moderate load (~50 concurrent requests).
- **In-memory rate limiter**: Per-instance memory maps for rate limiting break behind a load balancer.
- **In-process hub**: WebSocket `hub.js` uses a `Map` in process memory. Multiple API instances cannot share presence/realtime state.
- **setInterval workers**: Polling every 60 s means duplicated work across instances if scaled horizontally.
- **No cache invalidation strategy**: No consistent caching layer — every request hits the DB.

### 1.5 Modernization Goals

1. Migrate to **TypeScript** with strict mode across the entire backend.
2. Adopt **Clean Architecture** (Controller → Use Case → Domain → Infrastructure) with enforced dependency direction.
3. Introduce **Zod** schema validation at all API boundaries.
4. Implement **JWT + Refresh Token** rotation with revocation support.
5. Encrypt all OAuth/third-party tokens at rest using AES-256-GCM.
6. Separate **Worker process** from HTTP process.
7. Replace in-memory pub/sub hub with **Redis Streams** for multi-instance realtime.
8. Add **OpenTelemetry** distributed tracing, structured JSON logging, and Prometheus metrics.
9. Deploy on **Kubernetes** (EKS/GKE) with Helm, replacing single-process Render.
10. Add **API versioning** (`/v1/`) and consistent pagination/error contract.
11. Build a proper **Audit Log** system for all sensitive mutations.
12. Consolidate to a single PostgreSQL cluster (retire Supabase dual-write).
13. Add **PgBouncer** connection pooling layer.
14. Migrate untyped JSON config blobs to typed, migrated DB columns.

---

## 2. Proposed High-Level Architecture

### 2.1 Architecture Overview Diagram

```
                         ┌─────────────────────────────────┐
                         │         Internet / Clients       │
                         │  Browser  Mobile  WhatsApp Meta  │
                         └───────────────┬─────────────────┘
                                         │ HTTPS / WSS
                         ┌───────────────▼─────────────────┐
                         │        Cloudflare / CDN          │
                         │  WAF · DDoS · TLS Termination    │
                         └───────────────┬─────────────────┘
                                         │
                         ┌───────────────▼─────────────────┐
                         │    AWS Application Load Balancer │
                         │     (Layer 7, path routing)      │
                         └───┬───────────────┬─────────────┘
                             │               │
              ┌──────────────▼──┐       ┌────▼──────────────┐
              │  API Gateway    │       │  WebSocket Gateway │
              │  (Kong / APISIX)│       │  (Dedicated pods)  │
              │  Rate Limit     │       │  /realtime/inbox   │
              │  Auth verify    │       └────────┬──────────┘
              │  Versioning     │                │
              └──────┬──────────┘      ┌─────────▼──────────┐
                     │                 │   Redis Streams     │
        ┌────────────▼──────────┐      │   (Pub/Sub fan-out) │
        │  Application Services │◄─────┘                    │
        │  ┌─────────────────┐  │                            │
        │  │  Auth Service   │  │                            │
        │  ├─────────────────┤  │                            │
        │  │ Messaging Svc   │  │                            │
        │  ├─────────────────┤  │                            │
        │  │ Scheduling Svc  │  │                            │
        │  ├─────────────────┤  │                            │
        │  │ Campaign Svc    │  │                            │
        │  ├─────────────────┤  │                            │
        │  │ Billing Svc     │  │                            │
        │  ├─────────────────┤  │                            │
        │  │ AI Agent Svc    │  │                            │
        │  └─────────────────┘  │                            │
        └────────┬──────────────┘                            │
                 │                                           │
     ┌───────────┼───────────────────────────┐               │
     │           │                           │               │
┌────▼───┐ ┌─────▼──────┐ ┌───────────┐ ┌───▼──────────┐    │
│Postgres│ │   Redis    │ │  RabbitMQ │ │  S3 / Object │    │
│Primary │ │  Cache     │ │  / SQS    │ │  Storage     │    │
│Replica │ │  Sessions  │ │  Workers  │ │              │    │
└────────┘ │  Slots     │ └─────┬─────┘ └──────────────┘    │
           │  Pub/Sub   │       │                            │
           └────────────┘  ┌────▼──────────────────┐        │
                           │   Worker Process       │        │
                           │  Reminders             │        │
                           │  Waitlist              │        │
                           │  Calendar Sync         │        │
                           │  Rebooking Campaigns   │        │
                           └────────────────────────┘        │
                                                             │
                   ┌─────────────────────────────────────────┘
                   │ WebSocket Connection Management
              ┌────▼──────────────────────────────┐
              │  WebSocket Pod (stateful, scaled)  │
              │  Redis-backed presence hub          │
              └───────────────────────────────────┘
```

### 2.2 Request Flow

```
Browser Request:
  1. DNS → Cloudflare (WAF, DDoS, TLS)
  2. ALB → API Gateway pod (rate limit, JWT pre-verify, route)
  3. API Gateway → Application Service pod (business logic)
  4. Service → Redis (cache check, cache miss →)
  5. Service → PgBouncer → PostgreSQL Primary/Read Replica
  6. Service → Redis Streams (publish event)
  7. Service → Response with structured JSON

WhatsApp Webhook:
  1. Meta → /webhook (raw signature verify, 200 ACK immediately)
  2. Webhook Controller → RabbitMQ/SQS queue (async fan-out)
  3. Worker dequeues → process message → AI reply → WhatsApp Graph API
  4. Worker → Prisma → DB persist
  5. Worker → Redis → WebSocket fan-out (staff inbox update)
```

### 2.3 Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **Cloudflare WAF** | TLS termination, DDoS mitigation, bot detection, IP block lists |
| **AWS ALB** | L7 health-check aware routing, sticky sessions for WS |
| **API Gateway (Kong)** | JWT pre-validation, rate limiting, request ID injection, versioning, API key management |
| **Auth Service** | Login, register, token issue/refresh/revoke, OAuth flows |
| **Messaging Service** | WhatsApp message send/receive, AI bot pipeline, conversation state |
| **Scheduling Service** | Appointment CRUD, availability engine, slot locking, calendar sync |
| **Campaign Service** | Template management, bulk send, wallet deduction |
| **Billing Service** | Subscription lifecycle, Razorpay integration, payment webhooks |
| **AI Agent Service** | LLM conversation routing, tool-calling, session management |
| **Worker Process** | Reminder dispatch, waitlist expiry, rebooking campaigns, calendar poll |
| **WebSocket Gateway** | Presence, inbox live updates, agent typing indicators |
| **Redis** | Session cache, slot locks (SETNX), pub/sub, rate limit counters |
| **PgBouncer** | Connection pooling (transaction mode), prevents DB connection exhaustion |
| **PostgreSQL** | Single source of truth: primary write + read replicas |
| **RabbitMQ / SQS** | Async webhook processing, scheduled task dispatch, dead-letter |
| **S3** | Staff photos, media attachments, campaign file uploads |

---

## 3. Backend Architecture

### 3.1 Architecture Pattern Recommendation: Modular Monolith

**Recommendation: Modular Monolith → Selective Microservices**

**Justification:**

| Factor | Analysis |
|--------|----------|
| Team size | Small (2–8 engineers) — microservices multiply operational overhead |
| Domain coupling | Messaging ↔ Scheduling ↔ AI are tightly coupled — hard to split cleanly |
| Data integrity | Many cross-domain transactions (appointment + payment + notification atomically) |
| Operational maturity | No existing K8s expertise visible — start simpler |
| Extraction path | Modular monolith boundaries make future extraction to services clean |

**Selective extractions at scale (Phase 5+):**
- `WebSocket Gateway` — already stateful, must be separate for horizontal scaling
- `Worker Process` — already separate in current code, formalize
- `AI Agent Service` — high latency, GPU/LLM-specific scaling
- `Webhook Ingestion` — high volume, independent scaling needed

### 3.2 Clean Architecture Layers

```
src/
├── modules/                    # Domain modules (replaces flat structure)
│   ├── auth/
│   ├── messaging/
│   ├── scheduling/
│   ├── campaigns/
│   ├── billing/
│   ├── ai/
│   ├── admin/
│   └── shared/
├── infrastructure/             # External adapters (DB, Redis, HTTP clients)
│   ├── database/
│   ├── cache/
│   ├── queue/
│   ├── storage/
│   └── providers/
├── api/                        # HTTP entry points only
│   ├── v1/
│   │   ├── routes/
│   │   └── middlewares/
│   └── webhooks/
├── realtime/                   # WebSocket gateway
├── workers/                    # Background job handlers
└── core/                       # Shared kernel (no business logic)
    ├── types/
    ├── errors/
    ├── utils/
    └── config/
```

### 3.3 Module Structure (example: `scheduling`)

```
modules/scheduling/
├── domain/
│   ├── Appointment.ts          # Domain entity + invariants
│   ├── StaffMember.ts
│   ├── AvailabilityWindow.ts
│   ├── SlotLock.ts
│   └── events/
│       ├── AppointmentCreated.ts
│       ├── AppointmentCancelled.ts
│       └── AppointmentCompleted.ts
├── application/
│   ├── use-cases/
│   │   ├── CreateAppointment.ts
│   │   ├── CancelAppointment.ts
│   │   ├── GetAvailableSlots.ts
│   │   ├── CheckInAppointment.ts
│   │   └── RescheduleAppointment.ts
│   ├── queries/
│   │   ├── GetAppointmentById.ts
│   │   └── ListAppointments.ts
│   └── ports/
│       ├── IAppointmentRepository.ts
│       ├── ISlotLockService.ts
│       └── ICalendarService.ts
├── infrastructure/
│   ├── repositories/
│   │   └── PrismaAppointmentRepository.ts
│   ├── adapters/
│   │   ├── GoogleCalendarAdapter.ts
│   │   └── OutlookCalendarAdapter.ts
│   └── SlotLockRedisService.ts
└── presentation/
    ├── SchedulingController.ts
    └── scheduling.routes.ts
```

### 3.4 Dependency Rules

```
Allowed dependency directions:
  presentation → application
  application → domain
  infrastructure → application (implements ports)
  core → (nothing in src/)

Forbidden:
  domain → application
  domain → infrastructure
  application → infrastructure (only via port interfaces)
  Any module → another module's infrastructure directly
```

---

## 4. Database Architecture

### 4.1 Database Selection Recommendation

**Primary: PostgreSQL 16 (AWS RDS Aurora or Neon)**

PostgreSQL is the correct choice. The domain has:
- Complex relational data with strong consistency requirements (payments, appointments)
- Multi-tenant isolation requirements (RLS)
- JSONB for flexible config that can be queried
- Full-text search via `pg_trgm` / `tsvector` (for customer search)
- Temporal data and timezone-aware operations

**No NoSQL needed at current scale.** Redis fulfills all caching/session needs.

**Hybrid Add-ons (Phase 4+):**
- **pgvector** extension: AI embeddings for customer context, semantic search
- **TimescaleDB** extension or partition: analytics, metrics, audit log time-series
- **Redis**: Ephemeral state only (sessions, slots, rate limits, pub/sub)

### 4.2 Connection Architecture

```
Application Pods
      │
      ▼
  PgBouncer (transaction pooling, max 100 server connections)
      │
      ├── PostgreSQL Primary  (writes)
      └── PostgreSQL Replica  (reads: analytics, reports, list queries)
```

**Configuration:**
```ini
[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
server_reset_query = DISCARD ALL
```

### 4.3 Schema Improvements (Critical)

#### 4.3.1 Break up untyped JSON columns

```sql
-- BEFORE (problematic):
-- BusinessConfig.schedulingSettings Json  @default("{}")
-- BusinessConfig.workingHours String @default("{}")
-- BusinessConfig.services Json @default("[]")

-- AFTER: Proper tables
CREATE TABLE scheduling_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_advance_days INT NOT NULL DEFAULT 30,
  slot_duration_min INT NOT NULL DEFAULT 30,
  buffer_between_appts_min INT NOT NULL DEFAULT 0,
  allow_same_day_booking BOOLEAN NOT NULL DEFAULT true,
  cancellation_cutoff_hours INT NOT NULL DEFAULT 2,
  max_bookings_per_slot INT NOT NULL DEFAULT 1,
  whatsapp_confirmation_template TEXT,
  whatsapp_reminder_template TEXT,
  whatsapp_rebooking_template TEXT,
  email_confirmation_enabled BOOLEAN NOT NULL DEFAULT false,
  sms_confirmation_enabled BOOLEAN NOT NULL DEFAULT false,
  collect_advance_percent SMALLINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id)
);
```

#### 4.3.2 Encrypt OAuth tokens at application layer

```typescript
// infrastructure/crypto/TokenEncryption.ts
export class TokenEncryption {
  private readonly algo = 'aes-256-gcm';
  
  encrypt(plaintext: string, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algo, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string, keyHex: string): string {
    const [ivHex, tagHex, encHex] = ciphertext.split(':');
    const key = Buffer.from(keyHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algo, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  }
}
```

#### 4.3.3 Audit Log Table

```sql
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL,
  actor_id     UUID,                      -- NULL for system actions
  actor_type   TEXT NOT NULL DEFAULT 'USER', -- USER | SYSTEM | WEBHOOK
  entity_type  TEXT NOT NULL,             -- 'appointment', 'staff', etc.
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,             -- 'create', 'update', 'delete', 'status_change'
  old_value    JSONB,
  new_value    JSONB,
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Monthly partitions + index
CREATE INDEX idx_audit_logs_business_entity
  ON audit_logs (business_id, entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor
  ON audit_logs (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
```

#### 4.3.4 Refresh Token Table

```sql
CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id   UUID NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,     -- SHA-256 of raw token
  family_id     UUID NOT NULL,            -- rotation family for reuse detection
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  revoke_reason TEXT,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_expiry ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;
```

### 4.4 Complete ERD Summary

```
Business (1) ──────────────────── (many) User
    │                              │
    │                              └── StaffMember (optional)
    │
    ├── (many) Customer
    │       ├── (many) Message
    │       ├── (many) Appointment
    │       ├── (many) WaitlistEntry
    │       ├── (many) CustomerVariableValue
    │       └── (1)    CustomerAppointmentStats
    │
    ├── (many) Location
    │       └── (many) StaffLocation (junction)
    │
    ├── (many) ScheduledService
    │       └── (many) StaffService (junction)
    │
    ├── (many) StaffMember
    │       ├── (many) StaffWorkingHours
    │       ├── (many) StaffBreak
    │       ├── (many) StaffLeave
    │       ├── (many) StaffAvailabilityRule
    │       └── (many) CalendarConnection
    │
    ├── (many) Appointment
    │       ├── (many) AppointmentPayment
    │       ├── (many) AppointmentStatusHistory
    │       ├── (many) ReminderSchedule
    │       ├── (1)    AppointmentRating
    │       └── (many) AppointmentCalendarEvent
    │
    ├── (1)   SchedulingSettings (replaces JSON blob)
    ├── (1)   Wallet
    ├── (many) WalletTransaction
    ├── (many) Template
    ├── (many) CommunicationCampaign
    ├── (many) Payment
    ├── (many) Subscription
    ├── (many) AuditLog
    └── (many) RefreshToken
```

### 4.5 Index Strategy

```sql
-- High-cardinality write path
CREATE INDEX CONCURRENTLY idx_appointments_business_staff_start
  ON appointments (business_id, staff_id, start_at)
  WHERE status NOT IN ('CANCELLED', 'COMPLETED');

-- Inbox list (most frequent read)
CREATE INDEX CONCURRENTLY idx_customers_inbox_sort
  ON customers (business_id, last_inbound_customer_message_at DESC NULLS LAST)
  WHERE last_inbound_customer_message_at IS NOT NULL;

-- Reminder worker (polling 60s)
CREATE INDEX CONCURRENTLY idx_reminder_schedules_pending
  ON reminder_schedules (scheduled_at)
  WHERE status = 'SCHEDULED';

-- Idempotency key lookup
CREATE UNIQUE INDEX idx_booking_idempotency_key
  ON booking_idempotency_keys (business_id, idempotency_key)
  WHERE expires_at > now();

-- Full-text customer search
CREATE INDEX CONCURRENTLY idx_customers_fts
  ON customers USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || phone));
```

### 4.6 Row-Level Security (Multi-Tenant)

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- ... all 30+ tenant tables

-- Policy: API role can only see own business rows
CREATE POLICY tenant_isolation ON customers
  USING (business_id = current_setting('app.business_id', true)::uuid);

-- Application sets context before each query:
-- SET LOCAL app.business_id = '<uuid>';
```

### 4.7 Archival Strategy

```sql
-- Archive appointments older than 2 years to cold partition
CREATE TABLE appointments_archive (LIKE appointments INCLUDING ALL);

-- Monthly cron: move completed/cancelled appointments
INSERT INTO appointments_archive
  SELECT * FROM appointments
  WHERE status IN ('COMPLETED', 'CANCELLED')
    AND updated_at < now() - INTERVAL '2 years';

DELETE FROM appointments
  WHERE id IN (SELECT id FROM appointments_archive);
```

---

## 5. Authentication & Security Architecture

### 5.1 Token Architecture

```
POST /v1/auth/login
  → issues:
    access_token  (JWT HS256 or RS256, TTL 15 min, in body)
    refresh_token (opaque random 256-bit, TTL 30 days, HttpOnly cookie)

POST /v1/auth/refresh
  → validates refresh_token cookie
  → issues new access_token + rotates refresh_token (family-based)
  → on reuse detection: revoke entire family (compromise signal)

POST /v1/auth/logout
  → revokes refresh_token family
```

**JWT Payload:**
```typescript
interface AccessTokenPayload {
  sub: string;         // userId
  bid: string;         // businessId
  role: 'OWNER' | 'STAFF' | 'CHIEF_ADMIN';
  email: string;
  iat: number;
  exp: number;
  jti: string;         // for blacklist if needed
}
```

**Key Rotation:**
```
CURRENT_JWT_SECRET   → signs new tokens
PREVIOUS_JWT_SECRET  → still validates old tokens (30-min overlap)
# Rotate every 90 days via secrets manager automation
```

### 5.2 RBAC Matrix

| Resource | CHIEF_ADMIN | OWNER | STAFF |
|----------|-------------|-------|-------|
| Manage business | ✓ (all) | ✓ (own) | ✗ |
| Manage users | ✓ (all) | ✓ (own) | ✗ |
| View appointments | ✓ (all) | ✓ (own) | ✓ (assigned) |
| Cancel appointment | ✓ | ✓ | ✓ (own) |
| View messages | ✓ (all) | ✓ (own) | ✓ (own) |
| Billing operations | ✓ | ✓ | ✗ |
| Send campaigns | ✓ | ✓ | ✗ |
| Admin impersonate | ✓ | ✗ | ✗ |

### 5.3 ABAC Extension (Phase 3+)

```typescript
// For fine-grained access beyond roles
interface AccessPolicy {
  subject: { userId: string; role: UserRole; businessId: string };
  action: 'read' | 'write' | 'delete';
  resource: { type: string; ownerId?: string; businessId: string };
}

function evaluatePolicy(policy: AccessPolicy): boolean {
  if (policy.subject.businessId !== policy.resource.businessId) return false;
  if (policy.subject.role === 'CHIEF_ADMIN') return true;
  if (policy.action === 'delete' && policy.subject.role !== 'OWNER') return false;
  if (policy.resource.ownerId && policy.resource.ownerId !== policy.subject.userId) {
    return policy.subject.role === 'OWNER'; // owners see all
  }
  return true;
}
```

### 5.4 Secrets Management

```yaml
# AWS Secrets Manager hierarchy
/vartalap/production/
  database/
    primary-url          # PgBouncer DSN with credentials
    replica-url
  auth/
    jwt-secret-current   # Current signing key (rotate 90d)
    jwt-secret-previous  # Overlap window key
    refresh-token-secret
  integrations/
    whatsapp/
      access-token
      app-secret
    razorpay/
      key-id
      key-secret
      webhook-secret
    openai/
      api-key
    google-calendar/
      client-id
      client-secret
    calendar-token-encryption-key  # AES-256 key (hex) for OAuth tokens
```

```typescript
// Secrets are fetched at startup and cached in memory — never read from env in business logic
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export class SecretsService {
  private cache = new Map<string, { value: string; cachedAt: number }>();
  private TTL = 300_000; // 5 min

  async get(key: string): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.cachedAt < this.TTL) return cached.value;
    const value = await this.fetchFromAWS(key);
    this.cache.set(key, { value, cachedAt: Date.now() });
    return value;
  }
}
```

### 5.5 API Security

```typescript
// Rate limiting — Redis-backed sliding window
class RateLimiter {
  async check(key: string, windowMs: number, max: number): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const multi = this.redis.multi();
    multi.zremrangebyscore(key, 0, windowStart);       // remove old
    multi.zadd(key, now, `${now}-${Math.random()}`);   // add current
    multi.zcard(key);                                   // count
    multi.expire(key, Math.ceil(windowMs / 1000));
    const [,, count] = await multi.exec() as [any, any, [null, number], any];
    return { allowed: count <= max, remaining: Math.max(0, max - count) };
  }
}

// Helmet config
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'wss://api.vartalap.com'],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
```

### 5.6 OWASP Top 10 Mitigations

| OWASP Risk | Mitigation |
|------------|------------|
| A01 Broken Access Control | RBAC/ABAC middleware on every route, RLS in DB |
| A02 Cryptographic Failures | AES-256-GCM for tokens, bcrypt cost 12, TLS everywhere |
| A03 Injection | Prisma parameterized queries, Zod input validation, no raw SQL with user input |
| A04 Insecure Design | DDD with invariant enforcement in domain layer |
| A05 Security Misconfiguration | Secrets Manager, no `.env` in prod, Helmet headers |
| A06 Vulnerable Components | Dependabot + npm audit in CI, lock file committed |
| A07 Auth Failures | Refresh token rotation, account lockout after N failures |
| A08 Integrity Failures | Webhook signature verification (HMAC-SHA256), content type enforcement |
| A09 Logging Failures | Structured JSON logs, audit trail, no PII in log fields |
| A10 SSRF | Block RFC 1918 in outbound HTTP clients, allowlist external hosts |

---

## 6. API Design Standards

### 6.1 URL Convention

```
Base:     https://api.vartalap.com/v1
Webhooks: https://api.vartalap.com/webhook/...  (no version prefix)
Public:   https://api.vartalap.com/public/v1     (no auth, rate-limited)

Pattern:  /v1/{resource}[/{id}][/{sub-resource}]

Examples:
  GET    /v1/appointments
  POST   /v1/appointments
  GET    /v1/appointments/:id
  PATCH  /v1/appointments/:id
  DELETE /v1/appointments/:id
  GET    /v1/appointments/:id/payments
  POST   /v1/appointments/:id/check-in     (action)
  POST   /v1/appointments/:id/cancel       (action)
  GET    /v1/staff/:id/available-slots
```

### 6.2 Standard Response Envelope

```typescript
// Success (200/201)
{
  "data": { ... },          // single resource
  "meta": {
    "requestId": "req_01j...",
    "timestamp": "2026-06-07T10:00:00.000Z"
  }
}

// Success (paginated list)
{
  "data": [ ... ],
  "pagination": {
    "cursor": "eyJpZCI6IjEyMyJ9",
    "hasMore": true,
    "total": 1547           // only when cheap to compute
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}

// Error
{
  "error": {
    "code": "APPOINTMENT_SLOT_TAKEN",       // machine-readable
    "message": "The selected time slot is no longer available.",
    "details": [                            // validation errors
      { "field": "startAt", "message": "Must be in the future" }
    ]
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### 6.3 HTTP Method Semantics

```
GET    — idempotent read, never mutates state
POST   — create resource or execute action
PUT    — full replacement (rare — prefer PATCH)
PATCH  — partial update (merge semantics, not replace)
DELETE — soft-delete (set deletedAt) except where hard delete is required
```

### 6.4 Pagination (Cursor-based)

```
GET /v1/appointments?cursor=<opaque>&limit=50&sort=startAt:desc

Cursor is base64(JSON({ field: "startAt", value: "2026-06-07T...", id: "uuid" }))
Allows stable pagination even as records are inserted mid-page.
```

### 6.5 Filtering & Sorting

```
GET /v1/appointments
  ?status=CONFIRMED,PENDING       CSV enum filter
  &staffId=uuid                   exact match
  &startAt[gte]=2026-06-01        range operator
  &startAt[lte]=2026-06-30
  &q=John                         full-text search
  &sort=startAt:asc               field:direction
  &fields=id,status,startAt       sparse fieldset
```

### 6.6 Error Codes Reference

```typescript
export const ErrorCodes = {
  // Auth (1xxx)
  UNAUTHORIZED:                '1001',
  TOKEN_EXPIRED:               '1002',
  TOKEN_REUSE_DETECTED:        '1003',
  INSUFFICIENT_PERMISSIONS:    '1004',

  // Scheduling (2xxx)
  SLOT_NOT_AVAILABLE:          '2001',
  SLOT_LOCKED:                 '2002',
  STAFF_NOT_AVAILABLE:         '2003',
  SERVICE_NOT_FOUND:           '2004',
  APPOINTMENT_CANNOT_CANCEL:   '2005',

  // Payment (3xxx)
  PAYMENT_FAILED:              '3001',
  INSUFFICIENT_WALLET_BALANCE: '3002',
  PAYMENT_ALREADY_SETTLED:     '3003',

  // Validation (4xxx)
  VALIDATION_ERROR:            '4001',
  RESOURCE_NOT_FOUND:          '4004',
  CONFLICT:                    '4009',

  // System (5xxx)
  INTERNAL_ERROR:              '5001',
  SERVICE_UNAVAILABLE:         '5003',
} as const;
```

### 6.7 Versioning Strategy

- Current version: **v1**
- Breaking changes require a new version (`v2`)
- Non-breaking additive changes are allowed in existing version
- Deprecated fields are marked with `x-deprecated-since` in OpenAPI spec
- Old version supported for **12 months** after new version GA
- Version announced in `Sunset` and `Deprecation` response headers

---

## 7. Performance Optimization Strategy

### 7.1 Caching Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│ CACHE LAYER DECISION MATRIX                                      │
├──────────────────────────┬──────────┬──────────┬───────────────┤
│ Data                     │ TTL      │ Strategy │ Key Pattern   │
├──────────────────────────┼──────────┼──────────┼───────────────┤
│ Scheduled services list  │ 5 min    │ Read-thru│ svc:{bid}     │
│ Staff profiles           │ 10 min   │ Read-thru│ staff:{bid}   │
│ Business config          │ 30 min   │ Read-thru│ cfg:{bid}     │
│ Available slots (day)    │ 60 sec   │ Read-thru│ slots:{bid}:{staffId}:{date} │
│ WhatsApp templates       │ 60 min   │ Read-thru│ tpl:{bid}     │
│ Subscription status      │ 5 min    │ Read-thru│ sub:{bid}     │
│ Session (JWT substitute) │ 15 min   │ Write-thru│ sess:{jti}   │
│ Slot lock                │ 30 sec   │ SETNX/NX │ lock:slot:{...} │
│ Rate limit counters      │ window   │ ZADD/ZCARD│ rl:{ip/uid}  │
│ Idempotency key          │ 24 hr    │ SET NX   │ idem:{bid}:{key} │
└──────────────────────────┴──────────┴──────────┴───────────────┘
```

**Cache-aside pattern:**
```typescript
async function getScheduledServices(businessId: string): Promise<ScheduledService[]> {
  const cacheKey = `svc:${businessId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  const services = await prisma.scheduledService.findMany({
    where: { businessId, isActive: true, deletedAt: null },
  });
  await redis.setex(cacheKey, 300, JSON.stringify(services));
  return services;
}

// Invalidate on mutation:
async function updateService(id: string): Promise<void> {
  const service = await getServiceById(id);
  await prisma.scheduledService.update({ where: { id }, data: ... });
  await redis.del(`svc:${service.businessId}`);
}
```

### 7.2 Query Optimization

```typescript
// BEFORE (N+1 problem in current availability engine):
for (const staff of staffList) {
  const appointments = await prisma.appointment.findMany({ where: { staffId: staff.id } });
  // ...
}

// AFTER (batch load):
const appointments = await prisma.appointment.findMany({
  where: {
    staffId: { in: staffList.map(s => s.id) },
    startAt: { gte: rangeStart, lte: rangeEnd },
    status: { in: ACTIVE_APPT },
  },
});
const byStaff = groupBy(appointments, 'staffId');
```

### 7.3 Expected Response Times (p95 targets)

| Endpoint | Target p95 | Notes |
|----------|-----------|-------|
| GET /v1/appointments | < 100ms | Paginated, read replica |
| GET /v1/staff/:id/available-slots | < 200ms | Redis cache after first call |
| POST /v1/appointments | < 300ms | Includes slot lock |
| GET /v1/inbox/conversations | < 150ms | Covered index |
| POST /v1/messages/send | < 500ms | External WhatsApp API |
| POST /v1/campaigns/send | < 200ms | Queued, returns jobId |
| WebSocket inbox update | < 50ms | Redis pub/sub fan-out |

### 7.4 Connection Pooling

```typescript
// PgBouncer in front of Postgres
// Application: max 5 connections per pod (PgBouncer handles the rest)
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL, // points to PgBouncer
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 3_000,
});

// Separate read pool for analytics/reports
const readPool = new pg.Pool({
  connectionString: process.env.DATABASE_READ_URL, // replica via PgBouncer
  max: 10,
});
```

### 7.5 Background Processing

- All webhook processing is async (ack 200 immediately, enqueue)
- All reminder/notification dispatch via queue workers
- Availability slot computation cached in Redis
- Heavy analytics queries run against read replica
- Long-running operations (bulk campaign) use job queue with progress events

---

## 8. Event-Driven Architecture

### 8.1 Event Broker

**Recommendation: AWS SQS + SNS for cloud-native, RabbitMQ for self-hosted**

The current optional RabbitMQ integration is the right direction. Formalize it as the backbone:

```
Event Publishers:
  AppointmentService → appointment.* events
  MessagingService   → message.received, message.sent
  BillingService     → payment.success, subscription.activated
  WebhookIngestion   → whatsapp.message.received, whatsapp.status.*

Event Consumers:
  NotificationWorker ← appointment.created, appointment.status_changed
  ReminderScheduler  ← appointment.created
  AiBot              ← message.received (customer inbound)
  RealtimePublisher  ← all events (fan-out to WebSockets)
  AuditLogWriter     ← all events
  CalendarSyncer     ← appointment.created, appointment.cancelled
  WaitlistNotifier   ← appointment.cancelled (slot freed)
```

### 8.2 Event Contract

```typescript
// core/events/DomainEvent.ts
interface DomainEvent<T = unknown> {
  id: string;              // Event UUID
  type: string;            // 'appointment.created'
  version: number;         // Schema version for evolution
  businessId: string;
  occurredAt: string;      // ISO 8601
  payload: T;
  metadata: {
    correlationId: string; // Trace through system
    causationId: string;   // Event that caused this
    actorId?: string;
    source: string;        // 'scheduling-service', 'webhook'
  };
}

// Example: appointment.created
interface AppointmentCreatedPayload {
  appointmentId: string;
  appointmentNumber: string;
  customerId: string;
  staffId: string;
  serviceId: string;
  locationId: string;
  startAt: string;
  endAt: string;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
}
```

### 8.3 Dead Letter Queue & Retry

```typescript
// infrastructure/queue/RabbitMQConsumer.ts
class RabbitMQConsumer {
  async consume(queue: string, handler: EventHandler): Promise<void> {
    await this.channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'vartalap.dlx',
        'x-dead-letter-routing-key': `${queue}.dead`,
        'x-message-ttl': 3_600_000,  // 1 hour max TTL
      },
    });

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;
      const event = JSON.parse(msg.content.toString());
      const retryCount = msg.properties.headers?.['x-retry-count'] ?? 0;

      try {
        await handler(event);
        this.channel.ack(msg);
      } catch (error) {
        if (retryCount >= 3) {
          // Send to DLQ after 3 retries
          this.channel.nack(msg, false, false);
          this.alerting.notify('queue.dlq_message', { queue, event, error });
        } else {
          // Exponential backoff re-queue
          const delay = Math.pow(2, retryCount) * 1000;
          setTimeout(() => {
            this.channel.nack(msg, false, true);
          }, delay);
        }
      }
    });
  }
}
```

### 8.4 Idempotency

Every consumer must be idempotent:
```typescript
async function handleAppointmentCreated(event: DomainEvent<AppointmentCreatedPayload>): Promise<void> {
  const processed = await redis.get(`event:processed:${event.id}`);
  if (processed) return; // Already handled

  await processEvent(event);
  
  await redis.setex(`event:processed:${event.id}`, 86400, '1');
}
```

---

## 9. Observability Architecture

### 9.1 Three Pillars

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│    LOGS      │  │   METRICS    │  │   TRACES     │
│ Structured   │  │ Prometheus   │  │ OpenTelemetry│
│ JSON (pino)  │  │ + Grafana    │  │ Jaeger/Tempo │
│ CloudWatch   │  │              │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                  │
       └─────────────────┼──────────────────┘
                         │
                   Grafana Unified
                   Observability Stack
```

### 9.2 Structured Logging

```typescript
// core/logger.ts — replace current log() with pino
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'vartalap-api',
    env: process.env.NODE_ENV,
    version: process.env.APP_VERSION,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: ['req.headers.authorization', 'password', 'accessToken', 'refreshToken'],
    censor: '[REDACTED]',
  },
});

// Usage pattern:
logger.info({
  event: 'appointment.created',
  appointmentId,
  businessId,
  staffId,
  correlationId: req.correlationId,
  durationMs: Date.now() - start,
});
```

**Log fields convention:**
| Field | Type | Always Present | Description |
|-------|------|---------------|-------------|
| `event` | string | ✓ | Snake_case event name |
| `level` | string | ✓ | info/warn/error |
| `correlationId` | string | ✓ | From X-Request-ID header |
| `businessId` | string | context | Tenant ID |
| `userId` | string | context | Actor ID |
| `durationMs` | number | perf events | Execution time |
| `err.message` | string | errors | Error description |
| `err.stack` | string | errors | Only in dev |

### 9.3 Metrics

```typescript
// Prometheus metrics via prom-client
import client from 'prom-client';

// HTTP request duration histogram
const httpDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
});

// Business metrics
const appointmentsCreated = new client.Counter({
  name: 'appointments_created_total',
  help: 'Total appointments created',
  labelNames: ['business_id', 'location_id'],
});

const slotLockConflicts = new client.Counter({
  name: 'slot_lock_conflicts_total',
  help: 'Number of slot lock conflicts (concurrent booking race)',
});

const aiResponseDuration = new client.Histogram({
  name: 'ai_response_duration_ms',
  help: 'AI LLM response time in ms',
  labelNames: ['provider', 'model'],
  buckets: [200, 500, 1000, 2000, 5000, 10000],
});
```

### 9.4 Distributed Tracing (OpenTelemetry)

```typescript
// infrastructure/tracing/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PrismaInstrumentation(),
  ],
});

// Span enrichment in middleware:
app.use((req, res, next) => {
  const span = trace.getActiveSpan();
  span?.setAttributes({
    'business.id': req.user?.businessId,
    'user.id': req.user?.userId,
    'http.correlation_id': req.correlationId,
  });
  next();
});
```

### 9.5 Alerting Rules

```yaml
# Grafana alert rules
groups:
  - name: vartalap-api
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 2m
        annotations:
          summary: "Error rate > 5% for 2 minutes"

      - alert: SlowAppointmentCreation
        expr: histogram_quantile(0.95, http_request_duration_ms{route="/v1/appointments",method="POST"}) > 1000
        for: 5m

      - alert: QueueBacklog
        expr: rabbitmq_queue_messages{queue="scheduling.tick.reminders"} > 1000
        for: 5m

      - alert: DatabaseConnectionPoolExhausted
        expr: pg_pool_idle_connections < 2
        for: 1m
```

---

## 10. DevOps Architecture

### 10.1 Repository Structure

```
vartalap/
├── apps/
│   ├── api/             # Main application (was backend/)
│   ├── worker/          # Background job process
│   ├── ws-gateway/      # WebSocket process (Phase 3)
│   └── web/             # Frontend (was frontend/)
├── packages/
│   ├── database/        # Prisma schema + migrations
│   ├── types/           # Shared TypeScript types
│   └── config/          # Shared runtime config
├── infrastructure/
│   ├── terraform/       # AWS IaC
│   ├── helm/            # Kubernetes Helm charts
│   └── docker/          # Dockerfiles
└── .github/
    └── workflows/       # CI/CD pipelines
```

### 10.2 Branching Strategy (GitHub Flow + Environment Branches)

```
main         ── production (protected, requires 2 approvals)
  └── staging ── pre-production (protected, 1 approval)
        └── feature/APT-123-slot-locking ── feature branches
        └── fix/APT-456-reminder-crash
```

### 10.3 CI/CD Pipeline

```yaml
# .github/workflows/api-ci.yml
name: API CI/CD
on:
  push:
    branches: [main, staging]
    paths: [apps/api/**, packages/**]
  pull_request:
    branches: [main, staging]

jobs:
  quality:
    steps:
      - TypeScript compilation (tsc --noEmit)
      - ESLint + Prettier check
      - Zod schema validation tests
      - Unit tests (Vitest)
      - Integration tests (Testcontainers)
      - Security audit (npm audit --audit-level=moderate)
      - SAST scan (CodeQL)

  build:
    needs: quality
    steps:
      - Docker build (multi-stage)
      - Push to ECR with SHA tag
      - Vulnerability scan (Trivy)

  deploy-staging:
    needs: build
    if: branch == 'staging'
    steps:
      - helm upgrade --install vartalap-staging
      - Run smoke tests
      - Notify Slack

  deploy-production:
    needs: build
    if: branch == 'main'
    steps:
      - helm upgrade --install vartalap-prod (blue-green)
      - Run smoke + synthetic tests
      - Notify Slack
```

### 10.4 Docker (Multi-Stage)

```dockerfile
# infrastructure/docker/api.Dockerfile
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS build
COPY --from=base /app/node_modules ./node_modules
COPY . .
RUN npm run build   # tsc

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# Non-root user
RUN addgroup -S vartalap && adduser -S vartalap -G vartalap
COPY --from=build --chown=vartalap:vartalap /app/dist ./dist
COPY --from=build --chown=vartalap:vartalap /app/node_modules ./node_modules
COPY --from=build --chown=vartalap:vartalap /app/package.json .
USER vartalap
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s CMD curl -f http://localhost:3000/health
CMD ["node", "dist/server.js"]
```

### 10.5 Kubernetes / Helm

```yaml
# infrastructure/helm/vartalap/values.yaml
api:
  replicaCount: 3
  image:
    repository: 123456789.dkr.ecr.ap-south-1.amazonaws.com/vartalap-api
    tag: latest
  resources:
    requests: { cpu: 250m, memory: 256Mi }
    limits:   { cpu: 1000m, memory: 512Mi }
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70
    targetMemoryUtilizationPercentage: 80
  livenessProbe:
    path: /health
    initialDelaySeconds: 30
    periodSeconds: 10
  readinessProbe:
    path: /health/ready
    initialDelaySeconds: 5
    periodSeconds: 5

worker:
  replicaCount: 2
  resources:
    requests: { cpu: 100m, memory: 128Mi }
    limits:   { cpu: 500m, memory: 256Mi }

pgbouncer:
  replicaCount: 2
  maxClientConn: 1000
  defaultPoolSize: 25
```

---

## 11. Database Migration Plan

### 11.1 Migration Phases

```
Phase 1 — Non-breaking additions (weeks 1–2)
  ✓ Add refresh_tokens table
  ✓ Add audit_logs table (partitioned)
  ✓ Add scheduling_settings table
  ✓ Add encrypted token columns to calendar_connections
  ✓ Add correlation_id to all future requests

Phase 2 — Data migration (weeks 3–4)
  ✓ Backfill scheduling_settings from BusinessConfig.schedulingSettings JSON
  ✓ Encrypt existing CalendarConnection tokens
  ✓ Backfill CustomerAppointmentStats for existing appointments
  ✓ Mark legacy Booking model as deprecated in schema

Phase 3 — Cutover (weeks 5–6)
  ✓ Deploy new API reading from new columns (dual-read from old+new)
  ✓ Run shadow comparison in production (log discrepancies)
  ✓ Cut write path to new tables
  ✓ Remove dual-read after 2-week stable window

Phase 4 — Cleanup (week 7+)
  ✓ Remove JSON blob columns (schedulingSettings, old services JSON)
  ✓ Drop legacy Booking table (retain as archive first)
  ✓ Remove Supabase dual-write code
```

### 11.2 Zero-Downtime Migration Strategy

```sql
-- Step 1: Add new column nullable (instant)
ALTER TABLE business_configs ADD COLUMN scheduling_settings_v2_id UUID;

-- Step 2: Backfill in batches (no table lock)
DO $$
DECLARE batch_size INT := 1000;
        last_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  LOOP
    INSERT INTO scheduling_settings (business_id, booking_advance_days, ...)
    SELECT bc.business_id,
           (bc.scheduling_settings->>'bookingAdvanceDays')::int,
           ...
    FROM business_configs bc
    WHERE bc.id > last_id
      AND bc.scheduling_settings_v2_id IS NULL
    ORDER BY bc.id
    LIMIT batch_size;

    UPDATE business_configs SET scheduling_settings_v2_id = ss.id
    FROM scheduling_settings ss
    WHERE ss.business_id = business_configs.business_id
      AND business_configs.scheduling_settings_v2_id IS NULL
      AND business_configs.id > last_id
    RETURNING business_configs.id INTO last_id;

    EXIT WHEN NOT FOUND;
    PERFORM pg_sleep(0.1); -- rate limit backfill
  END LOOP;
END $$;

-- Step 3: Add NOT NULL after all rows backfilled
ALTER TABLE business_configs ALTER COLUMN scheduling_settings_v2_id SET NOT NULL;

-- Step 4: Drop old JSON column (after code cutover)
ALTER TABLE business_configs DROP COLUMN scheduling_settings;
```

### 11.3 Rollback Strategy

Every Prisma migration ships with a matching `down` migration:
```
prisma/migrations/
  20260607_001_add_refresh_tokens/
    migration.sql        ← up
    rollback.sql         ← down
    verify.sql           ← data integrity checks
```

Blue-green deployment allows instant traffic rollback without data migration.

---

## 12. Scalability Roadmap

### 12.1 Stage 1: 0 → 10k Active Businesses (Current scale)

**Target:** < 50 req/s peak, < 100 concurrent WebSocket connections per instance

| Action | Why |
|--------|-----|
| Add PgBouncer | Prevent connection exhaustion |
| Separate Worker from API process | Stability — worker crash doesn't kill HTTP |
| TypeScript migration | Catch errors before production |
| Add Redis rate limiting | Shared across instances |
| Add `/health/ready` endpoint | Proper K8s readiness probes |

**Infrastructure:** 2 API pods + 1 Worker pod + 1 PgBouncer + 1 Redis (ElastiCache Serverless)

### 12.2 Stage 2: 10k → 100k Active Businesses

**Target:** < 500 req/s peak, < 1k concurrent WebSocket connections

| Action | Why |
|--------|-----|
| Read replica routing | Offload analytics/reports from primary |
| Redis Cluster mode | Cache + pub/sub at scale |
| Add CDN for static assets | Reduce API load |
| Horizontal pod autoscaler | Auto-scale API 2–10 pods |
| Separate WebSocket pods | Stateful WS needs dedicated scaling |
| Add full-text search index | Customer search, message search |
| Queue-based webhook processing | Meta can burst to 10k msgs/s |

**Infrastructure:** 3–10 API pods + 2 Worker pods + 2 WS pods + PgBouncer + Redis Cluster + Aurora Multi-AZ

### 12.3 Stage 3: 100k → 1M Active Businesses

**Target:** < 5k req/s peak, < 50k concurrent WebSocket connections

| Action | Why |
|--------|-----|
| Extract AI Agent Service | LLM calls are slow and need separate scaling |
| Kafka/SQS for events | Higher throughput than RabbitMQ |
| pgvector for semantic search | Customer context, message embeddings |
| Read-only API tier (CQRS) | Heavy analytics on separate path |
| Multi-region deployment | Latency for international businesses |
| Tiered Redis caching | L1 in-process (LRU), L2 Redis |
| Database sharding by businessId | If single cluster approaches limits |

**Infrastructure:** EKS multi-AZ, Aurora Global, Redis Enterprise, Kafka MSK

### 12.4 Stage 4: 1M → 10M Active Businesses

**Target:** Multi-region, 99.99% uptime, global traffic

| Action | Why |
|--------|-----|
| Full microservices extraction | Independent deployment at scale |
| CockroachDB / Aurora Global | Multi-region writes |
| Edge API (Cloudflare Workers) | Sub-50ms globally |
| AI inference optimization | Fine-tuned models, local inference |
| Event sourcing for audit | Immutable audit log at scale |
| Data mesh architecture | Business intelligence at scale |

---

## 13. Disaster Recovery Plan

### 13.1 Backup Strategy

| Asset | Method | Frequency | Retention |
|-------|--------|-----------|-----------|
| PostgreSQL | AWS RDS automated backup | Continuous PITR | 35 days |
| PostgreSQL | Manual snapshot before migrations | On-demand | 90 days |
| Redis | ElastiCache snapshots | Daily | 7 days |
| S3 (media) | Cross-region replication | Continuous | 1 year |
| Secrets | Secrets Manager versioned | Always | Indefinite |
| Code | Git + ECR image tags | On every push | 90 days ECR |

### 13.2 Recovery Targets

| Scenario | RTO | RPO | Strategy |
|----------|-----|-----|----------|
| Pod crash | < 30s | 0 | K8s restart + health check |
| AZ failure | < 2 min | 0 | Multi-AZ EKS + Aurora Multi-AZ failover |
| Region failure | < 30 min | < 1 min | Route 53 failover to DR region |
| DB corruption | < 4 hours | < 5 min | PITR restore |
| Complete data loss | < 24 hours | < 24 hours | Daily snapshot restore |

### 13.3 Failover Architecture

```
Primary Region (ap-south-1)          DR Region (ap-southeast-1)
  EKS Cluster (active)                 EKS Cluster (warm standby)
  Aurora Primary                       Aurora Read Replica (global)
  ElastiCache (primary)                ElastiCache (replica)
  S3 (source)                          S3 (replicated)
        │                                    │
        └────────── Route 53 ────────────────┘
                   (failover policy)
```

---

## 14. Backend Coding Standards

### 14.1 TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": false,
    "outDir": "dist",
    "paths": {
      "@domain/*": ["src/modules/*/domain/*"],
      "@app/*": ["src/modules/*/application/*"],
      "@infra/*": ["src/infrastructure/*"],
      "@core/*": ["src/core/*"]
    }
  }
}
```

### 14.2 Naming Conventions

```typescript
// Classes: PascalCase
class AppointmentService {}
class PrismaAppointmentRepository {}

// Interfaces: IPrefixed or descriptive
interface IAppointmentRepository {}  // ports/contracts
interface AppointmentDTO {}           // data transfer objects

// Types: PascalCase
type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

// Functions: camelCase, verb-first
async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {}
async function getAvailableSlots(params: SlotQueryParams): Promise<Slot[]> {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_CONCURRENT_BOOKINGS = 50;
const SLOT_LOCK_TTL_SEC = 30;

// Files:
//   Classes/services: PascalCase.ts         → AppointmentService.ts
//   Route files: kebab-case.routes.ts       → scheduling.routes.ts
//   Types/interfaces: camelCase.types.ts    → appointment.types.ts
//   Utils: camelCase.utils.ts               → timeUtils.ts
```

### 14.3 Repository Pattern

```typescript
// application/ports/IAppointmentRepository.ts
interface IAppointmentRepository {
  findById(id: string, businessId: string): Promise<Appointment | null>;
  findMany(query: AppointmentQuery): Promise<PaginatedResult<Appointment>>;
  create(appointment: CreateAppointmentInput): Promise<Appointment>;
  update(id: string, businessId: string, updates: Partial<Appointment>): Promise<Appointment>;
  delete(id: string, businessId: string): Promise<void>;
}

// infrastructure/repositories/PrismaAppointmentRepository.ts
class PrismaAppointmentRepository implements IAppointmentRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: string, businessId: string): Promise<Appointment | null> {
    const row = await this.db.appointment.findFirst({
      where: { id, businessId },
      include: { staff: true, service: true, location: true },
    });
    return row ? AppointmentMapper.toDomain(row) : null;
  }
  // ...
}
```

### 14.4 Validation with Zod

```typescript
// modules/scheduling/application/schemas/CreateAppointment.schema.ts
import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
  customerId: z.string().uuid(),
  staffId: z.string().uuid(),
  serviceId: z.string().uuid(),
  locationId: z.string().uuid(),
  startAt: z.string().datetime(),
  appointmentType: z.enum(['IN_PERSON', 'ONLINE', 'HOME_VISIT']).default('IN_PERSON'),
  notes: z.string().max(1000).optional(),
  collectAdvance: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;

// Middleware
function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        error: {
          code: '4001',
          message: 'Validation failed',
          details: result.error.issues.map(i => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
      });
    }
    req.validatedBody = result.data;
    next();
  };
}
```

### 14.5 Error Handling

```typescript
// core/errors/AppError.ts
class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('4004', `${resource} not found: ${id}`, 404);
  }
}

class SlotUnavailableError extends AppError {
  constructor() {
    super('2001', 'The selected time slot is no longer available', 409);
  }
}

// Global error handler
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
      meta: { requestId: req.correlationId, timestamp: new Date().toISOString() },
    });
    return;
  }
  logger.error({ event: 'unhandled_error', err, correlationId: req.correlationId });
  res.status(500).json({
    error: { code: '5001', message: 'Internal server error' },
    meta: { requestId: req.correlationId, timestamp: new Date().toISOString() },
  });
}
```

---

## 15. Testing Strategy

### 15.1 Test Pyramid

```
                ┌──────┐
               /  E2E   \        5%   Playwright + real browser
              /──────────\
             / Integration\      20%  Supertest + Testcontainers (real DB)
            /──────────────\
           /   Unit Tests   \    75%  Vitest, no network, mocked ports
          /──────────────────\
```

### 15.2 Unit Tests

```typescript
// modules/scheduling/application/use-cases/__tests__/CreateAppointment.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CreateAppointmentUseCase } from '../CreateAppointment';
import { MockAppointmentRepository } from '../../__mocks__/MockAppointmentRepository';
import { MockSlotLockService } from '../../__mocks__/MockSlotLockService';

describe('CreateAppointmentUseCase', () => {
  it('throws SlotUnavailableError when slot is already locked', async () => {
    const mockLock = new MockSlotLockService();
    vi.spyOn(mockLock, 'acquireLock').mockResolvedValue(false); // lock denied

    const useCase = new CreateAppointmentUseCase(
      new MockAppointmentRepository(),
      mockLock,
    );

    await expect(useCase.execute(validInput)).rejects.toThrow(SlotUnavailableError);
  });

  it('creates appointment and publishes domain event', async () => {
    // ...
  });
});
```

### 15.3 Integration Tests (Testcontainers)

```typescript
// tests/integration/scheduling.test.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

describe('Appointment creation (integration)', () => {
  let pg: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let app: Express;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16').start();
    redis = await new RedisContainer('redis:7').start();
    await runMigrations(pg.getConnectionUri());
    app = createApp({ databaseUrl: pg.getConnectionUri(), redisUrl: redis.getConnectionUrl() });
  });

  it('POST /v1/appointments creates an appointment and locks the slot', async () => {
    const res = await request(app)
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${testJwt}`)
      .send(validAppointmentInput);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('CONFIRMED');
    // Verify slot is locked in Redis
    const lock = await redis.get(`lock:slot:${...}`);
    expect(lock).not.toBeNull();
  });
});
```

### 15.4 Coverage Targets

| Layer | Target |
|-------|--------|
| Domain entities | 100% |
| Use cases | 95% |
| Controllers (happy path) | 80% |
| Infrastructure adapters | 70% |
| Overall | **≥ 80%** |

### 15.5 Contract Tests

```typescript
// Consumer-driven contract tests with Pact
// Verify: WhatsApp webhook payload shape won't break processing
const whatsappWebhookProvider = new Pact({
  consumer: 'vartalap-api',
  provider: 'meta-whatsapp-api',
});

it('handles message webhook payload', async () => {
  await whatsappWebhookProvider.addInteraction({
    state: 'a text message is received',
    uponReceiving: 'a WhatsApp message webhook',
    withRequest: { method: 'POST', path: '/webhook' },
    willRespondWith: {
      status: 200,
      body: { ok: true },
    },
  });
});
```

---

## 16. AI-Ready Architecture

### 16.1 AI Module Structure

```
modules/ai/
├── domain/
│   ├── Conversation.ts
│   ├── AgentSession.ts
│   └── ToolCall.ts
├── application/
│   ├── use-cases/
│   │   ├── ProcessMessage.ts
│   │   ├── RunSchedulingAgent.ts
│   │   └── GenerateBookingConfirmation.ts
│   └── ports/
│       ├── ILlmProvider.ts       # Abstract LLM interface
│       ├── IVectorStore.ts       # Abstract vector DB
│       └── IEmbeddingProvider.ts
├── infrastructure/
│   ├── llm/
│   │   ├── OpenAiProvider.ts
│   │   ├── GroqProvider.ts
│   │   └── AnthropicProvider.ts  # Claude integration point
│   ├── vector/
│   │   └── PgVectorStore.ts      # pgvector via Prisma
│   └── embeddings/
│       └── OpenAiEmbeddings.ts
└── tools/
    ├── SchedulingTools.ts        # LLM tool-calling definitions
    ├── CustomerLookupTool.ts
    └── AppointmentTool.ts
```

### 16.2 LLM Provider Abstraction

```typescript
// application/ports/ILlmProvider.ts
interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

interface ILlmProvider {
  chat(params: {
    messages: LlmMessage[];
    tools?: LlmTool[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    content: string | null;
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
    usage: { promptTokens: number; completionTokens: number };
  }>;
}

// Easily switch between OpenAI, Groq, Anthropic Claude without changing business logic
```

### 16.3 RAG Architecture for Customer Context

```typescript
// When AI bot processes a customer message, enrich context with:
// 1. Customer's appointment history (structured data)
// 2. Previous conversation summaries (vector embeddings)
// 3. Business-specific knowledge (services, policies)

interface CustomerContext {
  appointments: AppointmentSummary[];      // Last 5 appointments
  conversationHistory: LlmMessage[];       // Last 10 messages
  customerProfile: CustomerProfile;        // Name, stats
  businessContext: BusinessContext;        // Services, working hours, policies
  relevantKnowledge: string[];             // RAG: top-K similar past queries
}

class CustomerContextBuilder {
  async build(customerId: string, currentMessage: string): Promise<CustomerContext> {
    const [appointments, history, profile, businessCtx, relevantKnowledge] = await Promise.all([
      this.getRecentAppointments(customerId),
      this.getConversationHistory(customerId),
      this.getCustomerProfile(customerId),
      this.getBusinessContext(businessId),
      this.vectorStore.similaritySearch(currentMessage, { k: 3, filter: { businessId } }),
    ]);
    return { appointments, conversationHistory: history, customerProfile: profile, businessContext: businessCtx, relevantKnowledge };
  }
}
```

### 16.4 Vector Database Integration (Phase 4)

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Conversation embeddings for RAG
CREATE TABLE conversation_embeddings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL,
  customer_id  UUID NOT NULL,
  content      TEXT NOT NULL,         -- summarized conversation chunk
  embedding    vector(1536),          -- OpenAI text-embedding-3-small
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW index for fast approximate nearest-neighbor
CREATE INDEX idx_conversation_embeddings_hnsw
  ON conversation_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## 17. Cost Optimization

### 17.1 Infrastructure Cost Estimates (AWS, ap-south-1)

#### Stage 1: 0–10k Businesses

| Service | Config | Monthly Cost (USD) |
|---------|--------|-------------------|
| EKS (2 nodes t3.medium) | 2 × $0.0416/h | ~$60 |
| RDS Aurora PostgreSQL (db.t3.medium) | $0.082/h | ~$60 |
| ElastiCache Redis (cache.t3.micro) | $0.017/h | ~$12 |
| ALB | ~$20/mo | ~$20 |
| S3 (50 GB media) | $0.023/GB | ~$2 |
| CloudWatch + logging | ~$10/mo | ~$10 |
| **Total** | | **~$164/mo** |

#### Stage 2: 10k–100k Businesses

| Service | Config | Monthly Cost (USD) |
|---------|--------|-------------------|
| EKS (5 nodes c5.xlarge) | 5 × $0.17/h | ~$620 |
| Aurora Multi-AZ (r6g.large) | $0.26/h × 2 | ~$380 |
| ElastiCache Redis Cluster | 3 nodes $0.068/h | ~$150 |
| PgBouncer (t3.small) | $0.02/h | ~$15 |
| ALB + WAF | | ~$50 |
| S3 (500 GB) | | ~$12 |
| CloudWatch/logging | | ~$50 |
| **Total** | | **~$1,277/mo** |

### 17.2 Cost-Saving Recommendations

| Recommendation | Savings |
|---------------|---------|
| Use Graviton3 (ARM) instances for worker pods | 20% CPU cost |
| Spot instances for non-critical workers | 60–70% worker cost |
| S3 intelligent tiering for media > 30 days | 40% storage cost |
| Neon serverless PostgreSQL at Stage 1 | ~$40/mo vs. RDS |
| Reserved instances for baseline capacity (1yr) | 40% compute |
| Redis TTL aggressiveness — cache eviction | Reduce cache size |
| Right-size EKS after 30 days of metrics | 20–30% |

---

## 18. Step-by-Step Implementation Plan

### Phase 1: Foundation (Weeks 1–4)
**Goal:** TypeScript, structure, no-regression on existing features

| # | Task | Owner | Risk | Deliverable |
|---|------|-------|------|-------------|
| 1.1 | Add TypeScript with `allowJs: true` incremental migration | Backend | Low | `tsconfig.json`, CI type-check passes |
| 1.2 | Add ESLint + Prettier + Husky pre-commit | Backend | Low | Consistent formatting enforced |
| 1.3 | Restructure folders: `modules/`, `infrastructure/`, `core/` | Backend | Medium | New directory layout, imports updated |
| 1.4 | Add Zod schemas for all existing controllers | Backend | Medium | All request bodies validated |
| 1.5 | Separate Worker process (`apps/worker/`) | Backend/DevOps | Medium | Worker runs independently |
| 1.6 | Add PgBouncer in front of Neon/RDS | DevOps | Low | DB connection pooling |
| 1.7 | Add correlation ID middleware | Backend | Low | `X-Request-ID` on all responses |
| 1.8 | Add structured logging (pino) | Backend | Low | JSON logs to CloudWatch |
| 1.9 | Add `/health/ready` + `/health/live` endpoints | Backend | Low | K8s-compatible health probes |
| 1.10 | Add Vitest + first unit tests for use cases | Backend | Low | Test suite running in CI |

**Dependencies:** None  
**Deliverables:** TypeScript compilation ✓, Zod validation ✓, Worker separated ✓, CI pipeline ✓

---

### Phase 2: Core Services Migration (Weeks 5–8)
**Goal:** Clean Architecture enforced across all modules

| # | Task | Owner | Risk | Deliverable |
|---|------|-------|------|-------------|
| 2.1 | Implement `modules/scheduling/` with domain entities | Backend | High | Domain entities with invariants |
| 2.2 | Extract Use Cases for appointment CRUD | Backend | High | Use cases tested independently |
| 2.3 | Implement `IAppointmentRepository` + Prisma adapter | Backend | Medium | Repository pattern |
| 2.4 | Move slot lock to Redis + `ISlotLockService` | Backend | Medium | Race-condition-safe booking |
| 2.5 | Migrate `modules/messaging/` (WhatsApp + AI bot) | Backend | Medium | AI bot with proper abstractions |
| 2.6 | Migrate `modules/billing/` (Razorpay) | Backend | Medium | Payment flow clean |
| 2.7 | Migrate `modules/campaigns/` | Backend | Medium | Bulk send with wallet |
| 2.8 | Add OpenAPI spec generation from Zod schemas | Backend | Low | Swagger UI at `/docs` |
| 2.9 | API versioning (`/v1/`) | Backend | Medium | All routes under `/v1` |
| 2.10 | Add integration tests (Testcontainers) | Backend | Medium | DB-backed tests in CI |

**Dependencies:** Phase 1 complete  
**Deliverables:** Clean arch enforced ✓, OpenAPI spec ✓, Integration tests ✓

---

### Phase 3: Security Hardening (Weeks 9–12)
**Goal:** Zero critical security issues

| # | Task | Owner | Risk | Deliverable |
|---|------|-------|------|-------------|
| 3.1 | Implement refresh token rotation | Backend | High | `/v1/auth/refresh` endpoint |
| 3.2 | Migrate to AWS Secrets Manager | DevOps | Medium | No secrets in env files |
| 3.3 | Encrypt CalendarConnection OAuth tokens | Backend | Medium | AES-256-GCM at application layer |
| 3.4 | Add audit log table + writer service | Backend | Medium | All mutations audited |
| 3.5 | Enable PostgreSQL RLS for all tenant tables | DB | High | Tenant isolation at DB layer |
| 3.6 | Add Redis-backed rate limiting (all endpoints) | Backend | Medium | Per-user + per-IP limits |
| 3.7 | RBAC middleware enforcement review | Backend | Medium | All routes protected correctly |
| 3.8 | Security scan integration (SAST + Trivy) | DevOps | Low | CI security gate |
| 3.9 | OWASP ZAP automated scan | Security | Low | DAST scan on staging |
| 3.10 | JWT key rotation procedure | DevOps | Medium | Documented + automated |

**Dependencies:** Phase 2 complete  
**Deliverables:** Refresh tokens ✓, Secrets Manager ✓, Audit logs ✓, RLS enabled ✓

---

### Phase 4: Observability (Weeks 13–15)
**Goal:** Full visibility into production

| # | Task | Owner | Risk | Deliverable |
|---|------|-------|------|-------------|
| 4.1 | OpenTelemetry instrumentation | Backend | Low | Traces in Jaeger/Tempo |
| 4.2 | Prometheus metrics endpoint | Backend | Low | `/metrics` scraped by Grafana |
| 4.3 | Grafana dashboard: API, DB, queue | DevOps | Low | Live dashboards |
| 4.4 | PagerDuty/Slack alerting rules | DevOps | Low | On-call alerts |
| 4.5 | Structured log aggregation (CloudWatch/Loki) | DevOps | Low | Searchable logs |
| 4.6 | SLI/SLO definitions | Engineering | Low | Error budget tracking |
| 4.7 | Synthetic monitoring (API canaries) | DevOps | Low | External availability checks |

**Dependencies:** Phase 1 (correlation IDs), Phase 2 (structured app)  
**Deliverables:** OTel traces ✓, Grafana dashboards ✓, Alerting ✓

---

### Phase 5: Scaling Infrastructure (Weeks 16–20)
**Goal:** Production-grade Kubernetes deployment

| # | Task | Owner | Risk | Deliverable |
|---|------|-------|------|-------------|
| 5.1 | Kubernetes migration (EKS/GKE) | DevOps | High | Apps running in K8s |
| 5.2 | Helm charts for all services | DevOps | Medium | Parameterized K8s manifests |
| 5.3 | HPA for API pods (CPU/RPS based) | DevOps | Medium | Auto-scaling works |
| 5.4 | Redis Cluster mode | DevOps | Medium | Pub/sub + cache at scale |
| 5.5 | Aurora Multi-AZ + read replica | DevOps | Medium | DB HA + read offload |
| 5.6 | Blue-green deployment pipeline | DevOps | Medium | Zero-downtime deploys |
| 5.7 | Database migration: JSON → typed columns | Backend | High | SchedulingSettings table live |
| 5.8 | Remove legacy Booking model | Backend | Medium | Single appointment model |
| 5.9 | pgvector extension + customer embeddings | Backend | Low | Semantic search ready |
| 5.10 | Load testing (k6) — 10k concurrent users | QA | Low | Capacity validated |

**Dependencies:** Phases 1–4 complete  
**Deliverables:** K8s running ✓, DB migrated ✓, Load test passed ✓

---

### Phase 6: Production Launch (Week 21+)
**Goal:** Full cutover with zero downtime

| # | Task | Owner | Risk | Deliverable |
|---|------|-------|------|-------------|
| 6.1 | Canary deploy (5% traffic to new stack) | DevOps | High | Monitor error rates |
| 6.2 | 50% traffic split + comparison | DevOps | High | No regression |
| 6.3 | Full cutover | DevOps | High | Old stack retired |
| 6.4 | Runbook documentation | Engineering | Low | Incident playbooks |
| 6.5 | Disaster recovery drill | DevOps | Medium | RTO/RPO validated |
| 6.6 | Security penetration test | Security | Low | External pentest report |
| 6.7 | Performance report vs. targets | Engineering | Low | SLO compliance confirmed |

---

## 19. Master AI Coding Agent Prompt

---

```
==============================================================================
MASTER IMPLEMENTATION PROMPT — VARTALAP BACKEND MODERNIZATION
Use with: Claude Code, Cursor, Windsurf, GitHub Copilot Agent, Aider
==============================================================================

You are implementing a production-grade Node.js/TypeScript backend for Vartalap,
a multi-tenant WhatsApp business platform. The existing backend is in
`backend/src/` (JavaScript, Express, Prisma). You are rebuilding it
incrementally in `apps/api/` following the architecture defined in
docs/BACKEND_MODERNIZATION_TDD.md.

READ THAT DOCUMENT FULLY BEFORE WRITING ANY CODE.

═══════════════════════════════════════════════════════════════════════════════
SECTION A — NON-NEGOTIABLE ARCHITECTURE RULES
═══════════════════════════════════════════════════════════════════════════════

A1. LANGUAGE
  ✓ TypeScript strict mode (`strict: true`, `noUncheckedIndexedAccess: true`)
  ✓ ESM modules (`"type": "module"` in package.json)
  ✓ Node.js ≥22 LTS
  ✓ Target: ES2022
  ✗ Never use `any` — use `unknown` and narrow
  ✗ Never use `as <Type>` casts except for DOM types or external untyped libs
  ✗ Never use non-null assertion `!` unless the reason is documented in a comment

A2. FOLDER LAYOUT (ENFORCE ALWAYS)
  apps/
    api/src/
      modules/
        {domain}/
          domain/           ← entities, value objects, domain events
          application/
            use-cases/      ← one file per use case
            queries/        ← read-only queries
            ports/          ← interfaces (IRepository, IService)
            schemas/        ← Zod schemas (co-located with use cases)
          infrastructure/
            repositories/   ← Prisma implementations of ports
            adapters/       ← external service adapters
          presentation/
            {domain}.controller.ts
            {domain}.routes.ts
      infrastructure/
        database/
          prisma.ts         ← PrismaClient singleton
          pgpool.ts         ← pg.Pool via PgBouncer
        cache/
          redis.ts          ← ioredis singleton
          cache.service.ts  ← typed get/set/del/setex helpers
        queue/
          rabbitmq.ts       ← channel management
          consumer.ts       ← retry + DLQ logic
          publisher.ts      ← typed event publish
        storage/
          s3.service.ts
        tracing/
          otel.ts           ← OTEL SDK bootstrap
      api/
        v1/
          middlewares/
            auth.middleware.ts
            rate-limit.middleware.ts
            validate.middleware.ts
            correlation-id.middleware.ts
            tenant-context.middleware.ts
          routes/
            index.ts        ← mounts all v1 routes
        webhooks/
          webhook.routes.ts
        app.ts
        server.ts
      core/
        errors/
          AppError.ts
          error-codes.ts
        logger.ts
        config.ts           ← typed env config with Zod
        types/
          common.types.ts
          pagination.types.ts
    worker/src/
      workers.registry.ts
      workers/
        reminders.worker.ts
        waitlist.worker.ts
        calendar-sync.worker.ts
        rebooking.worker.ts
        idempotency-purge.worker.ts

A3. DEPENDENCY DIRECTION (NEVER VIOLATE)
  presentation → application (use cases / queries)
  application → domain
  infrastructure → application (implements ports)
  core → nothing in src/

  FORBIDDEN:
  - domain → application or infrastructure
  - use case → another module's use case (go via domain event or direct call through port)
  - controller → repository directly (must go through use case)
  - route handler inline DB queries (NEVER like the current api.routes.js:32-46)

A4. CONFIGURATION
  ✓ All env vars declared as typed Zod schema in `core/config.ts`
  ✓ Process exits on startup if required vars are missing (fail fast)
  ✓ Secrets are fetched from AWS Secrets Manager in production (never `.env` in prod)
  ✓ Provide `.env.example` with all variables documented
  ✗ Never access `process.env` outside of `core/config.ts` and `core/secrets.ts`

A5. REQUEST LIFECYCLE
  Every HTTP request must pass through, in order:
  1. `correlationIdMiddleware` — generates or reads `X-Request-ID`, attaches to req
  2. `helmet()` — security headers
  3. `cors()` — origin allowlist
  4. `rateLimitMiddleware` — Redis sliding-window
  5. `authMiddleware` — JWT verify, attach req.user
  6. `tenantContextMiddleware` — set app.business_id for RLS
  7. `validateBody(Schema)` — Zod parse, return 422 on failure
  8. Controller → Use Case
  9. Use Case → Repository / Domain
  10. Response wrapper — always `{ data, meta: { requestId, timestamp } }`
  11. `errorHandler` — catches AppError and unknown errors

═══════════════════════════════════════════════════════════════════════════════
SECTION B — DATABASE RULES
═══════════════════════════════════════════════════════════════════════════════

B1. ORM
  ✓ Use Prisma 7+ with `@prisma/adapter-pg` (pg.Pool via PgBouncer DSN)
  ✓ Schema file: `packages/database/prisma/schema.prisma`
  ✓ Every migration gets an `up` SQL and a `down` SQL (rollback)
  ✓ No `prisma db push` in production — always `prisma migrate deploy`
  ✗ Never use `$executeRaw` with user-supplied values — always parameterized
  ✗ Never use `prisma.$queryRaw` when Prisma model queries cover the case

B2. MULTI-TENANCY
  ✓ Every data-returning function takes `businessId: string` as a required param
  ✓ Every Prisma query on a tenant-scoped table includes `where: { businessId }`
  ✓ RLS is the last line of defense — application code is the first
  ✓ Enable `SCHEDULING_RLS_ENABLED=1` in production
  ✗ Never return rows without scoping to businessId

B3. QUERIES
  ✓ Use cursor-based pagination for all list queries (never OFFSET on large tables)
  ✓ Run heavy analytics queries against the read replica pool
  ✓ Use `select` to return only needed fields (avoid `SELECT *` on wide tables)
  ✓ Add `explain analyze` output for any query taking >50ms in tests
  ✗ Never load unbounded collections into memory (always paginate or stream)

B4. TRANSACTIONS
  ✓ Any operation touching >1 table uses `prisma.$transaction(async (tx) => {...})`
  ✓ Keep transactions short (< 500ms) — no external API calls inside transactions
  ✗ Never hold a transaction open while calling WhatsApp API, Razorpay, etc.

B5. MODELS REQUIRING SPECIAL CARE
  - `CalendarConnection.accessToken` / `refreshToken`: MUST be encrypted with
    AES-256-GCM using `CALENDAR_TOKEN_SECRET` before writing, decrypted on read.
  - `User.password`: MUST be bcrypt hash (cost 12). Never log or return.
  - `RefreshToken.tokenHash`: Store SHA-256 of raw token only.
  - `AuditLog`: Write-only. Never update or delete audit log rows.

═══════════════════════════════════════════════════════════════════════════════
SECTION C — SECURITY RULES
═══════════════════════════════════════════════════════════════════════════════

C1. AUTHENTICATION
  ✓ Access tokens: JWT HS256, TTL 15 minutes, contains: sub, bid, role, email, jti
  ✓ Refresh tokens: 256-bit random (crypto.randomBytes(32)), stored as SHA-256 hash
  ✓ Refresh rotation: each use issues a new refresh token, revokes old one
  ✓ Reuse detection: if an already-used token is presented, revoke entire family
  ✓ Refresh token in HttpOnly, Secure, SameSite=Strict cookie
  ✗ Never return access token in a cookie (XSS risk)
  ✗ Never put sensitive data in JWT payload (no password hash, no OAuth tokens)

C2. AUTHORIZATION
  ✓ Every route handler that mutates data checks: businessId === req.user.businessId
  ✓ CHIEF_ADMIN can act on any business (explicitly checked, not implied)
  ✓ STAFF cannot perform billing, admin, or bulk send operations
  ✓ OWNER cannot impersonate other businesses (only CHIEF_ADMIN can)
  ✗ Never trust businessId from request body/params alone — always use req.user.businessId
    for write operations

C3. INPUT VALIDATION
  ✓ Every POST/PUT/PATCH route has a `validateBody(Schema)` middleware with Zod
  ✓ Every route with URL params validates them (uuid format, enum values)
  ✓ File uploads: validate MIME type, size limit, scan for polyglot files
  ✗ Never pass unsanitized user input to `$queryRaw`, `$executeRaw`, shell commands
  ✗ Never use `JSON.parse` on user input without a Zod schema validation after

C4. SECRETS & SENSITIVE DATA
  ✓ Load secrets from AWS Secrets Manager on startup (not env vars in prod)
  ✓ Rotate JWT secret every 90 days with overlap window
  ✓ Mask sensitive fields in all logs (passwords, tokens, signatures)
  ✓ WhatsApp webhook: verify X-Hub-Signature-256 with constant-time comparison
  ✓ Razorpay webhook: verify signature before processing payment state changes
  ✗ Never log: passwords, access tokens, refresh tokens, API keys, phone numbers (full)
  ✗ Never commit `.env` files with real credentials

C5. RATE LIMITING (MUST IMPLEMENT FOR ALL ENDPOINTS)
  ✓ Login/register: 10 requests / 15 min / IP
  ✓ Authenticated API: 300 requests / 1 min / userId
  ✓ Public booking: 40 requests / 1 min / IP
  ✓ Webhook ingestion: 1000 requests / 1 min / IP (Meta sends bursts)
  ✓ Bulk campaign send: 5 requests / 1 min / businessId
  ✓ Redis sliding-window implementation (shared across all pods)
  ✓ Return 429 with `Retry-After` header
  ✗ Never use per-process in-memory rate limiting for multi-pod deployments

C6. OWASP MITIGATIONS
  ✓ SQL injection: parameterized queries only (Prisma handles this)
  ✓ XSS: Helmet CSP headers, never render user content as HTML in API responses
  ✓ CSRF: SameSite cookie for refresh token; access token in Authorization header (not cookie)
  ✓ SSRF: Outbound HTTP clients must not resolve RFC 1918 addresses
  ✓ Broken object-level auth: every resource fetch uses `findFirst({ where: { id, businessId } })`
  ✓ Mass assignment: never spread `req.body` into DB calls — always explicit field mapping

═══════════════════════════════════════════════════════════════════════════════
SECTION D — CODING RULES
═══════════════════════════════════════════════════════════════════════════════

D1. NAMING
  Classes:       PascalCase
  Interfaces:    IPrefixed or plain (IRepository, AppointmentDTO)
  Functions:     camelCase, verb-first (createAppointment, getAvailableSlots)
  Constants:     SCREAMING_SNAKE_CASE
  Files/classes: match (AppointmentService.ts exports AppointmentService)
  Events:        kebab.noun.pastTense (appointment.created, payment.captured)
  Error codes:   SCREAMING_SNAKE_CASE string literal (SLOT_NOT_AVAILABLE)

D2. FUNCTIONS
  ✓ Max function length: 50 lines (extract if longer)
  ✓ Max nesting depth: 3 levels (extract or use early return)
  ✓ All public functions have explicit return type annotations
  ✓ Async functions return Promise<T> explicitly
  ✗ No callbacks (use async/await)
  ✗ No `var` (use `const`, `let`)

D3. ERROR HANDLING
  ✓ Throw `AppError` subclasses from use cases (not raw Error objects)
  ✓ Catch and rethrow domain errors from infrastructure with context
  ✓ Global `errorHandler` middleware handles all unhandled errors
  ✓ Async route handlers wrapped with `asyncHandler(fn)` to forward errors to next()
  ✓ Never return `{ error: ... }` from a 2xx response
  ✗ Never swallow errors silently (`catch(e) {}`)
  ✗ Never `console.log` — use structured logger

D4. RESPONSES
  ✓ Always use the standard envelope: `{ data: T, meta: { requestId, timestamp } }`
  ✓ Paginated lists: `{ data: T[], pagination: { cursor, hasMore }, meta: {...} }`
  ✓ Errors: `{ error: { code, message, details? }, meta: {...} }`
  ✓ HTTP status codes must be semantically correct:
      201 Created for POST that creates a resource
      204 No Content for DELETE
      409 Conflict for slot taken, duplicate resource
      422 Unprocessable for validation errors
      429 Too Many Requests for rate limit

D5. ASYNC PATTERNS
  ✓ Use `Promise.all([...])` for independent concurrent DB/cache calls
  ✓ Use structured concurrency — never `Promise.allSettled` and ignore errors
  ✓ Queue/async tasks that call external APIs (WhatsApp, Razorpay) — don't block HTTP
  ✗ Never `await` in a loop where calls are independent (use Promise.all)

D6. LOGGING
  ✓ Use pino with structured JSON output
  ✓ Every log entry has `event` (snake_case), `correlationId`
  ✓ Log request start (info), completion with durationMs (info), errors (error)
  ✓ Log all external API calls with durationMs and status code
  ✗ Never log: req.body (may contain passwords), Authorization header, tokens
  ✗ Never log user PII beyond the last 4 digits of phone

═══════════════════════════════════════════════════════════════════════════════
SECTION E — DOMAIN-SPECIFIC RULES
═══════════════════════════════════════════════════════════════════════════════

E1. SLOT BOOKING (CRITICAL PATH)
  ✓ Acquire Redis slot lock BEFORE checking DB availability
  ✓ Lock key: `lock:slot:{businessId}:{staffId}:{startAt.toISOString()}`
  ✓ Lock TTL: 30 seconds (env: SLOT_LOCK_TTL_SEC)
  ✓ Use `SET NX PX` — never `GET then SET` (race condition)
  ✓ Check idempotency key before acquiring lock
  ✓ Release lock in finally block after DB commit
  ✓ Return `409 SLOT_LOCKED` if lock fails (client should retry with GET slots)
  ✗ Never hold slot lock while calling Razorpay or WhatsApp API

E2. WHATSAPP WEBHOOK
  ✓ Respond 200 to Meta within 2 seconds (always ACK first)
  ✓ Enqueue message for async processing (RabbitMQ/SQS)
  ✓ Worker processes: dedup by `wamid`, handle status updates separately
  ✓ AI bot runs in worker, never in the HTTP handler
  ✓ All outbound WhatsApp sends are idempotent (store wamid, skip if already sent)
  ✗ Never run AI inference or DB transactions inside the webhook HTTP handler

E3. CALENDAR SYNC
  ✓ Store encrypted access/refresh tokens (AES-256-GCM)
  ✓ Refresh expired tokens before use, store updated token
  ✓ Handle `401` from calendar APIs by prompting re-auth (don't crash)
  ✓ Webhook token (`webhookToken`) verified on each push notification
  ✓ Blocked calendar slots stored in `CalendarBlockedSlot` — availability engine reads these
  ✗ Never cache calendar tokens in Redis (only in encrypted DB column)

E4. PAYMENTS (RAZORPAY)
  ✓ Verify webhook signature before any state change
  ✓ Use `prisma.$transaction` for: mark payment SUCCESS + activate subscription
  ✓ Idempotent: check `payment.status === 'SUCCESS'` before re-processing
  ✓ Log all payment events with providerPaymentId, providerOrderId
  ✓ Wallet debit uses SELECT FOR UPDATE or Prisma transaction to prevent race
  ✗ Never trust `amount` from webhook body for settlement — fetch from Razorpay API

E5. AI BOT
  ✓ Use `ILlmProvider` interface — never call OpenAI SDK directly in business logic
  ✓ Rate limit LLM calls per business (prevent runaway AI costs)
  ✓ Session TTL: 30 minutes (reset on each message)
  ✓ Tool call results are validated before using in DB operations
  ✓ Log LLM usage (tokens, latency, provider) for cost attribution per businessId
  ✗ Never expose raw LLM error messages to end users (WhatsApp customers)
  ✗ Never include raw conversation history beyond last 10 messages in LLM context

═══════════════════════════════════════════════════════════════════════════════
SECTION F — TESTING RULES
═══════════════════════════════════════════════════════════════════════════════

F1. UNIT TESTS (Vitest)
  ✓ Test file: `{file}.test.ts` co-located or in `__tests__/`
  ✓ Every use case has at least: happy path, not-found, permission denied, validation error
  ✓ Every domain entity has tests for all invariants
  ✓ Mock all ports/interfaces — never access DB or network in unit tests
  ✓ Run with `vitest --coverage` — enforce 80% branch coverage
  ✗ Never use `setTimeout` or `Date.now()` directly — inject clock for testability
  ✗ Never use `process.env` in tests — use config injection

F2. INTEGRATION TESTS (Testcontainers + Supertest)
  ✓ Test full HTTP request lifecycle: auth → validate → use case → DB → response
  ✓ Start real PostgreSQL + Redis containers in `beforeAll`
  ✓ Run migrations against test DB before tests
  ✓ Reset DB state between test suites (truncate or transaction rollback)
  ✓ Test idempotency: POST same request twice, expect same 201 result
  ✓ Test concurrent booking: two simultaneous POST /v1/appointments for same slot
       → one succeeds (201), one fails (409 SLOT_LOCKED)

F3. API TESTS
  ✓ Test all error codes (401, 403, 404, 409, 422, 429)
  ✓ Test rate limiting returns 429 after N+1 requests
  ✓ Test pagination: cursor is stable when records are inserted between pages
  ✓ Test webhook signature verification rejects tampered payloads

F4. PERFORMANCE TESTS (k6)
  ✓ Slot booking under 50 concurrent users: p95 < 500ms, 0% errors
  ✓ Inbox list (GET /v1/conversations): p95 < 100ms at 200 concurrent users
  ✓ Available slots query: p95 < 200ms at 100 concurrent users

═══════════════════════════════════════════════════════════════════════════════
SECTION G — DEPLOYMENT RULES
═══════════════════════════════════════════════════════════════════════════════

G1. DOCKER
  ✓ Multi-stage build (build → production)
  ✓ Non-root user in production image
  ✓ HEALTHCHECK instruction
  ✓ No secrets in Dockerfile or image layers
  ✓ Pin base image by digest (not just tag)

G2. KUBERNETES
  ✓ Resource requests AND limits on every deployment
  ✓ Liveness probe: /health/live (fails → pod restart)
  ✓ Readiness probe: /health/ready (fails → remove from LB)
  ✓ Horizontal Pod Autoscaler on CPU 70% + custom metric (queue depth)
  ✓ Pod Disruption Budget: minAvailable 1 for API deployment
  ✓ Secrets stored in AWS Secrets Manager, synced via External Secrets Operator
  ✗ Never use `latest` image tag in production deployments
  ✗ Never run pods as root

G3. CI/CD GATES (MUST PASS BEFORE MERGE)
  ✓ `tsc --noEmit` (0 type errors)
  ✓ `eslint` (0 errors)
  ✓ `vitest --coverage` (≥80% lines, ≥80% branches)
  ✓ `npm audit --audit-level=moderate` (0 moderate+ vulnerabilities)
  ✓ `trivy image scan` (0 critical, 0 high CVEs)
  ✓ Integration tests pass
  ✓ OpenAPI spec generation succeeds (spec is always up to date)

G4. MIGRATIONS
  ✓ Migrations are ALWAYS non-destructive (ADD, not DROP in the same deploy)
  ✓ `DROP` and `ALTER COLUMN` (breaking) run separately after traffic cutover
  ✓ Each migration has a rollback script
  ✓ Never run migrations automatically in the app process — use a one-off K8s Job
  ✓ Back up the database before any migration affecting >100k rows

═══════════════════════════════════════════════════════════════════════════════
SECTION H — IMPLEMENTATION CHECKLIST (VERIFY BEFORE EACH PR)
═══════════════════════════════════════════════════════════════════════════════

For each new feature or refactor, confirm:

□ TypeScript: No `any`, no unsafe assertions
□ Validation: Zod schema on all request inputs
□ Auth: Auth middleware + businessId ownership check
□ Rate limit: Endpoint has rate limit configuration
□ Logging: Key events logged with correlationId
□ Error: AppError thrown with correct code and HTTP status
□ Response: Standard envelope with requestId
□ Test: Unit test for happy + error path
□ Test: Integration test if DB is involved
□ Audit: Sensitive mutations write to audit_log
□ Migration: DB changes have up + down SQL
□ Docs: OpenAPI schema updated
□ No console.log: Pino logger only
□ No process.env outside config.ts
□ No inline DB queries in route files

═══════════════════════════════════════════════════════════════════════════════
SECTION I — KEY BUSINESS INVARIANTS TO PRESERVE
═══════════════════════════════════════════════════════════════════════════════

I1. Appointment must not be booked if:
    - Staff is on leave (StaffLeave covering startAt..endAt)
    - Staff has no working hours for that day/location
    - Staff is already booked (active appointment overlapping)
    - Business holiday covers the day (at business or location level)
    - External calendar block exists for staff at that time
    - Service is not offered by the staff member
    - Service is not active
    - Location is not active

I2. Wallet debit must be atomic with campaign creation:
    - Debit wallet by (recipient count × messageCost)
    - If wallet.balance < total, reject with INSUFFICIENT_WALLET_BALANCE
    - Create campaign record in same transaction as debit

I3. Subscription activation must be idempotent:
    - Check payment.status before activating
    - Use transaction: expire old subscription + create new one atomically

I4. AI bot override:
    - If aiOverride = true, skip bot and route to inbox
    - Auto-resume based on aiResumeMode (NEW_MESSAGES_ONLY | LAST_CUSTOMER_MESSAGE)
    - Override expires after the configured duration

I5. WhatsApp 24-hour session:
    - Template messages required after 24h of last customer message
    - Track lastInboundCustomerMessageAt on customer record
    - Update on every inbound USER message

I6. Slot capacity:
    - ScheduledService.maxCapacity controls how many concurrent bookings per slot
    - Count ACTIVE_APPT (PENDING/CONFIRMED/CHECKED_IN/IN_PROGRESS) only
    - capacityRemaining must be > 0 for booking to succeed

I7. Multi-tenant isolation:
    - A business can NEVER read or mutate another business's data
    - CHIEF_ADMIN impersonation creates a scoped JWT for the target business
    - Impersonation sessions are audited

══════════════════════════════════════════════════════════════════════════════
END OF MASTER IMPLEMENTATION PROMPT
══════════════════════════════════════════════════════════════════════════════
```

---

*This document is a living artifact. Update it as architectural decisions evolve. All implementation decisions must trace back to a section in this document or be explicitly added here first.*
