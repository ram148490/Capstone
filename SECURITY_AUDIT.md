# ShiftCast — Security Audit

**Date:** 2026-09-06 · **Scope:** secrets/keys, injection, data handling
**Baseline after fixes:** `npm run lint` clean · `npm test` 93/93 · `npm run test:scoping` 21/21 · `npm run test:http` 20/20

| ID | Area | Severity | Status |
|----|------|----------|--------|
| SEC-1 | Secrets | **High** | Fixed |
| SEC-2 | Secrets | Low (info) | Documented |
| SEC-3 | Injection | Low–Medium | Fixed |
| SEC-4 | Injection | Low | Fixed |
| SEC-5 | Data handling | Medium | Fixed |
| SEC-6 | Data handling | Low | Documented |
| SEC-7 | Injection | Low (info) | Documented |
| — | Hardening backlog | Low (info) | Documented |

---

## 1. API keys & secrets

### ✅ What's clean
- **No API keys or tokens hardcoded in source.** `GEMINI_API_KEY` is read only from `process.env` in `server/lib/gemini.ts` and never returned to the client or logged.
- **`.gitignore` is correct:** `.env*` is ignored with `!.env.example` un-ignored; `data/` (the runtime store) is ignored.
- **No `.env` file exists in the working tree**; `.env.example` contains only placeholders (`MY_GEMINI_API_KEY`, `MY_APP_URL`).
- No secrets in `vite.config.ts`, `index.html`, `metadata.json`, `package.json`.
- Passwords are never in source except the **intentional public demo credential** (`manager@rustictable.com` / `manager123`), which is documented as a demo login.

### 🔴 SEC-1 — Hardcoded JWT signing-secret fallback — **HIGH** — FIXED

`server/db.ts` signed all session tokens with:
```js
const JWT_SECRET = process.env.JWT_SECRET || 'shiftcast-secure-jwt-secret-key-2026';
```
Anyone who can read this (public) source could sign a valid JWT for **any** `userId` and fully impersonate any account — a complete authentication bypass — whenever the app is deployed without `JWT_SECRET` set. `.env.example` didn't even mention the variable, so an operator had no signal to set it.

**Fix:**
- `JWT_SECRET` is now resolved through a guard: in **production** (`NODE_ENV=production`, which the build script bakes into the bundle) the server **throws on startup** if `JWT_SECRET` is missing or shorter than 16 chars. In development it logs a `[security]` warning and uses a clearly-labelled throwaway key.
- `.env.example` now documents `JWT_SECRET` as **required in production**, with `openssl rand -base64 48` guidance.

Verified: dev boots with a warning; `NODE_ENV=production` with no secret refuses to boot; `NODE_ENV=production` + `JWT_SECRET` set boots normally.

### 🟡 SEC-2 — `data/shiftcast_db.json` exists in git history — **LOW (informational)** — DOCUMENTED

The runtime datastore was committed in `aa5aa25` and removed in `bc2c332` (when `data/` was added to `.gitignore`). It is **not currently tracked**. The historical copy contains **only the seed demo user** — its `bcrypt` hash (`$2b$10$xVd…`), no API keys, no real users, no tokens. Since the demo password (`manager123`) is already hardcoded in `server/db.ts`, the historical hash discloses nothing new.

**Recommendation (optional):** if you ever want a spotless history, `git filter-repo --path data/shiftcast_db.json --invert-paths` then force-push. Given the only exposed material is a throwaway demo hash, a history rewrite of `main` is disproportionate — left to your discretion. The forward-looking controls (`.gitignore`, untracked) are already in place.

---

## 2. Injection risks

