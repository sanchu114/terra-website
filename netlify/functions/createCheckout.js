const { google } = require('googleapis');
const { Client, Environment } = require('square');
const { v4: uuidv4 } = require('uuid');
const { addMinutes, parseISO, format, differenceInCalendarDays, isBefore, subMinutes } = require('date-fns');

// 環境変数の読み込み
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CAL_DIRECT_ID = process.env.CAL_DIRECT_ID; 
const CAL_BLOCK_ID = process.env.CAL_BLOCK_ID;

// Squareクライアント
const squareClient = new Client({
  accessToken: SQUARE_ACCESS_TOKEN,
  environment: Environment.Production, 
});

// 料金計算
const calculatePrice = (checkin, checkout, guests) => {
  const start = new Date(checkin);
  const end = new Date(checkout);
  const nights = differenceInCalendarDays(end, start);
  if (nights < 1) throw new Error("宿泊日数が不正です");
  
  let totalBasePrice = 0;
  for (let i = 0; i < nights; i++) {
    let d = new Date(start);
    d.setDate(start.getDate() + i);
    const day = d.getDay();
    if (day === 5 || day === 6 || day === 0) totalBasePrice += 30000;
    else totalBasePrice += 20000;
  }
  const extraGuestPrice = guests > 4 ? (guests - 4) * 5000 * nights : 0;
  return { totalPrice: totalBasePrice + extraGuestPrice, nights };
};

// カレンダーお掃除機能（期限切れの仮押さえを削除）
const cleanUpExpiredHolds = async (calendar) => {
  try {
    const now = new Date();
    // 過去1時間のイベントを取得してチェック
    const eventsRes = await calendar.events.list({
      calendarId: CAL_DIRECT_ID,
      timeMin: subMinutes(now, 60).toISOString(),
      singleEvents: true,
      q: "HOLD", // タイトルにHOLDが含まれるものを検索
    });

    const events = eventsRes.data.items || [];
    for (const event of events) {
      // 説明文から有効期限を探す
      const match = event.description && event.description.match(/有効期限: (.*)/);
      if (match && match[1]) {
        const expireTime = new Date(match[1]);
        if (isBefore(expireTime, now)) {
          console.log(`Deleting expired hold: ${event.summary}`);
          await calendar.events.delete({
            calendarId: CAL_DIRECT_ID,
            eventId: event.id
          });
        }
      }
    }
  } catch (e) {
    console.error("Cleanup error:", e); // エラーでもメイン処理は止めない
  }
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const data = JSON.parse(event.body);
    const { checkin, checkout, guests, name, email, message } = data;

    // 1. 料金計算
    const { totalPrice, nights } = calculatePrice(checkin, checkout, guests);
    if (nights >= 5) {
      return { statusCode: 400, body: JSON.stringify({ message: "5泊以上の長期滞在はお問い合わせください。" }) };
    }

    // 2. Googleカレンダー認証 & お掃除
    const jwtClient = new google.auth.JWT(GOOGLE_CLIENT_EMAIL, null, GOOGLE_PRIVATE_KEY, ['https://www.googleapis.com/auth/calendar']);
    await jwtClient.authorize();
    const calendar = google.calendar({ version: 'v3', auth: jwtClient });
    
    await cleanUpExpiredHolds(calendar); // 先にお掃除

    // 3. 空き状況確認
    const freeBusyRes = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date(checkin).toISOString(),
        timeMax: new Date(checkout).toISOString(),
        items: [{ id: CAL_DIRECT_ID }, { id: CAL_BLOCK_ID }]
      }
    });
    const busyDirect = freeBusyRes.data.calendars[CAL_DIRECT_ID]?.busy || [];
    const busyBlock = freeBusyRes.data.calendars[CAL_BLOCK_ID]?.busy || [];

    if (busyDirect.length > 0 || busyBlock.length > 0) {
      return { statusCode: 409, body: JSON.stringify({ message: "申し訳ありません。選択された日程は既に埋まっています。" }) };
    }

    // 4. Square顧客作成 (または検索)
    // 簡易的に毎回新規作成とします（厳密な重複チェックは省略）
    const customerRes = await squareClient.customersApi.createCustomer({
      givenName: name,
      emailAddress: email,
      note: "Terra Website Booking"
    });
    const customerId = customerRes.result.customer.id;

    // 5. Square注文作成
    const orderRes = await squareClient.ordersApi.createOrder({
      order: {
        locationId: SQUARE_LOCATION_ID,
        customerId: customerId,
        lineItems: [{
          name: `Terra宿泊費 (${checkin}〜 ${nights}泊 ${guests}名)`,
          quantity: '1',
          basePriceMoney: { amount: BigInt(totalPrice), currency: 'JPY' }
        }]
      },
      idempotencyKey: uuidv4()
    });
    const orderId = orderRes.result.order.id;

    // 6. Square請求書作成 & 送信
    // 期限は翌日の同じ時間まで（24時間）
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateString = dueDate.toISOString().split('T')[0];

    const invoiceRes = await squareClient.invoicesApi.createInvoice({
      invoice: {
        locationId: SQUARE_LOCATION_ID,
        orderId: orderId,
        primaryRecipient: { customerId: customerId },
        paymentRequests: [{
          requestType: 'BALANCE',
          dueDate: dueDateString,
          automaticPaymentSource: 'NONE',
          reminders: [{
            relativeScheduledDays: -1, // 期限1日前にリマインド（即時送信に近い効果）
            message: "ご予約ありがとうございます。お支払いの完了をもって予約確定となります。"
          }]
        }],
        deliveryMethod: 'EMAIL', // メールで送る
        title: '【Terra】ご宿泊代金のお支払い',
        description: `ご予約ありがとうございます。\n宿泊日: ${checkin} 〜 ${checkout} (${nights}泊)\n人数: ${guests}名\n\n本メールの「カードで支払う」ボタンより決済をお願いいたします。\n決済完了後に、当日の入室方法やハウスルールをお送りいたします。`,
        acceptedPaymentMethods: {
          card: true,
          squareGiftCard: false,
          bankAccount: false
        }
      },
      idempotencyKey: uuidv4()
    });
    
    const invoiceId = invoiceRes.result.invoice.id;
    
    // 請求書を「公開（送信）」する
    await squareClient.invoicesApi.publishInvoice(invoiceId, {
      idempotencyKey: uuidv4()
    });

    // 7. Googleカレンダーに仮押さえ作成
    const holdExpiresAt = addMinutes(new Date(), 60); // カレンダー上は余裕を持って
    const description = `【未払い・請求書送信済】\nゲスト: ${name} (${email})\n請求書ID: ${invoiceId}\n\n※支払いが完了するとSquareから通知が来ます。`;
    
    await calendar.events.insert({
      calendarId: CAL_DIRECT_ID,
      requestBody: {
        summary: `HOLD - ${name}様 (請求書送付済)`,
        description: description,
        start: { date: checkin },
        end: { date: checkout },
        colorId: '8' // グレー
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Reserve Success" }),
    };

  } catch (error) {
    console.error("Server Error:", error);
    // エラー内容を返す（デバッグ用）
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "予約処理中にエラーが発生しました: " + error.message }),
    };
  }
};