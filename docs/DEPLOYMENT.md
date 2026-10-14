# Deployment Guide

This app is a single Node.js process (Express, serving both the API and the static
frontend) plus a PostgreSQL database. That's deployable to almost any Node host —
these steps are written generically; substitute your chosen provider's exact UI.

## 1. Choose a host

Any of these work with zero code changes, since everything reads config from
environment variables:
- A Node-friendly PaaS (e.g. Render, Railway, Fly.io) — simplest, usually bundles
  a managed Postgres add-on.
- A VPS (e.g. a basic Ubuntu droplet) running the app under a process manager
  (`pm2 start src/server.js --name indochina`) behind a reverse proxy (nginx/Caddy)
  for TLS termination.

I did not deploy this for you — I don't have credentials for any hosting account,
and a real deployment needs you to make an account and make billing/ownership
decisions I can't make on your behalf.

## 2. Managed PostgreSQL

Create a Postgres instance on your host (or a dedicated provider like Neon,
Supabase, or your PaaS's own add-on). You'll get a `DATABASE_URL` like:

```
postgres://user:password@host:5432/dbname
```

Set `DATABASE_SSL=true` in production if your provider requires SSL (most do) —
the app passes `{ rejectUnauthorized: false }` in that case, which is the common
setting for managed Postgres providers that use provider-issued certificates.

For local development, run `docker compose up -d db` from the `backend` directory;
the bundled `compose.yaml` starts PostgreSQL 16 on `127.0.0.1:5432` with a
persistent Docker volume. Use the local-only `.env.example` credentials (never
reuse them in production), then run `npm run db:check`, `npm run migrate`, and
`npm run seed`. To stop the service without deleting data, run
`docker compose down`. Do not use `docker compose down -v` unless you intend to
delete the local database volume.

Run migrations and seed once, against the production database:
```bash
DATABASE_URL="postgres://..." npm run migrate
DATABASE_URL="postgres://..." npm run seed
```

## 3. Environment variables

Copy `.env.example` to `.env` (or set these directly in your host's dashboard):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | From step 2 |
| `DATABASE_SSL` | In production | `true` for most managed Postgres |
| `SESSION_SECRET` | Yes | Long random string — regenerate for production, don't reuse the dev one |
| `APP_BASE_URL` | Yes | Your real domain, e.g. `https://indochinarestaurant.in` |
| `CORS_ORIGIN` | If frontend is a different origin | Not needed if you keep the single-origin setup (recommended) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | For online payment | See step 5 |
| `RAZORPAY_WEBHOOK_SECRET` | For webhook reliability | See step 5 |

## 4. Domain and HTTPS

Point your domain's DNS at your host, then enable HTTPS — most PaaS providers do
this automatically (Let's Encrypt) once a custom domain is attached. On a bare VPS,
use Caddy (automatic HTTPS) or certbot with nginx.

Once HTTPS is live, `NODE_ENV=production` makes session cookies `secure: true`
(cookie-only-over-HTTPS) automatically — see `src/app.js`.

## 5. Razorpay (test mode first)

1. Create a Razorpay account, switch to **Test Mode**.
2. Dashboard → Settings → API Keys → generate a test Key ID/Secret.
3. Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in your environment, restart the app.
4. In the admin dashboard → Settings, check "Razorpay enabled".
5. Place a test order choosing "Pay online" — Razorpay's test checkout accepts
   card `4111 1111 1111 1111`, any future expiry, any CVV.
6. Dashboard → Settings → Webhooks → add `https://yourdomain.com/api/payments/webhook`,
   subscribe to `payment.captured`, copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.
7. Only switch to **Live Mode** keys once you've verified a full test-mode order
   end to end, including the webhook firing.

I implemented and locally verified the HMAC signature-verification logic (both the
checkout-handler path and the webhook path), but I have no Razorpay account of my
own, so the actual payment flow has not been exercised against Razorpay's servers.
Test it yourself in Test Mode before going live — don't skip step 5.

## 6. Backups

Most managed Postgres providers offer automatic daily backups — turn this on.
For a self-managed VPS: `pg_dump` on a cron schedule, stored somewhere off that
same VPS (e.g. object storage).

## 7. Logging & troubleshooting

- Server logs go to stdout — your host's log viewer (or `pm2 logs`) shows them.
- `GET /api/health/ready` returns 503 if the database is unreachable — point an
  uptime monitor at it.
- 4xx errors are logged at `warn`, 5xx at `error`, with the method+path — grep
  your log stream for `ERROR` to find real problems.

## Pre-launch

Run through **[PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md)** before telling
customers this is live.
