#!/usr/bin/env node
// Seeds ONLY real data: the actual menu extracted from the owner's photographed menu
// (seeds/data/menu-data.json), plus one singleton restaurant_settings row with the
// business facts the owner actually supplied. No fake reviews, customers or orders
// are ever inserted here, per the project's own rules.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

const menuData = require('./data/menu-data.json');

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const VARIANT_LABELS = { veg: 'Veg', pmc: 'Paneer / Mushroom / Baby Corn', chicken: 'Chicken', prawns: 'Prawns', single: 'Regular', half: 'Half', full: 'Full' };
const VARIANT_SORT = { veg: 1, pmc: 2, chicken: 3, prawns: 4, single: 1, half: 1, full: 2 };

async function seedCategories() {
  const map = {};
  for (const cat of menuData.categories) {
    const { rows } = await pool.query(
      `INSERT INTO menu_categories (slug, name, sort_order) VALUES ($1,$2,$3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
       RETURNING id, slug`,
      [cat.slug, cat.name, cat.sort_order]
    );
    map[rows[0].slug] = rows[0].id;
  }
  return map;
}

async function seedItems(categoryMap) {
  let created = 0;
  let flagged = 0;
  const seenSlugs = new Set();

  for (const item of menuData.items) {
    const categoryId = categoryMap[item.category];
    if (!categoryId) {
      console.warn(`Skipping "${item.name}" — unknown category "${item.category}"`);
      continue;
    }
    let slug = slugify(`${item.category}-${item.name}`);
    let suffix = 1;
    while (seenSlugs.has(slug)) { slug = `${slugify(`${item.category}-${item.name}`)}-${++suffix}`; }
    seenSlugs.add(slug);

    const priceEntries = Object.entries(item.prices || {});
    const hasAnyPrice = priceEntries.length > 0;
    const isVeg = item.category.includes('veg') && !item.category.includes('non-veg') || item.name.toLowerCase().startsWith('veg');

    const { rows } = await pool.query(
      `INSERT INTO menu_items (category_id, name, slug, is_vegetarian, is_available, needs_review, popularity_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (slug) DO UPDATE SET needs_review = EXCLUDED.needs_review, is_available = EXCLUDED.is_available
       RETURNING id`,
      [categoryId, item.name, slug, isVeg, hasAnyPrice, item.needs_review || null, 0]
    );
    const itemId = rows[0].id;
    created++;
    if (item.needs_review) flagged++;

    // Clear old variants before re-inserting (safe to re-run this script).
    await pool.query('DELETE FROM item_variants WHERE item_id = $1', [itemId]);
    let sort = 0;
    for (const [key, rupees] of priceEntries) {
      await pool.query(
        `INSERT INTO item_variants (item_id, variant_name, price_paise, is_default, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [itemId, VARIANT_LABELS[key] || key, Math.round(rupees * 100), sort === 0, VARIANT_SORT[key] || sort]
      );
      sort++;
    }
  }
  return { created, flagged };
}

async function seedSettings() {
  // Only the business facts actually supplied in the project brief. Phone number and
  // a confirmed Google Maps place link were NOT supplied — left null/placeholder and
  // flagged in docs/PRE_LAUNCH_CHECKLIST.md, per "never invent a phone number".
  await pool.query(`
    INSERT INTO restaurant_settings (id, restaurant_name, phone, address_line, google_maps_url, google_rating, google_review_count, opening_hours, tax_percent)
    VALUES (
      1, 'Indo China – Family Restaurant', NULL,
      'Shop No. 14, Shivaji Road, Kansai Section, Ambernath, Maharashtra 421501',
      'https://www.google.com/maps/search/?api=1&query=Indo+China+Family+Restaurant+Shivaji+Road+Kansai+Section+Ambernath',
      4.1, 690,
      '{"mon":{"open":"11:00","close":"23:30"},"tue":{"open":"11:00","close":"23:30"},"wed":{"open":"11:00","close":"23:30"},"thu":{"open":"11:00","close":"23:30"},"fri":{"open":"11:00","close":"23:30"},"sat":{"open":"11:00","close":"23:30"},"sun":{"open":"11:00","close":"23:30"}}'::jsonb,
      5.00
    )
    ON CONFLICT (id) DO UPDATE SET
      google_maps_url = EXCLUDED.google_maps_url, google_rating = EXCLUDED.google_rating,
      google_review_count = EXCLUDED.google_review_count;
  `);
}

async function main() {
  const categoryMap = await seedCategories();
  const { created, flagged } = await seedItems(categoryMap);
  await seedSettings();
  console.log(`Seeded ${Object.keys(categoryMap).length} categories, ${created} dishes (${flagged} flagged for owner review).`);
  console.log('NOTE: opening hours (11:00–23:30 daily) are a placeholder from the listed closing time only — confirm full weekly schedule with the owner.');
  console.log('NOTE: phone number was left blank — none was supplied. Add it via the admin Settings page before launch.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
