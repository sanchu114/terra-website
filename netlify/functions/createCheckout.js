// 予約停止フラグのチェックはハンドラー内で行います。

const { google } = require('googleapis');
const { Client, Environment } = require('square');
const { v4: uuidv4 } = require('uuid');
const { parseISO, format, differenceInCalendarDays } = require('date-fns');

// 環境変数の読み込み
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
// Netlify環境変数での改行コード対策
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CAL_DIRECT_ID = process.env.CAL_DIRECT_ID;

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

exports.handler = async (event) => {
  if (process.env.BOOKING_PAUSED === "true") {
    return { statusCode: 503, body: JSON.stringify({ message: "現在、公式サイトからの予約受付を一時停止しております。OTAサイトをご利用ください。" }) };
  }

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

    // 3. 空き状況確認 (FreeBusy)
    // 日本時間（JST）の0時基準での検索
    const startJST = new Date(`${checkin}T00:00:00+09:00`).toISOString();
    const endJST = new Date(`${checkout}T00:00:00+09:00`).toISOString();

    const freeBusyResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: startJST,
        timeMax: endJST,
        items: [{ id: CAL_DIRECT_ID }] // 予約ブロック専用のカレンダー（CAL_BLOCK_ID）は廃止
      }
    });

    const calendars = freeBusyResponse.data.calendars;
    const busyDirect = calendars[CAL_DIRECT_ID]?.busy || [];

    if (busyDirect.length > 0) {
      return {
        statusCode: 409, // 409: Conflict (重複)
        body: JSON.stringify({ message: "申し訳ありません。選択された日程は既に埋まっています。" }),
      };
    }

    // 4. Square顧客作成 (または検索)
    const customerRes = await squareClient.customersApi.createCustomer({
      givenName: name,
      emailAddress: email,
      note: "Terra Website Booking (Request)"
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
          basePriceMoney: {
            amount: BigInt(totalPrice),
            currency: 'JPY'
          }
        }]
      },
      idempotencyKey: uuidv4()
    });
    const orderId = orderRes.result.order.id;

    // 6. Square請求書作成（下書き状態で作成し、送信はしない）
    // Square APIの仕様上、下書きでも dueDate (支払い期限) が必須のため、仮で14日後を設定します。
    // （オーナーが手動で画面から送信する際に、必要に応じて日付を変更できます）
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
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
          dueDate: dueDateString, // ★必須項目のエラーを解消するため追加
          automaticPaymentSource: 'NONE',
        }],
        deliveryMethod: 'EMAIL', // 手動送信時にメールで送れるように設定は残す
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

    // ※ ここにあった publishInvoice（自動送信処理）を削除し、無断でお客様へメールが飛ばないように修正。
    const invoiceId = invoiceRes.result.invoice.id;

    // 7. Googleカレンダーへ仮押さえ（HOLD）の作成
    const eventDescription = `【仮予約リクエスト】オーナー承認待ち\n\nゲスト: ${name} (${email})\n人数: ${guests}名\n合計予定額: ¥${totalPrice.toLocaleString()}\nSquare下書き請求書ID: ${invoiceId}\n\n※OTAと重複がなければSquareで請求書を送信してください。\nお断りする場合はこのカレンダー予定を削除してください。`;

    await calendar.events.insert({
      calendarId: CAL_DIRECT_ID,
      requestBody: {
        summary: `HOLD - ${name}様 (仮予約)`,
        description: eventDescription,
        start: { date: checkin },
        end: { date: checkout },
        colorId: '8', // グレー
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Booking request completed successfully" }),
    };

  } catch (error) {
    console.error("Server Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "予約処理中にエラーが発生しました: " + (error.message || JSON.stringify(error)) }),
    };
  }
};