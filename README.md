# WAPilot

WAPilot is a WhatsApp-first CRM + automation app with:
- A web Conversations inbox (same thread as WhatsApp)
- WhatsApp template management (create/list/sync statuses)
- Wallet-based communication credits + transaction history
- Bulk/template sends to contacts
- Contact upload for campaign sending
- Product/Service catalog with images used by AI and staff in chat
- WhatsApp-style delivery markers (sent/delivered/read)

## Monorepo structure

- `backend/`: Node/Express API + webhook handlers + DB (Prisma)
- `frontend/`: React UI

## Local development

### Backend

From `backend/`:

```bash
npm install
npm run dev
```

Backend defaults to `http://localhost:3000`.

### Frontend

From `frontend/`:

```bash
npm install
npm run dev
```

Frontend defaults to `http://localhost:5173`.

## Features (detailed)

### 1) Communications module (UI split into 4 pages)

The previous single “Communications” sidebar entry is split into separate sidebar items:
- **Wallet**: view balance, add money, see transactions
- **Send Communication**: send an approved template to a contact or bulk
- **Templates**: list templates, sync Meta status, create new templates on a separate page
- **Upload Contacts**: upload contacts for bulk sends
- **Contact Book**: view uploaded contacts + appointment count + amount paid + products bought

Each page shows a tab-specific header/title/subtitle.

#### API loading behavior (important)
To keep the UI fast and reduce unnecessary backend load, the Communications pages **lazy-load** per tab:
- **Wallet tab** calls only wallet + transactions endpoints.
- **Send tab** loads only what the send UI needs (wallet, contacts, templates).
- **Templates tab** loads templates + Meta template options only.
- **Upload Contacts tab** does not auto-fetch lists.
- **Contact Book tab** loads only contact book data.

### 1.1) Settings module (with subtabs)

Settings now includes:
- **General**: business profile, phone number ID, AI client details, services/products catalog, working hours, auto-reply, UPI
- **User Management**: manage users from inside Settings

This allows client teams to manage users without leaving Settings.

### 2) Templates (Meta WhatsApp templates)

#### UI behavior
- **List page** shows local templates plus **Meta status**.
- **Create Template** opens a dedicated page (not inline in the list).
- **Sync from Meta**:
  - can sync status per-template
  - shows a loader while waiting for the API response

#### Meta status display
Meta’s UI often shows “In review” while the Meta API returns `PENDING`. In WAPilot we display:
- `APPROVED` → green badge
- `PENDING` → **`IN_REVIEW`** (amber badge) for readability/matching Meta UI language
- `REJECTED` → red badge
- missing status → `NOT_FOUND` (neutral badge)

#### Backend behavior
- Templates are created on Meta using the WhatsApp Business API template endpoint.
- Local template records store a simplified local status:
  - `WORKING` (Meta `APPROVED`)
  - `NOT_WORKING` (anything else)

### 3) Wallet + communications credits

#### What it does
- Stores a wallet balance for each business
- Deducts per-message costs when sending communication (as configured on backend)
- Tracks wallet transactions (credits/debits/topups)

#### UI behavior
- View balance
- Add money (Razorpay checkout)
- Paginated transaction list with filters

### 4) Upload Contacts (CSV)

#### What it does
- Upload contacts (CSV pasted/imported) to the business contact list
- Used as the target list for bulk template sends

#### UI behavior
- Upload action shows a loader during processing and reports inserted count

### 4.1) Contact Book (uploaded contacts + CRM summary)

Contact Book is a Sales/ops-friendly view built on top of the uploaded `Contact` list.

#### What it shows
- **Name / Phone**: from uploaded contacts (falls back to Customer name if available)
- **Amount paid till now**: sum of `CustomerPayment.amount` where `status=PAID`
- **Booking No**: number of appointments (booking count)
- **Products bought**: derived from bookings whose `service` matches **Settings → Products** catalog items

#### Delete contact
You can delete an uploaded contact from Contact Book.

### 5) Send Communication (Template sends)

#### What it does
- Sends WhatsApp **template messages** to:
  - a single contact
  - or bulk contacts

#### UI behavior
- Template picker, contact picker / bulk selection
- Shows success/failure feedback per operation

