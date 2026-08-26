const { google } = require('googleapis');
const { calculateQuote } = require('./pricing');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const calendarClient = async () => {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !privateKey || !process.env.CAL_DIRECT_ID) {
    throw new Error('Google Calendarの接続設定が不足しています。');
  }
  const auth = new google.auth.JWT(email, null, privateKey, ['https://www.googleapis.com/auth/calendar']);
  await auth.authorize();
  return google.calendar({ version: 'v3', auth });
};

const isAvailable = async (calendar, checkin, checkout) => {
  const calendarId = process.env.CAL_DIRECT_ID;
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: new Date(`${checkin}T00:00:00+09:00`).toISOString(),
      timeMax: new Date(`${checkout}T00:00:00+09:00`).toISOString(),
      items: [{ id: calendarId }],
    },
  });
  return (response.data.calendars?.[calendarId]?.busy || []).length === 0;
};

const publicQuote = (quote) => ({
  status: quote.status,
  nights: quote.nights,
  accommodationBase: quote.accommodationBase,
  extraGuestFee: quote.extraGuestFee,
  preschoolBeddingFee: quote.preschoolBeddingFee,
  subtotal: quote.subtotal,
  discountRate: quote.discountRate,
  discount: quote.discount,
  total: quote.total,
  totalGuests: quote.totalGuests,
});

module.exports = { json, calendarClient, calculateQuote, isAvailable, publicQuote };
