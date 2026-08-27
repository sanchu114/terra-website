import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App, { openCheckoutPicker } from './App';

test('主要コンテンツと予約導線を描画する', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('暮らすように、泊まる。');
  expect(html).toContain('空室と料金を確認');
  expect(html).toContain('設備・アメニティ');
  expect(html).toContain('お部屋と間取り');
  expect(html).toContain('約144㎡の2階建て。寝室4室、セミダブルベッド2台、敷布団6組です。');
  expect(html).toContain('予約確定までの流れ');
  expect(html).toContain('個人情報の取り扱い');
  expect(html).not.toContain('OFFICIAL BOOKING');
  expect(html).not.toContain('THE HOUSE');
  expect(html).not.toContain('aria-label="施設の主要情報"');
  expect(html).toContain('/assets/photos/hero1.jpg');
  expect(html).toContain('/assets/photos/renewal/entrance.jpg');
  expect(html).toContain('/assets/photos/renewal/kitchen-dining.jpg');
  expect(html).toContain('/assets/photos/renewal/engawa.jpg');
  expect(html).not.toContain('未就学児を含む総定員');
  expect(html).not.toContain('洗剤・物干し用品あり');
  expect(html).not.toContain('選択した日程の空室と、清掃費・サービス料を含む宿泊総額を表示します。');
  expect(html).toContain('しまなみ海道・伯方島の山間にある');
  expect(html).toContain('ラテン語で「大地」');
  expect(html).toContain('大地に還る時間。');
  expect(html).toContain('/assets/photos/niwa.png');
  expect(html).toContain('Terra 空室カレンダー');
  expect(html).toContain('コンビニは車で約7分');
  expect(html).toContain('ハイチェアは事前連絡要');
  expect(html).not.toContain('ベビーベッド');
  expect(html).toContain('PC作業に使えるデスク、ダイニングテーブル');
  expect(html).toContain('電子タバコを含め全面禁煙');
  expect(html).toContain('周辺の買い物');
  expect(html).toContain('虫は出ますか？');
});

test('チェックイン選択後にチェックアウトへ移る', () => {
  const checkout = document.createElement('input');
  checkout.type = 'date';
  checkout.showPicker = jest.fn();
  document.body.appendChild(checkout);

  openCheckoutPicker(checkout, '2026-10-09');

  expect(document.activeElement).toBe(checkout);
  expect(checkout.showPicker).toHaveBeenCalledTimes(1);
  expect(checkout.min).toBe('2026-10-09');

  checkout.remove();
});
