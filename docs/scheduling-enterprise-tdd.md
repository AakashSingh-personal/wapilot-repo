# Vartalap — Staff Scheduling & Appointment Booking
## Enterprise Technical Design Document (As-Built + Target Architecture)

**Version:** 2.0  
**Product:** Vartalap  
**Module:** Staff Scheduling & Appointment Booking  
**Status:** Implementation-ready (Express monolith deployed; microservices optional Phase 5)  
**Companion:** [`scheduling-tdd.md`](./scheduling-tdd.md) — quick as-built reference

---

## Document map (25 deliverables)

| # | Section | § |
|---|---------|---|
| 1 | System Architecture | [§1](#1-system-architecture) |
| 2 | Database Schema | [§2](#2-database-schema) |
| 3 | ER Diagrams | [§3](#3-er-diagrams-text-format) |
| 4 | API Specifications | [§4](#4-api-specifications) |
| 5 | Backend Services | [§5](#5-backend-services) |
| 6 | Frontend Screens | [§6](#6-frontend-screens) |
| 7 | User Flows | [§7](#7-user-flows) |
| 8 | AI Booking Flows | [§8](#8-ai-booking-flows) |
| 9 | WhatsApp Conversation Flows | [§9](#9-whatsapp-conversation-flows) |
| 10 | Calendar Integration | [§10](#10-calendar-integration-design) |
| 11 | Multi-Tenant SaaS | [§11](#11-multi-tenant-saas-design) |
| 12 | Notification Architecture | [§12](#12-notification-architecture) |
| 13 | Security Design | [§13](#13-security-design) |
| 14 | Scalability Design | [§14](#14-scalability-design) |
| 15 | Queue Architecture | [§15](#15-queue-architecture) |
| 16 | WebSocket Events | [§16](#16-websocket-events) |
| 17 | Appointment Engine | [§17](#17-appointment-engine-logic) |
| 18 | Staff Availability Engine | [§18](#18-staff-availability-engine) |
| 19 | Waitlist Engine | [§19](#19-waitlist-engine) |
| 20 | Payment Architecture | [§20](#20-payment-architecture) |
| 21 | Variables Architecture | [§21](#21-variables-architecture) |
| 22 | Analytics Architecture | [§22](#22-analytics-architecture) |
| 23 | Microservices Structure | [§23](#23-recommended-microservices-structure) |
| 24 | Development Phases | [§24](#24-development-phases) |
| 25 | Acceptance Criteria | [§25](#25-acceptance-criteria) |

---

## Stack note (spec vs as-built)

| Layer | Original enterprise spec | **Vartalap as-built** |
|-------|-------------------------|----------------------|
| Backend | Spring Boot | **Node.js 20+ / Express 4** |
| ORM | JPA | **Prisma 6.19** |
| Database | PostgreSQL | **PostgreSQL (Neon-compatible)** |
| Cache / locks | Redis | **Redis (ioredis)** — slot locks + realtime pub/sub |
| Messaging | RabbitMQ | **In-process poll workers** (Phase 5: RabbitMQ optional) |
| Realtime | WebSockets | **ws** on same server |
| Storage | S3 | **URL/string fields** (`profilePicture`); S3 upload Phase 5 |
| Frontend | React | **React 18 + Vite** |
| WhatsApp | Meta Cloud API | **Meta Cloud API** |
| Auth | JWT | **JWT (`authMiddleware`)** scoped by `businessId` |

---

## 1. System Architecture

### 1.1 High-level diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│  React Dashboard │ Staff Mobile │ Public Book │ Manage Link │ WhatsApp User │
└────────────┬───────────────────────────────┬────────────────────────────────┘
             │ REST + JWT                     │ Meta Webhook
             ▼                                ▼
┌──────────────────────────── Vartalap API (Express Monolith) ─────────────────┐
│  scheduling.routes.js → scheduling.controller.js                             │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────────────────┐  │
│  │ Appointment │ │ Slot/Avail   │ │ Calendar    │ │ AI Booking           │  │
│  │ Engine      │ │ Engine       │ │ Sync        │ │ aiBooking + tools    │  │
│  └──────┬──────┘ └──────┬───────┘ └──────┬──────┘ └──────────┬───────────┘  │
│         │               │                │                    │              │
│  ┌──────┴───────────────┴────────────────┴────────────────────┴──────────┐  │
│  │ Poll Workers (server.js): Reminders │ Waitlist │ Calendar │ Rebooking  │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└────────────┬──────────────────────┬──────────────────────┬───────────────────┘
             │                      │                      │
             ▼                      ▼                      ▼
      PostgreSQL              Redis                 External APIs
   (Prisma + GiST)      (locks, pub/sub)     Google/Outlook/Apple/Razorpay/Meta
```

### 1.2 Module boundaries (backend)

```
backend/src/scheduling/
├── appointment.service.js       # Create, status, reschedule, payments hook
├── slotEngine.service.js        # Slot generation
├── availabilityEngine.service.js# Window calculation (7 layers)
├── slotLock.service.js          # Redis NX locks
├── waitlist.service.js          # Join, offer, accept
├── reminder.service.js          # Schedule + dispatch reminders
├── calendarEvents.service.js    # Multi-calendar push/delete
├── googleCalendar.service.js    # Google OAuth + webhook
├── outlookCalendar.service.js   # Outlook OAuth + Graph subscriptions
├── appleCalendar.service.js     # CalDAV
├── calendarSync.service.js      # Pull busy blocks
├── publicBooking.service.js     # Public catalog + book
├── appointmentToken.service.js  # Signed manage links
├── aiBooking.service.js         # Rule-based + session state
├── aiBookingLlm.service.js      # LLM function calling
├── schedulingTools.service.js   # Tool definitions + handlers
├── appointmentPayment.service.js# Razorpay intents/QR
├── customerStats.service.js     # Denormalized KPIs
├── analytics.service.js         # Reporting aggregates
├── rebooking.service.js         # Campaign nudges
├── idempotency.service.js       # Booking idempotency keys
├── ics.service.js               # .ics generation
├── rrule.service.js             # RRULE expansion
├── notificationDelivery.service.js # Email/SMS
└── schedulingSettings.service.js   # Per-tenant JSON settings
```

### 1.3 Request lifecycle (dashboard booking)

```
Client POST /scheduling/appointments + Idempotency-Key
  → authMiddleware (JWT → businessId)
  → withBookingIdempotency()
  → acquireSlotLock (Redis NX, 30s TTL)
  → isStaffAvailable() + overlap count vs maxCapacity
  → prisma.$transaction(create appointment + status history)
  → scheduleRemindersForAppointment()
  → pushAppointmentToAllCalendars()
  → sendAppointmentConfirmationWhatsApp/Email (if CONFIRMED)
  → publishAppointmentEvent(APPOINTMENT_CREATED)
  → releaseSlotLock
  → JSON { ...appointment, paymentIntent?, warnings?, replayed? }
```

---

## 2. Database Schema

### 2.1 Tenant root

All scheduling entities include `businessId` (UUID FK → `Business.id`). Soft deletes: `StaffMember.deletedAt`, `ScheduledService.deletedAt`, `Location.deletedAt`.

### 2.2 Core tables

#### Location
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| businessId | UUID FK | Tenant |
| code | String | Unique per tenant (e.g. MAIN) |
| name | String | |
| timezone | String | IANA, default Asia/Kolkata |
| addressLine1, city, phone | String? | |
| latitude, longitude | Decimal? | |
| isActive | Boolean | |

#### StaffMember
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| businessId | UUID FK | |
| userId | UUID? FK | Link to dashboard user |
| staffCode | String | Unique per tenant |
| name, email, mobile | String | |
| profilePicture | String? | URL (S3 Phase 5) |
| designation, department, bio | String? | |
| skills | JSON | Array of strings |
| activeStatus | Enum | ACTIVE \| INACTIVE \| ARCHIVED |
| createdById, updatedById | UUID? | |
| deletedAt | DateTime? | Soft delete |

#### ScheduledService
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| businessId | UUID FK | |
| categoryId | UUID? FK | ServiceCategory |
| code, name | String | |
| durationMin | Int | Slot step basis |
| price | Decimal | |
| taxPercent | Decimal | |
| bufferBefore, bufferAfter | Int | Minutes |
| maxCapacity | Int | Default 1; group sessions |
| rebookingIntervalDays | Int? | AI rebooking campaigns |
| isActive | Boolean | |
| deletedAt | DateTime? | |

#### Appointment
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| businessId | UUID FK | |
| appointmentNumber | String | Human ref, unique/tenant |
| customerId, staffId, serviceId, locationId | UUID FK | |
| appointmentType | Enum | IN_PERSON \| ONLINE \| HOME_VISIT |
| startAt, endAt | DateTime | UTC stored |
| bufferBeforeMin, bufferAfterMin | Int | Copied from service |
| status | Enum | See §17 |
| notes, internalNotes | String? | |
| meetingLink, address | String? | Online / home visit |
| latitude, longitude | Decimal? | Home visit |
| paymentStatus | Enum | UNPAID \| PARTIAL \| PAID \| REFUNDED |
| amount, amountPaid, amountDue | Decimal | |
| source | String | DASHBOARD, WHATSAPP, PUBLIC_BOOKING, WAITLIST |
| version | Int | Optimistic concurrency |
| cancelledAt, cancellationReason | | |
| checkedInAt, completedAt | DateTime? | |

#### Supporting tables
- `StaffWorkingHours` — dayOfWeek 0–6, startTime/endTime HH:mm, optional locationId
- `StaffBreak` — breakType (LUNCH, TEA, PERSONAL), recurring or specificDate
- `StaffLeave` — leaveType enum: SICK, VACATION, EMERGENCY, HOLIDAY, OTHER
- `StaffAvailabilityRule` — rrule text, startTime/endTime, ruleType AVAILABLE|BLOCKED
- `BusinessHoliday` — business-wide or per-location closure
- `WaitlistEntry` — status ACTIVE|NOTIFIED|BOOKED|EXPIRED|CANCELLED
- `ReminderSchedule` — channel WHATSAPP|EMAIL|SMS, offsetMinutes, scheduledAt
- `AppointmentPayment` — Razorpay/cash/UPI records
- `AppointmentRating` — 1–5 + feedback
- `AppointmentStatusHistory` — audit trail
- `CustomerAppointmentStats` — denormalized visits/spend/favorites
- `CalendarConnection` — OAuth tokens (encrypted), webhook expiry
- `AppointmentCalendarEvent` — per-connection external event ID
- `CalendarBlockedSlot` — pulled busy time
- `BookingIdempotencyKey` — unique (businessId, idempotencyKey)
- `SchedulingSettings` — JSON in BusinessConfig.schedulingSettings

### 2.3 Double-booking constraint

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment" ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  ) WHERE (status IN ('PENDING','CONFIRMED','CHECKED_IN','IN_PROGRESS'));
```

### 2.4 Indexes (key)

- `Appointment(businessId, staffId, startAt)`
- `Appointment(businessId, customerId, startAt DESC)`
- `Appointment(businessId, status, startAt)`
- `WaitlistEntry(businessId, serviceId, locationId, status)`
- `ReminderSchedule(status, scheduledAt)`

---

## 3. ER Diagrams (text format)

```
Business 1──* Location
Business 1──* StaffMember
Business 1──* ScheduledService
Business 1──* ServiceCategory
Business 1──* Customer
Business 1──* Appointment
Business 1──* BusinessHoliday
Business 1──* WaitlistEntry
Business 1──* CalendarConnection

StaffMember *──* Location          via StaffLocation
StaffMember *──* ScheduledService   via StaffService
StaffMember 1──* StaffWorkingHours
StaffMember 1──* StaffBreak
StaffMember 1──* StaffLeave
StaffMember 1──* StaffAvailabilityRule
StaffMember 1──* Appointment
StaffMember 0..1── User             (dashboard login)

ScheduledService *──1 ServiceCategory (optional)
ScheduledService 1──* Appointment

Customer 1──* Appointment
Customer 1──0..1 CustomerAppointmentStats
Customer 1──* WaitlistEntry

Appointment 1──* AppointmentPayment
Appointment 1──* ReminderSchedule
Appointment 1──* AppointmentStatusHistory
Appointment 0..1── AppointmentRating
Appointment 1──* AppointmentCalendarEvent
Appointment 1──* BookingIdempotencyKey

CalendarConnection 1──* AppointmentCalendarEvent
CalendarConnection 1──* CalendarBlockedSlot
```

---

## 4. API Specifications

**Base:** `{API_PUBLIC_URL}`  
**Auth:** `Authorization: Bearer <JWT>` except `/public/*` and OAuth callbacks.

### 4.1 Staff & availability

| Method | Path | Description |
|--------|------|-------------|
| GET | `/scheduling/staff` | List staff with locations/services |
| POST | `/scheduling/staff` | Create staff |
| PATCH | `/scheduling/staff/:id` | Update (incl. bio, skills, department) |
| DELETE | `/scheduling/staff/:id` | Soft archive |
| GET/PUT | `/scheduling/staff/:id/working-hours` | Weekly hours |
| GET/POST/DELETE | `/scheduling/staff/:id/breaks` | Breaks |
| GET/POST/DELETE | `/scheduling/staff/:id/leaves` | Leaves |
| GET/POST/DELETE | `/scheduling/staff/:id/availability-rules` | RRULE rules |
| GET | `/scheduling/staff/:id/schedule/today` | Today's appts (`me` = linked user) |
| GET | `/scheduling/staff/:id/schedule/upcoming?days=7` | Upcoming |

### 4.2 Services & locations

| Method | Path | Description |
|--------|------|-------------|
| CRUD | `/scheduling/services`, `/scheduling/service-categories` | |
| CRUD | `/scheduling/locations` | |
| GET/POST/DELETE | `/scheduling/holidays` | Business holidays |

### 4.3 Slots & appointments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/scheduling/slots/available?serviceId&locationId&staffId&date` | Available slots |
| GET | `/scheduling/appointments?page&pageSize&status&staffId&customerId&from&to&q` | **Paginated list** |
| POST | `/scheduling/appointments` | Create (+ `Idempotency-Key` header) |
| GET/PATCH | `/scheduling/appointments/:id` | Detail / notes |
| PATCH | `/scheduling/appointments/:id/status` | Status transition |
| POST | `/scheduling/appointments/:id/reschedule` | Reschedule |
| POST | `/scheduling/appointments/confirm-pending` | Bulk confirm |
| POST | `/scheduling/appointments/check-in-today` | Bulk check-in |
| GET | `/scheduling/appointments/export.csv` | CSV export |
| GET | `/scheduling/appointments/:id/calendar.ics` | ICS download |
| GET | `/scheduling/appointments/:id/manage-link` | Signed customer URL |
| POST | `/scheduling/appointments/:id/notifications/send` | Test confirmation/reminder |

### 4.4 Payments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/scheduling/appointments/:id/payments/intent` | Razorpay payment link |
| POST | `/scheduling/appointments/:id/payments/qr` | UPI QR data URL |
| POST | `/scheduling/appointments/:id/payments` | Record cash/manual |
| GET | `/scheduling/appointments/:id/payments` | Payment history |

### 4.5 Public (unsigned token in path)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/public/booking/:token` | Catalog |
| GET | `/public/booking/:token/slots` | Slots |
| POST | `/public/booking/:token` | Book |
| POST | `/public/booking/:token/waitlist` | Join waitlist |
| GET | `/public/appointments/:token` | View appointment |
| POST | `/public/appointments/:token` | confirm \| cancel \| reschedule |
| GET | `/public/appointments/:token/slots` | Reschedule slots |
| POST | `/public/appointments/:token/rating` | Rate |
| POST | `/public/appointments/:token/pay` | Pay |
| GET | `/public/appointments/:token/calendar.ics` | ICS |

### 4.6 Sample: create appointment

**Request**
```http
POST /scheduling/appointments
Authorization: Bearer eyJ...
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "customerId": "uuid",
  "staffId": "uuid",
  "serviceId": "uuid",
  "locationId": "uuid",
  "startAt": "2026-06-15T09:30:00.000Z",
  "status": "CONFIRMED",
  "notes": "First visit",
  "collectAdvance": true
}
```

**Response 201**
```json
{
  "id": "uuid",
  "appointmentNumber": "APT-2026-0042",
  "status": "CONFIRMED",
  "startAt": "2026-06-15T09:30:00.000Z",
  "endAt": "2026-06-15T10:00:00.000Z",
  "amount": "500.00",
  "amountDue": "500.00",
  "paymentIntent": { "paymentLinkUrl": "https://rzp.io/..." },
  "warnings": [],
  "replayed": false,
  "customer": { "name": "Priya", "phone": "+9198..." },
  "staff": { "name": "Anita" },
  "service": { "name": "Haircut" },
  "location": { "name": "Main Branch" }
}
```

### 4.7 Sample: paginated list

**Response**
```json
{
  "items": [ { "id": "...", "appointmentNumber": "APT-...", "status": "CONFIRMED" } ],
  "total": 237,
  "page": 1,
  "pageSize": 50,
  "totalPages": 5,
  "hasMore": true
}
```

---

## 5. Backend Services

| Service | Responsibility | Key functions |
|---------|----------------|---------------|
| `appointment.service` | Lifecycle | `createAppointment`, `updateAppointmentStatus`, `rescheduleAppointment`, `confirmPendingAppointments`, `checkInTodayAppointments` |
| `slotEngine.service` | Slot generation | `findAvailableSlots` |
| `availabilityEngine.service` | Free windows | `getAvailableWindows`, `isStaffAvailable` |
| `slotLock.service` | Concurrency | `acquireSlotLock`, `releaseSlotLock` |
| `waitlist.service` | Waitlist | `joinWaitlist`, `processWaitlistForSlot`, `acceptWaitlistOffer` |
| `reminder.service` | Notifications | `scheduleRemindersForAppointment`, `processDueReminders` |
| `calendarEvents.service` | Push/delete | `pushAppointmentToAllCalendars`, `deleteAppointmentFromAllCalendars` |
| `idempotency.service` | Dedup bookings | `withBookingIdempotency` |
| `aiBooking.service` | WhatsApp NL | Session state machine + intents |
| `schedulingTools.service` | LLM tools | `SCHEDULING_TOOLS`, `executeSchedulingTool` |
| `customerStats.service` | KPIs | `refreshCustomerAppointmentStats` |
| `analytics.service` | Reports | `getSchedulingAnalytics`, `getSchedulingDashboardSummary` |
| `rebooking.service` | Campaigns | `sendRebookingCampaign` |

**Repository pattern:** Prisma client in `backend/src/lib/prisma.js`; no separate JPA repositories.

---

## 6. Frontend Screens

| Route | Component | Tabs / features |
|-------|-----------|-----------------|
| `/scheduling` | `Scheduling.jsx` | Appointments (paginated, filters, bulk confirm), Schedule (week DnD, holidays), Staff, Services, Locations, Calendar, Notifications, Waitlist, Analytics |
| `/staff-schedule` | `StaffSchedule.jsx` | Today/upcoming, check-in, complete, no-show, manage link |
| `/book?token=` | `PublicBook.jsx` | Self-service book + waitlist |
| `/appointments/manage?token=` | `ManageAppointment.jsx` | Confirm/cancel/reschedule/rate/pay/ICS |
| `/dashboard` | `Dashboard.jsx` | Today's schedule widget |
| `/bookings` | `Bookings.jsx` | Legacy + modern appointments |
| `/customers` | `Customers.jsx` | Stats + links to scheduling |
| Component | `StaffAvailabilityPanel.jsx` | Hours, breaks, leaves embedded in Staff tab |

**Deep links:** `/scheduling?tab=appointments&appt={id}&customerId={id}`

---

## 7. User Flows

### 7.1 Owner: first-time setup
```
Login → Scheduling → seed-defaults (auto) → Add staff → Set working hours
→ Add services → Add locations → Connect calendar (optional)
→ Enable public booking → Copy link → Test book
```

### 7.2 Receptionist: walk-in booking
```
Scheduling → Appointments → Select customer → Pick service/staff/date
→ Find slots → Click slot → CONFIRMED created → WhatsApp confirmation sent
```

### 7.3 Staff: day-of operations
```
/staff-schedule → See today → Check in customer → Start → Complete
OR No-show → Rating request sent on COMPLETED
```

### 7.4 Customer: public self-service
```
Open /book?token=… → Choose service/location/staff/date → Pick slot → Book
→ Receive WhatsApp/email confirmation → Manage link for changes
```

---

## 8. AI Booking Flows

### 8.1 Architecture

```
WhatsApp inbound message
  → webhook.service → aiBooking.service.handleInbound()
       ├─ AI_SCHEDULING_TOOLS=1 + LLM key?
       │    → aiBookingLlm.service (function calling)
       │    → schedulingTools.service.executeSchedulingTool()
       └─ Else rule-based intent detection (keywords, slot numbers)
  → AiBookingSession (Prisma) stores step + offered slots
  → createAppointment / reschedule / cancel / joinWaitlist
```

### 8.2 LLM tools (`schedulingTools.service.js`)

| Tool | Purpose |
|------|---------|
| `list_services` | Catalog with duration/price |
| `check_availability` | Slots for date |
| `offer_booking_slots` | Numbered slot list + session |
| `book_offered_slot` | Confirm by index |
| `cancel_appointment` | Cancel upcoming |
| `start_reschedule` | Offer new slots |
| `complete_reschedule` | Book new slot |
| `join_waitlist` | Waitlist when no slots |
| `get_next_appointment` | Upcoming info |
| `get_last_appointment` | History |
| `send_payment_link` | Razorpay link |

### 8.3 Intent architecture (rule-based fallback)

| Intent | Triggers | Action |
|--------|----------|--------|
| BOOK | "book", "appointment", service names | offer_booking_slots |
| SLOT_PICK | "1", "2", … | book_offered_slot |
| CANCEL | "cancel" | cancel_appointment |
| RESCHEDULE | "reschedule", "move" | start_reschedule |
| WAITLIST | "waitlist", "notify me" | join_waitlist |
| PAY | "pay", "payment" | send_payment_link |
| RATING | "1"–"5" after completion | store rating |

### 8.4 Conversation example

```
Customer: I want a haircut tomorrow
AI: [check_availability → offer_booking_slots]
    Available slots:
    1. 10:00 AM — Anita
    2. 11:30 AM — Anita
    Reply with the slot number.

Customer: 1
AI: [book_offered_slot → createAppointment CONFIRMED]
    Booking confirmed!
    Service: Haircut
    When: Tue, 10 Jun, 10:00 AM
    Ref: APT-2026-0042
    [manage link footer]
```

---

## 9. WhatsApp Conversation Flows

### 9.1 Booking flow (diagram)

```
[Customer message] → [Parse intent/date/service]
        ↓
[Find slots via slotEngine] ──no slots──→ [Offer WAITLIST]
        ↓ slots found
[Send numbered list] → [Store AiBookingSession]
        ↓
[Customer picks number] → [createAppointment + idempotency optional]
        ↓
[Confirmation WhatsApp + schedule reminders + calendar push]
```

### 9.2 Self-service keywords (24h session)

Within Meta 24h window, free-form messages work. Outside window, **approved templates** required (`WHATSAPP_CONFIRMATION_TEMPLATE`, `WHATSAPP_REMINDER_TEMPLATE`).

Customer can reply:
- Slot number → book/reschedule
- `CANCEL` → cancel upcoming (rule path)
- `RESCHEDULE` → slot offer flow
- Manage link (in footer) → full self-service web UI

### 9.3 Waitlist accept flow

```
[Cancellation frees slot] → processWaitlistForSlot()
  → WhatsApp: "Slot opened! Reply YES within 15 min"
  → Customer YES → createAppointment from offered slot
  → Customer NO/timeout → next candidate or EXPIRED
```

---

## 10. Calendar Integration Design

### 10.1 Provider matrix

| Provider | Auth | Push appt | Pull busy | Real-time |
|----------|------|-----------|-----------|-----------|
| Google | OAuth 2.0 | Events.insert | events.list | Watch API webhook |
| Outlook | Azure AD OAuth | Graph POST /events | Graph GET | Graph subscription |
| Apple | CalDAV + app password | PUT event | REPORT | Poll (`CALENDAR_SYNC_MS`) |

### 10.2 Token storage

- `CalendarConnection.accessToken`, `refreshToken` encrypted with `CALENDAR_TOKEN_SECRET`
- Auto-refresh before API calls via `getValidAccessToken()`

### 10.3 Sync architecture

```
Appointment CONFIRMED/CHECKED_IN
  → calendarEvents.service.pushAppointmentToAllCalendars()
  → AppointmentCalendarEvent row per connection

Appointment CANCELLED/RESCHEDULED
  → deleteAppointmentFromAllCalendars()

Poll worker (CALENDAR_SYNC_MS)
  → pullGoogle/Outlook/Apple blocks
  → CalendarBlockedSlot (excluded from availability)

Webhook (Google/Outlook)
  → trigger incremental pull
```

### 10.4 Conflict resolution

| Scenario | Resolution |
|----------|------------|
| External calendar busy | Block slot in availability engine |
| Vartalap books slot | Push event; store external ID |
| External event deleted | Next pull removes block |
| Duplicate push | Upsert by AppointmentCalendarEvent |
| Reschedule | Delete old external events → create new |

### 10.5 OAuth redirect URIs

- `{API_PUBLIC_URL}/scheduling/calendar/google/callback`
- `{API_PUBLIC_URL}/scheduling/calendar/outlook/callback`

---

## 11. Multi-Tenant SaaS Design

### 11.1 Tenant key

- **`businessId`** from JWT claim (`req.user.businessId`)
- Every Prisma query: `where: { businessId: tenant(req) }`

### 11.2 Isolation layers

| Layer | Implementation |
|-------|----------------|
| API | JWT middleware rejects cross-tenant IDs |
| Database | FK + indexes on businessId; **no RLS yet** (Phase 5) |
| Cache | Redis keys prefixed `vartalap:slot:{businessId}:…` |
| Idempotency | Unique `(businessId, idempotencyKey)` |
| Settings | `BusinessConfig.schedulingSettings` JSON per tenant |
| Calendar | Connections scoped by businessId |
| Public tokens | JWT embeds businessId + scoped action |

### 11.3 Tenant-aware caching (future)

```
cache key: scheduling:{businessId}:slots:{serviceId}:{date}:{staffId}
TTL: 60s; invalidate on appointment_* events
```

---

## 12. Notification Architecture

### 12.1 Reminder scheduler

```
On appointment PENDING/CONFIRMED:
  cancelRemindersForAppointment()
  For offset in [1440, 120, 30] minutes:
    For channel in activeChannels (WHATSAPP, EMAIL, SMS):
      If recipient ready → ReminderSchedule row (SCHEDULED)

Poll worker (REMINDER_POLL_MS, default 60s):
  processDueReminders()
    → dispatchReminderRow()
    → status SENT | FAILED
```

### 12.2 Channels

| Channel | Config | Template |
|---------|--------|----------|
| WhatsApp | Meta phoneNumberId | Session text or approved template |
| Email | SMTP_* | Plain text + HTML optional |
| SMS | Twilio | Plain text |

Per-tenant override: `PATCH /scheduling/settings` → `reminderChannels[]`

### 12.3 Confirmation triggers

- Create with `status=CONFIRMED`
- `PENDING → CONFIRMED` status change
- Public booking (auto-confirmed)

### 12.4 Reminder payload

- Date/time (location timezone)
- Staff, location, service name
- Appointment ref
- Manage link footer (reschedule/cancel)

---

## 13. Security Design

| Control | Implementation |
|---------|----------------|
| Authentication | JWT on all `/scheduling/*` (except public) |
| Authorization | businessId scoping; staff `me` resolves linked user |
| Public tokens | HMAC-signed JWT, type `appointment_action` / `public_booking`, expiry |
| Calendar tokens | AES encrypt at rest |
| Idempotency | Prevents duplicate charges/bookings |
| Input validation | Required fields on create; slot re-validated server-side |
| Rate limiting | Platform-level (recommended Phase 5 on public endpoints) |
| PII | Customer phone/email; GDPR export via existing customer APIs |
| Webhook verification | Google channel token; Outlook clientState |

---

## 14. Scalability Design

| Concern | Current | Scale path |
|---------|---------|------------|
| API | Single Node process | Horizontal replicas + sticky WS optional |
| DB | Neon PostgreSQL | Read replicas for analytics |
| Slot locks | Redis NX | Redis Cluster |
| Workers | In-process intervals | Extract to worker service / RabbitMQ |
| Calendar sync | Batch 50 connections/poll | Sharded by businessId |
| WebSocket | Redis pub/sub fanout | Dedicated realtime service |

**Target:** 500 appointments/day/tenant, 100 concurrent slot searches — current monolith sufficient to ~50 tenants.

---

## 15. Queue Architecture

### 15.1 As-built (poll workers)

Started in `server.js`:

| Worker | Interval env | Handler |
|--------|--------------|---------|
| Reminders | `REMINDER_POLL_MS` (60s) | `processDueReminders` |
| Waitlist expiry | built-in 60s | Expire NOTIFIED entries |
| Calendar sync | `CALENDAR_SYNC_MS` | `syncAllGoogle/Outlook/Apple` |
| Rebooking | `REBOOKING_CAMPAIGN_MS` | `sendRebookingCampaign` |
| Idempotency purge | 1h | `purgeExpiredIdempotencyKeys` |
| Outlook renewal | inside sync | `renewOutlookSubscriptionsIfNeeded` |

### 15.2 Target (RabbitMQ — Phase 5)

```
Exchange: vartalap.scheduling (topic)

Queues:
  scheduling.reminder.dispatch    ← appointment.confirmed
  scheduling.waitlist.offer       ← appointment.cancelled
  scheduling.calendar.push        ← appointment.created, appointment.rescheduled
  scheduling.calendar.pull        ← webhook.received, cron
  scheduling.rebooking.campaign   ← cron daily

Dead letter: scheduling.dlq
```

**Event envelope:**
```json
{
  "eventId": "uuid",
  "type": "appointment.cancelled",
  "businessId": "uuid",
  "appointmentId": "uuid",
  "payload": {},
  "occurredAt": "ISO8601"
}
```

---

## 16. WebSocket Events

**Channel:** Redis `REDIS_REALTIME_CHANNEL` (default `vartalap:realtime`)

| Event type | Trigger | Payload |
|------------|---------|---------|
| `appointment_created` | New appointment | `{ id, appointmentNumber, status, startAt, customerId }` |
| `appointment_status_changed` | Status patch | `{ id, status, fromStatus }` |
| `appointment_payment_received` | Payment webhook/cash | `{ id, amountPaid, paymentStatus }` |
| `scheduling_changed` | Settings/staff bulk | `{ scope }` |

**Client:** `subscribeRealtime()` in `frontend/src/realtime/socket.js` — Scheduling, Bookings, StaffSchedule auto-refresh.

---

## 17. Appointment Engine Logic

### 17.1 Status machine

```
                    ┌──────────┐
                    │ PENDING  │
                    └────┬─────┘
                         │ confirm
                         ▼
                    ┌──────────┐     check-in      ┌────────────┐
                    │ CONFIRMED│ ────────────────► │ CHECKED_IN │
                    └────┬─────┘                   └─────┬──────┘
           cancel/reschedule│                            │ start
                         ▼                              ▼
              CANCELLED / RESCHEDULED            IN_PROGRESS
                                                       │ complete
                                                       ▼
                                                  COMPLETED
                                                       │
                                              NO_SHOW (from CONFIRMED/CHECKED_IN)
```

### 17.2 Side effects by transition

| To status | Actions |
|-----------|---------|
| CONFIRMED (from PENDING) | Confirmation WA/email, reminders, calendar push |
| CHECKED_IN | — |
| IN_PROGRESS | — |
| COMPLETED | Rating request WA, refresh stats |
| CANCELLED | Cancel reminders, delete calendar, waitlist offer |
| RESCHEDULED | Old appt marked; new appt created via reschedule flow |
| NO_SHOW | Cancel reminders |

### 17.3 Reschedule algorithm

```
1. updateAppointmentStatus(RESCHEDULED) on old row
2. createAppointment(same customer/staff/service/location, newStartAt)
3. Return { appointment, paymentIntent? }
```

---

## 18. Staff Availability Engine

### 18.1 Seven layers (evaluation order)

```
1. Staff ACTIVE + assigned to service + location
2. Resolve location timezone
3. StaffWorkingHours for day-of-week → base windows
4. StaffAvailabilityRule (RRULE) → add/subtract windows
5. StaffBreak → subtract intervals
6. StaffLeave + BusinessHoliday → subtract / clear day
7. CalendarBlockedSlot + existing Appointments (with buffers) → subtract
```

### 18.2 Slot generation pseudocode

```
function findAvailableSlots(businessId, serviceId, locationId, staffId, date):
  service = loadService(serviceId)
  staffList = resolveStaff(staffId, serviceId, locationId)
  slots = []

  for staff in staffList:
    windows = getAvailableWindows(staff, date, date, timezone)
    for window in windows:
      t = window.start
      while t + service.duration <= window.end:
        blockStart = t - service.bufferBefore
        blockEnd = t + service.duration + service.bufferAfter
        if isStaffAvailable(blockStart, blockEnd):
          booked = countOverlappingAppointments(staff, blockStart, blockEnd)
          if booked < service.maxCapacity:
            slots.push({ startAt: t, staffId: staff.id, capacityRemaining })
        t += max(15min, service.duration)

  return sort(slots by startAt)
```

### 18.3 RRULE presets

| Preset | RRULE |
|--------|-------|
| weekdays | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| every_monday | `FREQ=WEEKLY;BYDAY=MO` |
| alternate_saturday | `FREQ=WEEKLY;INTERVAL=2;BYDAY=SA` |
| first_sunday | `FREQ=MONTHLY;BYDAY=1SU` |

---

## 19. Waitlist Engine

### 19.1 Join

```
joinWaitlist(customer, service, location, staff?, preferredDate?)
  IF existing ACTIVE|NOTIFIED for same customer+service+location (+staff)
    RETURN existing
  CREATE WaitlistEntry(status=ACTIVE, priorityScore=100)
```

### 19.2 Offer on cancellation

```
processWaitlistForSlot(businessId, serviceId, locationId, staffId, freedStartAt):
  candidates = WaitlistEntry WHERE status=ACTIVE
               AND (staffId IS NULL OR staffId = freedStaff)
               ORDER BY priorityScore DESC, createdAt ASC
               LIMIT 5

  entry = candidates[0]
  UPDATE entry SET status=NOTIFIED, expiresAt=now+15min
  SEND WhatsApp offer with YES/NO

  ON YES (within TTL):
    createAppointment(entry, freedStartAt)
    UPDATE entry SET status=BOOKED

  ON NO or timeout:
    UPDATE entry SET status=EXPIRED or ACTIVE
    processWaitlistForSlot(next candidate)
```

### 19.3 Priority rules (extensible)

| Factor | Score delta |
|--------|-------------|
| Default | 100 |
| Preferred staff match | +10 (future) |
| Preferred date match | +5 (future) |
| VIP customer tag | +20 (future) |

---

## 20. Payment Architecture

### 20.1 Fields (appointment)

- `amount` = service price + tax
- `amountPaid` = sum(PAID payments)
- `amountDue` = amount - amountPaid
- `paymentStatus` = UNPAID | PARTIAL | PAID

### 20.2 Workflows

```
Dashboard book + collectAdvance:
  createAppointment → createAppointmentPaymentIntent(Razorpay)
  → paymentLinkUrl via WhatsApp

Public book + collectAdvance:
  Same via public token endpoint

QR payment:
  createPaymentQr → UPI QR data URL (Razorpay)

Cash at desk:
  POST /payments { paymentMethod: CASH, status: PAID }

Webhook:
  Razorpay webhook → update AppointmentPayment → refresh appointment totals
  → publish APPOINTMENT_PAYMENT_RECEIVED
```

### 20.3 Advance vs full

- `APPOINTMENT_ADVANCE_PERCENT` env (default 30%)
- `collectAdvance` flag on create

---

## 21. Variables Architecture

**Engine:** `backend/src/services/dynamicFieldEngine.service.js`

### 21.1 Scheduling variables (canonical keys)

| Variable | Source |
|----------|--------|
| `{{current_appointment_id}}` | Active/upcoming appointment number |
| `{{current_appointment_date}}` | startAt (display) |
| `{{current_appointment_time}}` | startAt time |
| `{{current_appointment_status}}` | status enum |
| `{{current_appointment_staff}}` | staff.name |
| `{{last_appointment_date}}` | Previous COMPLETED |
| `{{last_appointment_staff}}` | staff.name |
| `{{last_appointment_service}}` | service.name |
| `{{next_appointment_date}}` | CustomerAppointmentStats.nextVisitAt |
| `{{next_appointment_time}}` | derived |
| `{{next_appointment_staff}}` | from next appt |
| `{{appointment_amount}}` | amount |
| `{{amount_paid}}` | amountPaid |
| `{{amount_due}}` | amountDue |
| `{{payment_status}}` | paymentStatus |
| `{{staff_name}}` | staff.name |
| `{{staff_designation}}` | staff.designation |
| `{{staff_email}}` | staff.email |
| `{{staff_phone}}` | staff.mobile |

### 21.2 Resolution order

```
1. Load customer + business context
2. Load current appointment (upcoming or in-progress)
3. Load CustomerAppointmentStats (denormalized)
4. Load last COMPLETED appointment
5. Merge custom VariableDefinition values
6. Apply ENGINE_KEY_ALIASES (dotted → snake_case)
7. Replace {{tokens}} in template body
```

---

## 22. Analytics Architecture

### 22.1 Metrics (`GET /scheduling/analytics/summary?days=30`)

| Metric | Calculation |
|--------|-------------|
| Total appointments | COUNT by period |
| Revenue | SUM AppointmentPayment PAID |
| Cancellation rate | CANCELLED / total |
| No-show rate | NO_SHOW / CONFIRMED |
| Utilization | booked minutes / available minutes (approx) |
| Avg booking value | revenue / completed |
| Staff performance | GROUP BY staffId |
| Source breakdown | GROUP BY source |
| Ratings | AVG + recent list |

### 22.2 Dashboard summary

`GET /scheduling/dashboard/summary` → todayCount, weekCount, upcoming[5]

### 22.3 Customer stats

`CustomerAppointmentStats` refreshed on COMPLETED/CANCELLED via `refreshCustomerAppointmentStats()`.

### 22.4 Rebooking AI

```
For each service with rebookingIntervalDays:
  Find customers where lastVisitAt + interval <= today
  AND no future appointment
  → sendRebookingCampaign via WhatsApp template
```

---

## 23. Recommended Microservices Structure

**Current:** Modular monolith (recommended until >100 tenants or team >8 engineers).

**Target decomposition:**

```
┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐
│ scheduling-api  │  │ scheduling-worker│  │ calendar-sync   │
│ (REST + WS)     │  │ (reminders, WL)    │  │ (OAuth, webhooks│
└────────┬────────┘  └────────┬─────────┘  └────────┬────────┘
         │                    │                     │
         └────────────────────┼─────────────────────┘
                              ▼
                    PostgreSQL + Redis + RabbitMQ
```

| Service | Responsibilities |
|---------|------------------|
| scheduling-api | CRUD, slots, auth, public tokens |
| scheduling-worker | Reminders, waitlist, rebooking, idempotency purge |
| calendar-sync | OAuth, push/pull, webhooks |
| ai-scheduling | WhatsApp tools, LLM, session state |
| scheduling-analytics | Read replica queries, exports |

**Migration path:** Extract workers first (lowest risk), then calendar-sync, then AI.

---

## 24. Development Phases

| Phase | Scope | Status |
|-------|-------|--------|
| **P1 Foundation** | Schema, staff, services, locations, working hours, basic CRUD | ✅ Done |
| **P2 Booking Core** | Availability engine, slot engine, appointments, double-book protection | ✅ Done |
| **P3 Channels** | Dashboard UI, WhatsApp AI, public booking, manage links | ✅ Done |
| **P4 Integrations** | Google/Outlook/Apple calendar, Razorpay, reminders email/SMS | ✅ Done |
| **P5 Enterprise hardening** | RabbitMQ, RLS, S3 uploads, rate limits, read replicas | ✅ Done (opt-in flags) |
| **P6 Advanced** | Group class UI, geo routing, staff mobile app native, ML demand forecast | 🔲 Future |

### P5 backlog (remaining gaps)

- ~~PostgreSQL row-level security policies~~ → migration `20260605180000_scheduling_rls` + `SCHEDULING_RLS_ENABLED=1`
- ~~RabbitMQ replacement for poll workers~~ → `queue.service.js` + `npm run worker`
- ~~S3 presigned upload for `profilePicture`~~ → `/scheduling/staff/:id/profile-picture/*`
- ~~Staff form UI: bio, skills, department, photo~~ → Scheduling.jsx staff tab
- Apple Calendar webhooks — **not supported by Apple CalDAV**; use `APPLE_CALENDAR_SYNC_MS` for faster poll
- ~~Formal API rate limiting on public endpoints~~ → `publicRateLimit.js`
- Horizontal pod autoscaling runbook — ops documentation (see Appendix D)

---

## 25. Acceptance Criteria

### 25.1 Staff management
- [x] CRUD staff with code, contact, designation, soft delete
- [x] Assign multiple services and locations
- [x] Activate/deactivate/archive staff
- [x] Full UI for profile picture upload (S3 presign + Supabase fallback)

### 25.2 Availability
- [x] Working hours per day-of-week
- [x] Breaks (lunch/tea/personal types)
- [x] Leaves with typed enum
- [x] Business holidays (all or per location)
- [x] RRULE recurring rules with presets

### 25.3 Booking
- [x] Slot search by service/date/staff/location
- [x] Book from dashboard with idempotency
- [x] Prevent double booking (Redis + GiST)
- [x] Multi-capacity (`maxCapacity`) in engine
- [x] Paginated appointment list
- [x] Week view drag-and-drop reschedule

### 25.4 Channels
- [x] WhatsApp AI book/cancel/reschedule/waitlist/pay
- [x] Public booking page + waitlist
- [x] Signed manage links (confirm/cancel/reschedule/rate/pay/ICS)

### 25.5 Calendar
- [x] Google two-way + webhook
- [x] Outlook two-way + subscription renewal
- [x] Apple CalDAV push/pull (poll)
- [x] Blocked slots affect availability

### 25.6 Notifications
- [x] Reminders 24h/2h/30m — WhatsApp, email, SMS
- [x] Confirmation on book/confirm
- [x] Rating request on complete

### 25.7 Waitlist
- [x] Join from dashboard, public, AI
- [x] Dedup active entries
- [x] Auto-offer on cancel with 15m TTL

### 25.8 Payments
- [x] Razorpay link + QR + cash recording
- [x] Advance % configurable
- [x] Partial/full payment states

### 25.9 Analytics & variables
- [x] Dashboard summary + analytics tab
- [x] Customer stats denormalized
- [x] Template variables for appointments
- [x] Rebooking campaigns

### 25.10 Quality
- [x] Integration tests for booking idempotency
- [x] Realtime WebSocket events
- [x] E2E Playwright suite (`e2e/tests/scheduling-public.spec.js`)
- [x] Load test concurrent bookings (`npm run test:scheduling:load`)

---

## Appendix A — Environment variables

See [`backend/.env.example`](../backend/.env.example):

- `GOOGLE_CLIENT_*`, `OUTLOOK_CLIENT_*`, `CALENDAR_TOKEN_SECRET`
- `RAZORPAY_*`, `APPOINTMENT_ADVANCE_PERCENT`
- `SMTP_*`, `TWILIO_*`, `REMINDER_CHANNELS`, `REMINDER_POLL_MS`
- `CALENDAR_SYNC_MS`, `REBOOKING_CAMPAIGN_MS`, `SLOT_LOCK_TTL_SEC`
- `AI_SCHEDULING_TOOLS`, `WHATSAPP_*_TEMPLATE`
- `REDIS_URL`, `DATABASE_URL`, `JWT_SECRET`

---

## Appendix B — Folder structure

```
vartalap-repo/
├── backend/
│   ├── prisma/schema.prisma
│   ├── prisma/migrations/
│   ├── src/scheduling/          # Module services
│   ├── src/controllers/scheduling.controller.js
│   ├── src/routes/scheduling.routes.js
│   └── tests/scheduling/        # Unit + integration tests
├── frontend/src/pages/
│   ├── Scheduling.jsx
│   ├── StaffSchedule.jsx
│   ├── PublicBook.jsx
│   └── ManageAppointment.jsx
└── docs/
    ├── scheduling-tdd.md        # Quick reference
    └── scheduling-enterprise-tdd.md  # This document
```

---

## Appendix C — Future enhancements

- Native iOS/Android staff app
- Google Reserve / Meta appointment extensions
- Deposit rules by service category
- Multi-resource booking (room + staff)
- HIPAA audit log export (clinics)
- Demand-based dynamic pricing
- Customer loyalty points linked to `lifetimeSpend`

---

## Appendix D — Horizontal scaling runbook

1. **API**: Run multiple `node src/server.js` instances behind a load balancer. Set `WORKER_ENABLE=false` on API pods when workers run separately.
2. **Workers (same deployment)**: Default `WORKER_ENABLE=true` — reminders, waitlist, calendar sync, and rebooking run in the API process (poll or RabbitMQ).
3. **Workers (separate deployment)**: Set `WORKER_ENABLE=false` on API and run `npm run worker` (sets `WORKER_STANDALONE=true`). With RabbitMQ, exchange `vartalap.scheduling` and queues auto-create on connect.
4. **Redis**: Required shared instance for slot locks and WebSocket pub/sub.
5. **PostgreSQL**: Use PgBouncer in transaction mode; apply RLS migration and enable `SCHEDULING_RLS_ENABLED=1` for defense in depth.
6. **Rate limits**: In-memory limiter is per-instance; use edge WAF or Redis limiter at scale.

---

*End of document.*
