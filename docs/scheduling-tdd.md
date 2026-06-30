# Staff Scheduling — Quick Reference (Vartalap)

> **Full enterprise TDD (25 sections):** [`scheduling-enterprise-tdd.md`](./scheduling-enterprise-tdd.md)  
> Use the enterprise document for architecture, ER diagrams, API samples, algorithms, acceptance criteria, and development phases.

This file is a concise **as-built** summary for day-to-day development.

## Scope

- Multi-staff appointment booking with services, locations, and working hours
- 7-layer availability engine + RRULE recurring rules
- WhatsApp AI booking (book, cancel, reschedule, waitlist, payments, ratings)
- Google, Outlook & Apple calendar sync (OAuth or CalDAV, push appointments, pull busy blocks)
- Razorpay advance payments and payment QR
- Reminders (WhatsApp default; optional email/SMS)
- Waitlist, rebooking campaigns, customer stats, analytics
- Public online booking page and self-service manage links (confirm / cancel / reschedule / rate / pay)
- ICS calendar download for appointments
- Double-booking protection: Redis slot locks + PostgreSQL GiST exclusion constraint
- Paginated appointment list, week drag-and-drop reschedule, bulk confirm/check-in
- Booking idempotency keys + integration tests (`npm run test:scheduling`)

## Architecture

```
┌─────────────┐     REST/WS      ┌──────────────────┐
│ React UI    │ ◄──────────────► │ Express API      │
│ Scheduling  │                  │ scheduling.*     │
└─────────────┘                  └────────┬─────────┘
                                          │
         ┌────────────────────────────────┼────────────────────────┐
         ▼                ▼               ▼                ▼         ▼
   PostgreSQL          Redis        WhatsApp Meta    Google/Outlook  Razorpay
   (Prisma)         (locks, RT)         API           Graph API      webhooks
```

**Background workers** (poll-based): Reminders, Waitlist, Calendar sync, Rebooking, Idempotency purge.

## Key paths

| Area | Path |
|------|------|
| Routes | `backend/src/routes/scheduling.routes.js` |
| Controller | `backend/src/controllers/scheduling.controller.js` |
| Services | `backend/src/scheduling/*.service.js` |
| Frontend hub | `frontend/src/pages/Scheduling.jsx` |
| Tests | `backend/tests/scheduling/` |
| Env | `backend/.env.example` |

## Appointment list API (paginated)

`GET /scheduling/appointments?page=1&pageSize=50` → `{ items, total, page, pageSize, totalPages, hasMore }`

## Deployment

```bash
cd backend && npx prisma migrate deploy && npx prisma generate
```

OAuth redirects: `{API_PUBLIC_URL}/scheduling/calendar/google/callback`, `{API_PUBLIC_URL}/scheduling/calendar/outlook/callback`

## Remaining vs enterprise spec (Phase 5)

See **§24–§25** in [`scheduling-enterprise-tdd.md`](./scheduling-enterprise-tdd.md). Phase 5 is implemented (RLS, RabbitMQ, S3, rate limits, E2E, load tests) — enable via env flags in `backend/.env.example`.
