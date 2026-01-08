const { google } = require('googleapis');
const { Client, Environment } = require('square');
const { v4: uuidv4 } = require('uuid');
const { addMinutes, parseISO, format, differenceInCalendarDays, isBefore, subMinutes } = require('date-fns');

// 環境変数の読み込み
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
// Netlify環境変数での改行コード対策
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CAL_DIRECT_ID = process.env.CAL_DIRECT_ID; 
const CAL_BLOCK_ID = process.env.CAL_BLOCK_ID;

// Squareクライアント初期化
const squareClient = new Client({
  accessToken: SQUARE_ACCESS_TOKEN,
  environment: Environment.Production, 
});

// 料金計算ロジック
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
    // 金(5), 土(6), 日(0) は休前日料金 30,000円、それ以外は 20,000円
    if (day === 5 || day === 6 || day === 0) {
      totalBasePrice += 30000;
    } else {
      totalBasePrice += 20000;
    }
  }

  const extraGuestPrice = guests > 4 ? (guests - 4) * 5000 * nights : 0;
  return { totalPrice: totalBasePrice + extraGuestPrice, nights };
};

// カレンダーお掃除機能（期限切れの未払い仮押さえを削除）
const cleanUpExpiredHolds = async (calendar) => {
  try {
    const now = new Date();
    // 過去24時間以内のイベントを取得してチェック
    const eventsRes = await calendar.events.list({
      calendarId: CAL_DIRECT_ID,
      timeMin: subMinutes(now, 1440).toISOString(), 
      singleEvents: true,
      q: "HOLD", // タイトルにHOLDが含まれるものを検索
    });

    const events = eventsRes.data.items || [];
    for (const event of events) {
      // 説明文から有効期限を探す
      const match = event.description && event.description.match(/有効期限: (.*)/);
      if (match && match[1]) {
        const expireTime = new Date(match[1]);
        // 現在時刻が有効期限を過ぎていたら削除
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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { checkin, checkout, guests, name, email, message } = data;

    if (!checkin || !checkout || !guests || !name || !email) {
      return { statusCode: 400, body: JSON.stringify({ message: "入力内容に不備があります。" }) };
    }

    // 1. 料金計算
    const { totalPrice, nights } = calculatePrice(checkin, checkout, guests);
    if (nights >= 5) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "5泊以上の長期滞在は割引がありますので、お問い合わせフォームからご連絡ください。" }),
      };
    }

    // 2. Googleカレンダー認証
    const jwtClient = new google.auth.JWT(
      GOOGLE_CLIENT_EMAIL,
      null,
      GOOGLE_PRIVATE_KEY,
      ['https://www.googleapis.com/auth/calendar']
    );
    await jwtClient.authorize();
    const calendar = google.calendar({ version: 'v3', auth: jwtClient });

    // 3. お掃除実行（新しい予約を入れる前にゴミを消す）
    await cleanUpExpiredHolds(calendar);

    // 4. 空き状況確認 (FreeBusy)
    const freeBusyResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date(checkin).toISOString(),
        timeMax: new Date(checkout).toISOString(),
        items: [{ id: CAL_DIRECT_ID }, { id: CAL_BLOCK_ID }]
      }
    });
    
    const calendars = freeBusyResponse.data.calendars;
    const busyDirect = calendars[CAL_DIRECT_ID]?.busy || [];
    const busyBlock = calendars[CAL_BLOCK_ID]?.busy || [];

    if (busyDirect.length > 0 || busyBlock.length > 0) {
      return {
        statusCode: 409, 
        body: JSON.stringify({ message: "申し訳ありません。選択された日程は既に埋まっています。" }),
      };
    }

    // 5. Square顧客作成 (または検索)
    const customerRes = await squareClient.customersApi.createCustomer({
      givenName: name,
      emailAddress: email,
      note: "Terra Website Booking"
    });
    const customerId = customerRes.result.customer.id;

    // 6. Square注文作成
    const orderRes = await squareClient.ordersApi.createOrder({
      order: {
        locationId: SQUARE_LOCATION_ID,
        customerId: customerId,
        lineItems: [{
          name: `Terra宿泊費 (${checkin}〜 ${nights}泊 ${guests}名)`,
          quantity: '1',
          basePriceMoney: {
            amount: BigInt(totalPrice),
            currency: 'JPY'
          }
        }]
      },
      idempotencyKey: uuidv4()
    });
    const orderId = orderRes.result.order.id;

    // 7. Square請求書作成
    const dueDate = addMinutes(new Date(), 60); // 1時間後
    const dueDateString = dueDate.toISOString().split('T')[0]; 

    const invoiceRes = await squareClient.invoicesApi.createInvoice({
      invoice: {
        locationId: SQUARE_LOCATION_ID,
        orderId: orderId,
        primaryRecipient: {
          customerId: customerId,
        },
        paymentRequests: [{
          requestType: 'BALANCE',
          dueDate: dueDateString, 
          automaticPaymentSource: 'NONE',
          reminders: [{
            relativeScheduledDays: -1, 
            message: "ご予約ありがとうございます。本メールより決済をお願いいたします。"
          }]
        }],
        deliveryMethod: 'EMAIL', 
        title: '【Terra】ご宿泊代金のお支払い',
        description: `ご予約ありがとうございます。\n宿泊日: ${checkin} 〜 ${checkout} (${nights}泊)\n人数: ${guests}名\n\n本メールの「カードで支払う」ボタンより決済をお願いいたします。\n\n※決済完了をもって予約確定となります。\n※確定後、当日の入室方法やハウスルールを別途メールにてお送りいたします。`,
        acceptedPaymentMethods: {
          card: true,
          squareGiftCard: false,
          bankAccount: false
        }
      },
      idempotencyKey: uuidv4()
    });
    
    // ★修正ポイント：作成された請求書のIDだけでなく、バージョン番号も取得する
    const invoice = invoiceRes.result.invoice;
    const invoiceId = invoice.id;
    const invoiceVersion = invoice.version;
    
    // 請求書を「公開（送信）」する
    // ★修正ポイント：バージョン番号を含めて送信リクエストを送る
    await squareClient.invoicesApi.publishInvoice(invoiceId, {
      version: invoiceVersion, // これがないとエラーになります
      idempotencyKey: uuidv4()
    });

    // 8. Googleカレンダーに仮押さえ作成
    const eventDescription = `【未払い・請求書送信済】\nゲスト: ${name} (${email})\n人数: ${guests}名\n合計: ¥${totalPrice.toLocaleString()}\n有効期限: ${dueDate.toISOString()}\n請求書ID: ${invoiceId}\n\n※支払いが完了するとSquareから通知が来ます。`;
    
    await calendar.events.insert({
      calendarId: CAL_DIRECT_ID,
      requestBody: {
        summary: `HOLD - ${name}様 (請求書送付済)`,
        description: eventDescription,
        start: { date: checkin },
        end: { date: checkout },
        colorId: '8', // グレー
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Invoice sent successfully" }),
    };

  } catch (error) {
    console.error("Server Error:", error);
    // エラーオブジェクトを文字列化して返す
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "予約処理中にエラーが発生しました: " + (error.message || JSON.stringify(error)) }),
    };
  }
};