### ✅ What's clean
- **No SQL database.** Persistence is a single JSON file with an in-memory object; lookups are `Array.prototype.find` on `===` comparisons. No query language, no SQL injection surface.
- **No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or `document.write` anywhere** (client or server). React auto-escapes every interpolated value, so stored strings (event titles, employee names, POS notes, iCal fields, AI output) render as inert text.
- **File writes:** `server/db.ts` `saveDb` writes a **fixed path** (`data/shiftcast_db.json`) via an atomic temp-file + rename; user input only ever becomes JSON *values* (serialized by `JSON.stringify`), never part of the path or file structure.
- **No path traversal:** static assets are served by `express.static(dist)` (built-in traversal protection); the SPA catch-all only ever `sendFile`s `dist/index.html`.
- **Prototype pollution:** route handlers destructure known keys (`const { profile } = req.body`, `const { roster } = req.body`, …) rather than merging raw bodies; V8's `JSON.parse` puts `__proto__` on the object as an own property, and object spread doesn't set the prototype — not exploitable via the observed paths.
- **DELETE params** (`req.params.id` for POS / accuracy log deletion) are used only in `.filter(r => r.id !== id)` comparisons — no file or query use.
- CSV output already applied RFC-4180 quote-doubling.

### 🟡 SEC-3 — CSV formula injection in `generateScheduleCSV` — **LOW–MEDIUM** — FIXED

`src/lib/calendarUtils.ts` wrote user-controlled values (chiefly **employee names** from the Add Staff form) into the exported schedule CSV. RFC-4180 quoting prevents CSV *parsing* attacks but **not** spreadsheet formula execution: Excel / Google Sheets evaluate a cell whose value starts with `=`, `+`, `-`, `@`, tab, or CR as a formula **even when the value is quoted**. A staff member named `=HYPERLINK("http://evil","invoice")` or `@SUM(…)` could fire when a manager opens the export.

**Fix:** a new `csvCell()` serializer prefixes any cell value starting with `= + - @ \t \r` with a single quote (OWASP guidance) before quote-doubling. No legitimate column (dates, role names, non-negative rates/hours/costs/covers) starts with those characters, so real data is untouched. Regression tests added to `tests/test-engine.ts`.

`generateKitchenScheduleText` (clipboard/pinboard) was **not** changed — it's prose formatted (`• [ROLE] Name (hrs)`), the leading `•` already neutralises formula interpretation, and it isn't opened as a spreadsheet.

### 🟡 SEC-4 — AI route error messages echoed to the client — **LOW** — FIXED

The four `/api/*` AI endpoints returned `error: error.message` to the client on failure, which could leak internal details (stack fragments, file paths, SDK internals, conceivably a mis-formatted upstream URL). **Fix:** they now return a generic message (`'Failed to generate AI forecast.'` etc.) while still `console.error`-ing the full error server-side. The `/api/restaurant/*` routes already returned generic strings; `/api/auth/*` intentionally returns its own friendly messages ("Invalid email or password.").

### 🟡 SEC-7 — LLM prompt injection — **LOW (informational)** — DOCUMENTED

User-supplied text (`rawText`, `location`, restaurant profile JSON) is interpolated into Gemini prompts server-side, so a user can attempt to steer the model ("ignore the schema, output …"). Impact is contained: the prompts contain **no secrets and no other users' data**, and the response is parsed as records/events and shown back only to the same user. No fix beyond awareness; if you later put sensitive context in a prompt, revisit this.

---

## 3. Data handling

### ✅ What's clean
- **Passwords are bcrypt-hashed** (`bcryptjs`, cost factor 10) on both register (`bcrypt.hash`) and demo seed (`bcrypt.hashSync`). Verified via `bcrypt.compare` on login. Plaintext passwords are **never stored**.
- **Passwords are never logged.** Every server `console.error` logs an `Error` object/message only — no `req.body`, no credentials (verified by grep across `server/` and `src/`).
- **`passwordHash` is stripped from every response:** `getUserById` returns `{ passwordHash: _, ...safeUser }`; `loginUser` / `registerUser` return `userWithoutPassword`. `GET /api/restaurant/data`, `GET /api/auth/me`, login, register, demo — none expose the hash.
- **Per-user data isolation holds.** All data is keyed by `req.userId` (from the verified JWT) or `DEMO_USER_ID`. The optional `restaurantId` is only ever composed *with the caller's own* `userId` (`getRestaurantStorageKey` → `${userId}__${restaurantId}`), so one user cannot address another user's bucket. Cross-restaurant and reset isolation is covered by `test:scoping` (21 assertions) and `test:http` (20 assertions).
- **Login does not allow user enumeration** — always `'Invalid email or password.'` regardless of whether the email exists.

