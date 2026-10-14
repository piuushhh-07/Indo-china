-- Indo China Family Restaurant — initial schema
-- Monetary values are stored as INTEGER PAISE (1 rupee = 100 paise) throughout, per spec.
-- Run with: npm run migrate

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ========== ENUM TYPES ==========
CREATE TYPE user_role AS ENUM ('customer', 'staff', 'admin');
CREATE TYPE order_status AS ENUM ('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled');
CREATE TYPE fulfillment_type AS ENUM ('delivery', 'takeaway', 'pickup');
CREATE TYPE payment_method AS ENUM ('cod', 'razorpay');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'rejected', 'cancelled', 'completed');
CREATE TYPE coupon_discount_type AS ENUM ('percentage', 'fixed');

-- ========== USERS & AUTH ==========
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  mobile        VARCHAR(15) NOT NULL UNIQUE,
  email         VARCHAR(255) UNIQUE,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'customer',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_mobile ON users (mobile);

CREATE TABLE addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         VARCHAR(50) DEFAULT 'Home',
  line1         TEXT NOT NULL,
  landmark      TEXT,
  locality      VARCHAR(120),
  city          VARCHAR(120) NOT NULL DEFAULT 'Ambernath',
  pincode       VARCHAR(10),
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_addresses_user ON addresses (user_id);

CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prt_user ON password_reset_tokens (user_id);

-- ========== MENU ==========
CREATE TABLE menu_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(80) NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE menu_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
  name              VARCHAR(160) NOT NULL,
  slug              VARCHAR(180) NOT NULL UNIQUE,
  description       TEXT,
  image_url         TEXT,
  is_vegetarian     BOOLEAN NOT NULL DEFAULT FALSE,
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured       BOOLEAN NOT NULL DEFAULT FALSE,
  base_price_paise  INTEGER CHECK (base_price_paise IS NULL OR base_price_paise >= 0),
  popularity_score  INTEGER NOT NULL DEFAULT 0,
  needs_review      TEXT, -- non-null = flagged for owner before going live (e.g. ambiguous menu price)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_items_category ON menu_items (category_id);
CREATE INDEX idx_menu_items_available ON menu_items (is_available);
CREATE INDEX idx_menu_items_name_trgm ON menu_items USING gin (to_tsvector('english', name));

-- A variant represents a priced option of a dish: veg / paneer-mushroom-babycorn / chicken / prawns / half / full / single etc.
CREATE TABLE item_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_name  VARCHAR(60) NOT NULL, -- e.g. 'Veg', 'Chicken', 'Prawns', 'Half', 'Full', 'Single'
  price_paise   INTEGER NOT NULL CHECK (price_paise >= 0),
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  is_available  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (item_id, variant_name)
);
CREATE INDEX idx_item_variants_item ON item_variants (item_id);

CREATE TABLE addons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name          VARCHAR(120) NOT NULL,
  price_paise   INTEGER NOT NULL CHECK (price_paise >= 0),
  is_available  BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_addons_item ON addons (item_id);

