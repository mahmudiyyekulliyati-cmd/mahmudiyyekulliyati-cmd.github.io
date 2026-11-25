/* =====================================================================
   UYGULAMA OLARAK YÜKLEME (Android / iPhone-iPad) ve ÇEVRİMDIŞI UYARISI
   - Android (Chrome, Samsung İnternet, Edge): tarayıcının «yükle» penceresi açılır.
   - iPhone / iPad: Safari'de Paylaş → «Ana Ekrana Ekle» adımları gösterilir.
   - İnternet kesildiğinde kısa bir uyarı gösterilir; virdler, Kur'ân ve
     daha önce açılmış sayfalar internetsiz de okunur (sw.js).
   ===================================================================== */
const Uygulama = (()=>{
  let istem = null;   // Android'in yükleme penceresi (beforeinstallprompt)
  window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); istem = e; dugmeleriGuncelle(); });
  window.addEventListener('appinstalled', ()=>{ istem = null; bildirimGoster('Uygulama cihazınıza yüklendi.'); dugmeleriGuncelle(); });

  const yukluMu = ()=> (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function platform(){
    const ua = navigator.userAgent || '';
    if(/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if(/android/i.test(ua)) return 'android';
    return 'masaustu';
  }
  const IKON_ANDROID = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22a11.4 11.4 0 0 0-9.84 0L5.22 5.92a.38.38 0 1 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg>`;
  const IKON_APPLE = `<svg width="20" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.37 12.6c-.03-2.7 2.2-4 2.3-4.07-1.26-1.84-3.2-2.09-3.9-2.12-1.65-.17-3.23.98-4.07.98-.84 0-2.13-.96-3.5-.93a5.2 5.2 0 0 0-4.4 2.66c-1.88 3.26-.48 8.08 1.35 10.73.9 1.3 1.96 2.75 3.36 2.7 1.35-.05 1.86-.87 3.49-.87 1.62 0 2.08.87 3.5.84 1.45-.03 2.37-1.32 3.25-2.62a11.3 11.3 0 0 0 1.48-3.03 4.7 4.7 0 0 1-2.86-4.27zM13.7 4.67A4.6 4.6 0 0 0 14.78 1.3a4.7 4.7 0 0 0-3.05 1.58 4.4 4.4 0 0 0-1.1 3.24 3.9 3.9 0 0 0 3.07-1.45z"/></svg>`;
  const IKON_PAYLAS = `<svg width="16" height="18" viewBox="0 0 20 22" fill="none" aria-hidden="true"><path d="M10 13V2M6 5.5 10 1.5l4 4M5 9H3.5A1.5 1.5 0 0 0 2 10.5v8A1.5 1.5 0 0 0 3.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 16.5 9H15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  async function androidYukle(){
    if(istem){
      istem.prompt();
      try{ const s = await istem.userChoice; if(s && s.outcome === 'accepted') bildirimGoster('Yükleniyor…'); }catch(e){}
      istem = null; dugmeleriGuncelle();
      return;
    }
    if(location.hash !== '#/uygulama') { location.hash = '#/uygulama'; setTimeout(()=> adimaGit('android'), 300); }
    else adimaGit('android');
  }
  function adimaGit(id){ const e = document.getElementById('uyg-'+id); if(e){ e.scrollIntoView({behavior:'smooth', block:'start'}); e.classList.add('flash'); setTimeout(()=>e.classList.remove('flash'), 1500); } }
  function dugmeleriGuncelle(){
    document.querySelectorAll('[data-uyg="android"] .uyg-dugme-alt').forEach(e=> e.textContent = istem ? 'Tek dokunuşla yükle' : 'Yükleme adımları');
  }
  function bagla(kok){
    (kok || document).querySelectorAll('[data-uyg="android"]').forEach(b=> b.onclick = androidYukle);
    (kok || document).querySelectorAll('[data-uyg="ios"]').forEach(b=> b.onclick = ()=>{ if(location.hash !== '#/uygulama'){ location.hash = '#/uygulama'; setTimeout(()=> adimaGit('ios'), 300); } else adimaGit('ios'); });
    dugmeleriGuncelle();
  }
  function dugmelerHtml(){
    return `<div class="uyg-dugmeler">
      <button type="button" class="uyg-dugme" data-uyg="android">${IKON_ANDROID}<span><b>Android</b><span class="uyg-dugme-alt">${istem ? 'Tek dokunuşla yükle' : 'Yükleme adımları'}</span></span></button>
      <button type="button" class="uyg-dugme" data-uyg="ios">${IKON_APPLE}<span><b>iPhone / iPad</b><span class="uyg-dugme-alt">Ana ekrana ekle</span></span></button>
    </div>`;
  }
  // Ana sayfa kartı (uygulama içinden açıldıysa gösterilmez)
  function kartHtml(){
    if(yukluMu()) return '';
    return `<div class="ana-kart uygulama-kart">
      <div class="ana-kart-baslik">Uygulamayı İndir</div>
      <div class="uyg-kart-metin">Siteyi telefonunuza uygulama olarak ekleyin; tek dokunuşla açılır, internet olmadan da virdleri ve Kur'ân-ı Kerîm'i okuyabilirsiniz.</div>
      ${dugmelerHtml()}
    </div>`;
  }

  function render(){
    setRoute('uygulama');
    const p = platform();
    const sira = p === 'ios' ? ['ios','android'] : ['android','ios'];
    const bolumler = {
      android: `<section class="uyg-bolum" id="uyg-android">
        <h3>${IKON_ANDROID} Android telefon ve tablet</h3>
        ${istem ? `<p><button type="button" class="tp-btn tp-btn-ana" data-uyg="android">Şimdi yükle</button></p>` : ''}
        <ol>
          <li>Siteyi <b>Chrome</b> (veya Samsung İnternet) ile açın: <b>evradimahmudiyye.com</b></li>
          <li>Sağ üstteki <b>⋮</b> menüsüne dokunun.</li>
          <li><b>«Uygulamayı yükle»</b> ya da <b>«Ana ekrana ekle»</b> seçeneğine dokunun ve onaylayın.</li>
          <li>«Evrâd-ı Mahmûdiyye» simgesi ana ekranınıza ve uygulama listenize eklenir.</li>
        </ol>
      </section>`,
      ios: `<section class="uyg-bolum" id="uyg-ios">
        <h3>${IKON_APPLE} iPhone ve iPad</h3>
        <ol>
          <li>Siteyi <b>Safari</b> ile açın: <b>evradimahmudiyye.com</b></li>
          <li>Alttaki (iPad'de üstteki) <b>Paylaş</b> düğmesine dokunun ${IKON_PAYLAS}.</li>
          <li>Listeyi kaydırıp <b>«Ana Ekrana Ekle»</b> seçeneğine dokunun.</li>
          <li>Sağ üstteki <b>«Ekle»</b> ile onaylayın. Simge ana ekranınıza gelir.</li>
        </ol>
        <p class="tp-kucuk">iOS 16.4 ve sonrasında Chrome'da da Paylaş menüsünden aynı şekilde eklenebilir.</p>
      </section>`
    };
    document.getElementById('content').innerHTML = `
      <div class="crumb"><b>Uygulamayı İndir</b></div>
      <div class="tp-giris-kart uyg-giris">
        <img src="assets/icon-192.png" alt="" width="72" height="72" class="uyg-logo">
        <div>
          <span class="eyebrow">Ücretsiz · mağaza gerektirmez</span>
          <h2>Evrâd-ı Mahmûdiyye'yi telefonunuza ekleyin</h2>
          <p>Uygulama, telefonunuzun ana ekranından tek dokunuşla açılır; tam ekran çalışır. <b>İnternet olmadan da</b> virdleri, duâları ve Kur'ân-ı Kerîm'i okuyabilirsiniz. Güncellemeler kendiliğinden gelir.</p>
          ${yukluMu() ? '<p class="uyg-yuklu">✓ Şu an uygulama olarak kullanıyorsunuz.</p>' : dugmelerHtml()}
        </div>
      </div>
      ${sira.map(k=>bolumler[k]).join('')}
      <section class="uyg-bolum">
        <h3>İnternetsiz kullanım</h3>
        <p>Siteyi bir kez internetle açtığınızda virdler, duâlar, Kur'ân-ı Kerîm metni, zikirmatik ve namaz vakitleri cihazınıza kaydedilir. Sonra internet olmadan da açılır. Kitap sayfası görselleri ise açtığınız anda kaydedilir.</p>
        <p class="tp-kucuk">Topluluk (yazılar, sohbet ve sesli odalar) ile Kur'ân'ı sesli dinleme için internet gerekir.</p>
      </section>
      ${footerHtml()}`;
    bagla(document.getElementById('content'));
    window.scrollTo({top:0});
  }

  // ---- İnternet bağlantısı uyarısı ----
  function baglantiDurumu(){
    let s = document.getElementById('cevrimdisiSerit');
    if(navigator.onLine){ if(s) s.remove(); return; }
    if(!s){
      s = document.createElement('div'); s.id = 'cevrimdisiSerit'; s.className = 'cevrimdisi-serit'; s.setAttribute('role','status');
      s.textContent = 'İnternet bağlantısı yok — virdler, duâlar ve Kur\'ân-ı Kerîm okunabilir; topluluk ve sesli dinleme için internet gerekir.';
      document.body.appendChild(s);
    }
  }
  window.addEventListener('online', ()=>{ baglantiDurumu(); bildirimGoster('İnternet bağlantısı geri geldi.'); });
  window.addEventListener('offline', baglantiDurumu);
  window.addEventListener('load', baglantiDurumu);

  return { render, kartHtml, bagla, yukluMu };
})();
