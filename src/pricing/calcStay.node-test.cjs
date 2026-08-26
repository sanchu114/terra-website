const test = require('node:test');
const assert = require('node:assert/strict');
const { calcStayWithRates } = require('../../netlify/functions/lib/pricing');

const makeRates = (start, days, amount = 10000) => {
  const rates = {};
  const first = new Date(`${start}T00:00:00Z`);
  for (let index = 0; index < days; index += 1) {
    const date = new Date(first.getTime() + index * 86400000).toISOString().slice(0, 10);
    rates[date] = { official: amount, season: 'M', dayType: '平日', note: '' };
  }
  return rates;
};
const rates = makeRates('2026-09-01', 40);

test('1〜2名は日付別基本料金だけを合計する', () => {
  assert.equal(calcStayWithRates(rates, { checkin: '2026-09-01', checkout: '2026-09-03', adults: 2 }).total, 20000);
});
test('3名目以降は1名1泊5,000円を加算する', () => {
  assert.equal(calcStayWithRates(rates, { checkin: '2026-09-01', checkout: '2026-09-03', adults: 3 }).total, 30000);
});
test('未就学児の添い寝は無料', () => {
  assert.equal(calcStayWithRates(rates, { checkin: '2026-09-01', checkout: '2026-09-03', adults: 2, childCoSleeping: 2 }).total, 20000);
});
test('未就学児の寝具は1名1泊2,500円', () => {
  assert.equal(calcStayWithRates(rates, { checkin: '2026-09-01', checkout: '2026-09-04', adults: 2, childWithBedding: 1 }).total, 37500);
});
test('6〜29泊は宿泊総額から15%引き', () => {
  const quote = calcStayWithRates(rates, { checkin: '2026-09-01', checkout: '2026-09-07', adults: 2 });
  assert.equal(quote.discount, 9000);
  assert.equal(quote.total, 51000);
});
test('30泊以上は個別相談', () => {
  assert.equal(calcStayWithRates(rates, { checkin: '2026-09-01', checkout: '2026-10-01', adults: 1 }).status, 'consultation');
});
test('未就学児を含む合計9名は受付しない', () => {
  assert.equal(calcStayWithRates(rates, { checkin: '2026-09-01', checkout: '2026-09-02', adults: 7, childCoSleeping: 2 }).status, 'invalid');
});
test('料金がない日を含む場合は範囲外', () => {
  assert.equal(calcStayWithRates(rates, { checkin: '2026-10-10', checkout: '2026-10-12', adults: 2 }).status, 'out_of_range');
});
