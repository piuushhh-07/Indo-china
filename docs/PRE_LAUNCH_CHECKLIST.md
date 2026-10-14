# Pre-Launch Checklist

An honest status report, as requested: what's implemented and tested, what needs
credentials only the owner can provide, and what needs real-world verification
before this touches real customers and real money.

## ✅ Implemented and tested (against a real PostgreSQL database, not mocks)

- Full schema: 16 tables, enums, constraints, indexes. Migrations run cleanly
  from scratch via `npm run migrate`.
- 236 menu items extracted from the 7 supplied menu photos, seeded via
  `npm run seed`. Nothing was invented — see "Menu data to confirm" below.
- Server-side price calculation: the browser's total is never trusted. Verified
  with real orders (tax math, quantity validation, unknown-item rejection).
- Coupon engine: percentage/fixed discounts, min-cart threshold, max-discount
  cap, usage limits, expiry — all verified with real coupons against real carts.
- Checkout: guest and logged-in, with idempotency (a repeated click with the
  same key returns the original order instead of creating a duplicate —
  verified).
- Reservations: opening-hours validation, past-date rejection, and seating
  capacity conflict detection — verified by actually overbooking a slot and
  confirming it's rejected.
- Auth: bcrypt password hashing (verified hashes never store plaintext),
  session-based login, role-based admin access (verified a non-admin session
  gets a 403, no session gets a 401).
- Admin order-status transitions: illegal jumps (e.g. `placed → delivered`)
  are rejected server-side — verified.
- Razorpay signature verification (HMAC) and webhook signature verification:
  implemented per Razorpay's documented scheme, unit-correct, but **not**
  exercised against Razorpay's actual servers — see below.
- Automated test suite: 16 tests, `npm test`, all passing, idempotent (safe to
  run repeatedly).
- Security middleware: Helmet CSP, rate limiting on login/contact/reservation/
  checkout, parameterized SQL everywhere, bcrypt, httpOnly+sameSite cookies.

## 🔑 Needs your credentials before it can work

- **Razorpay**: no account was provided to me. The integration code is written
  and the signature-verification logic is tested, but the actual "pay ₹1 and
  see it succeed" flow has never run, because that requires a real (even if
  test-mode) Razorpay account. Follow `docs/DEPLOYMENT.md` step 5.
- **Phone number**: not supplied anywhere in the original brief or the menu
  photos. The site currently shows "Phone number coming soon." Add it in
  Admin → Settings.
- **Hosting + managed Postgres**: I ran and tested everything against a local
  Postgres instance in my own sandbox. You'll need to provision real hosting —
  I have no accounts or billing access to do that for you.
- **Google Maps link**: I built one as a standard Maps *search* link for
  "Indo China Family Restaurant, Shivaji Road, Kansai Section, Ambernath" (a
  real business directory listing confirms this address, including the
  building name "Panvelkar Plaza," which isn't in your original brief — worth
  double-checking). I could not verify this resolves to your *exact* Google
  Business Profile listing (as opposed to a similarly-named nearby place), so
  confirm this link yourself and replace it with your actual Place link in
  Admin → Settings if it's not quite right.
- **SMS/email notifications**: not implemented at all. No provider (Twilio,
  SendGrid, etc.) was specified, so no code was written against one. Customers
  currently get their order number on-screen only — they'd need to use Track
  Order to check status themselves.

## 📋 Menu data to confirm (22 items flagged in the admin Menu tab)

The most important ones:
- **Murg Musallam** — printed menu showed no price, but a handwritten sticky
  note on the physical menu showed "370/700." I used the sticky note price but
  flagged it — please confirm this is current.
- **Lollypop / Lollypop Masala / Malaysian Lollypop** (6pc/8pc) — the menu
  printed two numbers against four pricing columns for these rows; I guessed
  which column they belong to. Confirm before these go live.
- **American & Hong Kong Chopsuey** — the veg price printed *higher* than the
  chicken/prawns price, which is unusual. Possibly a misprint — confirm.
- **"By Kilo" items** (Veg Biryani by Kilo, Chicken/Mutton Biryani by Kilo) —
  no per-kg rate was printed anywhere.
- Several dishes had one or more variant columns blank ("xxx") on the
  physical menu (Cream of Tomato/Palak Soup, Malai Brocoli, Mushroom/Paneer
  Rice chicken+prawns pricing, several more) — these are seeded as
  unavailable rather than guessed, and will stay invisible to customers until
  you add a real price.

Full list with reasons: open the admin Menu tab and check "Flagged only," or
read `backend/seeds/data/menu-data.json` directly (each flagged item has a
`needs_review` note).

## 🧪 Needs real-world verification (I could not test these myself)

- A full Razorpay test-mode payment, start to finish, including the webhook
  actually firing from Razorpay's servers to your deployed URL (can't test a
  webhook without a publicly reachable HTTPS URL, which this sandbox doesn't
  have).
- Delivery zone / pincode behavior with your actual delivery radius — the
  schema and logic support it, but no real delivery zones were supplied, so
  none are seeded. Add them via SQL or a future admin UI for delivery zones
  (not yet built — currently zones can only be inserted directly in the
  `delivery_zones` table).
- Legal pages (privacy policy, terms, delivery/refund/reservation policy) are
  clearly-marked editable placeholders, not reviewed legal advice — have an
  actual lawyer or at least yourself review before relying on them.
- Load/performance testing under real traffic.
- Mobile device testing on actual phones (I verified responsive CSS by eye,
  not on physical devices).
- Browser compatibility testing beyond modern evergreen browsers (the JS uses
  `fetch`, template literals, and CSS custom properties — fine for anything
  from the last ~6 years, but untested on anything older).

## Known UI gaps (listed in docs/ADMIN_GUIDE.md "Known gaps")
In-dashboard price editing, "mark COD collected," dish image upload, and
notification sending are all not built — the groundwork (schema, `image_url`
columns, etc.) is there, but the UI isn't.

## Before you flip this on for real customers
1. Fix the 22 flagged menu items.
2. Add the real phone number.
3. Confirm the Google Maps link.
4. Decide: launch with COD only (works today, zero extra setup) or wait for
   Razorpay test-mode verification.
5. Have the legal pages actually reviewed.
6. Deploy to real hosting + managed Postgres, run `npm run migrate && npm run
   seed`, create the real admin account, and test one full order yourself
   end to end on the live URL before announcing it anywhere.
