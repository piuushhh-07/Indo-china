BEGIN;

ALTER TABLE item_variants
  ADD COLUMN stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

ALTER TABLE order_items
  ADD COLUMN variant_id UUID REFERENCES item_variants(id) ON DELETE SET NULL,
  ADD COLUMN stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE menu_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  menu_item_id   UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text    VARCHAR(1000) NOT NULL,
  status         VARCHAR(10) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  moderated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  moderated_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, menu_item_id)
);
CREATE INDEX idx_menu_reviews_public ON menu_reviews (menu_item_id, created_at DESC)
  WHERE status = 'approved';
CREATE INDEX idx_menu_reviews_pending ON menu_reviews (created_at)
  WHERE status = 'pending';

COMMIT;
