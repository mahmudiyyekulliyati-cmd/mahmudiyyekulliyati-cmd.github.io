/* =====================================================================
   KUR'ÂN-I KERÎM SESLİ DİNLEME
   - Mişârî Râşid el-Afâsî ve Abdulbâsıt Abdussamed: âyet âyet (everyayah.com).
     Okunan âyet işaretlenir; sûre bitince sonraki sûreye geçilir.
   - Hâfız Yâsir Demirkoparan: Lâlegül TV mukâbelesi, cüz cüz (archive.org).
     Sûrenin bulunduğu cüz açılır ve sûrenin başına yaklaşık olarak gidilir.
   ===================================================================== */
const KuranDinle = (()=>{
  const KARILER = [
    { id:'demirkoparan', ad:'Hâfız Yâsir Demirkoparan', kisaNot:'Mukâbele · cüz cüz', tur:'cuz' },
    { id:'afasi', ad:'Mişârî Râşid el-Afâsî', kisaNot:'Âyet âyet', tur:'ayet', klasor:'Alafasy_128kbps' },
    { id:'abdulbasit', ad:'Abdulbâsıt Abdussamed', kisaNot:'Klasik Mısır ekolü · âyet âyet', tur:'ayet', klasor:'Abdul_Basit_Murattal_192kbps' },
  ];
  const AYET_ADRESI = (klasor, sure, ayet)=> `https://everyayah.com/data/${klasor}/${String(sure).padStart(3,'0')}${String(ayet).padStart(3,'0')}.mp3`;
  const CUZ_ADRESI = (cuz)=> `https://archive.org/download/MuhammedYasirDemirkoparan/${encodeURIComponent(`Mukâbele ${String(cuz).padStart(2,'0')}.${cuz>=22 && cuz<=24 ? '  ' : ' '}Cüz Lâlegül TV.mp4`)}`;
  // Cüzlerin başladığı yer: [sûre, âyet]
  const CUZ_BASI = [[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],[18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];

  const ses = new Audio();
  ses.preload = 'auto';
  const onYukleme = new Audio(); onYukleme.preload = 'auto';
  let durum = null;   // {kari, sure, sira:[{ayet}], i, calıyor}  veya cüz modu {kari, sure, cuz}
  let otomatikGecis = false;
  let kullaniciDurdurdu = false;

  function kariSecili(){ const id = hafizaOku('em_kari', 'demirkoparan'); return KARILER.find(k=>k.id===id) || KARILER[0]; }
  function cuzBul(sure, ayet){
    let c = 1;
    for(let i=0;i<CUZ_BASI.length;i++){ const [s,a] = CUZ_BASI[i]; if(sure > s || (sure===s && ayet>=a)) c = i+1; }
    return c;
  }
  // Cüz içinde sûre başının yaklaşık konumu (harf sayısına göre, 0..1)
  function cuzIciOran(cuz, sure){
    const [bs, ba] = CUZ_BASI[cuz-1];
    const [ss, sa] = cuz < 30 ? CUZ_BASI[cuz] : [115, 1];
    let once = 0, toplam = 0;
    for(let s=bs; s<=Math.min(ss,114); s++){
      const ayetler = QURAN_DATA.content[s] || [];
      ayetler.forEach((t,i)=>{
        const n = i+1;
        if(s===bs && n<ba) return;
        if(s===ss && n>=sa) return;
        const u = t.length;
        if(s < sure) once += u;
        toplam += u;
      });
    }
    return toplam ? once/toplam : 0;
  }
  function sureBilgisi(no){ return QURAN_DATA.surahs.find(s=>s.no===no); }

  /* ---------------- çalma çubuğu ---------------- */
  function cubuk(){
    let c = document.getElementById('kuranOynatici');
    if(c) return c;
    c = document.createElement('div');
    c.id = 'kuranOynatici'; c.className = 'kuran-oynatici'; c.setAttribute('role','region'); c.setAttribute('aria-label',"Kur'ân dinleme");
    c.innerHTML = `
      <div class="ko-ust"><span class="ko-kari" id="koKari"></span><span class="ko-yer" id="koYer"></span></div>
      <div class="ko-ilerleme" id="koIlerlemeKutu" hidden><input type="range" id="koIlerleme" min="0" max="1000" value="0" aria-label="Kayıtta ilerle"><span class="ko-zaman" id="koZaman"></span></div>
      <div class="ko-alt">
        <button type="button" class="ko-btn" id="koGeri" aria-label="Önceki">‹‹</button>
        <button type="button" class="ko-btn ko-ana" id="koCal" aria-label="Duraklat">❚❚</button>
        <button type="button" class="ko-btn" id="koIleri" aria-label="Sonraki">››</button>
        <span class="ko-bosluk"></span>
        <button type="button" class="ko-btn ko-kapat" id="koKapat" aria-label="Dinlemeyi kapat">✕</button>
      </div>
      <div class="ko-not" id="koNot"></div>`;
    document.body.appendChild(c);
    c.querySelector('#koCal').onclick = ()=>{ if(ses.paused){ kullaniciDurdurdu = false; ses.play().catch(hataGoster); } else { kullaniciDurdurdu = true; ses.pause(); } };
    c.querySelector('#koKapat').onclick = ()=>{ durdur(); ses.removeAttribute('src'); try{ ses.load(); }catch(e){} };
    c.querySelector('#koGeri').onclick = ()=> adimla(-1);
    c.querySelector('#koIleri').onclick = ()=> adimla(1);
    const ilerleme = c.querySelector('#koIlerleme');
    ilerleme.oninput = ()=>{ if(ses.duration) ses.currentTime = ses.duration * ilerleme.value/1000; };
    return c;
  }
  function zamanYaz(s){ if(!isFinite(s)) return '--:--'; s = Math.floor(s); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), sn = s%60; return (h? h+':'+String(m).padStart(2,'0') : m) + ':' + String(sn).padStart(2,'0'); }
  function cubukGuncelle(){
    const c = document.getElementById('kuranOynatici'); if(!c || !durum) return;
    c.querySelector('#koKari').textContent = durum.kari.ad;
    const s = sureBilgisi(durum.sure);
    if(durum.kari.tur==='cuz') c.querySelector('#koYer').textContent = `${durum.cuz}. cüz · ${s ? s.tr+' Sûresi' : ''}`;
    else { const a = durum.sira[durum.i]; c.querySelector('#koYer').textContent = `${s ? s.tr : ''} · ${a.ayet===0 ? 'Besmele' : a.ayet+'. âyet'}`; }
    c.querySelector('#koCal').textContent = ses.paused ? '►' : '❚❚';
    c.querySelector('#koCal').setAttribute('aria-label', ses.paused ? 'Devam et' : 'Duraklat');
    c.querySelector('#koIlerlemeKutu').hidden = durum.kari.tur!=='cuz';
    c.querySelector('#koGeri').setAttribute('aria-label', durum.kari.tur==='cuz' ? '30 saniye geri' : 'Önceki âyet');
    c.querySelector('#koIleri').setAttribute('aria-label', durum.kari.tur==='cuz' ? '30 saniye ileri' : 'Sonraki âyet');
    document.body.classList.add('kuran-oynatici-acik');
    const dugme = document.getElementById('kuranDinleBtn');
    if(dugme){ dugme.classList.toggle('aktif', !ses.paused); dugme.querySelector('span').textContent = ses.paused ? 'Dinle' : 'Duraklat'; }
  }
  ses.addEventListener('timeupdate', ()=>{
    if(!durum || durum.kari.tur!=='cuz' || !ses.duration) return;
    const c = document.getElementById('kuranOynatici'); if(!c) return;
    c.querySelector('#koIlerleme').value = Math.round(ses.currentTime/ses.duration*1000);
    c.querySelector('#koZaman').textContent = `${zamanYaz(ses.currentTime)} / ${zamanYaz(ses.duration)}`;
  });
  ['play','pause'].forEach(o=> ses.addEventListener(o, cubukGuncelle));
  function notYaz(t){ const n = document.getElementById('koNot'); if(n) n.textContent = t || ''; }
  function hataGoster(e){
    if(e && e.name==='NotAllowedError'){ notYaz('Başlatmak için ► düğmesine dokunun.'); cubukGuncelle(); return; }
    notYaz('Ses yüklenemedi. İnternet bağlantınızı kontrol edin.');
  }
  ses.addEventListener('error', ()=>{
    // Kaynak boşaltılırken çıkan "boş kaynak" hatasını yok say
    const m = (ses.error && ses.error.message) || '';
    if(!durum || !ses.getAttribute('src') || /empty/i.test(m)) return;
    hataGoster();
  });

  /* ---------------- âyet âyet mod ---------------- */
  function ayetIsaretle(){
    document.querySelectorAll('.flow-entry.okunan-ayet').forEach(e=> e.classList.remove('okunan-ayet'));
    if(!durum || durum.kari.tur!=='ayet') return;
    const a = durum.sira[durum.i];
    const e = document.getElementById(a.ayet===0 ? 'ayet-besmele' : 'ayet-'+a.ayet);
    if(e && location.hash==='#/kuran/'+durum.sure){
      e.classList.add('okunan-ayet');
      const r = e.getBoundingClientRect();
      if(r.top < 150 || r.bottom > window.innerHeight - 170) e.scrollIntoView({behavior:'smooth', block:'center'});
    }
  }
  function siraKur(sure, baslangic){
    const n = (QURAN_DATA.content[sure] || []).length;
    const sira = [];
    if(sure!==1 && sure!==9 && baslangic<=1) sira.push({ayet:0});
    for(let a=Math.max(1,baslangic); a<=n; a++) sira.push({ayet:a});
    return sira;
  }
  function ayetCal(){
    const a = durum.sira[durum.i];
    // Besmele için Fâtiha'nın 1. âyeti (besmele) kaydı kullanılır
    ses.src = a.ayet===0 ? AYET_ADRESI(durum.kari.klasor, 1, 1) : AYET_ADRESI(durum.kari.klasor, durum.sure, a.ayet);
    const sonraki = durum.sira[durum.i+1];
    if(sonraki) onYukleme.src = AYET_ADRESI(durum.kari.klasor, durum.sure, sonraki.ayet||1);
    notYaz('');
    ses.play().catch(hataGoster);
    ayetIsaretle(); cubukGuncelle(); medyaOturumu();
  }
  ses.addEventListener('ended', ()=>{
    if(!durum || durum.kari.tur!=='ayet') { cubukGuncelle(); return; }
    if(durum.i < durum.sira.length-1){ durum.i++; ayetCal(); return; }
    // Sûre bitti: sonraki sûreye geç
    if(durum.sure < 114){
      const yeni = durum.sure + 1;
      durum = { kari:durum.kari, sure:yeni, sira:siraKur(yeni, 1), i:0 };
      otomatikGecis = true;
      if(location.hash.startsWith('#/kuran/')){ const s = sureBilgisi(yeni); if(s) renderSurah(s); }
      otomatikGecis = false;
      ayetCal();
    } else { durdur(); }
  });

  /* ---------------- cüz modu ---------------- */
  function cuzCal(sure, cuz, oran){
    durum = { kari:KARILER[0], sure, cuz };
    cubuk(); cubukGuncelle();
    notYaz(oran > 0.01 ? 'Kayıt cüz hâlindedir; sûrenin başına yaklaşık olarak gidildi. Gerekirse çubukla ileri-geri alın.' : 'Kayıt cüz hâlindedir.');
    ses.src = CUZ_ADRESI(cuz);
    const atla = ()=>{ ses.removeEventListener('loadedmetadata', atla); if(oran > 0.01 && ses.duration) ses.currentTime = Math.max(0, ses.duration*oran - 20); };
    ses.addEventListener('loadedmetadata', atla);
    ses.play().catch(hataGoster);
    medyaOturumu();
  }

  /* ---------------- genel ---------------- */
  function baslat(sure, ayet){
    kullaniciDurdurdu = false;
    const kari = kariSecili();
    cubuk();
    if(kari.tur==='cuz'){
      const cuz = cuzBul(sure, ayet || 1);
      const oran = (ayet && ayet>1) ? 0 : cuzIciOran(cuz, sure);
      cuzCal(sure, cuz, oran);
      return;
    }
    durum = { kari, sure, sira:siraKur(sure, ayet || 1), i:0 };
    ayetCal();
  }
  function adimla(yon){
    if(!durum) return;
    if(durum.kari.tur==='cuz'){ ses.currentTime = Math.max(0, ses.currentTime + yon*30); return; }
    const yeni = durum.i + yon;
    if(yeni < 0 || yeni >= durum.sira.length) return;
    durum.i = yeni; ayetCal();
  }
  function durdur(){
    ses.pause();
    durum = null;
    const c = document.getElementById('kuranOynatici'); if(c) c.remove();
    document.body.classList.remove('kuran-oynatici-acik');
    document.querySelectorAll('.flow-entry.okunan-ayet').forEach(e=> e.classList.remove('okunan-ayet'));
    const dugme = document.getElementById('kuranDinleBtn');
    if(dugme){ dugme.classList.remove('aktif'); dugme.querySelector('span').textContent = 'Dinle'; }
  }
  function medyaOturumu(){
    if(!('mediaSession' in navigator) || !durum) return;
    const s = sureBilgisi(durum.sure);
    try{
      navigator.mediaSession.metadata = new MediaMetadata({ title: `${s ? s.tr+' Sûresi' : ''}${durum.kari.tur==='cuz' ? ' · '+durum.cuz+'. cüz' : ''}`, artist: durum.kari.ad, album: "Kur'ân-ı Kerîm", artwork:[{src:'assets/icon-512.png', sizes:'512x512', type:'image/png'}] });
      navigator.mediaSession.setActionHandler('previoustrack', ()=> adimla(-1));
      navigator.mediaSession.setActionHandler('nexttrack', ()=> adimla(1));
    }catch(e){}
  }

  // Sûre sayfası açıldığında çağrılır: kâri kartları ve Dinle düğmesi
  function sayfaHazirla(s){
    const yer = document.getElementById('kuranKariler'); if(!yer) return;
    const secili = kariSecili();
    yer.innerHTML = `<div class="kuran-kariler" role="radiogroup" aria-label="Okuyan kâri">${KARILER.map(k=>`
        <button type="button" class="kari-kart${k.id===secili.id?' secili':''}" role="radio" aria-checked="${k.id===secili.id}" data-kari="${k.id}">
          <span class="kari-ad">${k.ad}</span><span class="kari-not">${k.kisaNot}</span>
        </button>`).join('')}</div>
      <div class="tp-kucuk kuran-dinle-ipucu">${secili.tur==='ayet' ? 'Bir âyetin numarasına dokunarak oradan dinlemeye başlayabilirsiniz.' : 'Bu kârinin kaydı cüz cüz yayımlanmıştır; sûrenin başına yaklaşık olarak gidilir.'}</div>`;
    yer.querySelectorAll('[data-kari]').forEach(b=> b.onclick = ()=>{
      if(b.dataset.kari===kariSecili().id) return;
      hafizaYaz('em_kari', b.dataset.kari);
      const calistir = durum && !ses.paused;
      durdur(); sayfaHazirla(s);
      if(calistir) baslat(s.no, 1);
    });
    const dugme = document.getElementById('kuranDinleBtn');
    if(dugme) dugme.onclick = ()=>{
      if(durum && durum.sure===s.no){ if(ses.paused){ kullaniciDurdurdu = false; ses.play().catch(hataGoster); } else { kullaniciDurdurdu = true; ses.pause(); } return; }
      baslat(s.no, 1);
    };
    document.querySelectorAll('[data-ayet-dinle]').forEach(b=> b.onclick = ()=>{
      const k = kariSecili();
      if(k.tur!=='ayet'){ bildirimGoster('Âyetten başlatma, âyet âyet okuyan kârilerde çalışır.'); return; }
      baslat(s.no, Number(b.dataset.ayetDinle));
    });
    if(durum && durum.sure===s.no){ cubukGuncelle(); ayetIsaretle(); }
  }
  // Rota değişince: Kur'ân dışına çıkılırsa ya da başka sûre elle açılırsa dur
  function rotaDegisti(yol){
    if(!durum || otomatikGecis) return;
    if(!yol.startsWith('kuran/')){ durdur(); return; }
    const no = Number(yol.split('/')[1]);
    if(no && no!==durum.sure) durdur();
  }
  return { sayfaHazirla, rotaDegisti, durdur, KARILER };
})();
