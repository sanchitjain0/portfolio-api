# portfolio-api

Backend + admin dashboard for [sanchit-portfolio](https://github.com/sanchitjain0/sanchit-portfolio).

- **API**: Fastify 5 + TypeScript + Zod + Mongoose (MongoDB Atlas).
- **Dashboard**: React + Vite + Tailwind, built into the server and served at **`/admin`** (same origin → simple, secure cookie login).
- **Hosting**: one free Render web service + a free Atlas M0 cluster. No AI/LLM costs: "Ask my portfolio" answers from a knowledge base you edit in the dashboard.

```
Portfolio (Vercel) ──HTTPS──► Render: Fastify ── /v1/*        public API (CORS: portfolio only)
                                             ├─ /v1/admin/*  admin API (cookie session, same-origin)
                                             └─ /admin       React dashboard
                                                   │
                                                   ▼
                                        MongoDB Atlas (free M0)
```

## What it stores and what you can do in the dashboard

| Portfolio feature | Endpoint | Stored in | Dashboard page |
| --- | --- | --- | --- |
| Contact form | `POST /v1/contact` | `contacts` | **Inbox**: read, reply by email, mark replied/archived/spam, private notes, search |
| "Ask my portfolio" chat | `POST /v1/ai/ask` | `chatlogs` (90 days) | **Chat questions**: see unanswered questions → one click to add an answer |
| Knowledge base for the chat | — | `knowledges` | **Knowledge base**: add/edit answers + keywords, see hit counts |
| Guestbook | `GET/POST /v1/guestbook` | `guestbooks` | **Guestbook**: approve / reject (nothing is public until approved) |
| ❤ project reactions | `GET/POST /v1/reactions` | `reactions` | Overview: reactions per project |
| Availability, "currently working on", banner | `GET /v1/public/config` | `siteconfigs` | **Site settings**: changes go live within ~1 minute, no redeploy |
| Anonymous analytics | `POST /v1/events` | `events` (90 days) | Overview: visitors, page views, top sections, devices, referrers, resume downloads |
| Architecture "test order" | `POST /v1/demo/orders` | `demoorders` (30 days) | Overview count |
| TagHawk demo listings | `GET /v1/taghawk/listings` | — (static) | — |
| Admin activity | — | `audits` (180 days) | **Audit log**: logins (incl. failed) and changes |

**Export data** (Overview page) downloads everything as JSON. Atlas M0 has no automatic backups, so export now and then.

## Security

- **Admin login**: single account from env vars, password stored only as a **bcrypt hash**. The session is an 8-hour JWT in an `HttpOnly; Secure; SameSite=Strict` cookie. Writes also require an `X-Requested-With` header (CSRF guard). Admin routes send no CORS headers, so other sites can't call them.
- **Brute force**: 5 login attempts per 15 minutes per IP; every attempt is in the audit log.
- **Rate limits per IP**: global 120/min; contact 5/hour, guestbook 3/hour, chat 20/min, reactions 30/min, events 60/min, demo orders 20/hour. Plus **daily global caps** on contacts/guestbook/events.
- **Validation**: strict Zod schemas on every route (unknown fields rejected, length limits, only primitive values → no NoSQL operator injection), 16 KB body limit, honeypot fields, link/spam detection (spam goes to the Spam tab / rejected).
- **CORS**: only the origins in `CORS_ORIGINS`.
- **Headers**: Helmet (CSP, HSTS, nosniff, frame-ancestors none).
- **Privacy**: IPs are never stored, only salted hashes; analytics use a daily-rotating visitor hash and respect Do Not Track; logs auto-expire (TTL indexes).
- **Real client IP**: only Render's proxy hop is trusted (`TRUST_PROXY_HOPS=1`), so a forged `X-Forwarded-For` can't dodge rate limits.

## Run locally

```bash
npm install
npm run dev:memory          # throwaway in-memory MongoDB, nothing to set up
# → http://localhost:8080/admin   (admin / admin-password-123)
npm test                    # 21 API tests against an in-memory MongoDB
```

Against a real database: copy `.env.example` to `.env`, fill it in, then `npm run dev` (API) and `npm run dev:dashboard` (dashboard with hot reload on :5174, proxied to the API).

## Deploy (free)

### 1. MongoDB Atlas (free M0)
1. [cloud.mongodb.com](https://cloud.mongodb.com) → create a **Free (M0)** cluster (region close to Singapore/Mumbai).
2. **Database Access** → add a user with a long random password, role **readWrite** on database `portfolio` only.
3. **Network Access** → `0.0.0.0/0` (Render's free tier has no fixed IP; the strong user password is the protection).
4. **Connect → Drivers** → copy the URI and put the database name in the path:
   `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/portfolio?retryWrites=true&w=majority`

### 2. Admin password hash
```bash
npm run hash-password -- 'a long password you will remember'
```
Copy the `$2b$12$…` output.

### 3. Render
1. Push this repo to GitHub (keep it **private** if you like; it doesn't matter for the free plan).
2. [render.com](https://render.com) → **New → Blueprint** → select the repo (uses `render.yaml`).
3. Fill in the prompted values:
   - `MONGODB_URI`: from step 1
   - `ADMIN_USERNAME`: e.g. `sanchit`
   - `ADMIN_PASSWORD_HASH`: from step 2
   - `CORS_ORIGINS`: `https://sanchit-portfolio.vercel.app` (your exact Vercel URL; add a custom domain here too later, comma-separated)

   `JWT_SECRET` and `IP_HASH_SALT` are generated automatically.
4. Deploy. Check `https://<service>.onrender.com/v1/health`, then log in at `https://<service>.onrender.com/admin`.

### 4. Connect the portfolio (Vercel)
Vercel → sanchit-portfolio → Settings → Environment Variables:
`VITE_API_BASE_URL = https://<service>.onrender.com/v1` → **Redeploy**. The footer dot turns green ("API online").

## Free-tier notes

- **Render free services sleep after 15 minutes idle**; the first request takes ~30–60 s. The portfolio pings `/health` on page load to wake it, shows mock data until it's up, and the contact form waits (with a "waking up the server" note) instead of failing.
  - Optional: a free [UptimeRobot](https://uptimerobot.com) monitor on `/v1/health` every 10 min keeps it awake. One always-on service uses ~744 of the 750 free hours/month, so don't add a second always-on free service.
- **Atlas M0**: 512 MB, plenty for this. Logs/events expire automatically.
- No paid APIs. Total cost: **$0**.

## Project layout

```
server/
  src/app.ts            Fastify setup: security headers, CORS, rate limits, errors, dashboard hosting
  src/routes/public.ts  endpoints the portfolio calls
  src/routes/auth.ts    login / logout / me
  src/routes/admin.ts   dashboard API (stats, inbox, chats, guestbook, config, knowledge, export, audit)
  src/models.ts         Mongoose schemas (+ TTL indexes)
  src/lib/knowledge.ts  chat knowledge base: defaults + keyword matcher
  test/api.test.ts      end-to-end tests (in-memory MongoDB)
dashboard/              React admin app (built into server/public/admin)
render.yaml             Render blueprint
```
