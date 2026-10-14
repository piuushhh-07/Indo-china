const menuRepo = require('../repositories/menu.repo');
const asyncHandler = require('../utils/asyncHandler');

const getCategories = asyncHandler(async (req, res) => {
  const categories = await menuRepo.listCategories();
  res.json({ categories });
});

const getItems = asyncHandler(async (req, res) => {
  const { category, search, veg, sort } = req.query;
  const items = await menuRepo.listItems({
    categorySlug: category || undefined,
    search: search || undefined,
    vegOnly: veg === 'true',
    sort: sort || undefined
  });
  res.json({ items });
});

const getItem = asyncHandler(async (req, res) => {
  const item = await menuRepo.getItemById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Dish not found' });
  res.json({ item });
});

module.exports = { getCategories, getItems, getItem };