### 6) Catalog (Products & Services) with images

#### What it does
Settings → Products/Services supports an `imageUrl` per catalog item. These images are used in two places:
- **AI auto-replies**: bot can pick a relevant catalog image and send it
- **Staff chat composer**: staff can click **Send from catalog** to send an item image quickly

#### Image upload support
Catalog item images can be added by:
- pasting a public image URL, or
- uploading an image file (frontend converts to base64 and calls `/media/upload`)

### 7) Conversations inbox (chat)

#### Supported message types (rendering)
Messages are stored as structured JSON content to support multiple kinds:
- `text`
- `image` (supports `imageUrl` + optional caption)
- `audio`, `video`, `document`, `sticker`
- `location`, `contacts`
- `button`, `interactive`
- `reaction`

#### “Sent from catalog” label
If a message content indicates it was sourced from a product/service catalog, the bubble shows a small **Sent from catalog** label.

### 8) WhatsApp-style delivery markers (ticks)

Outgoing messages show WhatsApp-like delivery/read markers:
- **Sent**: single tick
- **Delivered**: double tick
- **Read**: double **blue** tick

Markers update based on WhatsApp **status webhooks** (sent/delivered/read), persisted on outbound message records.

### 9) User Management

User Management is available as:
- a dedicated page (`/user-management`)
- a subtab inside **Settings**

#### What it supports
- List users
- Create user
- Reset user password (role-restricted)
- Delete user (role-restricted)

#### Role-based visibility and permissions
- **CHIEF_ADMIN**
  - can see users across clients
  - can create `CHIEF_ADMIN` and `STAFF`
  - can reset/delete users (except self-delete is blocked)
- **OWNER (client)**
  - sees only users of their own client
  - visible roles in client scope: `OWNER`, `STAFF`
  - can create only `STAFF` for their own client
  - can reset/delete only `STAFF` users in their own client
- **STAFF**
  - can view according to client scope
  - cannot reset/delete any user

#### STAFF creation and client linking
- If creator is **CHIEF_ADMIN** and selected role is `STAFF`, UI shows a **Client dropdown** to choose which client to link.
- In client scope (OWNER/STAFF), cross-client linking is not allowed.

## API surface (high-level)

The backend exposes API routes under `/` (see `backend/src/routes/api.routes.js`). Common endpoints used by the UI include:

- **Wallet**
  - `GET /wallet`
  - `GET /wallet/transactions`
  - `POST /wallet/add-money`
  - `PATCH /wallet/add-money/:id/verify`

- **Contacts**
  - `GET /contacts`
  - `POST /contacts/upload`
  - `GET /contacts/book` (Contact Book summary)
  - `DELETE /contacts/:id` (delete uploaded contact)

- **Templates**
  - `GET /templates` (includes Meta sync/status info)
  - `GET /templates/meta-options`
  - `POST /templates` (creates on Meta and stores locally)
  - `PATCH /templates/:id/status` (sync one template from Meta)

- **Send**
  - `POST /communications/send` (send template communication)
  - `POST /send-message` (send chat message; supports text or imageUrl)

- **ChiefAdmin**
  - `POST /admin/onboard`
  - `POST /admin/chiefadmins`
  - `GET /admin/clients`
  - `POST /admin/impersonate`
  - `POST /admin/return-session`
  - `POST /admin/ensure-chiefadmin`

- **User Management**
  - `GET /user-management/users`
  - `GET /user-management/clients`
  - `POST /user-management/users`
  - `POST /user-management/users/:id/reset-password`
  - `DELETE /user-management/users/:id`

## ChiefAdmin (Sales-led onboarding)

Public self-signup is disabled. New clients are onboarded by the Sales team using a ChiefAdmin-only dashboard.

### Role
- `CHIEF_ADMIN` is a dedicated role used for onboarding clients.

### ChiefAdmin UI
- Frontend route: `/chiefadmin`
- Visible in sidebar **only** for users with role `CHIEF_ADMIN`.
- For `CHIEF_ADMIN`, sidebar is intentionally minimal and shows:
  - **ChiefAdmin**
  - **User Management**
