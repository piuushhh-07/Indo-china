# Admin Guide (for restaurant staff)

Admin dashboard: `yourdomain.com/admin`. Log in with the mobile number and
password set up via `scripts/create-admin.js` (see README). There's no "forgot
password" flow for admin accounts yet — if you lose access, re-run that script
to reset it.

## Overview tab
Today's order count, pending orders, today's paid revenue, pending reservations,
and the 5 dishes with the highest popularity score. Popularity score currently
only updates when you manually set `is_featured` or via future order-volume
tracking — it isn't yet wired to actual order counts, so treat it as a manual
"feature this dish" signal for now rather than a live bestseller list.

## Menu tab
- Search and filter by category or "flagged only."
- **22 dishes are flagged** from the original menu-photo extraction — their
  price was ambiguous, missing, or (for Murg Musallam) only visible on a
  handwritten sticky note. Each flagged row shows exactly why. Fix the real
  price, then edit the dish via a direct database update or re-run `npm run
  seed` after correcting `backend/seeds/data/menu-data.json` — there's no
  in-dashboard price editor for variants yet (see "Known gaps" below).
- "Mark Unavailable" takes a dish off the public menu immediately.

## Orders tab
- Filter by status or search by order number/mobile.
- Each order shows only the next valid status buttons (e.g. a `placed` order
  can move to `confirmed` or `cancelled`, not straight to `delivered`) — this
  is enforced by the server, not just hidden in the UI.
- Payment method and payment status are shown per order. COD orders stay
  `payment_status: pending` until you reconcile cash collection manually —
  there's no "mark cash collected" button yet (see "Known gaps").

## Reservations tab
- Filter by date or status.
- Pending reservations show Confirm/Reject buttons. Confirming does **not**
  check capacity again at confirm-time — capacity was already checked when the
  guest submitted the request, so an overlapping confirm from two staff members
  at once is the one race condition worth being aware of.

## Settings tab
- **Add the real phone number here** — none was supplied in the original
  project brief, so it launches blank. The footer, contact page, and
  structured data will start showing it as soon as you save it here.
- Confirm or correct the Google Maps link, address, and opening hours.
- Tax percent, delivery fee, and minimum order apply to every new order
  immediately after saving.
- Toggle Razorpay on only after you've completed the Razorpay setup in
  `docs/DEPLOYMENT.md` — turning it on before real API keys are configured
  will make online checkout fail with a clear error (not a fake success).
- Maintenance mode blocks new checkouts entirely, with a message telling
  customers to call instead — use this for planned downtime.

## Known gaps (not built yet)
- In-dashboard editor for a dish's price/variants (currently: edit the seed
  JSON and re-run `npm run seed`, or run SQL directly).
- "Mark COD payment collected" button.
- Image upload for dishes (no photos were supplied — `image_url` is ready in
  the schema, just unused).
- Any SMS/email notifications (reservation confirmed, order status changed) —
  none are wired up; see PRE_LAUNCH_CHECKLIST.md.
