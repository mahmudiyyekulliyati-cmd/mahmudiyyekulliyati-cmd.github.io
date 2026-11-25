/* =====================================================================
   OKUMA ARAÇLARI
   - EkranAcik : vird okurken ekranın kararmasını/kapanmasını engeller (Wake Lock)
   - Zikirmatik: tesbîhât ve zikir sayacı
   Bu dosya ana betikten önce yüklenir; ana betikteki yardımcılar (hafizaOku,
   bildirimGoster vb.) sadece kullanıcı etkileşimi anında çağrılır.
   ===================================================================== */

/* ---------------- EKRANI AÇIK TUT ---------------- */
const EkranAcik = (()=>{
  let kilit = null, tercih = null;
  const destek = ()=> 'wakeLock' in navigator;
  const tercihOku = ()=>{ if(tercih===null) tercih = hafizaOku('em_ekran','0')==='1'; return tercih; };
  async function al(){
    if(!destek() || kilit) return;
    try{
      kilit = await navigator.wakeLock.request('screen');
      kilit.addEventListener('release', ()=>{ kilit = null; });
    }catch(e){ kilit = null; }
  }
  function birak(){ if(kilit){ try{ kilit.release(); }catch(e){} kilit = null; } }
  function gerekli(){ return (tercihOku() && !!document.getElementById('okumaAraclari')); }
  function uygula(){ if(gerekli()) al(); else birak(); guncelle(); }
  function guncelle(){
    const b = document.getElementById('ekranBtn');
    if(!b) return;
    const ac = tercihOku();
    b.classList.toggle('aktif', ac);
    b.setAttribute('aria-pressed', String(ac));
    b.title = ac ? 'Ekran açık tutuluyor (kapatmak için dokunun)' : 'Okurken ekranı açık tut';
  }
  function degistir(){
    if(!destek()){ bildirimGoster('Tarayıcınız ekranı açık tutma özelliğini desteklemiyor.'); return; }
    tercih = !tercihOku();
    hafizaYaz('em_ekran', tercih ? '1' : '0');
    uygula();
    bildirimGoster(tercih ? 'Vird sayfalarında ekran kararmayacak.' : 'Ekran normal ayarına döndü.');
  }
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') uygula(); });
  return { uygula, degistir, guncelle };
})();

