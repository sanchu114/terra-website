const { WebhooksHelper } = require('square');
const { calendarClient } = require('./lib/booking');

const text = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body });

const verifySignature = async ({ body, signature, signatureKey, notificationUrl }) => {
  if (typeof WebhooksHelper?.verifySignature === 'function') {
    return WebhooksHelper.verifySignature({ requestBody: body, signatureHeader: signature, signatureKey, notificationUrl });
  }
  if (typeof WebhooksHelper?.isValidWebhookEventSignature === 'function') {
    return WebhooksHelper.isValidWebhookEventSignature(body, signature, signatureKey, notificationUrl);
  }
  throw new Error('Square Webhook署名検証機能を利用できません。');
};

const sendGaConfirmation = async ({ clientId, value, requestId }) => {
  const measurementId = process.env.GA_MEASUREMENT_ID || 'G-K26L6NB3MK';
  const apiSecret = process.env.GA_MEASUREMENT_PROTOCOL_API_SECRET;
  if (!apiSecret || !clientId) return;
  const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      events: [{ name: 'booking_confirmed', params: { currency: 'JPY', value, transaction_id: requestId } }],
    }),
  });
  if (!response.ok) throw new Error(`GA Measurement Protocol: ${response.status}`);
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return text(405, 'Method Not Allowed');

  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;
  const signature = event.headers['x-square-hmacsha256-signature'] || event.headers['X-Square-Hmacsha256-Signature'];
  if (!signatureKey || !notificationUrl || !signature) {
    console.error('Square webhook verification settings are missing.');
    return text(503, 'Webhook verification is not configured');
  }

  try {
    const valid = await verifySignature({ body: event.body, signature, signatureKey, notificationUrl });
    if (!valid) return text(403, 'Invalid signature');

    const payload = JSON.parse(event.body || '{}');
    if (payload.type !== 'invoice.payment_made') return text(200, 'Ignored');
    const invoice = payload.data?.object?.invoice;
    const invoiceId = invoice?.id;
    if (!invoiceId) return text(400, 'Invoice ID is missing');

    const calendar = await calendarClient();
    const calendarId = process.env.CAL_DIRECT_ID;
    const found = await calendar.events.list({
      calendarId,
      privateExtendedProperty: [`invoiceId=${invoiceId}`],
      showDeleted: false,
      maxResults: 1,
    });
    const bookingEvent = found.data.items?.[0];
    if (!bookingEvent) {
      console.error(`No calendar event for invoice ${invoiceId}`);
      return text(200, 'No matching booking');
    }

    const privateProperties = bookingEvent.extendedProperties?.private || {};
    if (privateProperties.paymentConfirmedAt) return text(200, 'Already confirmed');
    const confirmedAt = new Date().toISOString();
    await calendar.events.patch({
      calendarId,
      eventId: bookingEvent.id,
      requestBody: {
        summary: String(bookingEvent.summary || '').replace(/^\[未決済・Direct\]/, '[確定・Direct]'),
        description: String(bookingEvent.description || '').replace('公式サイトからの予約リクエスト（未決済）', '公式サイト予約（支払い済み・予約確定）'),
        colorId: '10',
        extendedProperties: { private: { ...privateProperties, paymentConfirmedAt: confirmedAt } },
      },
    });

    await sendGaConfirmation({
      clientId: privateProperties.gaClientId,
      value: Number(privateProperties.totalPrice || 0),
      requestId: privateProperties.requestId || invoiceId,
    }).catch((error) => console.error('GA confirmation event failed:', error));
    return text(200, 'Confirmed');
  } catch (error) {
    console.error('Square Webhook Error:', error);
    return text(500, 'Error');
  }
};
