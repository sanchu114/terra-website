import React, { useState, useEffect, useRef } from 'react';
// 必要なアイコンをインポート
import { Menu, X, MapPin, Wifi, Car, Home, CalendarCheck, Mail, ExternalLink, ArrowRight, Sparkles, Utensils, Sun, Laptop, AlertTriangle, Dog, CigaretteOff, Trash2, CheckCircle, Users, Coffee, ChevronLeft, ChevronRight } from 'lucide-react';

const App = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  // AI関連のState
  const [aiInput, setAiInput] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const aiResultRef = useRef(null);

  // フォーム関連のState
  const [formStatus, setFormStatus] = useState(null); 

  // スライドショー関連のState
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // ギャラリーモーダル関連のState
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const heroImages = [
    "/assets/photos/hero1.jpg",
    "/assets/photos/hero2.jpg",
    "/assets/photos/hero3.png",
    "/assets/photos/hero4.png",
  ];
  
  // ギャラリー用画像のリスト
  const galleryImages = [
    "/assets/photos/hero1.jpg",
    "/assets/photos/niwa.png",
    "/assets/photos/bento.png",
    "/assets/photos/view.png",
    "/assets/photos/dining.png",
    "/assets/photos/engawa.png",
    "/assets/photos/hero2.jpg",
    "/assets/photos/exterior.png",
  ];

  // スライドショーのタイマー設定
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentImageIndex((prevIndex) => 
        prevIndex === heroImages.length - 1 ? 0 : prevIndex + 1
      );
    }, 8000); 

    return () => clearInterval(intervalId);
  }, [heroImages.length]);

  // スクロール検知
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // モーダル操作関数
  const openModal = (index) => {
    setSelectedImageIndex(index);
    setSelectedImage(galleryImages[index]);
    document.body.style.overflow = 'hidden'; // 背景スクロール固定
  };

  const closeModal = () => {
    setSelectedImage(null);
    document.body.style.overflow = 'unset'; // 背景スクロール解除
  };

  const nextImage = (e) => {
    e.stopPropagation();
    const nextIndex = selectedImageIndex === galleryImages.length - 1 ? 0 : selectedImageIndex + 1;
    setSelectedImageIndex(nextIndex);
    setSelectedImage(galleryImages[nextIndex]);
  };

  const prevImage = (e) => {
    e.stopPropagation();
    const prevIndex = selectedImageIndex === 0 ? galleryImages.length - 1 : selectedImageIndex - 1;
    setSelectedImageIndex(prevIndex);
    setSelectedImage(galleryImages[prevIndex]);
  };


  const navLinks = [
    { name: 'コンセプト', href: '#concept' },
    { name: 'お部屋・設備', href: '#rooms' },
    { name: '注意事項', href: '#notes' },
    { name: 'お食事', href: '#meals' },
    { name: 'AIアシスタント', href: '#ai-assistant' },
    { name: 'アクセス', href: '#access' },
    { name: 'ご予約', href: '#contact' },
  ];

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  // Gemini API 呼び出しロジック
  const callGeminiAPI = async (promptText) => {
    setIsAiLoading(true);
    setAiResponse('');
    setAiError('');
    
    const apiKey = ""; // ★APIキーはそのまま維持してください
    
    const systemPrompt = `
      あなたは愛媛県今治市伯方島にある簡易宿所「Terra（テラ）」のAIアシスタントです。
      
      【Terraのコンセプト】
      - 「暮らすように泊まる」静かな大人の隠れ家。
      - 住所：愛媛県今治市伯方町北浦甲1501−3
      - 近くの店：山中商店（徒歩圏内・食材あり）、コンビニ（車5分）、道の駅マリンオアシスはかた（車10分）
      
      【回答のためのカンペ】
      1. 買い物・食事:
         - 基本は自炊推奨だが、「山中商店」で手作りのお弁当や朝食の注文が可能（要予約・別料金）。
         - 外食ならランチで「さんわ（ラーメン）」「お好み焼き」などを提案。
      2. 観光・リフレッシュ:
         - 「開山公園（桜・展望）」「船折瀬戸（潮流）」など自然スポットを推す。
      3. レシピ提案:
         - 山中商店で買える食材を使った、フライパン一つでできる男飯や、疲れた体に優しいスープなどを提案。
      
      【トーン＆マナー】
      - 落ち着いていて、少し詩的で丁寧なトーン。
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: promptText }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    try {
      const fetchWithRetry = async (retries = 3, delay = 1000) => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!response.ok) throw new Error(`API Error: ${response.status}`);
          return await response.json();
        } catch (error) {
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchWithRetry(retries - 1, delay * 2);
        }
      };

      const data = await fetchWithRetry();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (text) {
        setAiResponse(text);
      } else {
        setAiError('申し訳ありません。うまく回答を生成できませんでした。');
      }

    } catch (error) {
      console.error(error);
      setAiError('通信エラーが発生しました。');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiSubmit = (e) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    callGeminiAPI(aiInput);
  };

  const handlePresetQuestion = (type) => {
    if (type === 'recipe') {
      const q = "疲れていて自炊する元気がありません。山中商店のお弁当サービスについて詳しく教えてください。";
      setAiInput(q);
      callGeminiAPI(q);
    } else if (type === 'weekend') {
      const q = "読みかけの本を持って出かけたいです。伯方島内で、波の音だけが聞こえるような、静かで人が少ない場所はありますか？";
      setAiInput(q);
      callGeminiAPI(q);
    }
  };

  const handleBookingSubmit = (e) => {
    e.preventDefault();
    setFormStatus('submitting');
    
    const formData = new FormData(e.target);
    
    fetch('/', {
      method: 'POST',
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(formData).toString()
    })
    .then(() => setFormStatus('success'))
    .catch((error) => setFormStatus('error'));
  };

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-stone-800 font-sans selection:bg-[#4A5D23] selection:text-white">
      <form name="booking" netlify="true" hidden>
        <input type="text" name="name" />
        <input type="email" name="email" />
        <input type="date" name="checkin" />
        <input type="date" name="checkout" />
        <input type="number" name="guests" />
        <textarea name="message"></textarea>
      </form>

      {/* 画像拡大モーダル */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-fade-in"
          onClick={closeModal}
        >
          <button 
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
            onClick={closeModal}
          >
            <X size={32} />
          </button>

          <button 
            className="absolute left-4 text-white/50 hover:text-white p-2 hidden md:block"
            onClick={prevImage}
          >
            <ChevronLeft size={48} />
          </button>

          <img 
            src={selectedImage} 
            alt="Enlarged view" 
            className="max-w-full max-h-[90vh] object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()} // 画像クリックで閉じないようにする
          />

          <button 
            className="absolute right-4 text-white/50 hover:text-white p-2 hidden md:block"
            onClick={nextImage}
          >
            <ChevronRight size={48} />
          </button>
          
          <div className="absolute bottom-4 text-white/60 text-sm tracking-widest">
            {selectedImageIndex + 1} / {galleryImages.length}
          </div>
        </div>
      )}

      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#2C3E28] text-white shadow-md py-3' : 'bg-transparent text-white py-5'}`}>
        <div className="container mx-auto px-4 md:px-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Terra Logo" className={`h-10 md:h-12 w-auto object-contain transition-all duration-300 ${scrolled ? 'brightness-0 invert' : ''}`} />
          </div>
          <nav className="hidden md:flex gap-8">
            {navLinks.map((link) => (<a key={link.name} href={link.href} className="text-sm tracking-wider hover:text-[#A8B692] transition-colors">{link.name}</a>))}
          </nav>
          <button className="md:hidden p-2 text-white" onClick={toggleMenu} aria-label="メニューを開く">{isMenuOpen ? <X size={24} /> : <Menu size={24} />}</button>
        </div>
        {isMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-[#2C3E28] border-t border-[#4A5D23] animate-fade-in">
            <div className="flex flex-col p-4">
              {navLinks.map((link) => (<a key={link.name} href={link.href} className="py-3 text-white border-b border-[#4A5D23] last:border-none" onClick={() => setIsMenuOpen(false)}>{link.name}</a>))}
            </div>
          </div>
        )}
      </header>

      {/* ヒーローセクション */}
      <section className="relative h-[80vh] flex items-center justify-center overflow-hidden bg-stone-900">
        {heroImages.map((img, index) => (
          <div key={index} className={`absolute inset-0 transition-opacity duration-[3000ms] ease-in-out ${index === currentImageIndex ? 'opacity-60' : 'opacity-0'}`}>
            <img src={img} alt={`Terra Slide ${index + 1}`} className={`w-full h-full object-cover transition-transform duration-[10000ms] ease-linear ${index === currentImageIndex ? 'scale-110' : 'scale-100'}`} />
          </div>
        ))}
        <div className="relative z-10 text-center px-4 text-white max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-serif font-medium mb-8 leading-tight drop-shadow-lg">暮らすように、<br/>泊まる。</h1>
          <p className="text-base md:text-lg mb-12 leading-loose tracking-widest font-serif opacity-90 drop-shadow-md">しまなみ海道・伯方島の山間にある一軒家。<br className="hidden md:block"/>聞こえるのは、風の音と鳥の声だけ。<br className="hidden md:block"/>何もしない時間を過ごすための、大人の隠れ家です。</p>
          <a href="#contact" className="inline-flex items-center gap-2 bg-[#4A5D23] hover:bg-[#3A4A1C] text-white px-8 py-3 rounded-sm transition-colors duration-300 tracking-widest text-sm shadow-lg">ご予約・空室確認 <ArrowRight size={16} /></a>
        </div>
      </section>

      {/* コンセプト */}
      <section id="concept" className="py-20 md:py-32 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="md:w-1/2 space-y-6">
              <span className="text-[#4A5D23] font-bold tracking-widest text-sm block mb-2">CONCEPT</span>
              <h2 className="text-3xl md:text-4xl font-serif text-stone-800 leading-snug">大地に還る時間。<br/>心ほどける、島の日常。</h2>
              <p className="text-stone-600 leading-relaxed">Terra（テラ）はラテン語で「大地」を意味します。広い縁側でただ過ぎゆく時を感じ、窓辺のハンモックで微睡む。目の前に広がる里山の風景が、忙しい日常を忘れさせてくれます。</p>
              <p className="text-stone-600 leading-relaxed">観光地化を避け、古民家を最低限リノベーションした素朴な空間です。過度なサービスはありませんが、長期の業務渡航やワーケーションなど、「生活の安定」と「静かな時間」を最優先する方に選ばれています。</p>
            </div>
            <div className="md:w-1/2">
              <div className="relative">
                <div className="aspect-[4/3] bg-stone-200 rounded-sm overflow-hidden">
                   <img src="/assets/photos/niwa.png" alt="Terraの庭" className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
                </div>
                <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-[#FDFCF8] p-4 hidden md:block">
                  <div className="w-full h-full border border-[#4A5D23] flex items-center justify-center text-[#4A5D23]"><span className="font-serif italic">Est. 2024</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* お部屋と設備 */}
      <section id="rooms" className="py-20 bg-[#F5F5F0]">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-16">
            <span className="text-[#4A5D23] font-bold tracking-widest text-sm">ROOMS & FACILITIES</span>
            <h2 className="text-3xl font-serif text-stone-800 mt-2">お部屋と設備</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
            {[
              { icon: <Wifi size={24} />, title: "Free Wi-Fi", desc: "高速光回線" },
              { icon: <Laptop size={24} />, title: "Work Space", desc: "静かな書斎・デスク" },
              { icon: <Utensils size={24} />, title: "Kitchen", desc: "自炊を楽しむ広いDK" },
              { icon: <Dog size={24} />, title: "Pet Friendly", desc: "小型犬OK（要連絡）" },
            ].map((item, index) => (
              <div key={index} className="bg-white p-6 rounded-sm shadow-sm text-center hover:shadow-md transition-shadow">
                <div className="text-[#4A5D23] mb-3 flex justify-center">{item.icon}</div>
                <h3 className="font-bold mb-1 text-stone-800">{item.title}</h3>
                <p className="text-xs text-stone-500">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-12 items-center mb-20">
             <div className="order-1 md:order-2 space-y-6">
                <h3 className="text-2xl font-serif text-stone-800">心ほどける特等席と、<br/>暮らしを支える機能性</h3>
                <div className="space-y-4">
                  <div className="border-l-2 border-[#4A5D23] pl-4">
                    <h4 className="font-bold text-stone-800">1F 縁側とダイニング</h4>
                    <p className="text-sm text-stone-600 mt-1">PC作業も可能な広いダイニングテーブル。IHコンロ（2口）、冷蔵庫、電子レンジ、調理器具一式を完備しており、地元の食材での自炊に最適です。</p>
                  </div>
                  <div className="border-l-2 border-[#4A5D23] pl-4">
                    <h4 className="font-bold text-stone-800">2F くつろぎの寝室群</h4>
                    <p className="text-sm text-stone-600 mt-1">セミダブルベッド2台、布団6組をご用意。最大8名様まで滞在可能です。窓辺にハンモックのある部屋や、静かに読書ができる洋室など、思い思いの場所でお過ごしください。</p>
                  </div>
                  <div className="border-l-2 border-[#4A5D23] pl-4">
                    <h4 className="font-bold text-stone-800">長期滞在の快適さ</h4>
                    <p className="text-sm text-stone-600 mt-1">洗濯機、ドライヤー、清潔なバス・トイレを完備。Wi-Fiも各室で利用可能です。派手さはありませんが、実用性を重視した空間です。</p>
                  </div>
                </div>
             </div>
             <div className="order-2 md:order-1">
               <div className="grid grid-cols-2 gap-4">
                 <img src="/assets/photos/engawa.png" alt="縁側" className="w-full h-40 object-cover rounded-sm" />
                 <img src="/assets/photos/view.png" alt="2Fからの眺め" className="w-full h-40 object-cover rounded-sm" />
                 <img src="/assets/photos/dining.png" alt="ダイニング" className="w-full h-40 object-cover rounded-sm" />
                 <img src="/assets/photos/exterior.png" alt="外観" className="w-full h-40 object-cover rounded-sm" />
               </div>
             </div>
          </div>
        </div>
      </section>

      {/* 注意事項セクション */}
      <section id="notes" className="py-20 bg-white border-b border-stone-100">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <span className="text-[#4A5D23] font-bold tracking-widest text-sm">THINGS TO KNOW</span>
            <h2 className="text-3xl font-serif text-stone-800 mt-2">知っておいていただきたいこと</h2>
            <p className="text-stone-600 mt-4 max-w-2xl mx-auto">Terraは自然の中にある、素朴な一軒家です。お客様と私たちの双方が気持ちよく過ごせるよう、ご予約前にご確認ください。</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-[#FDFCF8] p-8 border border-stone-200 rounded-sm">
               <div className="flex items-center gap-3 mb-4 text-[#4A5D23]">
                 <AlertTriangle size={24} />
                 <h3 className="font-bold text-lg text-stone-800">自然環境・虫について</h3>
               </div>
               <p className="text-sm text-stone-600 leading-relaxed">自然豊かな場所のため、野良猫や虫（クモやムカデなど）が出ることがあります。殺虫剤などは完備していますが、自然環境の一部としてご理解いただけない方のご予約はご遠慮ください。</p>
            </div>
            <div className="bg-[#FDFCF8] p-8 border border-stone-200 rounded-sm">
               <div className="flex items-center gap-3 mb-4 text-[#4A5D23]">
                 <Utensils size={24} />
                 <h3 className="font-bold text-lg text-stone-800">お食事・買い物</h3>
               </div>
               <p className="text-sm text-stone-600 leading-relaxed">徒歩圏内に「山中商店」はありますが、近隣に飲食店や大型スーパーはありません。基本的に食材を持ち込んでの「自炊」がメインの滞在となります。</p>
            </div>
             <div className="bg-[#FDFCF8] p-8 border border-stone-200 rounded-sm">
               <div className="flex items-center gap-3 mb-4 text-[#4A5D23]">
                 <Dog size={24} />
                 <h3 className="font-bold text-lg text-stone-800">ペットとの滞在</h3>
               </div>
               <p className="text-sm text-stone-600 leading-relaxed">小型犬のみ同伴可能です（追加料金なし）。中型・大型犬は受け入れ不可となります。必ずゲージをご持参の上、指定のスペースで管理をお願いいたします。</p>
            </div>
            <div className="bg-[#FDFCF8] p-8 border border-stone-200 rounded-sm">
               <div className="flex items-center gap-3 mb-4 text-[#4A5D23]">
                 <div className="flex gap-2"><CigaretteOff size={24} /><Trash2 size={24} /></div>
                 <h3 className="font-bold text-lg text-stone-800">ハウスルール</h3>
               </div>
               <p className="text-sm text-stone-600 leading-relaxed">・室内は電子タバコ含め完全禁煙です（屋外に喫煙所あり）。<br/>・滞在中の清掃、ゴミの分別・処理はゲスト様ご自身でお願いします。<br/>・夜間（21時以降）はお静かにお願いします。</p>
            </div>
          </div>
        </div>
      </section>

      {/* お食事セクション */}
      <section id="meals" className="py-20 bg-[#F9FAF6] border-y border-stone-100">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="md:w-1/2">
               <div className="relative">
                <div className="aspect-[4/3] bg-stone-200 rounded-sm overflow-hidden">
                   <img src="/assets/photos/bento.png" alt="山中商店のお弁当イメージ" className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-[#F9FAF6] p-4 hidden md:block">
                  <div className="w-full h-full border border-[#4A5D23] flex flex-col items-center justify-center text-[#4A5D23]">
                    <Utensils size={24} />
                    <span className="text-xs font-bold mt-1">Homemade</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="md:w-1/2 space-y-6">
              <span className="text-[#4A5D23] font-bold tracking-widest text-sm block mb-2">OPTIONAL MEALS</span>
              <h2 className="text-3xl font-serif text-stone-800 leading-snug">島の日常を味わう、<br/>手作りの朝食とお弁当。</h2>
              <p className="text-stone-600 leading-relaxed">Terraの近隣にある「山中商店」にて、手作りのお弁当や朝食をご用意できます（要予約）。コンビニ弁当とは違う、家庭的な味とボリュームで、長期滞在中の健康と活力をサポートします。</p>
              <div className="bg-white p-6 rounded-sm border border-stone-200 mt-4">
                <h4 className="font-bold text-stone-800 mb-3 flex items-center gap-2"><Coffee size={18} className="text-[#4A5D23]" /> ご利用について</h4>
                <ul className="text-sm text-stone-600 space-y-2">
                  <li className="flex items-start gap-2"><span className="text-[#4A5D23] mt-1">●</span><span><strong>メニュー：</strong> 日替わり弁当、朝食セットなど</span></li>
                  <li className="flex items-start gap-2"><span className="text-[#4A5D23] mt-1">●</span><span><strong>お支払い：</strong> 受け取り時に、山中商店へ直接現金等でお支払いください。</span></li>
                  <li className="flex items-start gap-2"><span className="text-[#4A5D23] mt-1">●</span><span><strong>ご予約：</strong> ご宿泊予約時、または現地にてご相談ください。</span></li>
                </ul>
                <p className="text-xs text-stone-400 mt-4">※法人利用等で宿泊費とまとめての請求書払いをご希望の場合はご相談ください。</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ギャラリーセクション */}
      <section id="gallery" className="py-20 bg-white">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <span className="text-[#4A5D23] font-bold tracking-widest text-sm">GALLERY</span>
            <h2 className="text-3xl font-serif text-stone-800 mt-2">島の時間、Terraの記憶。</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-[200px]">
            <div className="col-span-2 row-span-2 overflow-hidden rounded-sm relative group cursor-pointer" onClick={() => openModal(0)}>
              <img src="/assets/photos/hero1.jpg" alt="Gallery 1" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>
            </div>
            <div className="col-span-1 row-span-1 overflow-hidden rounded-sm relative group cursor-pointer" onClick={() => openModal(1)}>
              <img src="/assets/photos/niwa.png" alt="Gallery 2" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>
            </div>
            <div className="col-span-1 row-span-1 overflow-hidden rounded-sm relative group cursor-pointer" onClick={() => openModal(2)}>
               <img src="/assets/photos/bento.png" alt="Gallery 3" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
               <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>
            </div>
            <div className="col-span-1 row-span-2 overflow-hidden rounded-sm relative group cursor-pointer" onClick={() => openModal(3)}>
              <img src="/assets/photos/view.png" alt="Gallery 4" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>
            </div>
            <div className="col-span-1 row-span-1 overflow-hidden rounded-sm relative group cursor-pointer" onClick={() => openModal(4)}>
              <img src="/assets/photos/dining.png" alt="Gallery 5" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>
            </div>
            <div className="col-span-2 row-span-1 overflow-hidden rounded-sm relative group cursor-pointer" onClick={() => openModal(5)}>
               <img src="/assets/photos/engawa.png" alt="Gallery 6" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
               <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>
            </div>
             <div className="col-span-1 row-span-1 overflow-hidden rounded-sm relative group cursor-pointer" onClick={() => openModal(6)}>
               <img src="/assets/photos/hero2.jpg" alt="Gallery 7" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
               <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>
            </div>
             <div className="col-span-1 row-span-1 overflow-hidden rounded-sm relative group cursor-pointer" onClick={() => openModal(7)}>
               <img src="/assets/photos/exterior.png" alt="Gallery 8" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
               <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>
            </div>
          </div>
        </div>
      </section>

      {/* AIアシスタントセクション */}
      <section id="ai-assistant" className="py-20 bg-gradient-to-br from-[#E8ECD6] to-[#F5F5F0]">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-[#4A5D23] text-white px-4 py-1 rounded-full text-xs font-bold tracking-widest mb-4">
              <Sparkles size={14} /> POWERED BY GEMINI
            </div>
            <h2 className="text-3xl font-serif text-stone-800">Terra Life Assistant</h2>
            <p className="text-stone-600 mt-4 max-w-2xl mx-auto">今日の夕食のレシピや、誰にも邪魔されない散歩道。<br/>あなたの静かな滞在を、AIアシスタントがそっとサポートします。</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-stone-100">
            <div className="p-6 md:p-8 bg-[#FDFCF8] border-b border-stone-100">
              <p className="text-sm text-stone-500 font-bold mb-4">たとえば、こんなことを聞いてみてください</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => handlePresetQuestion('recipe')} className="flex items-center gap-3 p-4 rounded-lg border border-stone-200 hover:border-[#4A5D23] hover:bg-[#F5F9F2] transition-colors text-left group">
                  <div className="bg-orange-100 text-orange-600 p-2 rounded-full group-hover:scale-110 transition-transform"><Utensils size={20} /></div>
                  <div><span className="font-bold text-stone-800 block text-sm">母の味を注文</span><span className="text-xs text-stone-500">山中商店のお弁当について</span></div>
                </button>
                <button onClick={() => handlePresetQuestion('weekend')} className="flex items-center gap-3 p-4 rounded-lg border border-stone-200 hover:border-[#4A5D23] hover:bg-[#F5F9F2] transition-colors text-left group">
                  <div className="bg-blue-100 text-blue-600 p-2 rounded-full group-hover:scale-110 transition-transform"><Sun size={20} /></div>
                  <div><span className="font-bold text-stone-800 block text-sm">静寂を探しに</span><span className="text-xs text-stone-500">波音だけの読書スポット</span></div>
                </button>
              </div>
            </div>
            <div className="p-6 md:p-8">
              <form onSubmit={handleAiSubmit} className="relative">
                <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="例：考え事をしたいので、海が見える静かな場所を教えてください。" className="w-full p-4 pr-12 rounded-lg border border-stone-300 focus:ring-2 focus:ring-[#4A5D23] focus:border-transparent outline-none resize-none min-h-[100px] text-stone-800 placeholder-stone-400" />
                <button type="submit" disabled={isAiLoading || !aiInput.trim()} className="absolute bottom-4 right-4 bg-[#4A5D23] text-white p-2 rounded-full hover:bg-[#3A4A1C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-label="送信">
                  {isAiLoading ? <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : <ArrowRight size={20} />}
                </button>
              </form>
              {(aiResponse || aiError) && (
                <div ref={aiResultRef} className="mt-6 animate-fade-in">
                   <div className="flex gap-3">
                     <div className="w-8 h-8 md:w-10 md:h-10 bg-[#4A5D23] rounded-full flex-shrink-0 flex items-center justify-center text-white"><Sparkles size={16} /></div>
                     <div className="bg-[#F5F5F0] rounded-lg rounded-tl-none p-5 text-stone-800 w-full">
                        {aiError ? <p className="text-red-600 text-sm">{aiError}</p> : <div className="prose prose-stone prose-sm max-w-none whitespace-pre-wrap leading-relaxed">{aiResponse}</div>}
                     </div>
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="access" className="py-20 bg-[#F5F5F0]">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <span className="text-[#4A5D23] font-bold tracking-widest text-sm">ACCESS</span>
          <h2 className="text-3xl font-serif text-stone-800 mt-2 mb-12">アクセス</h2>
          <div className="bg-white p-8 md:p-12 border border-stone-200 rounded-sm shadow-sm">
            <div className="flex flex-col items-center gap-4 mb-8">
              <MapPin size={40} className="text-[#4A5D23]" />
              <div><p className="text-lg font-bold text-stone-800">Terra -Shimanami-</p><p className="text-stone-600">〒794-2303 愛媛県今治市伯方町北浦甲1501-3</p></div>
            </div>
            <div className="w-full h-64 md:h-96 bg-stone-100 rounded-sm mb-8 overflow-hidden border border-stone-200 shadow-inner">
              <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15001.718766085127!2d133.08585290656603!3d34.21415511207934!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x35504f003ea8ae61%3A0x9483beb05b1df249!2sTerra%20-Shimanami-!5e1!3m2!1sja!2sjp!4v1764070070196!5m2!1sja!2sjp" width="100%" height="100%" style={{ border: 0 }} allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Terra Location Map"></iframe>
            </div>
            <div className="flex flex-col md:flex-row justify-center gap-8 text-left max-w-2xl mx-auto">
              <div className="flex-1">
                <h4 className="font-bold text-stone-800 mb-2 border-b border-stone-300 pb-1">お車でお越しの方</h4>
                <p className="text-sm text-stone-600 leading-relaxed">しまなみ海道「伯方島IC」から車で約10分。<br/>県道50号線を北浦方面へ。<br/>※駐車場1台分あり（要予約）</p>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-stone-800 mb-2 border-b border-stone-300 pb-1">周辺情報</h4>
                <p className="text-sm text-stone-600 leading-relaxed">・スーパー/商店：山中商店（徒歩圏内）<br/>・コンビニ：車で約5分<br/>・道の駅 マリンオアシスはかた：車で10分<br/><span className="text-xs text-stone-500 mt-1 block">※飲食店・大型スーパーは近くにありません</span></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="py-20 bg-[#2C3E28] text-white">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif mb-6">ご予約・空室確認</h2>
            <p className="opacity-90 leading-relaxed max-w-2xl mx-auto">公式サイトからのご予約が最もお得（ベストレート）です。<br/>手数料がかからない分、各予約サイト（Airbnb・じゃらん等）よりお安くご案内しております。</p>
          </div>
          
          <div className="mb-12 grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="bg-white/10 border border-white/20 p-6 rounded-sm text-center">
              <div className="inline-flex items-center justify-center gap-2 mb-3 text-[#A8B692]"><Home size={24} /><span className="font-bold tracking-widest text-sm">BASIC RATE</span></div>
              <p className="text-sm opacity-80 mb-1">一棟貸し（4名様まで）</p>
              {/* 修正：金額を変更しました */}
              <div className="text-3xl font-sans font-medium tracking-widest text-white mb-2">10,000円〜 <span className="text-sm font-sans font-normal opacity-60">/ 泊</span></div>
              <p className="text-xs opacity-60">※シーズン・曜日により変動します</p>
            </div>
            <div className="bg-white/10 border border-white/20 p-6 rounded-sm text-center">
              <div className="inline-flex items-center justify-center gap-2 mb-3 text-[#A8B692]"><Users size={24} /><span className="font-bold tracking-widest text-sm">EXTRA GUEST</span></div>
              <p className="text-sm opacity-80 mb-1">5名様以降の追加料金</p>
              {/* 修正：金額を変更しました */}
              <div className="text-3xl font-sans font-medium tracking-widest text-white mb-2">+5,000円 <span className="text-sm font-sans font-normal opacity-60">/ 名</span></div>
              <p className="text-xs opacity-60">※最大8名様まで宿泊可能</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 md:gap-12 bg-white text-stone-800 rounded-lg overflow-hidden shadow-2xl">
            <div className="p-6 md:p-8 bg-stone-50">
              <h3 className="font-bold text-lg mb-4 text-[#4A5D23] flex items-center gap-2"><CalendarCheck size={20} /> 空室状況</h3>
              <p className="text-xs text-stone-500 mb-4">※カレンダーの <span className="text-red-500 font-bold">予定あり</span> の日はご予約いただけません。</p>
              <div className="aspect-[4/3] w-full bg-white border border-stone-200 rounded-sm overflow-hidden relative">
                 <iframe src="https://calendar.google.com/calendar/embed?src=htreagrcn9d32sfdts0s49hhne40q41e%40import.calendar.google.com&ctz=Asia%2FTokyo" style={{ border: 0 }} width="100%" height="100%" frameBorder="0" scrolling="no" title="Terra Availability Calendar"></iframe>
              </div>
              <div className="mt-4 text-xs text-stone-500 bg-white p-3 rounded border border-stone-100">
                <strong>ご予約の流れ：</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>空室状況を確認し、リクエストフォームを送信</li>
                  <li>Terraより確認メールと請求書（カード決済）を送付</li>
                  <li>お支払い完了後、予約確定となります</li>
                </ol>
              </div>
            </div>
            <div className="p-6 md:p-8">
              <h3 className="font-bold text-lg mb-6 text-[#4A5D23] flex items-center gap-2"><Mail size={20} /> 予約リクエスト</h3>
              {formStatus === 'success' ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 animate-fade-in">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4"><CheckCircle size={32} /></div>
                  <h4 className="text-xl font-bold mb-2">リクエスト送信完了</h4>
                  <p className="text-stone-600">お問い合わせありがとうございます。<br/>内容を確認し、24時間以内にメールにて<br/>ご連絡させていただきます。</p>
                  <button onClick={() => setFormStatus(null)} className="mt-6 text-sm text-[#4A5D23] underline hover:text-[#3A4A1C]">戻る</button>
                </div>
              ) : (
                <form name="booking" method="POST" data-netlify="true" onSubmit={handleBookingSubmit} className="space-y-4">
                  <input type="hidden" name="form-name" value="booking" />
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-stone-500 mb-1">お名前 *</label><input type="text" name="name" required className="w-full p-2 border border-stone-300 rounded focus:border-[#4A5D23] outline-none text-sm" placeholder="山田 太郎" /></div>
                    <div><label className="block text-xs font-bold text-stone-500 mb-1">メールアドレス *</label><input type="email" name="email" required className="w-full p-2 border border-stone-300 rounded focus:border-[#4A5D23] outline-none text-sm" placeholder="example@email.com" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-stone-500 mb-1">チェックイン *</label><input type="date" name="checkin" required className="w-full p-2 border border-stone-300 rounded focus:border-[#4A5D23] outline-none text-sm" /></div>
                    <div><label className="block text-xs font-bold text-stone-500 mb-1">チェックアウト *</label><input type="date" name="checkout" required className="w-full p-2 border border-stone-300 rounded focus:border-[#4A5D23] outline-none text-sm" /></div>
                  </div>
                  <div><label className="block text-xs font-bold text-stone-500 mb-1">宿泊人数 *</label><select name="guests" className="w-full p-2 border border-stone-300 rounded focus:border-[#4A5D23] outline-none text-sm">{[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}名</option>)}</select></div>
                  <div><label className="block text-xs font-bold text-stone-500 mb-1">メッセージ（任意）</label><textarea name="message" rows="3" className="w-full p-2 border border-stone-300 rounded focus:border-[#4A5D23] outline-none text-sm" placeholder="チェックイン予定時刻やご質問など"></textarea></div>
                  <button type="submit" disabled={formStatus === 'submitting'} className="w-full bg-[#4A5D23] text-white py-3 rounded-sm hover:bg-[#3A4A1C] transition-colors font-bold tracking-wider disabled:opacity-50">{formStatus === 'submitting' ? '送信中...' : '空室状況を確認してリクエスト'}</button>
                  <p className="text-[10px] text-center text-stone-400">※この時点では予約は確定しません。</p>
                </form>
              )}
            </div>
          </div>
          
          <div className="mt-12 text-center">
             <p className="text-sm opacity-80 mb-4">即時予約はこちら（OTAサイト）</p>
             <div className="flex justify-center gap-4 flex-wrap">
               <a href="https://www.airbnb.jp/rooms/1559396243936791784?source_impression_id=p3_1764072846_P34Mc5WDV_W3hHb-" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[#FF5A5F] border border-[#FF5A5F] px-6 py-2 rounded-full text-sm hover:bg-[#FF5A5F] hover:text-white transition-colors"><ExternalLink size={16} /> Airbnb</a>
               <a href="#" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[#FF7500] border border-[#FF7500] px-6 py-2 rounded-full text-sm hover:bg-[#FF7500] hover:text-white transition-colors"><ExternalLink size={16} /> じゃらん</a>
             </div>
          </div>
        </div>
      </section>

      <footer className="bg-[#1A2619] text-[#A8B692] py-8 text-sm">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center items-center gap-2 mb-4"><span className="font-serif font-bold text-lg text-white">Terra</span></div>
          <p className="mb-4">Ehime Imabari Hakata Island</p>
          <p>&copy; {new Date().getFullYear()} Terra. All Rights Reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;