const { json, calendarClient, calculateQuote, isAvailable, publicQuote } = require('./lib/booking');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method Not Allowed' });
  if (process.env.BOOKING_PAUSED === 'true') {
    return json(503, { message: '現在、公式サイトからの予約受付を一時停止しています。' });
  }

  try {
    const data = JSON.parse(event.body || '{}');
    const quote = calculateQuote(data);
    if (quote.status === 'empty' || quote.status === 'invalid') {
      return json(400, { status: 'invalid', message: quote.message || '入力内容をご確認ください。' });
    }
    if (quote.status === 'consultation') return json(200, { status: 'consultation', nights: quote.nights });
    if (quote.status === 'out_of_range') return json(200, { status: 'out_of_range', nights: quote.nights });

    const calendar = await calendarClient();
    const available = await isAvailable(calendar, data.checkin, data.checkout);
    if (!available) return json(200, { status: 'unavailable' });
    return json(200, { status: 'available', quote: publicQuote(quote) });
  } catch (error) {
    console.error('Availability Error:', error);
    return json(500, { status: 'error', message: '空室情報を取得できませんでした。' });
  }
};
