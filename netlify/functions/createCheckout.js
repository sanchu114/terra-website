const crypto = require('crypto');
const { Client, Environment } = require('square');
const { json, calendarClient, calculateQuote, isAvailable } = require('./lib/booking');

const stableKey = (requestId, purpose) => crypto.createHash('sha256').update(`${requestId}:${purpose}`).digest('hex');
const safeText = (value, max = 500) => String(value || '').trim().slice(0, max);

const validateRequest = (data) => {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(data.requestId || '')) return '受付番号が不正です。ページを再読み込みしてください。';
  if (!safeText(data.name, 100) || !/^\S+@\S+\.\S+$/.test(data.email || '')) return 'お名前とメールアドレスをご確認ください。';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.arrivalTime || '')) return '到着予定時刻をご確認ください。';
  if (!['yes', 'maybe', 'no'].includes(data.pantry)) return '食事のご希望を選択してください。';
  if (data.agreed !== true) return '料金・キャンセル規定をご確認ください。';
  return null;
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method Not Allowed' });
  if (process.env.BOOKING_PAUSED === 'true') return json(503, { message: '現在、公式サイトからの予約受付を一時停止しています。' });

  try {
    const data = JSON.parse(event.body || '{}');
    const validationError = validateRequest(data);
    if (validationError) return json(400, { message: validationError });

    const quote = calculateQuote(data);
    if (quote.status !== 'ok') return json(400, { message: 'この条件では自動受付できません。日程と人数をご確認ください。' });

    const calendar = await calendarClient();
    const calendarId = process.env.CAL_DIRECT_ID;
    const duplicate = await calendar.events.list({
      calendarId,
      privateExtendedProperty: [`requestId=${data.requestId}`],
      showDeleted: false,
      maxResults: 1,
    });
    const existing = duplicate.data.items?.[0];
    if (existing) {
      return json(200, { status: 'accepted', requestId: data.requestId, duplicate: true });
    }

    if (!(await isAvailable(calendar, data.checkin, data.checkout))) {
      return json(409, { status: 'unavailable', message: '選択された日程は満室となりました。' });
    }

    const squareToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId = process.env.SQUARE_LOCATION_ID;
    if (!squareToken || !locationId) throw new Error('Squareの接続設定が不足しています。');
    const square = new Client({ accessToken: squareToken, environment: Environment.Production });

    const name = safeText(data.name, 100);
    const email = safeText(data.email, 200);
    const phone = safeText(data.phone, 40).replace(/[^\d+]/g, '');
    const notes = safeText(data.notes, 1200);
    const pantryLabel = { yes: '希望する', maybe: '検討中', no: '希望しない' }[data.pantry];

    const customerResponse = await square.customersApi.createCustomer({
      idempotencyKey: stableKey(data.requestId, 'customer'),
      givenName: name,
      emailAddress: email,
      ...(phone ? { phoneNumber: phone } : {}),
      note: `Terra公式予約 ${data.requestId}`,
    });
    const customerId = customerResponse.result.customer.id;

    const orderResponse = await square.ordersApi.createOrder({
      idempotencyKey: stableKey(data.requestId, 'order'),
      order: {
        locationId,
        customerId,
        referenceId: data.requestId.slice(0, 40),
        lineItems: [{
          name: `Terra宿泊費（${data.checkin}〜${data.checkout}・${quote.nights}泊）`,
          quantity: '1',
          basePriceMoney: { amount: BigInt(quote.total), currency: 'JPY' },
        }],
      },
    });
    const orderId = orderResponse.result.order.id;

    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + 2);
    const dueDateString = dueDate.toISOString().slice(0, 10);
    const invoiceResponse = await square.invoicesApi.createInvoice({
      idempotencyKey: stableKey(data.requestId, 'invoice'),
      invoice: {
        locationId,
        orderId,
        primaryRecipient: { customerId },
        paymentRequests: [{ requestType: 'BALANCE', dueDate: dueDateString, automaticPaymentSource: 'NONE' }],
        deliveryMethod: 'EMAIL',
        title: '【Terra】ご宿泊代金のお支払い',
        description: `宿泊日：${data.checkin}〜${data.checkout}（${quote.nights}泊）\n人数：${quote.totalGuests}名\n\nお支払い完了をもって予約確定です。`,
        acceptedPaymentMethods: { card: true, squareGiftCard: false, bankAccount: false },
      },
    });
    const invoiceId = invoiceResponse.result.invoice.id;

    const guestBreakdown = `大人・小学生 ${quote.adults}名／未就学児（添い寝）${quote.childCoSleeping}名／未就学児（寝具あり）${quote.childWithBedding}名`;
    const eventDescription = [
      '公式サイトからの予約リクエスト（未決済）',
      '',
      `ゲスト：${name}（${email}${phone ? `／${phone}` : ''}）`,
      `人数：${guestBreakdown}`,
      `到着予定：${data.arrivalTime}`,
      `食事：${pantryLabel}`,
      `BBQ：${data.bbq ? '希望' : '希望なし'}`,
      notes ? `その他：${notes}` : '',
      `宿泊総額：¥${quote.total.toLocaleString('ja-JP')}`,
      `Square下書き請求書ID：${invoiceId}`,
      '',
      '空室を最終確認後、Square管理画面から請求書を送信してください。',
    ].filter((line) => line !== '').join('\n');

    await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `[未決済・Direct] ${name}様`,
        description: eventDescription,
        start: { date: data.checkin },
        end: { date: data.checkout },
        colorId: '8',
        extendedProperties: {
          private: {
            requestId: data.requestId,
            invoiceId,
            orderId,
            totalPrice: String(quote.total),
            gaClientId: safeText(data.gaClientId, 100),
          },
        },
      },
    });

    return json(200, { status: 'accepted', requestId: data.requestId });
  } catch (error) {
    console.error('Booking Request Error:', error);
    return json(500, { message: '予約リクエストの処理中にエラーが発生しました。' });
  }
};
