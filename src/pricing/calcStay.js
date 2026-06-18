// 料金計算の純粋ロジック（データ依存なし・テスト可能）
// rates: { "2026-07-01": { official, minNights, season, dayType, note }, ... }

export const EXTRA_GUEST_FEE = 5000; // 3名目以降 +5,000円/人・泊
export const LONG_STAY_NIGHTS = 5;   // 5泊以上は長期割引相談（個別見積もり）

// "2026-7-4" / Date → "2026-07-04"
export const toKey = (dateLike) => {
  const d = new Date(dateLike);
  if (isNaN(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// 1泊分の公式料金（カレンダーに無い日は null = 範囲外）
export const getNightRateFromRates = (rates, dateLike) => {
  const key = toKey(dateLike);
  if (!key) return null;
  const row = rates[key];
  return row ? row.official : null;
};

// 宿泊期間の合計を計算する。
//   { status: 'ok',           total, nights, minNights, isLongStay }
//   { status: 'out_of_range', nights, isLongStay, firstMissingDate }
//   { status: 'empty',        total:0, nights:0, isLongStay:false }
export const calcStayWithRates = (rates, { checkin, checkout, guests = 1 }) => {
  if (!checkin || !checkout) {
    return { status: 'empty', total: 0, nights: 0, isLongStay: false };
  }
  const start = new Date(checkin);
  const end = new Date(checkout);
  const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (!(nights > 0)) {
    return { status: 'empty', total: 0, nights: 0, isLongStay: false };
  }

  let base = 0;
  let minNights = 1;
  for (let i = 0; i < nights; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = toKey(d);
    const row = key ? rates[key] : null;
    if (!row || row.official == null) {
      return {
        status: 'out_of_range',
        nights,
        isLongStay: nights >= LONG_STAY_NIGHTS,
        firstMissingDate: key,
      };
    }
    base += row.official;
    if (row.minNights > minNights) minNights = row.minNights;
  }

  const extra = guests > 2 ? (guests - 2) * EXTRA_GUEST_FEE * nights : 0;
  return {
    status: 'ok',
    total: base + extra,
    nights,
    minNights,
    isLongStay: nights >= LONG_STAY_NIGHTS,
  };
};
