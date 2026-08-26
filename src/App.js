import React, { useEffect, useMemo, useRef, useState } from 'react';
import { calcStay } from './pricing/pricing';
import { getGaClientId, track } from './analytics';

const PHOTOS = [
  { src: '/assets/photos/renewal/floor-plan.jpeg', alt: 'Terraの1階と2階の間取り図', caption: '1階・2階の間取り' },
  { src: '/assets/photos/renewal/tv-room.jpeg', alt: '座卓とテレビのある1階和室', caption: '1階和室' },
  { src: '/assets/photos/renewal/engawa.jpg', alt: '午後の光が差し込む1階の縁側と籐の座卓', caption: '1階の縁側' },
  { src: '/assets/photos/renewal/kitchen-dining.jpg', alt: '青いタイルのキッチンと丸いダイニングテーブル', caption: 'ダイニングキッチン' },
  { src: '/assets/photos/renewal/bedroom.png', alt: 'セミダブルベッドが2台ある2階ベッドルーム', caption: '2階ベッドルーム' },
  { src: '/assets/photos/renewal/futon-room.jpg', alt: '敷布団を用意した畳敷きの和室', caption: '和室・敷布団' },
  { src: '/assets/photos/renewal/entrance.jpg', alt: 'Terraの玄関', caption: '玄関' },
  { src: '/assets/photos/renewal/bathroom.jpeg', alt: '浴槽と洗い場の全体が見える浴室', caption: '浴室' },
  { src: '/assets/photos/renewal/toilet.jpg', alt: '1階のトイレ', caption: 'トイレ' },
];

const OTA_LINKS = [
  { label: 'Airbnbで確認', href: 'https://www.airbnb.jp/rooms/42695042' },
  { label: 'じゃらんで確認', href: 'https://www.jalan.net/yad389390/' },
];

const emptyGuest = {
  name: '',
  email: '',
  phone: '',
  arrivalTime: '',
  pantry: '',
  bbq: false,
  notes: '',
  agreed: false,
};

const yen = (value) => `${new Intl.NumberFormat('ja-JP').format(value)}円`;
const dateLabel = (value) => {
  if (!value) return '未選択';
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
};
const todayKey = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};

function Gallery({ initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const photo = PHOTOS[index];

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((index + 1) % PHOTOS.length);
      if (event.key === 'ArrowLeft') setIndex((index - 1 + PHOTOS.length) % PHOTOS.length);
    };
    document.body.classList.add('modal-open');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [index, onClose]);

  return (
    <div className="gallery-dialog" role="dialog" aria-modal="true" aria-label="施設写真">
      <div className="gallery-dialog__top">
        <strong>施設写真</strong>
        <button type="button" onClick={onClose}>閉じる</button>
      </div>
      <div className="gallery-dialog__stage">
        <button type="button" className="gallery-nav gallery-nav--prev" onClick={() => setIndex((index - 1 + PHOTOS.length) % PHOTOS.length)} aria-label="前の写真">‹</button>
        <img src={photo.src} alt={photo.alt} />
        <button type="button" className="gallery-nav gallery-nav--next" onClick={() => setIndex((index + 1) % PHOTOS.length)} aria-label="次の写真">›</button>
      </div>
      <div className="gallery-dialog__footer"><span>{photo.caption}</span><span>{index + 1} / {PHOTOS.length}</span></div>
    </div>
  );
}

function QuoteBreakdown({ quote }) {
  return (
    <div className="quote-breakdown">
      <div><span>宿泊日程</span><strong>{quote.nights}泊</strong></div>
      <div><span>宿泊人数</span><strong>{quote.totalGuests}名</strong></div>
      {quote.extraGuestFee > 0 && <div><span>3名目以降の追加料金</span><strong>{yen(quote.extraGuestFee)}</strong></div>}
      {quote.preschoolBeddingFee > 0 && <div><span>未就学児の寝具</span><strong>{yen(quote.preschoolBeddingFee)}</strong></div>}
      {quote.discount > 0 && <div className="quote-discount"><span>連泊割引（15%）</span><strong>−{yen(quote.discount)}</strong></div>}
      <div className="quote-total"><span>宿泊総額（税込）</span><strong>{yen(quote.total)}</strong></div>
      <p>清掃費・サービス料を含みます。</p>
    </div>
  );
}

