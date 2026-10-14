const reviewsRepo = require('../repositories/reviews.repo');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorHandler');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const listForItem = asyncHandler(async (req, res) => {
  res.json({ reviews: await reviewsRepo.listApprovedForItem(req.params.id) });
});

const listMine = asyncHandler(async (req, res) => {
  res.json({ reviews: await reviewsRepo.listForUser(req.user.id) });
});

const create = asyncHandler(async (req, res) => {
  const { orderId, menuItemId, rating, reviewText } = req.body || {};
  if (!UUID_PATTERN.test(orderId || '') || !UUID_PATTERN.test(menuItemId || '')) {
    throw new AppError('A valid order and menu item are required', 400);
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AppError('Rating must be a whole number from 1 to 5', 400);
  }
  if (typeof reviewText !== 'string' || reviewText.trim().length < 3 || reviewText.trim().length > 1000) {
    throw new AppError('Review must be between 3 and 1000 characters', 400);
  }

  try {
    const review = await reviewsRepo.createForCompletedPurchase({
      userId: req.user.id,
      itemId: menuItemId,
      orderId,
      rating,
      reviewText: reviewText.trim()
    });
    if (!review) {
      throw new AppError('Reviews are available only for items in your completed orders', 400);
    }
    res.status(201).json({ review });
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('You have already reviewed this item', 409);
    }
    throw error;
  }
});

module.exports = { listForItem, listMine, create };
