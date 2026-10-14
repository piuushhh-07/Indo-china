# API Reference

Base URL: `/api`. All responses are JSON. Authenticated endpoints use an
httpOnly session cookie (set on login/register) — there is no separate API token.

Errors always look like: `{ "error": "human-readable message" }`, optionally with
a `details` field. Server errors (5xx) never include stack traces or internals.

## Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | `{ name, mobile, email?, password }` → creates a customer account and logs in |
| POST | `/login` | — | `{ mobile, password }` |
| POST | `/logout` | — | Destroys the session |
| GET | `/me` | — | `{ user }` or `{ user: null }` |
| GET | `/addresses` | customer | List saved addresses |
| POST | `/addresses` | customer | `{ line1, landmark?, locality?, city?, pincode?, isDefault? }` |

Login/register are rate-limited (10 attempts / 15 min / IP).

## Menu — `/api/menu` (public)

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | All active categories, in menu order |
| GET | `/items?category=&search=&veg=true&sort=price_asc\|price_desc\|name` | Items with nested variants + add-ons, tracked stock availability, and approved-review rating/count |
| GET | `/items/:id` | Single item detail |
| GET | `/items/:id/reviews` | Up to 50 newest approved customer reviews |

Variants begin with `stock_quantity: null` (unlimited). A zero quantity makes a
variant unavailable for ordering. Tracked stock is reserved atomically at checkout
and returned if an admin/staff member cancels the order.

## Cart — `/api/cart` (public)

| Method | Path | Description |
|---|---|---|
| POST | `/validate` | `{ lines: [{variantId, quantity, addonIds?}], fulfillmentType, deliveryPincode?, couponCode? }` → full server-computed price breakdown. **Never trust a total computed in the browser; always call this (or checkout) to get the real number.** |

## Orders — `/api/orders`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/checkout` | optional | Same cart payload as `/cart/validate`, plus `paymentMethod: 'cod'\|'razorpay'`, `guest: {name, mobile, email?}` (required if not logged in), `idempotencyKey` (recommended — a client-generated string; retries with the same key return the original order instead of creating a duplicate) |
| GET | `/mine` | customer | Order history for the logged-in customer |
| GET | `/:orderNumber?mobile=` | optional | Order lookup. Guests must supply the mobile number used on the order. |

## Payments — `/api/payments`

| Method | Path | Description |
|---|---|---|
| POST | `/verify` | Called by the frontend after the Razorpay checkout widget returns. Verifies the HMAC signature server-side before marking anything paid. |
| POST | `/webhook` | Razorpay server-to-server webhook. Verifies `x-razorpay-signature` against `RAZORPAY_WEBHOOK_SECRET`. Idempotent — safe to receive the same event twice. |

## Reservations — `/api/reservations` (public)

| Method | Path | Description |
|---|---|---|
| POST | `/` | `{ name, mobile, email?, bookingDate, bookingTime, guestCount, occasion?, specialRequests? }`. Validates opening hours, past dates, and remaining seating capacity for that exact date+time before confirming. |
| GET | `/:code` | Look up a reservation by its reference code |

## Contact — `/api/contact` (public)

| Method | Path | Description |
|---|---|---|
| POST | `/` | `{ name, email?, phone?, message }` — at least one of email/phone required. Rate-limited, honeypot-protected. |

## Reviews — `/api/reviews`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/mine` | customer | List your submitted reviews and moderation status |
| POST | `/` | customer | `{ orderId, menuItemId, rating, reviewText }` — only items in the customer's completed orders qualify; one review per item, pending admin approval |

## Settings — `/api/settings` (public, read-only subset)

`GET /` → restaurant name, phone, address, maps link, rating, hours, tax rate, which
payment methods are enabled, maintenance mode.

## Admin — `/api/admin` (requires `admin` or `staff` role session)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/overview` | admin/staff | Today's orders, pending orders, today's paid revenue, pending reservations, popular dishes |
| GET | `/menu/items` | admin/staff | All menu items, including unavailable dishes, with variant stock quantities |
| POST | `/menu/items` | admin | Create a dish with its variants |
| PATCH | `/menu/items/:id` | admin/staff | Update name/description/availability/featured |
| DELETE | `/menu/items/:id` | admin | Delete a dish |
| PATCH | `/menu/variants/:variantId/availability` | admin/staff | Toggle one priced variant on/off |
| PATCH | `/menu/variants/:variantId/inventory` | admin/staff | `{ stockQuantity: integer }` to track quantity, or `null` for unlimited |
| GET | `/reviews` | admin | List pending customer reviews |
| PATCH | `/reviews/:id/status` | admin | `{ status: 'approved'\|'rejected' }` — moderate a review |
| GET | `/orders?status=&dateFrom=&dateTo=&search=` | admin/staff | List orders |
| GET | `/orders/:id` | admin/staff | Full order detail |
| PATCH | `/orders/:id/status` | admin/staff | `{ status, note? }` — only valid state transitions are accepted (see below) |
| GET | `/reservations?date=&status=` | admin/staff | List reservations |
| PATCH | `/reservations/:id/status` | admin/staff | `{ status, internalNotes? }` |
| PATCH | `/reservations/:id/reschedule` | admin/staff | `{ bookingDate, bookingTime }` |
| GET | `/settings` | admin/staff | Full settings row |
| PATCH | `/settings` | admin | Update any subset of settings fields |

**Order status transitions** (enforced server-side, illegal jumps are rejected):
`placed → confirmed → preparing → ready|out_for_delivery → delivered → completed`,
with `cancelled` reachable from any non-terminal state.

There is no public endpoint anywhere that creates an `admin` or `staff` user — see
`scripts/create-admin.js` in the README.

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health/live` | Process is up |
| GET | `/api/health/ready` | Process is up **and** can reach the database |