/* ---------------- ZİKİRMATİK ---------------- */
const Zikirmatik = (()=>{
  const ZIKIRLER = [
    { id:'tesbihat', ad:'Namaz tesbîhâtı', adimlar:[
      {ad:'Sübhânallâh', ar:'سُبْحَانَ اللّٰهِ', hedef:33},
      {ad:'Elhamdülillâh', ar:'اَلْحَمْدُ لِلّٰهِ', hedef:33},
      {ad:'Allâhu ekber', ar:'اَللّٰهُ أَكْبَرُ', hedef:33} ] },
    { id:'tevhid', ad:'Kelime-i tevhîd', adimlar:[{ad:'Lâ ilâhe illallâh', ar:'لَا إِلٰهَ إِلَّا اللّٰهُ', hedef:100}] },
    { id:'istigfar', ad:'İstiğfâr', adimlar:[{ad:'Estağfirullâh', ar:'أَسْتَغْفِرُ اللّٰهَ', hedef:100}] },
    { id:'salavat', ad:'Salavât-ı şerîfe', adimlar:[{ad:'Allâhümme salli alâ seyyidinâ Muhammed', ar:'اَللّٰهُمَّ صَلِّ عَلٰى سَيِّدِنَا مُحَمَّدٍ', hedef:100}] },
    { id:'tesbih', ad:'Sübhânallâhi ve bihamdihî', adimlar:[{ad:'Sübhânallâhi ve bihamdihî', ar:'سُبْحَانَ اللّٰهِ وَبِحَمْدِه۪', hedef:100}] },
    { id:'havkale', ad:'Lâ havle', adimlar:[{ad:'Lâ havle ve lâ kuvvete illâ billâh', ar:'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللّٰهِ', hedef:100}] },
    { id:'serbest', ad:'Serbest', adimlar:[{ad:'Serbest zikir', ar:'', hedef:0}] },
  ];
  const CEVRE = 2*Math.PI*88;
  let d = null;
  function yukle(){
    if(d) return d;
    d = Object.assign({id:'tesbihat', adim:0, sayi:0, serbestHedef:0, toplam:0, titresim:true}, jsonOku('em_zikirmatik', {}));
    if(!ZIKIRLER.some(z=>z.id===d.id)){ d.id = 'tesbihat'; d.adim = 0; d.sayi = 0; }
    return d;
  }
  const kaydet = ()=> jsonYaz('em_zikirmatik', d);
  const zikir = ()=> ZIKIRLER.find(z=>z.id===d.id);
  const adim = ()=> zikir().adimlar[Math.min(d.adim, zikir().adimlar.length-1)];
  const hedef = ()=> d.id==='serbest' ? (Number(d.serbestHedef)||0) : adim().hedef;
  const sayiYaz = (n)=> Number(n).toLocaleString('tr-TR');
  const titret = (p)=>{ if(!d.titresim) return; try{ if(navigator.vibrate) navigator.vibrate(p); }catch(_){} };

  function ciz(){
    const o = document.getElementById('zkPencere'); if(!o) return;
    const z = zikir(), a = adim(), h = hedef();
    o.querySelectorAll('[data-zk-sec]').forEach(c=> c.classList.toggle('aktif', c.dataset.zkSec===d.id));
    o.querySelector('.zk-ar').textContent = a.ar || '';
    o.querySelector('.zk-ar').hidden = !a.ar;
    o.querySelector('.zk-ad').textContent = a.ad + (z.adimlar.length>1 ? ` · ${d.adim+1}/${z.adimlar.length}` : '');
    o.querySelector('.zk-sayi').textContent = sayiYaz(d.sayi);
    o.querySelector('.zk-hedef').textContent = h ? `/ ${h}` : 'hedefsiz';
    const oran = h ? Math.min(1, d.sayi/h) : (d.sayi % 100)/100;
    o.querySelector('.zk-halka-on').style.strokeDashoffset = String(CEVRE*(1-oran));
    o.querySelector('.zk-daire').classList.toggle('tamam', !!h && d.sayi>=h);
    o.querySelector('.zk-toplam').textContent = `Bugüne kadar toplam ${sayiYaz(d.toplam)} zikir`;
    o.querySelector('[data-zk="titresim"]').textContent = d.titresim ? 'Titreşim: açık' : 'Titreşim: kapalı';
    const hg = o.querySelector('.zk-serbest-hedef'); hg.hidden = d.id!=='serbest';
    const hi = o.querySelector('#zkHedefGir'); if(document.activeElement!==hi) hi.value = d.serbestHedef || '';
  }
  function say(){
    const z = zikir(), h = hedef();
    if(h && d.sayi >= h){
      // Hedef tamamlanmışsa: çok adımlıysa sonraki adıma geç, değilse yeniden başla
      if(d.adim < z.adimlar.length-1){ d.adim++; d.sayi = 0; }
      else { d.adim = 0; d.sayi = 0; }
    }
    d.sayi++; d.toplam++;
    const yeniH = hedef();
    if(yeniH && d.sayi === yeniH){
      titret([70,50,70,50,120]);
      const sonAdim = d.adim >= z.adimlar.length-1;
      bildirimGoster(sonAdim ? `${z.ad} tamamlandı. Allah kabul etsin.` : `${adim().ad} tamamlandı. Sıradaki: ${z.adimlar[d.adim+1].ad}`);
      if(!sonAdim){ d.adim++; d.sayi = 0; }
    } else if(d.sayi % 33 === 0 || d.sayi % 100 === 0){ titret([40,40,40]); }
    else titret(14);
    kaydet(); ciz();
    const daire = document.querySelector('#zkPencere .zk-daire');
    if(daire){ daire.classList.remove('vurus'); void daire.offsetWidth; daire.classList.add('vurus'); }
  }
  function ac(){
    yukle();
    kapat();
    const o = document.createElement('div');
    o.id = 'zkPencere'; o.className = 'zk-arka';
    o.innerHTML = `<div class="zk-pencere" role="dialog" aria-modal="true" aria-labelledby="zkBaslik">
      <div class="zk-bas"><h3 id="zkBaslik">Zikirmatik</h3><button type="button" class="modal-close" data-zk="kapat" aria-label="Kapat">✕</button></div>
      <div class="zk-secimler" role="group" aria-label="Zikir seçimi">${ZIKIRLER.map(z=>`<button type="button" class="zk-cip" data-zk-sec="${z.id}">${z.ad}</button>`).join('')}</div>
      <div class="zk-zikir"><div class="zk-ar" dir="rtl"></div><div class="zk-ad"></div></div>
      <button type="button" class="zk-daire" aria-label="Zikri say (boşluk tuşu da sayar)">
        <svg class="zk-halka" viewBox="0 0 200 200" aria-hidden="true">
          <circle class="zk-halka-arka" cx="100" cy="100" r="88"/>
          <circle class="zk-halka-on" cx="100" cy="100" r="88" style="stroke-dasharray:${CEVRE};stroke-dashoffset:${CEVRE}"/>
        </svg>
        <span class="zk-ic"><span class="zk-sayi">0</span><span class="zk-hedef"></span><span class="zk-dokun">dokunun</span></span>
      </button>
      <div class="zk-serbest-hedef" hidden><label for="zkHedefGir">Hedef sayı</label><input id="zkHedefGir" type="number" min="0" max="100000" inputmode="numeric" placeholder="ör. 1000"></div>
      <div class="zk-alt">
        <button type="button" class="tp-btn" data-zk="sifirla">Sıfırla</button>
        <button type="button" class="tp-btn" data-zk="titresim"></button>
      </div>
      <div class="zk-toplam tp-kucuk"></div>
    </div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e=>{
      if(e.target===o){ kapat(); return; }
      const sec = e.target.closest('[data-zk-sec]');
      if(sec){ if(sec.dataset.zkSec!==d.id){ d.id = sec.dataset.zkSec; d.adim = 0; d.sayi = 0; kaydet(); ciz(); } return; }
      const b = e.target.closest('[data-zk]');
      if(b){
        if(b.dataset.zk==='kapat') kapat();
        else if(b.dataset.zk==='sifirla'){ d.adim = 0; d.sayi = 0; kaydet(); ciz(); }
        else if(b.dataset.zk==='titresim'){ d.titresim = !d.titresim; kaydet(); ciz(); }
        return;
      }
      if(e.target.closest('.zk-daire')) say();
    });
    o.querySelector('#zkHedefGir').oninput = (e)=>{ d.serbestHedef = Math.max(0, Math.min(100000, parseInt(e.target.value,10)||0)); kaydet(); ciz(); };
    o.addEventListener('keydown', e=>{
      if(e.key==='Escape'){ kapat(); return; }
      if((e.key===' ' || e.key==='Enter') && !e.target.matches('input, .zk-cip, [data-zk]')){ e.preventDefault(); say(); }
    });
    document.body.classList.add('zk-acik');
    ciz();
    o.querySelector('.zk-daire').focus();
  }
  function kapat(){ const o = document.getElementById('zkPencere'); if(o) o.remove(); document.body.classList.remove('zk-acik'); }
  return { ac, kapat };
})();
