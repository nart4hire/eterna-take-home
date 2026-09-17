# Take-Home Test — Full-Stack JavaScript Developer

**Role:** Full-Stack Developer (Node.js + any JS framework)
**Project:** "StockFlow" — a minimal Inventory & Invoicing system
**Time budget:** 1 day of focused work
**Deadline:** 1 calendar day from the date you receive this document
**Submission:** Git repository link (GitHub/GitLab/Bitbucket) + a short README

---

## 1. Before You Start — Read This

This is a **scoped** exercise, not an open-ended project. We are deliberately asking for a *small* application so that you can spend your effort on **doing a small thing well** rather than a big thing badly.

What we actually care about:

- Does it **run** from a clean clone by following your README?
- Is the **authentication** done the way a professional would do it?
- Did you handle the **business rules** correctly (stock, totals, invoice states)?
- Is the **code** something a teammate could pick up on Monday?

What we do **not** care about:

- Pixel-perfect or beautiful UI (plain and functional is fine)
- Deployment to a live server (optional bonus only)
- Feature quantity — extra unrequested features do **not** earn points and often cost points

> If you run out of time, ship **less scope, finished properly** rather than more scope, half-broken. Write down in the README what you cut and why. That is a respected answer here.

---

## 2. Tech Stack — Your Choice

**Backend (required):** Node.js. Any framework you like — **NestJS, Express, Fastify, Hapi, Koa, or Next.js API routes / Route Handlers**.

**Frontend (required, kept small):** Any JS framework — **React, Next.js, Vue, Nuxt, Svelte, Angular, or Remix**. Server-rendered templates are also acceptable if that is your strength.

**Free choices:**

| Concern | Options |
|---|---|
| Language | JavaScript or TypeScript (**TypeScript is preferred**) |
| Database | PostgreSQL, MySQL/MariaDB, SQLite, or MongoDB |
| ORM / query layer | Prisma, TypeORM, Drizzle, Sequelize, Mongoose, Knex, or raw SQL |
| Styling / UI kit | Tailwind, MUI, Chakra, shadcn/ui, Bootstrap, or plain CSS |
| Monorepo vs two folders | Either — just document how to run both |

**Only hard rules:** the server runtime must be Node.js, and the whole thing must run locally with a documented setup. Use a real database (SQLite counts) — **not** an in-memory array that dies on restart.

---

## 3. The Scenario

A small distribution business tracks the products it holds in stock and bills its customers with invoices. Today it does this in a spreadsheet, and it keeps overselling stock it does not have.

They want a simple internal web app where a staff member can:

1. Sign in securely.
2. Maintain a list of products with quantity on hand.
3. Raise an invoice for a customer containing one or more of those products.
4. Have stock go **down automatically** when an invoice is issued, and **come back** if it is cancelled.

---

## 4. Functional Requirements (Core — all required)

### 4.1 Authentication

| # | Requirement |
|---|---|
| A1 | **Register** with email + password. Email must be unique and validated. |
| A2 | **Login** returning a credential (JWT or httpOnly session cookie — your call). |
| A3 | **Logout** that actually invalidates the client's session/token from the app's point of view. |
| A4 | Passwords **hashed with bcrypt or argon2** (with per-user salt). Plaintext or reversible encryption is an automatic fail. |
| A5 | A minimum password policy (e.g. ≥8 chars) enforced **server-side**, not only in the browser. |
| A6 | **Every** inventory and invoice endpoint requires authentication and returns `401` when unauthenticated. |
| A7 | Users only see and modify **their own** data (each user is effectively their own workspace). |
| A8 | Secrets (JWT secret, DB URL) come from environment variables. A committed `.env` holding real secrets is a fail; commit a `.env.example` instead. |
| A9 | Auth errors must not leak which part was wrong (no "user not found" vs "wrong password" distinction). |

### 4.2 Inventory (Products)

Suggested shape — adapt as you see fit, but justify changes:

