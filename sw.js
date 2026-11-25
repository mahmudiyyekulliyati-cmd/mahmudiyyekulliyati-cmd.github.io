/* Evrâd-ı Mahmûdiyye — internetsiz kullanım için service worker.
   - Kurulumda sitenin bütün dosyaları (sayfa, betikler, vird ve Kur'ân verisi, yazı tipleri, simgeler)
     cihaza kaydedilir; site bir kez açıldıktan sonra internet olmadan da çalışır.
   - Sayfa (HTML): önce internet (en fazla 4 sn beklenir), yoksa kayıtlı hâli.
   - Diğer dosyalar: kayıtlı hâl hemen açılır, internet varsa arka planda güncellenir.
   - Kitap sayfası görselleri açıldıkça kaydedilir ve sürüm değişse de silinmez.
   - Firebase kütüphanesi ve Google yazı tipleri ilk kullanımda kaydedilir. */
const SURUM = 'em-v21';
const ONBELLEK = SURUM;
const GORSEL_ONBELLEK = 'em-kaynak-gorselleri';
const DIS_ONBELLEK = 'em-dis-kaynaklar';
const TEMEL = [
  './',
  'index.html',
  'data/master-data.js',
  'data/quran-data.js',
  'sesli-oda.js',
  'topluluk.js',
  'okuma-araclari.js',
  'kuran-dinle.js',
  'uygulama.js',
  'assets/logo.jpg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/apple-touch-icon.png',
  'assets/fonts/ShaikhHamdullahMushaf.ttf',
  'assets/fonts/amiri-salavat.woff2',
  'assets/fonts/yazitipleri.css',
  'manifest.webmanifest'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(ONBELLEK)
      .then(c=> c.addAll(TEMEL.map(u=> new Request(u, {cache:'reload'}))))
      .then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', (e)=>{
  const kalici = [ONBELLEK, GORSEL_ONBELLEK, DIS_ONBELLEK];
  e.waitUntil(
    caches.keys().then(keys=> Promise.all(keys.filter(k=> !kalici.includes(k)).map(k=> caches.delete(k))))
      .then(()=> self.clients.claim())
  );
});

function zamanAsimi(ms){ return new Promise((_, ret)=> setTimeout(()=> ret(new Error('zaman aşımı')), ms)); }
function kaydet(adi, istek, yanit){
  if(yanit && (yanit.ok || yanit.type === 'opaque')){ const k = yanit.clone(); caches.open(adi).then(c=> c.put(istek, k)).catch(()=>{}); }
  return yanit;
}

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  const ayniSite = url.origin === self.location.origin;

  // Sayfanın kendisi: önce internet (4 sn), yoksa kayıtlı sayfa
  if(req.mode === 'navigate'){
    e.respondWith(
      Promise.race([fetch(req), zamanAsimi(4000)])
        .then(r=> kaydet(ONBELLEK, 'index.html', r))
        .catch(()=> caches.match('index.html', {ignoreSearch:true}).then(r=> r || caches.match('./')))
    );
    return;
  }

  // Kitap sayfası görselleri: kayıtlıysa oradan, değilse indir ve kaydet
  if(ayniSite && url.pathname.includes('/kaynak/')){
    e.respondWith(
      caches.open(GORSEL_ONBELLEK).then(c=> c.match(req).then(r=> r || fetch(req).then(y=> kaydet(GORSEL_ONBELLEK, req, y))))
    );
    return;
  }

  // Sitenin diğer dosyaları: kayıtlı hâl hemen, arka planda güncelle
  if(ayniSite){
    e.respondWith(
      caches.match(req, {ignoreSearch:true}).then(kayitli=>{
        const ag = fetch(req).then(y=> kaydet(ONBELLEK, req, y)).catch(()=> kayitli);
        return kayitli || ag;
      })
    );
    return;
  }

  // Google yazı tipleri ve Firebase kütüphanesi (sürümlü adres): kayıtlıysa oradan
  const yaziTipi = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const firebaseKutuphane = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if(yaziTipi || firebaseKutuphane){
    e.respondWith(
      caches.open(DIS_ONBELLEK).then(c=> c.match(req).then(r=>{
        const ag = fetch(req).then(y=> kaydet(DIS_ONBELLEK, req, y));
        if(r){ if(url.hostname === 'fonts.googleapis.com') ag.catch(()=>{}); return r; }
        return ag;
      }))
    );
  }
  // Firestore, ses kayıtları vb. her zaman internetten gelir.
});
