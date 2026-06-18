// 料金計算モジュール（案2α：料金テーブルのスナップショットJSONを参照）
//
// calendar.json（料金テーブルv1.0「日付別カレンダー」の写し）だけを正とする。
// 曜日や季節をコードで判定しない。カレンダーを更新したいときは
// calendar.json を作り直すだけでよい（このファイルは触らない）。

import calendar from './calendar.json';
import { calcStayWithRates, getNightRateFromRates } from './calcStay';

const RATES = calendar.rates;
export const RANGE_START = calendar._meta.rangeStart; // 例 "2026-07-01"
export const RANGE_END = calendar._meta.rangeEnd;     // 例 "2027-03-31"

export const calcStay = (opts) => calcStayWithRates(RATES, opts);
export const getNightRate = (dateStr) => getNightRateFromRates(RATES, dateStr);