- Dashboard has two sections:
  - **Clients** (list all client businesses)
  - **Onboard New Client**
  - plus **Create ChiefAdmin** option in onboarding area

### Onboarding API
- `POST /admin/onboard` (requires auth + `CHIEF_ADMIN`)
  - Creates a new **Business** and **OWNER user**
  - Returns a **temporary password** for the owner (to share with the client)

### Create ChiefAdmin API
- `POST /admin/chiefadmins` (requires auth + `CHIEF_ADMIN`)
  - Creates a new `CHIEF_ADMIN` user
  - Accepts optional password; auto-generates temp password when omitted

### Client access APIs
- `GET /admin/clients` (requires auth + `CHIEF_ADMIN`)
  - Lists clients with business name, owner email, and created date.
- `POST /admin/impersonate` (requires auth + `CHIEF_ADMIN`)
  - Switches ChiefAdmin into selected client OWNER session.
  - Returns both client auth token and a short-lived `returnToken`.
- `POST /admin/return-session` (requires auth)
  - Restores ChiefAdmin session using `returnToken` (no re-login needed).

### Safe return flow
When ChiefAdmin clicks **Access** from the Clients list:
1. Frontend calls `/admin/impersonate`.
2. Backend returns client token + `returnToken`.
3. Frontend switches to client session and stores `returnToken`.
4. Sidebar shows **Back to ChiefAdmin**.
5. Clicking it calls `/admin/return-session` and restores ChiefAdmin session.

### Bootstrap ChiefAdmin (optional)
If you want a quick way to create the first ChiefAdmin account in a fresh environment:
- `POST /admin/ensure-chiefadmin`
- Requires env vars:
  - `CHIEF_ADMIN_EMAIL`
  - `CHIEF_ADMIN_PASSWORD`

### Signup disabled
- `/auth/register` returns `403` with a “contact sales” message.
- Frontend “Create account” links are replaced by **Contact sales** CTA.

## Media upload API (Base64 JSON)

The backend supports uploading media by sending a JSON payload containing `base64Data`:

```bash
curl 'http://localhost:3000/media/upload' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  --data-raw '{"base64Data":"data:image/png;base64,...","mimeType":"image/png","fileName":"image.png"}'
```

Returns:
- `publicUrl`: public file URL (used for catalog images and WhatsApp image sends)
- `bucket`, `path`: storage identifiers

### Payload too large (413)

Base64 payloads can be large. The backend increases JSON body parsing limits and returns a clearer `413` response message:
- suggests reducing payload size, or
- increasing `JSON_BODY_LIMIT`

You can configure the server JSON size limit via:

```bash
JSON_BODY_LIMIT=25mb
```

## Webhooks (WhatsApp)

The backend receives WhatsApp webhooks under `/webhook` and handles:
- inbound messages/events
- outbound message status updates (`sent`, `delivered`, `read`)

These statuses are used to update the tick markers in the chat UI.

## Environment variables

See `backend/.env` for the full list used in local development. Commonly used values include:
- **WhatsApp**
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_BUSINESS_ACCOUNT_ID`
- **Supabase media**
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_MEDIA_BUCKET` (optional; default `wapilot-media`)
- **Server**
  - `CORS_ORIGIN` (comma-separated)
  - `JSON_BODY_LIMIT` (optional; default `25mb`)
  - `CHIEF_ADMIN_EMAIL` (optional; only used by `/admin/ensure-chiefadmin`)
  - `CHIEF_ADMIN_PASSWORD` (optional; only used by `/admin/ensure-chiefadmin`)

## Troubleshooting

### `/media/upload` fails with 413
- Reduce image size (compress/resize)
- Or increase `JSON_BODY_LIMIT`

### Template shows “In review” on Meta but “Pending” in API
- Meta API often returns `PENDING`; WAPilot displays it as `IN_REVIEW` to match Meta UI terminology.

### Contact Book “Products bought” is empty
- This column counts only bookings whose `service` matches a name in **Settings → Products**.
- If your bookings store product purchases differently (separate purchase table), update the aggregation source.

### User not visible in User Management
- Check role-based scope:
  - client scope shows only that client’s `OWNER` + `STAFF`
  - chief scope can view broader user list