-- ========== COUPONS ==========
CREATE TABLE coupons (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(40) NOT NULL UNIQUE,
  discount_type       coupon_discount_type NOT NULL,
  discount_value      INTEGER NOT NULL CHECK (discount_value > 0), -- percentage points OR paise, per discount_type
  min_cart_paise      INTEGER NOT NULL DEFAULT 0,
  max_discount_paise  INTEGER, -- cap for percentage coupons
  usage_limit         INTEGER, -- NULL = unlimited
  times_used          INTEGER NOT NULL DEFAULT 0,
  starts_at           TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== DELIVERY ZONES & SETTINGS ==========
CREATE TABLE delivery_zones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(120) NOT NULL,
  pinccodes         TEXT[] NOT NULL DEFAULT '{}',
  delivery_fee_paise INTEGER NOT NULL DEFAULT 0,
  min_order_paise   INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE restaurant_settings (
  id                      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton row
  restaurant_name         VARCHAR(160) NOT NULL DEFAULT 'Indo China – Family Restaurant',
  phone                   VARCHAR(20),
  address_line            TEXT,
  google_maps_url         TEXT,
  google_rating           NUMERIC(2,1),
  google_review_count     INTEGER,
  opening_hours           JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "mon": {"open":"11:00","close":"23:30"}, ... }
  tax_percent             NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  default_delivery_fee_paise INTEGER NOT NULL DEFAULT 0,
  default_min_order_paise INTEGER NOT NULL DEFAULT 0,
  pickup_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  cod_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  razorpay_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  reservation_seating_capacity INTEGER NOT NULL DEFAULT 40,
  reservation_slot_minutes INTEGER NOT NULL DEFAULT 90,
  maintenance_mode        BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== ORDERS ==========
CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number        VARCHAR(20) NOT NULL UNIQUE, -- human-friendly e.g. ICR-20261012-0007
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL = guest order
  guest_name          VARCHAR(120),
  guest_mobile        VARCHAR(15),
  guest_email         VARCHAR(255),
  fulfillment_type    fulfillment_type NOT NULL,
  delivery_address    TEXT,
  delivery_landmark   TEXT,
  delivery_locality   VARCHAR(120),
  delivery_instructions TEXT,
  status              order_status NOT NULL DEFAULT 'placed',
  subtotal_paise      INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  discount_paise      INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  delivery_fee_paise  INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_paise >= 0),
  tax_paise           INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  total_paise         INTEGER NOT NULL CHECK (total_paise >= 0),
  coupon_id           UUID REFERENCES coupons(id),
  payment_method      payment_method NOT NULL,
  payment_status      payment_status NOT NULL DEFAULT 'pending',
  idempotency_key     VARCHAR(100) UNIQUE, -- prevents duplicate order creation on client retry
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guest_or_user CHECK (user_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_mobile IS NOT NULL)),
  CONSTRAINT delivery_needs_address CHECK (fulfillment_type <> 'delivery' OR delivery_address IS NOT NULL)
);
CREATE INDEX idx_orders_user ON orders (user_id);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_created ON orders (created_at DESC);
CREATE INDEX idx_orders_guest_mobile ON orders (guest_mobile);

-- Historical snapshot: name/variant/price/qty frozen at order time, independent of later menu edits.
CREATE TABLE order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id      UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name_snapshot VARCHAR(160) NOT NULL,
  variant_name_snapshot VARCHAR(60),
  unit_price_paise  INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  addons_snapshot   JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{name, price_paise}]
  special_instructions TEXT,
  line_total_paise  INTEGER NOT NULL CHECK (line_total_paise >= 0)
);
CREATE INDEX idx_order_items_order ON order_items (order_id);

CREATE TABLE order_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      order_status NOT NULL,
  changed_by  UUID REFERENCES users(id),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_osh_order ON order_status_history (order_id);

CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method              payment_method NOT NULL,
  status              payment_status NOT NULL DEFAULT 'pending',
  amount_paise        INTEGER NOT NULL CHECK (amount_paise >= 0),
  razorpay_order_id   VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  razorpay_signature  TEXT,
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order ON payments (order_id);
CREATE UNIQUE INDEX idx_payments_razorpay_order ON payments (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;

-- ========== RESERVATIONS ==========
CREATE TABLE reservations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_code    VARCHAR(20) NOT NULL UNIQUE, -- e.g. RSV-20261012-0003
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  name                VARCHAR(120) NOT NULL,
  mobile              VARCHAR(15) NOT NULL,
  email               VARCHAR(255),
  booking_date        DATE NOT NULL,
  booking_time        TIME NOT NULL,
  guest_count         INTEGER NOT NULL CHECK (guest_count > 0),
  occasion            VARCHAR(80),
  special_requests    TEXT,
  status              reservation_status NOT NULL DEFAULT 'pending',
  internal_notes       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservations_date ON reservations (booking_date, booking_time);
CREATE INDEX idx_reservations_status ON reservations (status);
CREATE INDEX idx_reservations_mobile ON reservations (mobile);

-- ========== AUDIT LOG ==========
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id),
  action      VARCHAR(120) NOT NULL, -- e.g. 'order.status_changed', 'menu_item.updated'
  entity_type VARCHAR(60) NOT NULL,
  entity_id   UUID,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id);

COMMIT;
