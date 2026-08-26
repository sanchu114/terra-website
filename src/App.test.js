import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from './App';

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
});
