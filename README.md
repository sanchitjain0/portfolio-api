# portfolio-api

The backend for my [portfolio](https://github.com/sanchitjain0/sanchit-portfolio), plus a small admin dashboard I use to check what comes in.

It's a Fastify + TypeScript service with MongoDB (Atlas free tier). The dashboard is a React app that gets built into the server and served at `/admin`, so the whole thing is one Render service.

## What it does

The portfolio sends a few kinds of things here, and they all end up in Mongo:

- contact form messages
- questions people type into the "ask my portfolio" chat. Answers come from a small keyword-based knowledge base, not an LLM, so there's no API bill.
- guestbook notes. They stay hidden until I approve them.
- likes on projects (one per visitor)
- basic analytics: page and section views, resume downloads, devices, referrers. No cookies, IPs are hashed, and Do Not Track is respected.
- the "send a test order" demo from the architecture section

From the dashboard I can:

- read and reply to messages
- see which chat questions had no answer and add one
- approve guestbook notes
- change the availability badge and banner on the site without redeploying
- export everything as JSON
- see a log of admin logins

## Security

I didn't want this to be an open door, so:

- There's one admin account. The password is only stored as a bcrypt hash in an env var. Login gives an 8 hour session cookie (HttpOnly, Secure, SameSite=Strict), and write requests also need an `X-Requested-With` header.
- Login is limited to 5 tries per 15 minutes per IP, and every attempt goes into the audit log.
- Every route has its own rate limit (contact form 5/hour, guestbook 3/hour, chat 20/min, ...) and there are daily caps on top.
- Request bodies are validated with strict Zod schemas. Unknown fields get rejected and values have to be plain strings or numbers, so Mongo operators can't sneak in. Bodies are capped at 16 KB.
- CORS only allows the portfolio's domain. Admin routes don't send CORS headers at all.
- Helmet sets the usual headers (CSP, HSTS and so on).
- Only Render's proxy hop is trusted for the client IP, so faking `X-Forwarded-For` doesn't get around the limits.
- Logs and analytics expire on their own (TTL indexes).

## Running locally

```bash
npm install
npm run dev:memory
```

That starts an in-memory MongoDB and the API on port 8080. Open http://localhost:8080/admin and log in with `admin` / `admin-password-123`. Nothing is saved when you stop it.

To use a real database, copy `.env.example` to `.env`, fill it in and run `npm run dev`. For working on the dashboard with hot reload, run `npm run dev:dashboard` (port 5174) at the same time.

Tests run against an in-memory Mongo too:

```bash
npm test
```

## Deploying (all free)

1. **MongoDB Atlas.** Create an M0 cluster. Add a database user with `readWrite` on the `portfolio` database only and a long password. Allow network access from `0.0.0.0/0`, since Render's free plan has no fixed IP. Copy the connection string and put `portfolio` in the path:

   ```
   mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/portfolio?retryWrites=true&w=majority
   ```

2. **Admin password.** Generate the hash and keep the output:

   ```bash
   npm run hash-password -- 'some long password'
   ```

3. **Render.** New → Blueprint → pick this repo. It reads `render.yaml` and asks for:
   - `MONGODB_URI`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD_HASH`
   - `CORS_ORIGINS` (`https://sanchit-portfolio-chi.vercel.app`)

   `JWT_SECRET` and `IP_HASH_SALT` are generated for you.

4. **Vercel.** On the portfolio project, set `VITE_API_BASE_URL` to `https://<service>.onrender.com/v1` and redeploy. The dot in the site's footer turns green when it's connected.

Health check: `GET /v1/health`.

A few things to know about the free tiers:

- Render puts the service to sleep after 15 minutes without traffic, and waking it takes 30–60 seconds. The portfolio pings `/health` when the page opens, and the contact form waits instead of failing. If that bothers you, an UptimeRobot check every 10 minutes keeps it awake, and it still fits in the 750 free hours.
- Atlas M0 has no automatic backups. That's what the export button is for.
- The default knowledge base is only seeded when the collection is empty. After the first start, edit answers from the dashboard.

## Layout

```
server/
  src/app.ts             Fastify setup, security plugins, error handling, serves the dashboard
  src/routes/public.ts   endpoints the portfolio calls
  src/routes/auth.ts     login / logout / session check
  src/routes/admin.ts    everything the dashboard uses
  src/models.ts          Mongoose models
  src/lib/knowledge.ts   chat answers + keyword matching
  test/api.test.ts       end-to-end tests
dashboard/               React admin app
render.yaml              Render blueprint
```

The API contract the frontend expects is in the portfolio repo under `docs/API.md`.