function Booking() {
  const [search, setSearch] = useState({ checkin: '', checkout: '', adults: 2, childCoSleeping: 0, childWithBedding: 0 });
  const [result, setResult] = useState({ status: 'idle' });
  const [guest, setGuest] = useState(emptyGuest);
  const [galleryViewed, setGalleryViewed] = useState(false);
  const requestId = useRef(null);
  const sectionRef = useRef(null);

  const localQuote = useMemo(() => calcStay(search), [search]);
  const totalGuests = Number(search.adults) + Number(search.childCoSleeping) + Number(search.childWithBedding);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !galleryViewed) {
        track('view_booking');
        setGalleryViewed(true);
      }
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [galleryViewed]);

  const setSearchValue = (event) => {
    const { name, value } = event.target;
    setSearch((current) => ({ ...current, [name]: name.includes('child') || name === 'adults' ? Number(value) : value }));
    setResult({ status: 'idle' });
  };

  const checkAvailability = async (event) => {
    event.preventDefault();
    track('search_availability', { nights: localQuote.nights || 0, guest_count: totalGuests });

    if (localQuote.status === 'invalid' || localQuote.status === 'empty') {
      setResult({ status: 'invalid', message: localQuote.message || '日程を入力してください。' });
      return;
    }
    if (localQuote.status === 'consultation') {
      setResult({ status: 'consultation', quote: localQuote, mode: 'long' });
      return;
    }
    if (localQuote.status === 'out_of_range') {
      track('quote_out_of_range');
      setResult({ status: 'consultation', quote: localQuote, mode: 'unpriced' });
      return;
    }

    setResult({ status: 'checking' });
    try {
      const response = await fetch('/.netlify/functions/checkAvailability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(search),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '空室確認に失敗しました。');
      if (data.status === 'unavailable') {
        track('quote_unavailable');
        setResult({ status: 'unavailable' });
        return;
      }
      if (data.status === 'out_of_range') {
        track('quote_out_of_range');
        setResult({ status: 'consultation', quote: localQuote, mode: 'unpriced' });
        return;
      }
      if (data.status === 'consultation') {
        setResult({ status: 'consultation', quote: localQuote, mode: 'long' });
        return;
      }
      track('quote_available', { nights: localQuote.nights, value: localQuote.total, currency: 'JPY' });
      track('start_booking_request');
      setResult({ status: 'available', quote: data.quote || localQuote });
    } catch (error) {
      track('quote_error');
      setResult({ status: 'error', message: error.message });
    }
  };

  const submitNetlifyForm = async (formName, values) => {
    const body = new URLSearchParams({ 'form-name': formName, ...values });
    await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  };

  const submitBooking = async (event) => {
    event.preventDefault();
    if (!requestId.current) requestId.current = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setResult((current) => ({ ...current, status: 'submitting' }));
    track('submit_booking_request');
    const gaClientId = await getGaClientId();
    const payload = { ...search, ...guest, requestId: requestId.current, gaClientId };

    try {
      const response = await fetch('/.netlify/functions/createCheckout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        track('booking_request_error', { error_category: 'availability_conflict' });
        setResult({ status: 'conflict' });
        return;
      }
      if (!response.ok) throw new Error(data.message || '予約リクエストを送信できませんでした。');

      submitNetlifyForm('booking', {
        requestId: requestId.current,
        name: guest.name,
        email: guest.email,
        phone: guest.phone,
        checkin: search.checkin,
        checkout: search.checkout,
        adults: String(search.adults),
        childCoSleeping: String(search.childCoSleeping),
        childWithBedding: String(search.childWithBedding),
        arrivalTime: guest.arrivalTime,
        pantry: guest.pantry,
        bbq: guest.bbq ? '希望' : '希望なし',
        notes: guest.notes,
      }).catch(() => {});
      track('booking_request_success', { nights: localQuote.nights, value: localQuote.total, currency: 'JPY' });
      setResult({ status: 'success', requestId: requestId.current });
    } catch (error) {
      track('booking_request_error', { error_category: 'technical' });
      setResult({ status: 'request_error', message: error.message, quote: localQuote });
    }
  };

  const submitConsultation = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData.entries());
    setResult((current) => ({ ...current, status: 'consultation_sending' }));
    try {
      await submitNetlifyForm('consultation', values);
      setResult({ status: 'consultation_success' });
    } catch {
      setResult({ status: 'consultation_error', quote: localQuote, mode: localQuote.status === 'consultation' ? 'long' : 'unpriced' });
    }
  };

  return (
    <section id="booking" className="booking-wrap" aria-labelledby="booking-title" ref={sectionRef}>
      <div className="container">
        <div className="booking-heading">
          <p className="eyebrow">OFFICIAL BOOKING</p>
          <h2 id="booking-title">空室と料金を確認</h2>
          <p><span>日程と人数を入力すると、空室と宿泊総額を確認できます。</span><span>空室確認後に、お名前・連絡先をご入力ください。</span></p>
        </div>

        <div className="booking-shell">
          <form className="availability-form" onSubmit={checkAvailability}>
            <div className="booking-fields booking-fields--dates">
              <label>チェックイン<input type="date" name="checkin" min={todayKey()} value={search.checkin} onChange={setSearchValue} required /></label>
              <label>チェックアウト<input type="date" name="checkout" min={search.checkin || todayKey()} value={search.checkout} onChange={setSearchValue} required /></label>
            </div>
            <div className="booking-fields booking-fields--guests">
              <label>大人・小学生<select name="adults" value={search.adults} onChange={setSearchValue}>{[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n}名</option>)}</select></label>
              <label>未就学児・添い寝<select name="childCoSleeping" value={search.childCoSleeping} onChange={setSearchValue}>{[0,1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}名</option>)}</select></label>
              <label>未就学児・寝具あり<select name="childWithBedding" value={search.childWithBedding} onChange={setSearchValue}>{[0,1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}名</option>)}</select></label>
            </div>
            <div className="booking-summary"><span>{localQuote.nights > 0 ? `${localQuote.nights}泊` : '—'}</span><span className={totalGuests > 8 ? 'is-error' : ''}>合計 {totalGuests} / 8名</span></div>
            <button className="button button--primary button--wide" type="submit" disabled={result.status === 'checking'}>{result.status === 'checking' ? '確認しています…' : '空室と料金を確認'}</button>
          </form>

          <div className="booking-result" aria-live="polite">
            {result.status === 'idle' && <p className="booking-placeholder">選択した日程の空室と、清掃費・サービス料を含む宿泊総額を表示します。</p>}
            {result.status === 'invalid' && <div className="notice notice--error"><strong>入力内容をご確認ください</strong><p>{result.message}</p></div>}
            {result.status === 'unavailable' && <div className="notice notice--error"><strong>この日程は満室です</strong><p>別の日程を選んで、もう一度空室をご確認ください。</p><button type="button" className="button button--ghost" onClick={() => setResult({ status: 'idle' })}>別の日程を探す</button></div>}
            {result.status === 'error' && <div className="notice notice--error"><strong>空室情報を取得できませんでした</strong><p>時間をおいて、もう一度お試しください。</p><div className="button-row"><button type="button" className="button button--ghost" onClick={() => setResult({ status: 'idle' })}>もう一度試す</button>{OTA_LINKS.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" onClick={() => track('click_ota', { ota: link.label })}>{link.label}</a>)}</div></div>}
            {(result.status === 'available' || result.status === 'submitting' || result.status === 'request_error') && (
              <div className="request-panel">
                <div className="notice notice--success"><strong>空室があります</strong><p>{dateLabel(search.checkin)}〜{dateLabel(search.checkout)}</p></div>
                <QuoteBreakdown quote={result.quote || localQuote} />
                <form className="request-form" onSubmit={submitBooking}>
                  <h3>予約リクエスト</h3>
                  <p>送信後に空室を最終確認し、24時間以内にお支払い方法をご案内します。</p>
                  <div className="form-grid">
                    <label>お名前<input name="name" autoComplete="name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} required /></label>
                    <label>メールアドレス<input type="email" name="email" autoComplete="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} required /></label>
                    <label>電話番号 <small>任意</small><input type="tel" name="phone" autoComplete="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /></label>
                    <label>到着予定時刻<input type="time" name="arrivalTime" value={guest.arrivalTime} onChange={(e) => setGuest({ ...guest, arrivalTime: e.target.value })} required /></label>
                  </div>
                  <fieldset>
                    <legend>山中商店の食事</legend>
                    <p>予約時点でのご希望をお知らせください。詳細は予約完了後にご案内します。</p>
                    <div className="choice-row">
                      {[['yes','希望する'],['maybe','検討中'],['no','希望しない']].map(([value, label]) => <label key={value}><input type="radio" name="pantry" value={value} checked={guest.pantry === value} onChange={(e) => { setGuest({ ...guest, pantry: e.target.value }); track('pantry_interest', { choice: value }); }} required /><span>{label}</span></label>)}
                    </div>
                  </fieldset>
                  <label className="check-line"><input type="checkbox" checked={guest.bbq} onChange={(e) => setGuest({ ...guest, bbq: e.target.checked })} /><span><strong>BBQグリルセットレンタルを希望（5,000円／回）</strong><small>詳細は「よくあるご質問」からご確認ください。</small></span></label>
                  <label>その他のご希望 <small>任意</small><textarea rows="4" value={guest.notes} onChange={(e) => setGuest({ ...guest, notes: e.target.value })} placeholder="食物アレルギー、ベビーベッド・ハイチェア、小型犬同伴など" /></label>
                  <p className="form-help">小型犬1匹まで事前相談で同伴できます。追加料金はありません。ケージ等はご持参ください。</p>
                  <label className="check-line check-line--terms"><input type="checkbox" checked={guest.agreed} onChange={(e) => setGuest({ ...guest, agreed: e.target.checked })} required /><span><a href="#price">料金・キャンセル規定</a>と<a href="/privacy.html" target="_blank" rel="noopener noreferrer">個人情報の取り扱い</a>を確認しました</span></label>
                  {result.status === 'request_error' && <div className="notice notice--error"><strong>送信できませんでした</strong><p>{result.message} 入力内容は保持されています。時間をおいて再度お試しください。</p></div>}
                  <button className="button button--primary button--wide" type="submit" disabled={result.status === 'submitting'}>{result.status === 'submitting' ? '送信しています…' : '予約リクエストを送信'}</button>
                </form>
              </div>
            )}
            {result.status === 'conflict' && <div className="notice notice--error"><strong>送信前に満室となりました</strong><p>ご入力内容は保持しています。日程だけ変更して、再度空室をご確認ください。</p><button type="button" className="button button--ghost" onClick={() => setResult({ status: 'idle' })}>日程を変更する</button></div>}
            {result.status === 'success' && <div className="notice notice--success success-panel"><strong>予約リクエストを受け付けました</strong><p>まだ予約確定ではありません。<br />24時間以内に、お支払いのご案内をメールでお送りします。<br />お支払い完了をもって予約確定です。</p><p>メールが見当たらない場合は、迷惑メールフォルダもご確認ください。</p><small>受付番号：{result.requestId}</small></div>}
            {(result.status === 'consultation' || result.status === 'consultation_sending' || result.status === 'consultation_error') && (
              <form className="consultation-form" onSubmit={submitConsultation}>
                <h3>{result.mode === 'long' ? '30泊以上の滞在を相談' : 'この日程の料金を確認'}</h3>
                <p>{result.mode === 'long' ? '長期滞在のお見積もりを、24時間以内にメールでご案内します。' : '料金カレンダーの公開範囲外です。料金を確認し、24時間以内にメールでご案内します。'}</p>
                <input type="hidden" name="consultationKind" value={result.mode} />
                <input type="hidden" name="checkin" value={search.checkin} />
                <input type="hidden" name="checkout" value={search.checkout} />
                <input type="hidden" name="adults" value={search.adults} />
                <input type="hidden" name="childCoSleeping" value={search.childCoSleeping} />
                <input type="hidden" name="childWithBedding" value={search.childWithBedding} />
                <div className="consultation-summary"><span>{dateLabel(search.checkin)}〜{dateLabel(search.checkout)}</span><span>{localQuote.nights}泊・{totalGuests}名</span></div>
                <div className="form-grid">
                  <label>お名前<input name="name" required /></label>
                  <label>メールアドレス<input type="email" name="email" required /></label>
                </div>
                <label>ご相談内容 <small>任意</small><textarea name="message" rows="4" /></label>
                {result.status === 'consultation_error' && <div className="notice notice--error"><p>送信できませんでした。時間をおいて再度お試しください。</p></div>}
                <button className="button button--primary button--wide" type="submit" disabled={result.status === 'consultation_sending'}>{result.status === 'consultation_sending' ? '送信しています…' : result.mode === 'long' ? 'この条件で相談する' : 'この条件で見積もりを依頼'}</button>
              </form>
            )}
            {result.status === 'consultation_success' && <div className="notice notice--success success-panel"><strong>ご相談を受け付けました</strong><p>24時間以内にメールでご連絡します。</p></div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);

  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <a className="brand" href="#top" aria-label="Terra -Shimanami- トップ"><img src="/logo.png" alt="Terra -Shimanami-" /></a>
          <nav className="desktop-nav" aria-label="メインナビゲーション"><a href="#rooms">施設</a><a href="#food">食事</a><a href="#price">料金</a><a href="#access">アクセス</a><a className="button button--primary" href="#booking">空室・料金確認</a></nav>
          <button className="menu-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="メニューを開く">{menuOpen ? '閉じる' : 'メニュー'}</button>
        </div>
        {menuOpen && <nav className="mobile-nav"><a href="#rooms" onClick={() => setMenuOpen(false)}>施設</a><a href="#food" onClick={() => setMenuOpen(false)}>食事</a><a href="#price" onClick={() => setMenuOpen(false)}>料金</a><a href="#access" onClick={() => setMenuOpen(false)}>アクセス</a><a href="#booking" onClick={() => setMenuOpen(false)}>空室・料金確認</a></nav>}
      </header>

      <main id="top">
        <section className="hero">
          <img className="hero__image" src="/assets/photos/hero1.jpg" alt="海に架かるしまなみ海道の橋" />
          <div className="hero__shade" />
          <div className="hero__copy"><p>1日1組限定・しまなみ海道 伯方島</p><h1>暮らすように、泊まる。</h1><p>島の家を一棟まるごと。気兼ねなく過ごす、静かな時間。</p><a className="button button--light" href="#booking">空室と料金を確認</a></div>
        </section>

        <div className="facts-strip"><div><strong>1日1組</strong><span>一棟貸し</span></div><div><strong>約144㎡</strong><span>2階建て</span></div><div><strong>最大8名</strong><span>4寝室</span></div><div><strong>伯方島IC</strong><span>車で約10分</span></div></div>

        <Booking />

        <section id="rooms" className="section container" aria-labelledby="rooms-title">
          <div className="section__head"><p className="eyebrow">THE HOUSE</p><h2 id="rooms-title">一棟まるごと、島の家</h2><p>延床約144㎡の2階建て。寝室は4室あり、セミダブルベッド2台と敷布団6組をご用意しています。</p></div>
          <div className="photo-grid">
            <button className="photo-tile photo-tile--main" type="button" onClick={() => setGalleryIndex(0)}><img src={PHOTOS[0].src} alt={PHOTOS[0].alt} /><span>{PHOTOS[0].caption}</span></button>
            {[1,2,3,4].map((index) => <button key={index} className="photo-tile" type="button" onClick={() => setGalleryIndex(index)}><img src={PHOTOS[index].src} alt={PHOTOS[index].alt} /><span>{PHOTOS[index].caption}</span></button>)}
            <button className="gallery-open" type="button" onClick={() => setGalleryIndex(0)}>写真をすべて見る（9枚）</button>
          </div>
          <div className="room-facts"><div><strong>寝室4室</strong><span>1階2室・2階2室</span></div><div><strong>寝具8名分</strong><span>セミダブルベッド2台・敷布団6組</span></div><div><strong>浴室1室</strong><span>浴槽・シャワーあり</span></div><div><strong>トイレ2か所</strong><span>1階・2階に各1か所</span></div></div>
        </section>

        <section className="section container" aria-labelledby="amenity-title"><div className="section__head"><h2 id="amenity-title">設備・アメニティ</h2></div><div className="details-list">
          <details open><summary>キッチン・食事</summary><div><ul><li>2口IH、冷蔵・冷凍庫、電子レンジ、電気ケトル、炊飯器</li><li>基本的な調理器具、食器・カトラリー、食器用洗剤</li></ul></div></details>
          <details><summary>浴室・洗面</summary><div><ul><li>シャンプー、コンディショナー、ボディソープ、洗顔料</li><li>ハンドソープ、ドライヤー、歯ブラシ、カミソリ</li><li>バスタオル・フェイスタオル</li><li>くし・ブラシ、シャワーキャップ、パジャマはありません</li></ul></div></details>
          <details><summary>洗濯・長期滞在</summary><div><ul><li>洗濯機、洗濯洗剤、ハンガー・物干し用品</li><li>乾燥機はありません</li><li>無料の光回線Wi-Fi</li></ul></div></details>
          <details><summary>空調・共用設備</summary><div><ul><li>エアコン（3部屋）</li><li>テレビ、ボードゲーム</li></ul></div></details>
          <details><summary>子ども向け</summary><div><ul><li>ベビーベッド・ハイチェアは事前連絡要</li><li>未就学児は添い寝無料、寝具利用は1名1泊2,500円</li><li>子ども用食器はありません</li></ul></div></details>
        </div></section>

        <section id="food" className="section container" aria-labelledby="food-title"><div className="section__head"><h2 id="food-title">お食事</h2><p>朝食と夕食は、近隣の山中商店へ事前注文できます。</p></div><div className="food-feature"><figure><img src="/assets/photos/renewal/pantry-dinner.jpg" alt="揚げ物やいなり寿司などを盛り付けた3名分の夕食" /><figcaption>夕食の提供例（3名分）</figcaption></figure><div className="food-feature__content"><h3>山中商店の朝食・夕食</h3><p>1名分からご注文いただけます。</p><ul className="food-prices"><li><span>夕食</span><strong>1,300円／人</strong></li><li><span>朝食</span><strong>900円／人</strong></li><li><span>1泊セット（夕食＋朝食）</span><strong>2,000円／人</strong></li></ul><h4>ご予約とお支払い</h4><ul><li>前日17:00までに要予約</li><li>チェックイン時に山中商店で現金払い</li><li>ご注文確定後の当日キャンセルは、料金の全額を申し受けます</li></ul><p className="food-note">内容・品数・器は、当日の仕入れ状況により変わります。<br />アレルギーがある場合は予約時にお知らせください。</p></div></div></section>

        <section id="price" className="section container" aria-labelledby="price-title"><div className="section__head section__head--wide"><h2 id="price-title">料金・キャンセル規定</h2><p>日程ごとの宿泊総額は、ページ上部の空室・料金確認で表示します。</p></div><div className="price-layout"><div><div className="table-card"><h3>1〜2名の基本料金（1泊）</h3><div className="table-scroll"><table><thead><tr><th>シーズン</th><th>日〜木</th><th>金</th><th>土・祝前日</th></tr></thead><tbody><tr><td>オフ</td><td>12,000円</td><td>14,000円</td><td>17,000円</td></tr><tr><td>ミドル</td><td>15,000円</td><td>17,000円</td><td>22,000円</td></tr><tr><td>ピーク</td><td>18,000円</td><td>20,000円</td><td>25,000円</td></tr><tr><td>スーパーピーク</td><td colSpan="3">曜日を問わず 24,000円</td></tr></tbody></table></div><ul><li>3名目以降：1名1泊5,000円</li><li>未就学児：添い寝無料、寝具利用は1名1泊2,500円</li><li>最大宿泊人数は、未就学児も含めて8人です</li><li>6〜29泊：宿泊総額から15%引き。30泊以上は個別見積もり</li><li>連泊中の清掃はありません</li><li>清掃費・サービス料込み、税込</li></ul></div><div className="table-card cancellation"><h3>キャンセル料</h3><div className="table-scroll"><table><thead><tr><th>キャンセルのご連絡</th><th>キャンセル料</th></tr></thead><tbody><tr><td>チェックイン日の7日前23:59まで</td><td>無料</td></tr><tr><td>6〜2日前</td><td>30%</td></tr><tr><td>前日</td><td>50%</td></tr><tr><td>当日・無連絡不泊</td><td>100%</td></tr></tbody></table></div></div></div><aside className="policy-card"><div><strong>予約の成立</strong><span>お支払い完了をもって確定します。</span></div><div><strong>空室確認</strong><span>予約リクエスト後、24時間以内にご案内します。</span></div><div><strong>お支払い期限</strong><span>請求書のご案内から原則48時間以内です。</span></div><div><strong>静粛時間・禁煙</strong><span>20:00以降は静かにお過ごしください。室内全面禁煙です。</span></div><div><strong>返金</strong><span>キャンセル料を差し引き、お支払い時と同じ方法へ返金します。返金処理はキャンセル確定後7営業日以内です。</span></div></aside></div></section>

        <section className="section container" aria-labelledby="flow-title"><div className="section__head"><h2 id="flow-title">予約確定までの流れ</h2><p>予約リクエストの送信後、空室を最終確認します。お支払い完了をもって予約確定です。</p></div><div className="flow">{[['01','空室・料金確認','日程と人数だけで、空室と税込総額を確認します。'],['02','予約リクエスト','連絡先と食事・BBQなどの希望を送ります。'],['03','お支払いのご案内','空室を最終確認し、24時間以内にお支払い方法をご案内します。'],['04','お支払い・予約確定','お支払い完了後、予約確定をご連絡します。']].map(([n,h,p]) => <article key={n}><b>{n}</b><h3>{h}</h3><p>{p}</p></article>)}</div></section>

        <section id="access" className="section container" aria-labelledby="access-title"><div className="section__head"><h2 id="access-title">アクセス</h2><p>伯方島ICから車で約10分。島内の移動は車または自転車が便利です。</p></div><div className="access-layout"><div className="access-map"><iframe title="Terra -Shimanami- 周辺地図" src="https://www.google.com/maps?q=Terra%20-Shimanami-%20%E6%84%9B%E5%AA%9B%E7%9C%8C%E4%BB%8A%E6%B2%BB%E5%B8%82%E4%BC%AF%E6%96%B9%E7%94%BA%E5%8C%97%E6%B5%A6%E7%94%B21501-3&output=embed" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /><div className="access-map__meta"><address><strong>Terra -Shimanami-</strong><span>愛媛県今治市伯方町北浦甲1501-3</span></address><a href="https://maps.app.goo.gl/dcowbr5HjqgSd6Qf6" target="_blank" rel="noopener noreferrer">Googleマップで開く</a></div></div><div className="access-list"><div><strong>車でお越しの方</strong><span>しまなみ海道・伯方島ICから約10分です。</span></div><div><strong>駐車場</strong><span>1台・要予約。2台目は事前にご連絡ください。</span></div><div><strong>自転車でお越しの方</strong><span>敷地内に駐輪できます。</span></div><p>チェックイン方法と詳しい道順は、予約確定後にご案内します。</p></div></div></section>

        <section className="section container" aria-labelledby="faq-title"><div className="section__head"><h2 id="faq-title">よくあるご質問</h2></div><div className="faq-list">
          <details><summary>予約リクエストと予約確定の違いは？</summary><div>リクエスト後に空室を最終確認し、お支払い方法をご案内します。お支払い完了をもって予約確定です。</div></details>
          <details><summary>子どもの料金と人数の数え方は？</summary><div>未就学児は添い寝無料、寝具利用は1名1泊2,500円です。最大宿泊人数は、未就学児も含めて8人です。</div></details>
          <details><summary>6泊以上の割引は自動で適用されますか？</summary><div>6〜29泊は宿泊総額から15%引きを自動計算します。30泊以上は個別見積もりです。</div></details>
          <details><summary>食事はどう注文・支払いしますか？</summary><div>予約時に利用のご意向をお知らせください。予約完了後、詳細をご案内します。料金はチェックイン時に山中商店にて現金でお支払いください。</div></details>
          <details><summary>BBQはできますか？</summary><div>BBQグリルセットを1回5,000円でレンタルできます。グリル、新品の焼き網、炭用トング、食材用トング2本、火消しバケツを含みます。炭・着火剤・食材はご持参ください。持込グリル・焚火台は利用できません。調理と火気利用は20:00までです。</div></details>
          <details><summary>洗濯機と乾燥機はありますか？</summary><div>洗濯機、洗剤、物干し用品があります。乾燥機はありません。</div></details>
          <details><summary>20:00以降のルールは？</summary><div>20:00以降は静かにお過ごしください。</div></details>
          <details><summary>ベビーベッドはありますか？</summary><div>ベビーベッドとハイチェアは、事前にご連絡いただければご用意可能です。</div></details>
        </div></section>

        <section className="closing"><div><h2>空室と料金を確認</h2><p>お名前を入力する前に、空室と宿泊総額が分かります。</p></div><a className="button button--light" href="#booking">空室と料金を確認</a></section>
      </main>

      <footer><div className="footer-inner"><div className="footer-brand"><img src="/logo.png" alt="Terra -Shimanami-" /><p>愛媛県今治市・伯方島にある、1日1組限定の一棟貸し。約144㎡・4寝室・最大8名。</p></div><nav><a href="#price">料金・利用条件</a><a href="#price">キャンセル規定</a><a href="#access">アクセス</a><a href="#booking">予約リクエスト</a><a href="/privacy.html">個人情報の取り扱い</a></nav></div></footer>
      <div className="mobile-cta"><a className="button button--primary" href="#booking">空室と料金を確認</a></div>
      {galleryIndex !== null && <Gallery initialIndex={galleryIndex} onClose={() => setGalleryIndex(null)} />}
    </>
  );
}

export default App;
