const { query } = require('../config/db');

async function listCategories() {
  const { rows } = await query(
    'SELECT id, slug, name, sort_order FROM menu_categories WHERE is_active = true ORDER BY sort_order'
  );
  return rows;
}

// Returns items with their variants and addons nested, optionally filtered/sorted.
// All filters are applied server-side with parameterized queries — never string-concatenated.
async function listItems({ categorySlug, search, vegOnly, sort, includeUnavailable = false } = {}) {
  const clauses = ['mc.is_active = true'];
  if (!includeUnavailable) clauses.push('mi.is_available = true');
  const params = [];

  if (categorySlug) {
    params.push(categorySlug);
    clauses.push(`mc.slug = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`mi.name ILIKE $${params.length}`);
  }
  if (vegOnly) {
    clauses.push('mi.is_vegetarian = true');
  }

  let orderBy = 'mi.popularity_score DESC, mi.name ASC';
  if (sort === 'price_asc') orderBy = 'min_price ASC NULLS LAST';
  if (sort === 'price_desc') orderBy = 'min_price DESC NULLS LAST';
  if (sort === 'name') orderBy = 'mi.name ASC';

  const sql = `
    SELECT
      mi.id, mi.name, mi.slug, mi.description, mi.image_url, mi.is_vegetarian,
      mi.is_available, mi.is_featured, mi.base_price_paise, mi.popularity_score,
      mc.slug AS category_slug, mc.name AS category_name,
      (SELECT MIN(price_paise) FROM item_variants iv
       WHERE iv.item_id = mi.id AND iv.is_available = true
         AND (iv.stock_quantity IS NULL OR iv.stock_quantity > 0)) AS min_price,
      (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM menu_reviews r
       WHERE r.menu_item_id = mi.id AND r.status = 'approved') AS average_rating,
      (SELECT COUNT(*)::integer FROM menu_reviews r
       WHERE r.menu_item_id = mi.id AND r.status = 'approved') AS review_count,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', iv.id, 'name', iv.variant_name, 'price_paise', iv.price_paise,
          'is_default', iv.is_default,
          'is_available', (iv.is_available AND (iv.stock_quantity IS NULL OR iv.stock_quantity > 0)),
          'stock_quantity', iv.stock_quantity
        ) ORDER BY iv.sort_order)
        FROM item_variants iv WHERE iv.item_id = mi.id
      ), '[]') AS variants,
      COALESCE((
        SELECT json_agg(json_build_object('id', a.id, 'name', a.name, 'price_paise', a.price_paise))
        FROM addons a WHERE a.item_id = mi.id AND a.is_available = true
      ), '[]') AS addons
    FROM menu_items mi
    JOIN menu_categories mc ON mc.id = mi.category_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY ${orderBy}
  `;
  const { rows } = await query(sql, params);
  return rows;
}

async function getItemById(id) {
  const { rows } = await query(
    `SELECT mi.*, mc.slug AS category_slug, mc.name AS category_name
     FROM menu_items mi JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE mi.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const { rows: variants } = await query(
    'SELECT id, variant_name AS name, price_paise, is_default, is_available, stock_quantity FROM item_variants WHERE item_id = $1 ORDER BY sort_order',
    [id]
  );
  const { rows: addons } = await query(
    'SELECT id, name, price_paise FROM addons WHERE item_id = $1 AND is_available = true',
    [id]
  );
  const { rows: ratingRows } = await query(
    `SELECT ROUND(AVG(rating)::numeric, 1) AS average_rating, COUNT(*)::integer AS review_count
     FROM menu_reviews WHERE menu_item_id = $1 AND status = 'approved'`,
    [id]
  );
  return { ...rows[0], variants, addons, ...ratingRows[0] };
}

async function getVariant(variantId) {
  const { rows } = await query(
    `SELECT iv.*, mi.name AS item_name, mi.is_available AS item_is_available
     FROM item_variants iv JOIN menu_items mi ON mi.id = iv.item_id
     WHERE iv.id = $1`,
    [variantId]
  );
  return rows[0] || null;
}

async function getAddonsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const { rows } = await query('SELECT id, name, price_paise FROM addons WHERE id = ANY($1::uuid[])', [ids]);
  return rows;
}

module.exports = { listCategories, listItems, getItemById, getVariant, getAddonsByIds };