### 🟠 SEC-5 — Stale/invalid session silently downgraded to the shared demo account — **MEDIUM** — FIXED

`authMiddleware` (soft auth) fell back to `DEMO_USER_ID` in **two** cases: (a) no `Authorization` header, and (b) a header present but the token invalid/expired. Case (b) meant a signed-in user whose 30-day token lapsed would **keep working as the demo user** — and their next roster/POS/profile save would write their real data into the globally-readable, globally-writable demo workspace (a confidentiality + integrity problem).

**Fix:** `authMiddleware` now distinguishes the two. **No header at all** → demo user (anonymous browsing still works, by design). **Header present but token invalid/expired** → `401` with `"Your session has expired or is invalid. Please sign in again."`. The client already treats a thrown API error as a failed save (surfaces a toast; `AuthContext` clears the token on the next `/me` check), so a stale session now fails loudly instead of silently corrupting the demo bucket. Regression tests added to `tests/test-http.ts`.

### 🟡 SEC-6 — Registration reveals whether an email is already registered — **LOW** — DOCUMENTED

`registerUser` throws `'An account with this email address already exists.'`, allowing account enumeration via the register endpoint. This is a common, deliberate UX trade-off (a user who typo'd needs to know they already have an account) and login itself is correctly non-enumerable. Left as-is; noted for awareness. If you want to close it, switch to an email-verification flow that always responds identically.

### Hardening backlog (informational — conscious trade-offs for a demo app)

| Item | Note |
|------|------|
| **Shared demo workspace is anonymously writable** | By design (`authMiddleware` → demo when unauthenticated; `/api/restaurant/*` use soft auth). Anyone can mutate or `reset-defaults` the demo account. Fine for a personal capstone; would need per-session sandboxing for a public multi-tenant deploy. |
| **No rate limiting** on `/api/auth/login` | bcrypt cost 10 (~50–100 ms/attempt) is partial mitigation; no lockout. Consider `express-rate-limit` on the auth router if exposed publicly. |
| **30-day JWT, no server-side revocation** | Logout is client-only (`localStorage` clear). A leaked token is valid until expiry. Acceptable for the threat model; shorten `expiresIn` or add a token denylist if needed. |
| **JWT stored in `localStorage`** | Standard SPA XSS-exfiltration trade-off. Risk is low here (no XSS sinks — see §2). Moving to an `httpOnly` cookie would add CSRF surface. |
| **No `helmet` / CSP / security headers** | The app runs embedded in an AI Studio iframe, where `X-Frame-Options: DENY` would break it. Add a tailored CSP if deploying standalone. |
| **No server-side schema validation** on `/api/restaurant/*` payloads | Client can store arbitrary JSON — but only within its own scope, so blast radius is self-inflicted data corruption. `express.json({ limit: '10mb' })` bounds size; the whole DB is rewritten on every save (doesn't scale, not a security issue). |
| **Employee `phone` stored in plaintext** | Mild PII, inherent to a staff-scheduling tool. No encryption at rest (the JSON file). Acceptable for the domain; note it if handling real staff data. |

---

## Files changed

| File | Fix |
|------|-----|
| `server/db.ts` | SEC-1 — JWT_SECRET production guard |
| `.env.example` | SEC-1 — document `JWT_SECRET` |
| `src/lib/calendarUtils.ts` | SEC-3 — `csvCell()` formula-injection guard |
| `server/routes/ai.routes.ts` | SEC-4 — generic client error messages |
| `server/middleware/auth.ts` | SEC-5 — invalid token → 401 (not demo downgrade) |
| `tests/test-engine.ts` | SEC-3 regression tests (+2) |
| `tests/test-http.ts` | SEC-5 regression tests (+2) |
