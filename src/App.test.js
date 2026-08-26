import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App, { openCheckoutPicker } from './App';

test('主要コンテンツと予約導線を描画する', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('暮らすように、泊まる。');
  expect(html).toContain('空室と料金を確認');
  expect(html).toContain('設備・アメニティ');
  expect(html).toContain('個人情報の取り扱い');
  expect(html).toContain('/assets/photos/hero1.jpg');
  expect(html).toContain('/assets/photos/renewal/entrance.jpg');
  expect(html).toContain('/assets/photos/renewal/kitchen-dining.jpg');
  expect(html).toContain('/assets/photos/renewal/engawa.jpg');
  expect(html).toContain('未就学児を含む総定員');
  expect(html).toContain('洗剤・物干し用品あり');
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