```
Product
  id              uuid / int
  sku             string, unique per user, required
  name            string, required
  description     string, optional
  unitPrice       money, >= 0, required
  quantityOnHand  integer, >= 0, required
  createdAt / updatedAt
```

| # | Requirement |
|---|---|
| I1 | Create, read, update, delete a product. |
| I2 | List products with **pagination** and **search by name or SKU**. |
| I3 | Server-side validation: `sku` unique, `unitPrice >= 0`, `quantityOnHand >= 0`, required fields present. Return a clear `400`/`422` with field-level messages. |
| I4 | A product referenced by an existing invoice **must not silently disappear**. Either block the delete with a clear error, or soft-delete. Your choice — document it. |

### 4.3 Invoices

```
Invoice
  id
  invoiceNumber   string, unique, auto-generated (e.g. INV-2026-0001)
  customerName    string, required
  issueDate       date
  dueDate         date
  status          DRAFT | ISSUED | PAID | CANCELLED
  notes           string, optional
  subtotal / taxAmount / total
  items[]

InvoiceItem
  productId
  productName     (snapshot)
  unitPrice       (snapshot at the moment the invoice was created)
  quantity        integer, > 0
  lineTotal
```

| # | Requirement |
|---|---|
| V1 | Create an invoice with **one or more line items** referencing existing products. |
| V2 | Server calculates `lineTotal`, `subtotal`, `taxAmount`, `total`. **Never trust totals sent by the client.** |
| V3 | Tax rate configurable via env var, default **11%**, applied to the subtotal. |
| V4 | `unitPrice` and `productName` are **snapshotted onto the line item**. Changing a product's price later must **not** change any existing invoice. |
| V5 | **Stock guard:** an invoice line cannot exceed the product's available `quantityOnHand`. Reject with a clear error naming the product. |
| V6 | **Issuing** an invoice (`DRAFT → ISSUED`) decrements `quantityOnHand` for every line, **atomically** — either all lines succeed or none do. |
| V7 | **Cancelling** an `ISSUED` invoice restores the stock it consumed. Cancelling a `DRAFT` invoice restores nothing. |
| V8 | Status transitions are enforced server-side: `DRAFT → ISSUED → PAID`, `DRAFT → CANCELLED`, `ISSUED → CANCELLED`. `PAID` and `CANCELLED` are terminal. Any other transition returns an error. |
| V9 | Only `DRAFT` invoices may have their line items edited. |
| V10 | List invoices with pagination + filter by status; view a single invoice with its line items and totals. |

> **Money:** do not use floating-point arithmetic for currency. Use integer minor units (cents/rupiah) or a decimal type. We will check this.

### 4.4 Frontend (keep it small)

A minimal but working UI is required. Plain styling is completely fine.

| # | Screen |
|---|---|
| F1 | Register + Login pages, with server-side errors surfaced to the user |
| F2 | Products list (search + paginate) with create / edit / delete |
| F3 | Invoice creation form: enter customer name, add product lines, see live totals |
| F4 | Invoice list (filter by status) and invoice detail with status actions (Issue / Mark Paid / Cancel) |
| F5 | Authenticated layout — an unauthenticated visitor is redirected to login |
| F6 | Loading and error states that do not leave the user staring at a blank screen |

---

## 5. Non-Functional Requirements

| # | Requirement |
|---|---|
| N1 | **README** with: prerequisites, setup steps, env vars, how to run migrations + seed, how to start backend and frontend, how to run tests. |
| N2 | **`.env.example`** listing every variable with safe placeholder values. |
| N3 | **Seed script** creating a demo user and a handful of products so we can click around within a minute. Put the demo credentials in the README. |
| N4 | **Automated tests** — at minimum **5 meaningful tests**, and they must include: (a) login with a wrong password is rejected, (b) an unauthenticated request to a protected route returns 401, (c) invoicing more than the available stock is rejected, (d) issuing an invoice decrements stock correctly, (e) cancelling an issued invoice restores stock. Unit or integration, your choice. |
| N5 | **API documentation** — Swagger/OpenAPI, a Postman/Bruno collection, or a clear endpoint table in the README. |
| N6 | **Consistent error responses** with correct HTTP status codes (`400/401/403/404/409/422/500`) and a predictable JSON shape. |
| N7 | **Git history** with incremental, meaningful commits. A single "initial commit" containing everything scores poorly. |

