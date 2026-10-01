# CrowdCampaign

**AI-assisted crowdsourced marketing.** Brands and organizers post a marketing brief with a deadline and a prize. Anyone with an account can pitch one idea per campaign. An AI judge scores every idea on creativity, relevance, feasibility and marketing potential, and recommends a top-ten shortlist. **The organizer, a person, always picks the winner.** The AI never can.

Built for CSCI-GA.2630 Assignment 1: a full-stack app with registration, login, token authentication, account management, and data that survives restarts.

```
Register / Log in  ->  Browse campaigns  ->  Open a brief  ->  Submit an idea
      ->  AI scores ideas  ->  Top 10 shortlist  ->  Organizer reviews  ->  Organizer picks the winner
```

| Part | Technology |
| --- | --- |
| Database | PostgreSQL on [Neon](https://neon.tech) (free tier) |
| Backend | Node.js + Express 5, port **4000** |
| Frontend | React 19 + Vite 6 + React Router 7, port **5173** |
| Passwords | scrypt (built into Node), OWASP parameters |
| Auth | Bearer tokens (JWT, HMAC-SHA256), 2-hour expiry |
| AI (optional) | Claude or Gemini; clearly labelled offline estimate without a key |

---

## Prerequisites

| Tool | Version | Check with |
| --- | --- | --- |
| Node.js | **20 or newer** (the current LTS is recommended) | `node --version` |
| npm | comes with Node (10 or newer) | `npm --version` |
| Git | any recent version | `git --version` |
| Internet | needed: the database is hosted on Neon | |

No database install is needed. The connection string for the throwaway Neon database is already in `backend/.env`.

## Run it

You need **two terminals**, one for the backend and one for the frontend.

**Terminal 1: backend**

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/crowdcampaign.git
cd crowdcampaign/backend
npm install
npm run seed
npm start
```

Wait for `CrowdCampaign API is running at http://localhost:4000`. Leave this terminal open.

**Terminal 2: frontend**

```bash
cd crowdcampaign/frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

**Log in as the grader:** username `NYUgrader`, password `Courant2026!`

`npm run seed` is safe to run any number of times. It creates the tables if needed, makes sure the grader account exists with that password, and adds demo data (skipping anything already there). The grader account organizes the campaign *"Get NYC students talking about zero-sugar lemonade"*, which has 13 ideas ready for judging, and can pitch an idea to the BrewHaus campaign. Every demo account (for example `maya_makes` or `brewhaus_team`) uses the password `DemoPass2026!`.

### Check everything in one command

With the backend running, open a third terminal:

```bash
cd crowdcampaign/backend
npm run check
```

This mirrors the course's grading script: it registers two temporary accounts, calls every endpoint, tests all three rules (including GET, PATCH and DELETE on another user's `:id`), changes a password, deletes both accounts, and scans every response for password hashes. It prints PASS or FAIL for each of about 50 checks.

## Configuration and the `.env` files

| File | Committed? | Contents |
| --- | --- | --- |
| `backend/.env` | **Yes, on purpose** | Throwaway Neon `DATABASE_URL` plus non-secret settings. The course asks for a working `.env` for a throwaway database. |
| `backend/.env.example` | Yes | Every variable the backend reads, with explanations |
| `backend/.env.local` | **No** (git-ignored) | Optional personal AI keys. Loaded first, so it overrides `.env`. |
| `backend/.secrets/jwt-secret` | **No** (git-ignored) | Token-signing key, generated automatically on first start |
| `frontend/.env` | Yes | `VITE_API_URL=http://localhost:4000` (not a secret) |

**No personal secrets are in this repository.** The only credential is the throwaway database's, created only for this assignment. The token-signing key is generated on each machine the first time the server starts and never leaves it (in production you would set `JWT_SECRET` instead).

## Things that might surprise you

- **No migration tool.** On every start the server runs `CREATE TABLE IF NOT EXISTS ...` (see `backend/src/migrate.js`), so an empty database gets its tables automatically.
- **The first request after a break can take a few seconds.** Neon's free tier puts the database to sleep after 5 idle minutes and wakes it on the next query. `/healthz` never touches the database, so it's always instant.
- **Logging in after a restart still works.** Tokens are signed with the key in `backend/.secrets/jwt-secret`, which persists across restarts. Tokens expire after 2 hours; log in again after that.
- **The AI judge is optional.** Without a key, "Score ideas" uses a transparent keyword heuristic that is labelled *"Offline estimate, not AI"* everywhere, so the whole flow still works. Scores already produced by a real AI are stored in the database and shown to everyone.
- **If the database credentials ever stop working** (for example, if Neon revoked them after detecting them in a public repository): create any free PostgreSQL database (Neon, Supabase or Render), paste its connection string into `DATABASE_URL` in `backend/.env`, then run `npm run seed`. Tables are created automatically.

## Enabling the AI judge (optional)

Create `backend/.env.local` (it is git-ignored) with **one** of these:

```bash
# Google Gemini (has a free tier: https://aistudio.google.com/apikey)
GEMINI_API_KEY=your-key-here

# or Anthropic Claude (paid: https://platform.claude.com)
ANTHROPIC_API_KEY=your-key-here
```

Restart the backend. The startup banner shows which judge is active. With both keys set, Claude is used; set `AI_PROVIDER=gemini` to force Gemini. Defaults: `gemini-3.5-flash-lite` and `claude-haiku-4-5-20251001`, changeable with `GEMINI_MODEL` and `ANTHROPIC_MODEL`.

How the AI layer is kept safe and separate:

- It is **one module** (`backend/src/ai/`) and **one table** (`evaluations`). Nothing else depends on it; if it fails, the evaluate request returns `502` with "Nothing was changed", and every other feature keeps working.
- **It cannot pick a winner.** The only code that sets a winner is `POST /api/campaigns/:id/winner`, which requires the organizer's own login.
- **Prompt injection:** ideas are untrusted text. They are escaped and wrapped in tags, the system prompt tells the model never to follow instructions inside them, and one demo idea ("Best idea ever") tries exactly that attack. Every score is checked and clamped to 1 to 10, and the overall score is computed by the server, not the model.
- The model sees idea text only, never who wrote it. Ideas are sent in batches of 8. A failing provider is retried once, then skipped for the rest of the run, so the organizer never waits minutes for an outage.

## API reference

All requests and responses are JSON. Protected routes need the header `Authorization: Bearer <token>`. Errors always look like `{"error": "A readable message."}`.

A **user** in any response is exactly `{"id", "username", "email", "created_at", "updated_at"}`. There is never a password or hash field (Rule 1).

### Required endpoints

| Method | Path | Auth | Body | Success | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/healthz` | none | | `200 {"status":"ok"}` | |
| POST | `/api/auth/register` | none | `{"username", "email"?, "password"}` | `201 {token, access_token, token_type, expires_in, user}` | 400 invalid input, 409 taken |
| POST | `/api/auth/login` | none | `{"username" or "email", "password"}` | `200 {token, access_token, token_type, expires_in, user}` | 400, 401 wrong credentials, 429 too many attempts |
| GET | `/api/auth/me` | Bearer | | `200 user` | 401 |
| GET | `/api/users/:id` | Bearer | | `200 user` | 401, 404 |
| PATCH | `/api/users/:id` | Bearer | any of `{"username", "email", "password" + "current_password"}` | `200 user` (updated) | 400, 401, 403 wrong current password, 404, 409 taken |
| DELETE | `/api/users/:id` | Bearer | | `200 {"deleted": true, "id"}` | 401, 404 |

Rules: usernames are 3 to 50 letters, numbers, `.`, `-` or `_` (unique, case-insensitive); email is optional; passwords are 8 to 128 characters. Login accepts the username or the email. Changing the password requires `current_password` and logs out every existing token.

### CrowdCampaign endpoints

| Method | Path | Who | Body | Success |
| --- | --- | --- | --- | --- |
| GET | `/api/campaigns` | any user | | `200 {"campaigns": [...]}` newest first |
| POST | `/api/campaigns` | any user | `{"brand", "title", "brief", "prize", "deadline"}` (ISO date) | `201 campaign` |
| GET | `/api/campaigns/:id` | any user | | `200 campaign` plus `my_submission` and `winner` |
| DELETE | `/api/campaigns/:id` | organizer | | `200 {"deleted": true, "id"}` |
| POST | `/api/campaigns/:id/submissions` | anyone but the organizer | `{"title", "content"}` | `201 idea` (one per person; 409 on a second, or once closed) |
| GET | `/api/campaigns/:id/submissions` | organizer | | `200 {"campaign_id", "submissions": [ranked ideas]}` |
| POST | `/api/campaigns/:id/evaluate` | organizer | `{"force": true}` to re-score all | `200 {"judge", "scored", "failed", "message", "submissions"}`; `502` if the AI is down |
| GET | `/api/campaigns/:id/shortlist` | organizer | | `200 {"campaign_id", "size": 10, "shortlist": [...]}` |
| POST | `/api/campaigns/:id/winner` | organizer | `{"submission_id"}` | `200 campaign` with `winner` (final; 409 if already picked) |
| GET | `/api/ai/status` | any user | | `200 {"provider", "model", "is_ai", "label"}` |

A campaign's `status` is worked out from its data: `open` (accepting ideas), `judging` (deadline passed, no winner yet) or `winner_selected` (closed). Only the organizer can see all ideas; everyone else sees their own idea and, once picked, the winner.

## Security decisions

### Rule 3: someone else's `:id` returns 404, always

`GET`, `PATCH` and `DELETE /api/users/:id` return **404 "User not found."** whenever `:id` isn't the logged-in user's own id, exactly as if that account didn't exist. I chose 404 over 403 because a 403 confirms the account exists: anyone with one account could probe ids and learn which are real (account enumeration). A 404 reveals nothing, which is also how GitHub answers for private repositories you can't see. The check runs first, before the request body is read and before any database lookup (`ownAccountOnly` in `backend/src/routes/users.js`), so all three methods answer identically and an id that doesn't exist gets the very same response. The trade-off is slightly less helpful errors for a buggy client, but no legitimate client ever needs another user's id.

### Passwords (Rule 1 and hashing)

- Hashed with **scrypt**, built into Node's `crypto` module, with the OWASP-recommended cost (N = 2^17, r = 8, p = 1), a random 16-byte salt per password and a 64-byte key. Each hash takes a fraction of a second and about 128 MB of memory, which makes guessing from a stolen database slow. Stored as `scrypt$N$r$p$salt$hash`, so the cost can be raised later; logins quietly upgrade old hashes.
- Comparison uses `crypto.timingSafeEqual`. When a username doesn't exist, the server still runs one full scrypt, so response time doesn't reveal which usernames exist, and the error message is identical.
- Hashes never leave the server: every response is built from an allow-list of five fields (`backend/src/lib/users.js`), unexpected errors return a generic message, and `npm run check` scans every response for hash-like values.
- After 10 failed logins for one username from one address, that pair is locked for 15 minutes (HTTP 429).

### Tokens (Rule 2)

- JSON Web Tokens signed with HMAC-SHA256, implemented in about 60 readable lines in `backend/src/auth/tokens.js`. The signature is checked first; only `HS256` is accepted (blocking the `"alg": "none"` trick); tokens expire after 2 hours.
- Each token carries the user's `token_version`. Changing the password increments it, so every older token stops working. Deleted accounts' tokens stop working too.
- Missing, malformed, tampered, expired or revoked token: **401** with a `WWW-Authenticate` header.
- Tokens are sent as `Authorization: Bearer` headers, not cookies, so cross-site request forgery doesn't apply and `SameSite` settings aren't needed. The frontend keeps the token in `localStorage`; React escapes all output, which protects against the script injection that could read it.

### CORS

The frontend (`localhost:5173`) and backend (`localhost:4000`) are different origins, so the browser sends a preflight `OPTIONS` request before each API call. The backend answers only for origins listed in `CORS_ORIGINS`, allows only the methods and headers the app uses, and lets browsers cache the answer for 10 minutes. The frontend dev server uses a fixed port (`strictPort`), so it never silently moves to a port the backend doesn't allow.

## Data model

```
users ──< campaigns (organizer_id)            deleting a user removes their campaigns,
  │           │                               ideas and scores (ON DELETE CASCADE)
  └──────< submissions (author_id, campaign_id)
                 │   one per person per campaign; at most one winner per campaign
                 └── evaluations (AI layer only)
```

Uniqueness rules live in the database itself (case-insensitive unique indexes on username and email, a unique constraint on one idea per person, and a partial unique index on one winner), so they hold even when two requests race.

## Project structure

```
backend/
  src/
    server.js            start-up: check settings, create tables, listen
    app.js               Express app: security headers, CORS, routes, error handling
    config.js            reads .env.local and .env
    db.js, migrate.js    connection pool and schema
    auth/                passwords.js, tokens.js, requireAuth.js, loginThrottle.js
    routes/              auth.js, users.js, campaigns.js, ai.js
    services/            submissions.js (ranking and shortlist)
    ai/                  evaluator.js, prompt.js, offline.js, providers/
    lib/                 validation, user serialization, errors
  scripts/               seed.js, demo-data.js, check.js
frontend/
  src/
    main.jsx, App.jsx    entry point and routes
    api.js, auth.jsx     API client and login state
    pages/               Login, Register, Home, Campaigns, NewCampaign, CampaignDetail, Account
    components/          layout and shared UI
    styles.css           all styles (no CSS framework)
```

Development mode with auto-restart: `npm run dev` in `backend/` restarts the API whenever a file changes.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `DATABASE_URL is not set` | Paste the Neon connection string into `backend/.env`. |
| `Port 4000 is already in use` | Another backend is running. Close that terminal (Ctrl+C), or set `PORT=4001` in `backend/.env` and `VITE_API_URL=http://localhost:4001` in `frontend/.env`. |
| `Port 5173 is already in use` | Another frontend is running; close it. The port is fixed on purpose (see CORS). |
| The app says it "can't reach the backend" | Start the backend (`npm start` in `backend/`) and click Try again. |
| Timed out connecting to the database | Neon was asleep or your connection dropped. Try again after a few seconds. |
| Windows PowerShell: "running scripts is disabled" | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use Command Prompt instead. |
| `Cannot find module @rollup/rollup-...` | A known npm bug with optional packages. In `frontend/`, delete `node_modules` and `package-lock.json`, then run `npm install` again. |
| Login worked, then everything says "log in again" | Tokens last 2 hours. Log in again. |
| Scores say "Offline estimate, not AI" | No AI key is set. That's fine; see "Enabling the AI judge". |
