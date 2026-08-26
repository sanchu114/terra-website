const calendarData = require('../../../src/pricing/calendar.json');
const rules = require('../../../src/pricing/rules.json');

const DAY_MS = 24 * 60 * 60 * 1000;
const parseDateKey = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
};
const toKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const calcStayWithRates = (rates, options = {}) => {
  const start = parseDateKey(options.checkin);
  const end = parseDateKey(options.checkout);
  if (!start || !end) return { status: 'invalid', total: 0, nights: 0, message: '日付を正しく入力してください。' };
  const nights = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (nights < 1) return { status: 'invalid', total: 0, nights: 0, message: 'チェックアウトはチェックインの翌日以降を選んでください。' };

  const guests = {
    adults: Number(options.adults ?? options.guests ?? 1),
    childCoSleeping: Number(options.childCoSleeping ?? 0),
    childWithBedding: Number(options.childWithBedding ?? 0),
  };
  const values = Object.values(guests);
  const totalGuests = values.reduce((sum, value) => sum + value, 0);
  if (values.some((value) => !Number.isInteger(value) || value < 0) || guests.adults < 1) return { status: 'invalid', total: 0, nights, message: '人数を正しく入力してください。' };
  if (totalGuests > rules.maxGuests) return { status: 'invalid', total: 0, nights, totalGuests, message: `最大宿泊人数は、未就学児も含めて${rules.maxGuests}人です。` };
  if (nights >= rules.consultationStartNights) return { status: 'consultation', nights, totalGuests, ...guests };

  let accommodationBase = 0;
  for (let index = 0; index < nights; index += 1) {
    const key = toKey(new Date(start.getTime() + index * DAY_MS));
    const official = rates[key]?.official;
    if (!Number.isFinite(official)) return { status: 'out_of_range', nights, firstMissingDate: key, totalGuests, ...guests };
    accommodationBase += official;
  }
  const extraGuestFee = Math.max(0, guests.adults - rules.baseGuests) * rules.extraGuestFeePerNight * nights;
  const preschoolBeddingFee = guests.childWithBedding * rules.preschoolBeddingFeePerNight * nights;
  const subtotal = accommodationBase + extraGuestFee + preschoolBeddingFee;
  const discountRate = nights >= rules.longStayDiscountStartNights && nights <= rules.longStayDiscountEndNights ? rules.longStayDiscountRate : 0;
  const discount = Math.round(subtotal * discountRate);
  return { status: 'ok', nights, accommodationBase, extraGuestFee, preschoolBeddingFee, subtotal, discountRate, discount, total: subtotal - discount, totalGuests, ...guests };
};

const calculateQuote = (options) => calcStayWithRates(calendarData.rates, options);

module.exports = { calculateQuote, calcStayWithRates, rules };