---

## 6. Bonus (only after the core is complete)

Do **not** attempt these at the expense of Section 4. Pick at most one or two.

- Refresh tokens with rotation, or proper session expiry handling
- Roles: `ADMIN` (full access) vs `STAFF` (cannot delete products)
- Rate limiting on the login endpoint
- `docker-compose up` brings up app + database
- A stock-movement ledger (append-only record of every increment/decrement with a reason)
- Handling concurrent issue attempts safely (DB transaction isolation, row locking, or optimistic locking)
- Invoice PDF or print view
- CI pipeline (GitHub Actions) running lint + tests
- A deployed demo URL (Vercel / Railway / Render / Fly.io)
- E2E tests (Playwright / Cypress)

---

## 7. Explicitly Out of Scope

Please do **not** build: payment gateway integration, multi-currency, purchase orders / supplier management, email sending, password reset flows, OAuth / social login, real-time updates, multi-tenancy beyond per-user ownership, or an elaborate design system.

---

## 8. Use of AI Tools

Using ChatGPT, Claude, Copilot, Cursor, etc. is **allowed and expected** — that is how we work.

Two conditions:

1. Add a short **"AI Usage"** section to your README: which tools, and what you used them for.
2. You must be able to **explain and defend every line** in a live 30-minute walkthrough. We will ask you to justify specific design decisions, and to change something on the spot.

Unexplainable code is worse than no code.

---

## 9. What to Submit

1. **Repository link** (public, or private with access granted to the address in your invitation email).
2. **README.md** containing:
   - Setup and run instructions (assume a fresh machine with Node installed)
   - Demo login credentials from your seed
   - **Tech choices and why** — 5–10 bullet points
   - **Trade-offs and known limitations** — what you knowingly did not do
   - **What you would do with one more week**
   - **AI Usage** section
   - Roughly how many hours you actually spent (honest answer; it is not scored)
3. *(Optional, appreciated)* A 3–5 minute Loom walking through the app and one design decision you are proud of.

### Submission checklist

- [ ] `git clone` → follow README → app runs, with **no undocumented steps**
- [ ] `.env.example` present; no real secrets committed
- [ ] Seed script works; demo credentials in README
- [ ] Register → login → logout works
- [ ] Protected endpoints return 401 without a credential
- [ ] Products: create, list, search, paginate, update, delete
- [ ] Invoice: create with multiple lines, correct subtotal / tax / total
- [ ] Cannot invoice more than stock on hand
- [ ] Issuing decrements stock; cancelling an issued invoice restores it
- [ ] Illegal status transitions are rejected
- [ ] Changing a product price does not alter an existing invoice
- [ ] Tests run with a single documented command and pass
- [ ] More than one commit, with readable messages

---

## 10. How You Will Be Evaluated

We score against a written rubric weighted roughly like this:

| Area | Weight |
|---|---|
| Core feature completeness | 25% |
| Business logic & data integrity (stock, totals, transitions, money) | 20% |
| Authentication & security | 15% |
| Code quality & architecture | 15% |
| Data modeling & database usage | 8% |
| Testing | 8% |
| API design & error handling | 5% |
| Developer experience (README, setup, git hygiene) | 4% |

Bonus items can add a little on top, but they can never rescue an incomplete core.

---

## 11. Questions

If a requirement is ambiguous, **make a reasonable decision, write it down in the README, and move on** — that is exactly what we want to see. If something is genuinely blocking, email us; asking a good question is a positive signal, not a negative one.

Good luck. We are looking forward to seeing how you think.
