const reservationsRepo = require('../repositories/reservations.repo');
const settingsRepo = require('../repositories/settings.repo');
const { AppError } = require('../middleware/errorHandler');

const OPENING_HOUR = 11; // 11:00 — adjust to the restaurant's actual hours once confirmed
const CLOSING_HOUR = 23.5; // 23:30 per Google listing

function parseDateStrict(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new AppError('Invalid booking date', 400);
  return d;
}

function timeToHours(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h + m / 60;
}

async function validateAndCreate(payload) {
  const { name, mobile, email, bookingDate, bookingTime, guestCount, occasion, specialRequests, userId } = payload;

  if (!name || !mobile || !bookingDate || !bookingTime || !guestCount) {
    throw new AppError('Name, mobile, date, time and guest count are required', 400);
  }
  if (!/^[0-9]{10}$/.test(mobile.replace(/\D/g, '').slice(-10))) {
    throw new AppError('Please provide a valid 10-digit mobile number', 400);
  }
  if (guestCount < 1 || guestCount > 40) {
    throw new AppError('Guest count must be between 1 and 40. For larger parties, please call the restaurant directly.', 400);
  }

  const date = parseDateStrict(bookingDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) throw new AppError('Booking date cannot be in the past', 400);

  const isToday = date.getTime() === today.getTime();
  const hours = timeToHours(bookingTime);
  if (hours < OPENING_HOUR || hours > CLOSING_HOUR) {
    throw new AppError(`Reservations are only available between ${OPENING_HOUR}:00 and ${Math.floor(CLOSING_HOUR)}:30`, 400);
  }
  if (isToday) {
    const now = new Date();
    const nowHours = now.getHours() + now.getMinutes() / 60;
    if (hours <= nowHours) throw new AppError('That time slot has already passed today', 400);
  }

  const settings = await settingsRepo.getSettings();
  const capacity = settings.reservation_seating_capacity;
  const existingGuests = await reservationsRepo.sumGuestsForSlot(bookingDate, bookingTime);
  if (existingGuests + Number(guestCount) > capacity) {
    throw new AppError('That time slot is fully booked. Please choose a different time.', 409);
  }

  const reservation = await reservationsRepo.create({
    userId, name, mobile, email, bookingDate, bookingTime,
    guestCount: Number(guestCount), occasion, specialRequests
  });
  return reservation;
}

module.exports = { validateAndCreate };
