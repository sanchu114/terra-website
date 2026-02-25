exports.handler = async function (event, context) {
    // 開発・本番環境用のCORSヘッダー
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        const { promptText } = JSON.parse(event.body);
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("GEMINI_API_KEY is not set in environment variables");
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "AIのAPIキーが設定されていません。管理画面から設定してください。" })
            };
        }

        const systemPrompt = `
      あなたは愛媛県今治市伯方島にある簡易宿所「Terra（テラ）」のAIアシスタントです。
      
      【Terraのコンセプト】
      - 「暮らすように泊まる」静かな大人の隠れ家。
      - 住所：愛媛県今治市伯方町北浦甲1501−3
      - 近くの店：山中商店（徒歩圏内・食材あり）、コンビニ（車5分）、道の駅マリンオアシスはかた（車10分）
      
      【回答のためのカンペ（知識ベース）】
      1. 買い物・食事:
         - 基本は「山中商店」で食材を買って自炊を推奨。
         - 山中商店では、手作りのお弁当や朝食の注文が可能（要予約・別料金）。母の味でボリューム満点。
         - 外食なら「伯方島には夜遅くまでやっている店が少ない」と伝え、ランチなら「さんわ（ラーメン）」「お好み焼き」などを提案。
      2. 観光・リフレッシュ:
         - 「開山公園（桜・展望）」「船折瀬戸（潮流）」など自然スポットを推す。
         - 「ドルフィンファーム」などのメジャーどころも聞かれたら答える。
      3. レシピ提案:
         - 山中商店で買える「豚肉」「キャベツ」「卵」「もやし」などを使った、フライパン一つでできる男飯や、疲れた体に優しいスープなどを提案。
      
      【トーン＆マナー】
      - 落ち着いていて、少し詩的で丁寧なトーン。
      - 「〜です、〜ます」調。
      - 嘘はつかない。分からないことは「管理人にメールで聞いてみてください」と促す。
    `;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ parts: [{ text: promptText }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Google API Error: ${response.status}`);
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error("chatWithAI Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "サーバー側で通信エラーが発生しました。" })
        };
    }
};
