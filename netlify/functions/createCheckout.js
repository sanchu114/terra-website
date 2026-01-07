const { google } = require('googleapis');
const { Client, Environment } = require('square');
const { v4: uuidv4 } = require('uuid');
const { addMinutes, parseISO, format, differenceInCalendarDays } = require('date-fns');

// 環境変数の読み込み
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
// Netlifyの環境変数での改行コード対策
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CAL_DIRECT_ID = process.env.CAL_DIRECT_ID; // 予約書き込み用
const CAL_BLOCK_ID = process.env.CAL_BLOCK_ID;   // OTA同期用（空き確認のみ）

// Squareクライアント初期化
const squareClient = new Client({
  accessToken: SQUARE_ACCESS_TOKEN,
  environment: Environment.Production, // 本番環境
});

// 料金計算ロジック（サーバー側での厳密な再計算）
const calculatePrice = (checkin, checkout, guests) => {
  const start = new Date(checkin);
  const end = new Date(checkout);
  const nights = differenceInCalendarDays(end, start);

  if (nights < 1) throw new Error("宿泊日数が不正です");
  
  let totalBasePrice = 0;
  for (let i = 0; i < nights; i++) {
    let currentDay = new Date(start);
    currentDay.setDate(start.getDate() + i);
    const dayOfWeek = currentDay.getDay(); // 0:日, 1:月... 5:金, 6:土
    
    // 金(5), 土(6), 日(0) は休前日料金 30,000円、それ以外は 20,000円
    if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
      totalBasePrice += 30000;
    } else {
      totalBasePrice += 20000;
    }
  }

  // 追加人数料金: 5名以降 +5,000円/泊
  const extraGuestPrice = guests > 4 ? (guests - 4) * 5000 * nights : 0;
  
  const totalPrice = totalBasePrice + extraGuestPrice;
  
  return { totalPrice, nights };
};

exports.handler = async (event) => {
  // POSTメソッド以外は拒否
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { checkin, checkout, guests, name, email } = data;

    if (!checkin || !checkout || !guests || !name || !email) {
      return { statusCode: 400, body: JSON.stringify({ message: "入力内容に不備があります。" }) };
    }

    // 1. 料金計算
    const { totalPrice, nights } = calculatePrice(checkin, checkout, guests);

    // 2. 5泊以上の場合はエラー（問い合わせへ誘導）
    if (nights >= 5) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "5泊以上の長期滞在は割引がありますので、お問い合わせフォームからご連絡ください。" }),
      };
    }

    // 3. Googleカレンダー認証
    const jwtClient = new google.auth.JWT(
      GOOGLE_CLIENT_EMAIL,
      null,
      GOOGLE_PRIVATE_KEY,
      ['https://www.googleapis.com/auth/calendar']
    );
    await jwtClient.authorize();
    const calendar = google.calendar({ version: 'v3', auth: jwtClient });

    // 4. 空き状況確認 (FreeBusy)
    const freeBusyRequest = {
      timeMin: new Date(checkin).toISOString(),
      timeMax: new Date(checkout).toISOString(),
      items: [{ id: CAL_DIRECT_ID }, { id: CAL_BLOCK_ID }]
    };
    
    const freeBusyResponse = await calendar.freebusy.query({
      requestBody: freeBusyRequest
    });
    
    const calendars = freeBusyResponse.data.calendars;
    const busyDirect = calendars[CAL_DIRECT_ID]?.busy || [];
    const busyBlock = calendars[CAL_BLOCK_ID]?.busy || [];

    // 忙しい時間帯があれば予約不可
    if (busyDirect.length > 0 || busyBlock.length > 0) {
      return {
        statusCode: 409, // Conflict
        body: JSON.stringify({ message: "申し訳ありません。選択された日程は既に埋まっています。" }),
      };
    }

    // 5. 仮押さえイベント作成 (30分間)
    const holdExpiresAt = addMinutes(new Date(), 30);
    const eventDescription = `【仮予約】\nゲスト: ${name} (${email})\n人数: ${guests}名\n合計: ¥${totalPrice.toLocaleString()}\n有効期限: ${holdExpiresAt.toISOString()}`;
    
    // 終日イベントとして作成（終了日は翌日扱いにするGoogleカレンダーの仕様に合わせる）
    // ※入力されたcheckoutは既に翌日になっているはずだが念のため確認
    
    const eventRes = await calendar.events.insert({
      calendarId: CAL_DIRECT_ID,
      requestBody: {
        summary: `HOLD - ${name}様 (決済待ち)`,
        description: eventDescription,
        start: { date: checkin },
        end: { date: checkout }, 
        colorId: '8', // グレー（仮押さえ）
      },
    });
    
    const eventId = eventRes.data.id;

    // 6. Square Checkout Link作成
    const idempotencyKey = uuidv4();
    const checkoutResponse = await squareClient.checkoutApi.createPaymentLink({
      idempotencyKey,
      order: {
        locationId: SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Terra宿泊費 (${checkin}〜 ${nights}泊 ${guests}名)`,
            quantity: '1',
            basePriceMoney: {
              amount: BigInt(totalPrice),
              currency: 'JPY'
            }
          }
        ],
        metadata: {
            eventId: eventId,
            checkin: checkin,
            checkout: checkout,
            guestName: name,
            guestEmail: email
        }
      },
      checkoutOptions: {
        redirectUrl: "https://terra-shimanami.com/?payment=success", // 決済完了後の戻り先
        askForShippingAddress: false,
      },
      prePopulatedData: {
        buyerEmail: email
      },
      paymentNote: `予約ID: ${eventId}` // 念のためメモにも入れる
    });

    const paymentUrl = checkoutResponse.result.paymentLink.url;

    // イベントの説明に決済URLを追記して更新
    await calendar.events.patch({
      calendarId: CAL_DIRECT_ID,
      eventId: eventId,
      requestBody: {
        description: eventDescription + `\n\n決済URL: ${paymentUrl}`
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ paymentUrl }),
    };

  } catch (error) {
    console.error("Server Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "システムエラーが発生しました。" + error.message }),
    };
  }
};