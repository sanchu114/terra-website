import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { google } = require('googleapis');

const SPREADSHEET_ID = '17YZGWOwfz2XWc5a1_lBin9Ka7L8gUq00_qF9JJJq47Y';
const SHEET_ID = 656328032;
const SHEET_NAME = '日付別カレンダー';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'src/pricing/calendar.json');

const dateFromSerial = (serial) => {
  const date = new Date(Date.UTC(1899, 11, 30) + Number(serial) * 86400000);
  return date.toISOString().slice(0, 10);
};

const normalizeDate = (value) => {
  if (typeof value === 'number') return dateFromSerial(value);
  const match = String(value || '').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
};

const parsePrice = (value) => {
  const number = Number(String(value ?? '').replace(/[円,\s]/g, ''));
  return Number.isInteger(number) && number > 0 ? number : null;
};

const validate = (calendar, { requireFutureDays = true } = {}) => {
  const entries = Object.entries(calendar.rates || {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) throw new Error('料金データが0件です。');
  const keys = entries.map(([date]) => date);
  const seen = new Set();
  for (const [date, row] of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error(`不正な日付です: ${date}`);
    if (seen.has(date)) throw new Error(`日付が重複しています: ${date}`);
    seen.add(date);
    if (!row.season || !row.dayType) throw new Error(`シーズンまたは曜日区分が空欄です: ${date}`);
    if (!Number.isInteger(row.official) || row.official <= 0) throw new Error(`公式料金が不正です: ${date}`);
  }
  for (let index = 1; index < keys.length; index += 1) {
    const previous = new Date(`${keys[index - 1]}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() + 1);
    if (previous.toISOString().slice(0, 10) !== keys[index]) throw new Error(`日付が連続していません: ${keys[index - 1]} → ${keys[index]}`);
  }
  if (calendar._meta.rangeStart !== keys[0] || calendar._meta.rangeEnd !== keys.at(-1) || calendar._meta.rowCount !== keys.length) {
    throw new Error('メタ情報と料金データの範囲・件数が一致しません。');
  }
  if (calendar._meta.spreadsheetId !== SPREADSHEET_ID || Number(calendar._meta.sheetId) !== SHEET_ID) throw new Error('料金表の参照先が不正です。');
  if (requireFutureDays) {
    const today = new Date();
    const jstToday = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    jstToday.setHours(0, 0, 0, 0);
    const minimumEnd = new Date(jstToday);
    minimumEnd.setDate(minimumEnd.getDate() + 179);
    const rangeEnd = new Date(`${calendar._meta.rangeEnd}T00:00:00+09:00`);
    if (rangeEnd < minimumEnd) throw new Error(`将来料金が180日分ありません（最終日: ${calendar._meta.rangeEnd}）。`);
  }
  return entries.length;
};

const buildCalendar = (rows) => {
  const rates = {};
  for (const row of rows) {
    const date = normalizeDate(row[0]);
    if (!date) continue;
    if (rates[date]) throw new Error(`日付が重複しています: ${date}`);
    const official = parsePrice(row[4]);
    rates[date] = {
      season: String(row[2] || '').trim(),
      dayType: String(row[3] || '').trim(),
      official,
      note: String(row[10] || '').trim(),
    };
  }
  const dates = Object.keys(rates).sort();
  const sortedRates = Object.fromEntries(dates.map((date) => [date, rates[date]]));
  return {
    _meta: {
      source: 'Terra 料金テーブル v1.0 / 日付別カレンダー',
      spreadsheetId: SPREADSHEET_ID,
      sheetId: SHEET_ID,
      rangeStart: dates[0],
      rangeEnd: dates.at(-1),
      rowCount: dates.length,
    },
    rates: sortedRates,
  };
};

const diffSummary = (before, after) => {
  const dates = new Set([...Object.keys(before.rates || {}), ...Object.keys(after.rates || {})]);
  const changed = [...dates].filter((date) => JSON.stringify(before.rates?.[date]) !== JSON.stringify(after.rates?.[date])).sort();
  return { count: changed.length, first: changed[0] || 'なし', last: changed.at(-1) || 'なし' };
};

const loadLocal = () => JSON.parse(fs.readFileSync(outputPath, 'utf8'));

const main = async () => {
  const localOnly = process.argv.includes('--local');
  if (localOnly) {
    const local = loadLocal();
    const count = validate(local);
    console.log(`料金JSON検証OK: ${local._meta.rangeStart}〜${local._meta.rangeEnd} / ${count}日`);
    return;
  }

  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('GOOGLE_CLIENT_EMAIL と GOOGLE_PRIVATE_KEY が必要です。');
  const auth = new google.auth.JWT(email, null, key, ['https://www.googleapis.com/auth/spreadsheets.readonly']);
  await auth.authorize();
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!A:K`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const next = buildCalendar(response.data.values || []);
  const count = validate(next);
  const previous = loadLocal();
  const changes = diffSummary(previous, next);

  const checkOnly = process.argv.includes('--check');
  if (checkOnly && changes.count) throw new Error(`料金表とJSONに${changes.count}日の差があります（${changes.first}〜${changes.last}）。`);
  if (!checkOnly) fs.writeFileSync(outputPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`${checkOnly ? '料金同期確認OK' : '料金JSON更新完了'}: ${next._meta.rangeStart}〜${next._meta.rangeEnd} / ${count}日`);
  console.log(`変更日数: ${changes.count} / 最初: ${changes.first} / 最後: ${changes.last}`);
};

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
