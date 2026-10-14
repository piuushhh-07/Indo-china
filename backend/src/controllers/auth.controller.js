const bcrypt = require('bcryptjs');
const validator = require('validator');
const usersRepo = require('../repositories/users.repo');
const { AppError } = require('../middleware/errorHandler');
const asyncHandler = require('../utils/asyncHandler');

function toPublicUser(u) {
  return { id: u.id, name: u.name, mobile: u.mobile, email: u.email, role: u.role };
}

function normalizeMobile(mobile) {
  const digits = (mobile || '').replace(/\D/g, '');
  return digits.slice(-10);
}

const register = asyncHandler(async (req, res) => {
  const { name, mobile, email, password } = req.body;
  if (!name || !mobile || !password) throw new AppError('Name, mobile and password are required', 400);
  if (password.length < 8) throw new AppError('Password must be at least 8 characters', 400);

  const cleanMobile = normalizeMobile(mobile);
  if (cleanMobile.length !== 10) throw new AppError('Please provide a valid 10-digit mobile number', 400);
  if (email && !validator.isEmail(email)) throw new AppError('Please provide a valid email address', 400);

  const existing = await usersRepo.findByMobile(cleanMobile);
  if (existing) throw new AppError('An account with this mobile number already exists', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await usersRepo.create({ name: name.trim(), mobile: cleanMobile, email, passwordHash });

  req.session.user = toPublicUser(user);
  res.status(201).json({ user: toPublicUser(user) });
});

const login = asyncHandler(async (req, res) => {
  const { mobile, password } = req.body;
  if (!mobile || !password) throw new AppError('Mobile and password are required', 400);

  const cleanMobile = normalizeMobile(mobile);
  const user = await usersRepo.findByMobile(cleanMobile);
  // Same error for "no such user" and "wrong password" — don't leak which one it was.
  if (!user || !user.is_active) throw new AppError('Invalid mobile number or password', 401);

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new AppError('Invalid mobile number or password', 401);

  req.session.user = toPublicUser(user);
  res.json({ user: toPublicUser(user) });
});

const logout = asyncHandler(async (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(req.app.get('sessionCookieName'));
    res.json({ ok: true });
  });
});

const me = asyncHandler(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user });
});

const listAddresses = asyncHandler(async (req, res) => {
  const addresses = await usersRepo.listAddresses(req.user.id);
  res.json({ addresses });
});

const addAddress = asyncHandler(async (req, res) => {
  if (!req.body.line1) throw new AppError('Address line is required', 400);
  const address = await usersRepo.addAddress(req.user.id, req.body);
  res.status(201).json({ address });
});

module.exports = { register, login, logout, me, listAddresses, addAddress };
