/* =====================================================================
   YAZILAR VE MÜZÂKERE (yönetici yazıları + üye yorumları)
   ---------------------------------------------------------------------
   Çalışma şekilleri:
   - FIREBASE_AYARLARI doluysa  → gerçek üyelik ve canlı yorumlar (Firebase).
   - Boşsa ve site yerelde açılmışsa (localhost / dosya) → DENEME MODU:
     veriler sadece o tarayıcıda saklanır, tasarımı görmek içindir.
   - Boşsa ve site yayındaysa → bölüm gizlenir.
   Kurulum adımları: YAYIN-REHBERI.md → "Yazılar ve yorumlar bölümünü açmak".
   ===================================================================== */
// Sohbet odaları: yeni oda eklemek için bu listeye satır eklemeniz yeterlidir
// (kimlik küçük harf, rakam ve tire içermeli; örn. 'hatim').
const SOHBET_ODALARI = [
  {id:'genel', ad:'Genel Sohbet', aciklama:'Selâmlaşma ve hayırlı sohbetler'},
  {id:'dua', ad:'Duâ İstekleri', aciklama:'Duâ isteyin, kardeşleriniz için duâ edin'},
  {id:'vird', ad:'Vird Arkadaşlığı', aciklama:'Birlikte vird, hatim ve zikir takibi'},
  {id:'soru', ad:'Soru & Cevap', aciklama:'Site ve virdlerle ilgili sorular (fetvâ yerine geçmez)'},
];
// Sesli sohbet odaları (en fazla SES_AZAMI kişi). Yeni oda için satır eklemek yeterlidir.
const SESLI_ODALAR = [
  {id:'sesli-sohbet', ad:'Sesli Sohbet', aciklama:'Kardeşlerinizle sesli sohbet edin'},
  {id:'sesli-zikir', ad:'Sesli Zikir & Hatim', aciklama:'Birlikte zikir, tesbîhât ve hatim'},
  {id:'sesli-ders', ad:'Sesli Ders Halkası', aciklama:'Kitap okuma ve müzâkere'},
];
const Topluluk = (()=>{
  const SES_AZAMI = 8;
  const SES_AKTIF_MS = 60000;      // bu süre içinde nabız atmayan katılımcı odada sayılmaz
  let sesli = null;                // aktif sesli oda durumu
  const FIREBASE_SURUM = '10.12.2';
  const YORUM_AZAMI = 2000;
  const ETIKETLER = ['Yazı','Duyuru','Hatırlatma','Soru-Cevap'];

  let arka = null;          // seçili altyapı (firebase / demo)
  let hazirlaniyor = null;
  let kullanici = null;     // {uid, isim, eposta, yonetici, dogrulandi}
  let ayarlar = {yorumOnayi:false};
  let gorunum = null;       // {tur:'liste'} | {tur:'yazi', id}
  let dinleyiciler = [];
  const MESAJ_AZAMI = 500;
  let sonMesajZamani = 0;
  let gorulduZamanlayici = null;

  /* ---------------- yardımcılar ---------------- */
  function mod(){
    if(typeof FIREBASE_AYARLARI !== 'undefined' && FIREBASE_AYARLARI && FIREBASE_AYARLARI.apiKey) return 'firebase';
    if(location.protocol==='file:' || ['localhost','127.0.0.1','[::1]'].includes(location.hostname)) return 'demo';
    return 'kapali';
  }
  function acikMi(){ return mod()!=='kapali'; }
  function temizle(){ dinleyiciler.forEach(f=>{ try{ f(); }catch(e){} }); dinleyiciler = []; sesliAyril(true); }
  function esc(s){ return escapeHtml(s==null ? '' : s); }
  function icerik(){ return document.getElementById('content'); }
  function hataMesaji(e){
    const k = (e && (e.code || e.message)) || '';
    const tablo = {
      'auth/invalid-email':'E-posta adresi geçersiz.',
      'auth/missing-password':'Lütfen şifrenizi yazın.',
      'auth/weak-password':'Şifre en az 6 karakter olmalı.',
      'auth/email-already-in-use':'Bu e-posta ile zaten bir hesap var. "Giriş yap" sekmesini kullanın.',
      'auth/invalid-credential':'E-posta veya şifre hatalı.',
      'auth/wrong-password':'E-posta veya şifre hatalı.',
      'auth/user-not-found':'Bu e-posta ile kayıtlı hesap bulunamadı.',
      'auth/too-many-requests':'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.',
      'auth/popup-closed-by-user':'Giriş penceresi kapatıldı.',
      'auth/popup-blocked':'Tarayıcı giriş penceresini engelledi. Açılır pencerelere izin verip tekrar deneyin.',
      'auth/requires-recent-login':'Güvenlik için önce çıkış yapıp tekrar giriş yapmanız, ardından bu işlemi tekrarlamanız gerekiyor.',
      'auth/network-request-failed':'İnternet bağlantısı kurulamadı.',
      'permission-denied':'Bu işlem için yetkiniz yok.',
    };
    for(const anahtar in tablo){ if(k.includes(anahtar)) return tablo[anahtar]; }
    return 'Bir hata oluştu. Lütfen tekrar deneyin.';
  }
  function tarihYaz(t){
    if(!t) return 'az önce';
    const d = t instanceof Date ? t : new Date(t);
    const fark = (Date.now() - d.getTime())/1000;
    if(fark < 60) return 'az önce';
    if(fark < 3600) return Math.floor(fark/60)+' dakika önce';
    if(fark < 86400) return Math.floor(fark/3600)+' saat önce';
    if(fark < 172800) return 'dün';
    if(fark < 604800) return Math.floor(fark/86400)+' gün önce';
    return `${d.getDate()} ${MILADI_AYLAR[d.getMonth()]} ${d.getFullYear()}`;
  }
  function tamTarih(t){
    if(!t) return '';
    const d = t instanceof Date ? t : new Date(t);
    return `${d.getDate()} ${MILADI_AYLAR[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  // Yönetici yazıları: paragraflar, satır sonları, **kalın** ve bağlantılar desteklenir.
  function yaziBicimle(metin){
    return String(metin||'').split(/\n{2,}/).map(p=>{
      let h = esc(p.trim());
      h = h.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
      h = h.replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener nofollow">$1</a>');
      return h ? `<p>${h.replace(/\n/g,'<br>')}</p>` : '';
    }).join('');
  }
  // Üye yorumları: yalnızca düz metin ve satır sonları (bağlantı yok — istenmeyen reklamı önler).
  function yorumBicimle(metin){
    return String(metin||'').split(/\n{2,}/).map(p=>`<p>${esc(p.trim()).replace(/\n/g,'<br>')}</p>`).join('');
  }
  function ozet(metin, n){
    const t = String(metin||'').replace(/\*\*/g,'').replace(/\s+/g,' ').trim();
    return t.length > n ? t.slice(0, n).replace(/\s\S*$/,'') + '…' : t;
  }
  // Veritabanı kurallarıyla aynı: üyeler yönetici izlenimi veren isim alamaz.
  function isimYasak(isim){ return !(kullanici && kullanici.yonetici) && /(y[oö]net|admin|moderat|site sahib)/.test(String(isim||'').toLocaleLowerCase('tr')); }
  const ISIM_YASAK_MESAJ = 'Bu isim, yönetim ile karıştırılabileceği için kullanılamaz.';
  function basHarf(isim){ return esc((String(isim||'?').trim()[0] || '?').toLocaleUpperCase('tr')); }

  /* ---------------- altyapı: FIREBASE ---------------- */
  async function firebaseArka(){
    const B = `https://www.gstatic.com/firebasejs/${FIREBASE_SURUM}/`;
    const [appM, authM, fsM] = await Promise.all([
      import(B+'firebase-app.js'), import(B+'firebase-auth.js'), import(B+'firebase-firestore.js')
    ]);
    const app = appM.initializeApp(FIREBASE_AYARLARI);
    const auth = authM.getAuth(app);
    auth.languageCode = 'tr';
    const db = fsM.getFirestore(app);
    const { collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
            onSnapshot, query, where, orderBy, limit, serverTimestamp, getCountFromServer } = fsM;
    const tarihAl = (v)=> v && v.toDate ? v.toDate() : (v || null);
    const yaziCevir = (s)=>{ const d = s.data({serverTimestamps:'estimate'}); return {id:s.id, ...d, tarih:tarihAl(d.tarih), duzenlendi:tarihAl(d.duzenlendi)}; };
    const yorumCevir = (s)=>{ const d = s.data({serverTimestamps:'estimate'}); return {id:s.id, ...d, tarih:tarihAl(d.tarih)}; };
    let oturumCb = null;
    async function yay(u){
      if(!oturumCb) return;
      if(!u){ oturumCb(null); return; }
      let yonetici = false;
      try{ yonetici = (await getDoc(doc(db,'yoneticiler',u.uid))).exists(); }catch(e){}
      // İlk girişte herkese açık profil oluşturulur (e-posta adresi profilde tutulmaz)
      try{
        const pr = doc(db,'profiller',u.uid);
        if(!(await getDoc(pr)).exists()){
          await setDoc(pr, { isim:(u.displayName||'Üye').slice(0,40), hakkinda:'', sehir:'', katilim:serverTimestamp(), sonGorulme:serverTimestamp() });
        }
      }catch(_){}
      oturumCb({ uid:u.uid, isim:u.displayName || 'Üye', eposta:u.email,
                 yonetici, dogrulandi: !!u.emailVerified });
    }
    return {
      tur:'firebase',
      oturumDinle(cb){ oturumCb = cb; authM.onAuthStateChanged(auth, yay); },
      girisGoogle(){ return authM.signInWithPopup(auth, new authM.GoogleAuthProvider()); },
      girisEposta(e,p){ return authM.signInWithEmailAndPassword(auth, e, p); },
      async kayitEposta(isim, e, p){
        const c = await authM.createUserWithEmailAndPassword(auth, e, p);
        await authM.updateProfile(c.user, {displayName:isim});
        try{ await setDoc(doc(db,'profiller',c.user.uid), {isim:isim.slice(0,40)}, {merge:true}); }catch(_){}
        try{ await authM.sendEmailVerification(c.user); }catch(_){}
        await yay(auth.currentUser);
      },
      sifreSifirla(e){ return authM.sendPasswordResetEmail(auth, e); },
      dogrulamaGonder(){ return authM.sendEmailVerification(auth.currentUser); },
      async dogrulamaYenile(){ await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); await yay(auth.currentUser); },
      async isimDegistir(isim){ await authM.updateProfile(auth.currentUser, {displayName:isim}); try{ await setDoc(doc(db,'profiller',auth.currentUser.uid), {isim:isim.slice(0,40)}, {merge:true}); }catch(_){} await yay(auth.currentUser); },
      cikis(){ return authM.signOut(auth); },
      async hesabiSil(){
        const u = auth.currentUser;
        const yazilar = await getDocs(collection(db,'yazilar'));
        for(const y of yazilar.docs){
          const benim = await getDocs(query(collection(db,'yazilar',y.id,'yorumlar'), where('uid','==',u.uid)));
          for(const d of benim.docs) await deleteDoc(d.ref);
          try{ await deleteDoc(doc(db,'yazilar',y.id,'tesekkurler',u.uid)); }catch(_){}
        }
        for(const oda of SOHBET_ODALARI){
          try{ const benim = await getDocs(query(collection(db,'odalar',oda.id,'mesajlar'), where('uid','==',u.uid))); for(const d of benim.docs) await deleteDoc(d.ref); }catch(_){}
        }
        for(const oda of SESLI_ODALAR){ try{ await deleteDoc(doc(db,'sesOdalari',oda.id,'katilimcilar',u.uid)); }catch(_){} }
        try{ await deleteDoc(doc(db,'profiller',u.uid)); }catch(_){}
        await u.delete();
      },
      async ayarlarGetir(){
        try{ const s = await getDoc(doc(db,'ayarlar','genel')); return s.exists() ? s.data() : {yorumOnayi:false}; }
        catch(e){ return {yorumOnayi:false}; }
      },
      ayarKaydet(o){ return setDoc(doc(db,'ayarlar','genel'), o, {merge:true}); },
      yazilariDinle(cb, hata){
        return onSnapshot(query(collection(db,'yazilar'), orderBy('tarih','desc'), limit(50)),
          s=> cb(s.docs.map(yaziCevir)), hata);
      },
      async sonYazi(){
        const s = await getDocs(query(collection(db,'yazilar'), orderBy('tarih','desc'), limit(1)));
        return s.docs.length ? yaziCevir(s.docs[0]) : null;
      },
      async yaziGetir(id){ const s = await getDoc(doc(db,'yazilar',id)); return s.exists() ? yaziCevir(s) : null; },
      async yaziEkle(o){ const r = await addDoc(collection(db,'yazilar'), {...o, tarih:serverTimestamp()}); return r.id; },
      yaziGuncelle(id, o){ return updateDoc(doc(db,'yazilar',id), {...o, duzenlendi:serverTimestamp()}); },
      async yaziSil(id){
        for(const alt of ['yorumlar','tesekkurler']){
          const s = await getDocs(collection(db,'yazilar',id,alt));
          for(const d of s.docs) await deleteDoc(d.ref);
        }
        await deleteDoc(doc(db,'yazilar',id));
      },
      yorumlariDinle(yaziId, cb, hata){
        const kayit = {}; const parcalar = [];
        const yayinla = ()=>{
          const tum = {}; parcalar.forEach(p=> Object.assign(tum, p));
          cb(Object.values(tum).sort((a,b)=>(a.tarih||0)-(b.tarih||0)));
        };
        const dinle = (q)=>{
          const i = parcalar.length; parcalar.push({});
          return onSnapshot(q, s=>{ const m = {}; s.docs.forEach(d=> m[d.id] = yorumCevir(d)); parcalar[i] = m; yayinla(); }, hata);
        };
        const col = collection(db,'yazilar',yaziId,'yorumlar');
        const kapat = [];
        if(kullanici && kullanici.yonetici){ kapat.push(dinle(col)); }
        else {
          kapat.push(dinle(query(col, where('durum','==','yayinda'))));
          if(kullanici) kapat.push(dinle(query(col, where('uid','==',kullanici.uid))));
        }
        return ()=> kapat.forEach(f=>f());
      },
      async yorumSayisi(yaziId){
        try{ const s = await getCountFromServer(query(collection(db,'yazilar',yaziId,'yorumlar'), where('durum','==','yayinda'))); return s.data().count; }
        catch(e){ return null; }
      },
      yorumEkle(yaziId, metin){
        return addDoc(collection(db,'yazilar',yaziId,'yorumlar'), {
          uid:kullanici.uid, isim:kullanici.isim.slice(0,60), metin,
          durum: ayarlar.yorumOnayi ? 'bekliyor' : 'yayinda', tarih:serverTimestamp()
        });
      },
      yorumDurum(yaziId, yorumId, durum){ return updateDoc(doc(db,'yazilar',yaziId,'yorumlar',yorumId), {durum}); },
      yorumSil(yaziId, yorumId){ return deleteDoc(doc(db,'yazilar',yaziId,'yorumlar',yorumId)); },
      yorumBildir(yaziId, yorumId, neden){
        return addDoc(collection(db,'bildirimler'), {yaziId, yorumId, uid:kullanici.uid, neden:String(neden||'').slice(0,300), tarih:serverTimestamp()});
      },
      async tesekkurDurumu(yaziId){
        let sayi = 0, benim = false;
        try{ sayi = (await getCountFromServer(collection(db,'yazilar',yaziId,'tesekkurler'))).data().count; }catch(e){}
        if(kullanici){ try{ benim = (await getDoc(doc(db,'yazilar',yaziId,'tesekkurler',kullanici.uid))).exists(); }catch(e){} }
        return {sayi, benim};
      },
      async tesekkurDegistir(yaziId, benim){
        const r = doc(db,'yazilar',yaziId,'tesekkurler',kullanici.uid);
        if(benim) await deleteDoc(r); else await setDoc(r, {tarih:serverTimestamp()});
      },
      async bildirimleriGetir(){
        const s = await getDocs(query(collection(db,'bildirimler'), orderBy('tarih','desc'), limit(50)));
        return s.docs.map(d=>({id:d.id, ...d.data(), tarih:tarihAl(d.data().tarih)}));
      },
      bildirimSil(id){ return deleteDoc(doc(db,'bildirimler',id)); },
      async profilGetir(uid){
        const sn = await getDoc(doc(db,'profiller',uid));
        if(!sn.exists()) return null;
        const v = sn.data({serverTimestamps:'estimate'});
        return {uid, ...v, katilim:tarihAl(v.katilim), sonGorulme:tarihAl(v.sonGorulme)};
      },
      async profilKaydet(o){
        const u = auth.currentUser;
        await setDoc(doc(db,'profiller',u.uid), {isim:o.isim, hakkinda:o.hakkinda||'', sehir:o.sehir||''}, {merge:true});
        if(o.isim && o.isim!==u.displayName){ await authM.updateProfile(u, {displayName:o.isim}); await yay(u); }
      },
      async gorulduIsaretle(){
        if(!auth.currentUser) return;
        try{ await setDoc(doc(db,'profiller',auth.currentUser.uid), {sonGorulme:serverTimestamp()}, {merge:true}); }catch(_){}
      },
      async cevrimiciSayisi(){
        try{
          const esik = fsM.Timestamp.fromDate(new Date(Date.now() - 5*60000));
          return (await getCountFromServer(query(collection(db,'profiller'), where('sonGorulme','>',esik)))).data().count;
        }catch(e){ return null; }
      },
      mesajlariDinle(odaId, cb, hata){
        return onSnapshot(query(collection(db,'odalar',odaId,'mesajlar'), orderBy('tarih','desc'), limit(100)),
          sn=> cb(sn.docs.map(yorumCevir).reverse()), hata);
      },
      mesajGonder(odaId, metin){
        return addDoc(collection(db,'odalar',odaId,'mesajlar'), {uid:kullanici.uid, isim:kullanici.isim.slice(0,60), metin, tarih:serverTimestamp()});
      },
      mesajSil(odaId, id){ return deleteDoc(doc(db,'odalar',odaId,'mesajlar',id)); },
      mesajBildir(odaId, mesajId, neden){
        return addDoc(collection(db,'bildirimler'), {odaId, mesajId, uid:kullanici.uid, neden:String(neden||'').slice(0,300), tarih:serverTimestamp()});
      },
      async odaOzeti(odaId){
        try{ const sn = await getDocs(query(collection(db,'odalar',odaId,'mesajlar'), orderBy('tarih','desc'), limit(1))); return sn.docs.length ? yorumCevir(sn.docs[0]) : null; }
        catch(e){ return null; }
      },
      ses: {
        tokenAl(){ return auth.currentUser.getIdToken(); },
        katil(odaId, oturum, sessiz){
          const u = auth.currentUser;
          return setDoc(doc(db,'sesOdalari',odaId,'katilimcilar',u.uid),
            {isim:kullanici.isim.slice(0,60), oturum, sessiz:!!sessiz, giris:serverTimestamp(), sonGorulme:serverTimestamp()});
        },
        nabiz(odaId, sessiz){
          return updateDoc(doc(db,'sesOdalari',odaId,'katilimcilar',auth.currentUser.uid), {sessiz:!!sessiz, sonGorulme:serverTimestamp()});
        },
        async ayril(odaId){
          const u = auth.currentUser; if(!u) return;
          try{ await deleteDoc(doc(db,'sesOdalari',odaId,'katilimcilar',u.uid)); }catch(_){}
          try{ const sn = await getDocs(query(collection(db,'sesOdalari',odaId,'sinyaller'), where('kimden','==',u.uid))); for(const d of sn.docs) deleteDoc(d.ref).catch(()=>{}); }catch(_){}
        },
        cikar(odaId, uid){ return deleteDoc(doc(db,'sesOdalari',odaId,'katilimcilar',uid)); },
        katilimcilariDinle(odaId, cb, hata){
          return onSnapshot(collection(db,'sesOdalari',odaId,'katilimcilar'), sn=> cb(sn.docs.map(d=>{
            const v = d.data({serverTimestamps:'estimate'});
            return {uid:d.id, isim:v.isim, oturum:v.oturum, sessiz:!!v.sessiz, giris:tarihAl(v.giris), sonGorulme:tarihAl(v.sonGorulme)};
          })), hata);
        },
        async aktifSayisi(odaId){
          try{
            const esik = fsM.Timestamp.fromDate(new Date(Date.now() - SES_AKTIF_MS));
            return (await getCountFromServer(query(collection(db,'sesOdalari',odaId,'katilimcilar'), where('sonGorulme','>',esik)))).data().count;
          }catch(e){ return null; }
        },
        adaptor(odaId, oturum){
          const uid = auth.currentUser.uid;
          return {
            sinyalGonder(kime, hedefOturum, tur, veri){
              return addDoc(collection(db,'sesOdalari',odaId,'sinyaller'), {kimden:uid, kime, tur, veri, oturum, hedefOturum, tarih:serverTimestamp()});
            },
            sinyalleriDinle(cb){
              return onSnapshot(query(collection(db,'sesOdalari',odaId,'sinyaller'), where('kime','==',uid)), sn=>{
                const l = sn.docChanges().filter(c=>c.type==='added').map(c=>{ const v = c.doc.data({serverTimestamps:'estimate'}); return {id:c.doc.id, ...v, tarih:tarihAl(v.tarih)}; });
                if(l.length) cb(l);
              }, ()=>{});
            },
            sinyalSil(id){ return deleteDoc(doc(db,'sesOdalari',odaId,'sinyaller',id)); },
          };
        },
      },
    };
  }

  /* ---------------- altyapı: DENEME MODU (sadece bu tarayıcı) ---------------- */
  function demoArka(){
    const ANAHTAR = 'em_demo_topluluk', KUL = 'em_demo_kullanici';
    const oku = ()=>{
      let v = null; try{ v = JSON.parse(localStorage.getItem(ANAHTAR)); }catch(e){}
      if(!v){
        const t = Date.now();
        v = { ayarlar:{yorumOnayi:false}, bildirimler:[], tesekkur:{ornek:['demo-2','demo-3']},
          yazilar:[{ id:'ornek', etiket:'Duyuru', yazar:'Site Yönetimi', tarih:t-86400000*2,
            baslik:'Yazılar ve Müzâkere bölümüne hoş geldiniz',
            govde:'Bu bölümde site yönetimi zaman zaman duyurular, hatırlatmalar ve faydalı yazılar paylaşacaktır.\n\nÜye olan kardeşlerimiz yazıların altına yorum yazabilir, **«Allah razı olsun»** diyerek yazıya duâ ile karşılık verebilir.\n\nBu bir örnek yazıdır; deneme modunda yazdığınız her şey sadece bu tarayıcıda saklanır.' }],
          yorumlar:{ ornek:[
            {id:'y1', uid:'demo-2', isim:'Ahmet', metin:'Allah razı olsun, çok faydalı bir çalışma olmuş.', durum:'yayinda', tarih:t-86400000},
            {id:'y2', uid:'demo-3', isim:'Fatma', metin:'Âmîn. Günlük virdlerin tamamlanmasını sabırsızlıkla bekliyoruz.', durum:'yayinda', tarih:t-3600000*5},
          ]}
        };
        localStorage.setItem(ANAHTAR, JSON.stringify(v));
      }
      if(!v.mesajlar){
        const t = Date.now();
        v.mesajlar = {
          genel:[ {id:'m1', uid:'demo-2', isim:'Ahmet', metin:'Selâmün aleyküm kardeşler, hayırlı akşamlar.', tarih:t-3600000*3},
                  {id:'m2', uid:'demo-3', isim:'Fatma', metin:'Aleyküm selâm, hayırlı akşamlar. Bu gece Uyku virdini birlikte okuyalım inşâallah.', tarih:t-3600000*2} ],
          dua:[ {id:'m3', uid:'demo-2', isim:'Ahmet', metin:'Rahatsız olan annem için şifâ duâlarınızı rica ediyorum.', tarih:t-3600000*6} ],
        };
        v.profiller = v.profiller || {};
        localStorage.setItem(ANAHTAR, JSON.stringify(v));
      }
      return v;
    };
    const yaz = (v)=>{ localStorage.setItem(ANAHTAR, JSON.stringify(v)); abone.forEach(f=>f()); };
    let abone = [];
    const dinle = (f)=>{ abone.push(f); f(); return ()=>{ abone = abone.filter(x=>x!==f); }; };
    let oturumCb = null;
    const oturum = ()=>{ let k = null; try{ k = JSON.parse(localStorage.getItem(KUL)); }catch(e){} return k; };
    const oturumYay = ()=>{ if(oturumCb) oturumCb(oturum()); };
    const girisYap = (isim, eposta)=>{
      const k = { uid:'demo-'+aramaNormal(eposta||isim).replace(/[^a-z0-9]/g,''), isim:isim||'Deneme Üyesi', eposta:eposta||'', yonetici:false, dogrulandi:true };
      localStorage.setItem(KUL, JSON.stringify(k)); oturumYay();
    };
    const yeniId = ()=> Math.random().toString(36).slice(2,10);
    return {
      tur:'demo',
      oturumDinle(cb){ oturumCb = cb; oturumYay(); },
      async girisGoogle(){ girisYap('Deneme Üyesi', 'deneme@ornek.com'); },
      async girisEposta(e){ if(!e) throw {code:'auth/invalid-email'}; girisYap(e.split('@')[0], e); },
      async kayitEposta(isim, e){ if(!e) throw {code:'auth/invalid-email'}; girisYap(isim, e); },
      async sifreSifirla(){},
      async dogrulamaGonder(){}, async dogrulamaYenile(){},
      async isimDegistir(isim){ const k = oturum(); k.isim = isim; localStorage.setItem(KUL, JSON.stringify(k)); oturumYay(); },
      async cikis(){ localStorage.removeItem(KUL); oturumYay(); },
      async hesabiSil(){ const k = oturum(); const v = oku(); Object.keys(v.yorumlar).forEach(y=> v.yorumlar[y] = v.yorumlar[y].filter(c=>c.uid!==k.uid)); yaz(v); localStorage.removeItem(KUL); oturumYay(); },
      yoneticiDene(acik){ const k = oturum(); if(!k) return; k.yonetici = acik; localStorage.setItem(KUL, JSON.stringify(k)); oturumYay(); },
      async ayarlarGetir(){ return oku().ayarlar; },
      async ayarKaydet(o){ const v = oku(); v.ayarlar = {...v.ayarlar, ...o}; yaz(v); },
      yazilariDinle(cb){ return dinle(()=> cb(oku().yazilar.slice().sort((a,b)=>b.tarih-a.tarih).map(y=>({...y, tarih:new Date(y.tarih), duzenlendi:y.duzenlendi?new Date(y.duzenlendi):null})))); },
      async sonYazi(){ const l = oku().yazilar.slice().sort((a,b)=>b.tarih-a.tarih); return l[0] ? {...l[0], tarih:new Date(l[0].tarih)} : null; },
      async yaziGetir(id){ const y = oku().yazilar.find(x=>x.id===id); return y ? {...y, tarih:new Date(y.tarih), duzenlendi:y.duzenlendi?new Date(y.duzenlendi):null} : null; },
      async yaziEkle(o){ const v = oku(); const id = yeniId(); v.yazilar.push({...o, id, tarih:Date.now()}); yaz(v); return id; },
      async yaziGuncelle(id, o){ const v = oku(); const y = v.yazilar.find(x=>x.id===id); Object.assign(y, o, {duzenlendi:Date.now()}); yaz(v); },
      async yaziSil(id){ const v = oku(); v.yazilar = v.yazilar.filter(x=>x.id!==id); delete v.yorumlar[id]; yaz(v); },
      yorumlariDinle(yaziId, cb){
        return dinle(()=>{
          const k = oturum();
          const l = (oku().yorumlar[yaziId]||[]).filter(c=> c.durum==='yayinda' || (k && (k.yonetici || c.uid===k.uid)));
          cb(l.map(c=>({...c, tarih:new Date(c.tarih)})));
        });
      },
      async yorumSayisi(yaziId){ return (oku().yorumlar[yaziId]||[]).filter(c=>c.durum==='yayinda').length; },
      async yorumEkle(yaziId, metin){ const v = oku(); const k = oturum(); (v.yorumlar[yaziId] = v.yorumlar[yaziId]||[]).push({id:yeniId(), uid:k.uid, isim:k.isim, metin, durum:v.ayarlar.yorumOnayi?'bekliyor':'yayinda', tarih:Date.now()}); yaz(v); },
      async yorumDurum(yaziId, yorumId, durum){ const v = oku(); const c = (v.yorumlar[yaziId]||[]).find(x=>x.id===yorumId); if(c) c.durum = durum; yaz(v); },
      async yorumSil(yaziId, yorumId){ const v = oku(); v.yorumlar[yaziId] = (v.yorumlar[yaziId]||[]).filter(x=>x.id!==yorumId); yaz(v); },
      async yorumBildir(yaziId, yorumId, neden){ const v = oku(); v.bildirimler.unshift({id:yeniId(), yaziId, yorumId, uid:oturum().uid, neden, tarih:Date.now()}); yaz(v); },
      async tesekkurDurumu(yaziId){ const l = oku().tesekkur[yaziId]||[]; const k = oturum(); return {sayi:l.length, benim: !!(k && l.includes(k.uid))}; },
      async tesekkurDegistir(yaziId, benim){ const v = oku(); const k = oturum(); let l = v.tesekkur[yaziId]||[]; l = benim ? l.filter(u=>u!==k.uid) : l.concat(k.uid); v.tesekkur[yaziId] = l; yaz(v); },
      async bildirimleriGetir(){ return oku().bildirimler.map(b=>({...b, tarih:new Date(b.tarih)})); },
      async bildirimSil(id){ const v = oku(); v.bildirimler = v.bildirimler.filter(b=>b.id!==id); yaz(v); },
      async profilGetir(uid){
        const v = oku(); const k = oturum();
        const p = (v.profiller||{})[uid];
        if(p) return {uid, ...p, katilim:new Date(p.katilim), sonGorulme:new Date(p.sonGorulme||Date.now())};
        if(k && k.uid===uid) return {uid, isim:k.isim, hakkinda:'', sehir:'', katilim:new Date(), sonGorulme:new Date()};
        const ornek = {'demo-2':{isim:'Ahmet', hakkinda:'Günlük virdlerimi buradan takip ediyorum.', sehir:'Konya'}, 'demo-3':{isim:'Fatma', hakkinda:'', sehir:'İstanbul'}}[uid];
        return ornek ? {uid, ...ornek, katilim:new Date(Date.now()-86400000*30), sonGorulme:new Date(Date.now()-600000)} : null;
      },
      async profilKaydet(o){
        const v = oku(); const k = oturum(); v.profiller = v.profiller || {};
        const eski = v.profiller[k.uid] || {katilim:Date.now()};
        v.profiller[k.uid] = {...eski, isim:o.isim, hakkinda:o.hakkinda||'', sehir:o.sehir||'', sonGorulme:Date.now()};
        yaz(v);
        if(o.isim && o.isim!==k.isim){ k.isim = o.isim; localStorage.setItem(KUL, JSON.stringify(k)); oturumYay(); }
      },
      async gorulduIsaretle(){},
      async cevrimiciSayisi(){ return 3; },
      mesajlariDinle(odaId, cb){ return dinle(()=> cb(((oku().mesajlar||{})[odaId]||[]).slice(-100).map(m=>({...m, tarih:new Date(m.tarih)})))); },
      async mesajGonder(odaId, metin){ const v = oku(); const k = oturum(); (v.mesajlar[odaId] = v.mesajlar[odaId]||[]).push({id:yeniId(), uid:k.uid, isim:k.isim, metin, tarih:Date.now()}); yaz(v); },
      async mesajSil(odaId, id){ const v = oku(); v.mesajlar[odaId] = (v.mesajlar[odaId]||[]).filter(m=>m.id!==id); yaz(v); },
      async mesajBildir(odaId, mesajId, neden){ const v = oku(); v.bildirimler.unshift({id:yeniId(), odaId, mesajId, uid:oturum().uid, neden, tarih:Date.now()}); yaz(v); },
      async odaOzeti(odaId){ const l = (oku().mesajlar||{})[odaId] || []; const m = l[l.length-1]; return m ? {...m, tarih:new Date(m.tarih)} : null; },
    };
  }

  /* ---------------- hazırlık ---------------- */
  function hazirla(){
    if(arka) return Promise.resolve(arka);
    if(hazirlaniyor) return hazirlaniyor;
    hazirlaniyor = (async ()=>{
      if(mod()==='firebase') arka = await firebaseArka();
      else if(mod()==='demo') arka = demoArka();
      if(!arka) return null;
      ayarlar = await arka.ayarlarGetir();
      await new Promise(coz=>{
        let ilk = true;
        arka.oturumDinle(k=>{
          const onceki = JSON.stringify(kullanici);
          kullanici = k;
          if(k){
            arka.gorulduIsaretle();
            if(!gorulduZamanlayici) gorulduZamanlayici = setInterval(()=>{ if(kullanici && document.visibilityState==='visible') arka.gorulduIsaretle(); }, 120000);
          }
          if(ilk){ ilk = false; coz(); return; }
          if(onceki !== JSON.stringify(k)) yenidenCiz();
        });
      });
      return arka;
    })().catch(e=>{ hazirlaniyor = null; throw e; });
    return hazirlaniyor;
  }
  function yenidenCiz(){
    if(activeSection!=='yazilar' || !gorunum) return;
    if(gorunum.tur==='liste') renderListe(true);
    else if(gorunum.tur==='yazi') renderYazi(gorunum.id, true);
    else if(gorunum.tur==='sohbet') renderSohbetListe(true);
    else if(gorunum.tur==='oda') renderOda(gorunum.id, true);
    else if(gorunum.tur==='sesli'){ if(!sesli) renderSesliOda(gorunum.id, true); }
    else if(gorunum.tur==='profil') renderProfil(gorunum.id, true);
  }
  function yukleniyor(baslik){
    icerik().innerHTML = `<div class="crumb"><b>Yazılar</b></div><div class="tp-bos">${esc(baslik||'Yükleniyor…')}</div>${footerHtml()}`;
  }
  function baglantiHatasi(){
    icerik().innerHTML = `<div class="crumb"><b>Yazılar</b></div>
      <div class="empty-card"><div class="glyph">۞</div><h2>Bağlantı kurulamadı</h2><p>Yazılar şu an yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.</p></div>${footerHtml()}`;
  }

  /* ---------------- oturum çubuğu ---------------- */
  function oturumCubuguHtml(){
    const demoNot = arka && arka.tur==='demo' ? `<div class="tp-demo">
        <b>Deneme modu:</b> Firebase ayarları henüz girilmediği için bu bölüm sadece bu bilgisayarda örnek verilerle çalışıyor. Yayındaki sitede ziyaretçiler bunu görmez.
        ${kullanici ? `<label class="tp-demo-yonetici"><input type="checkbox" id="tpDemoYonetici" ${kullanici.yonetici?'checked':''}> Yönetici olarak dene</label>` : ''}
      </div>` : '';
    if(!kullanici){
      return `${demoNot}<div class="tp-oturum">
        <span>Yorum yazmak ve duâ ile karşılık vermek için üye olun.</span>
        <button class="tp-btn tp-btn-ana" data-tp="giris">Giriş yap / Üye ol</button>
      </div>`;
    }
    const dogrulama = (!kullanici.dogrulandi) ? `<div class="tp-uyari">
        E-posta adresinizi doğrulamanız gerekiyor. ${esc(kullanici.eposta)} adresine gönderilen bağlantıya tıklayın.
        <button class="tp-link" data-tp="dogrulama-gonder">Tekrar gönder</button> · <button class="tp-link" data-tp="dogrulama-yenile">Doğruladım</button>
      </div>` : '';
    return `${demoNot}<div class="tp-oturum">
        <span class="tp-avatar" aria-hidden="true">${basHarf(kullanici.isim)}</span>
        <span>Hoş geldiniz, <b>${esc(kullanici.isim)}</b>${kullanici.yonetici ? ' <span class="tp-rozet tp-rozet-yonetici">Yönetici</span>' : ''}</span>
        <span class="tp-bosluk"></span>
        <button class="tp-btn" data-tp="hesabim">Hesabım</button>
      </div>${dogrulama}`;
  }
  function oturumCubuguBagla(){
    const k = icerik();
    k.querySelectorAll('[data-tp="giris"]').forEach(b=> b.onclick = ()=> girisPenceresi());
    k.querySelectorAll('[data-tp="hesabim"]').forEach(b=> b.onclick = ()=> hesabimPenceresi());
    k.querySelectorAll('[data-tp="dogrulama-gonder"]').forEach(b=> b.onclick = async ()=>{
      try{ await arka.dogrulamaGonder(); bildirimGoster('Doğrulama e-postası gönderildi.'); }catch(e){ bildirimGoster(hataMesaji(e)); }
    });
    k.querySelectorAll('[data-tp="dogrulama-yenile"]').forEach(b=> b.onclick = async ()=>{
      try{ await arka.dogrulamaYenile(); if(!kullanici.dogrulandi) bildirimGoster('Henüz doğrulanmamış görünüyor. E-postadaki bağlantıya tıkladığınızdan emin olun.'); }
      catch(e){ bildirimGoster(hataMesaji(e)); }
    });
    const dy = document.getElementById('tpDemoYonetici');
    if(dy) dy.onchange = ()=> arka.yoneticiDene(dy.checked);
  }

  /* ---------------- pencereler (giriş, hesabım) ---------------- */
  function pencere(baslik, govdeHtml){
    pencereKapat();
    const o = document.createElement('div');
    o.className = 'tp-pencere-arka'; o.id = 'tpPencere';
    o.innerHTML = `<div class="tp-pencere" role="dialog" aria-modal="true" aria-labelledby="tpPencereBaslik">
      <div class="tp-pencere-bas"><h3 id="tpPencereBaslik">${baslik}</h3><button class="modal-close" data-tp="kapat" aria-label="Kapat">✕</button></div>
      <div class="tp-pencere-govde">${govdeHtml}</div></div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e=>{ if(e.target===o) pencereKapat(); });
    o.querySelector('[data-tp="kapat"]').onclick = pencereKapat;
    o.addEventListener('keydown', e=>{ if(e.key==='Escape') pencereKapat(); });
    const ilk = o.querySelector('input, button:not([data-tp="kapat"])'); if(ilk) ilk.focus();
    return o;
  }
  function pencereKapat(){ const o = document.getElementById('tpPencere'); if(o) o.remove(); }

  function girisPenceresi(sekme){
    sekme = sekme || 'giris';
    const googleBtn = `<button class="tp-btn tp-google" data-tp="google"><svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> Google ile devam et</button>`;
    const govde = `
      <div class="tp-sekmeler" role="tablist">
        <button role="tab" class="${sekme==='giris'?'aktif':''}" data-sekme="giris" aria-selected="${sekme==='giris'}">Giriş yap</button>
        <button role="tab" class="${sekme==='kayit'?'aktif':''}" data-sekme="kayit" aria-selected="${sekme==='kayit'}">Üye ol</button>
      </div>
      ${googleBtn}
      <div class="tp-ayirici"><span>veya e-posta ile</span></div>
      <form class="tp-form" id="tpGirisForm" novalidate>
        ${sekme==='kayit' ? `<div class="form-field"><label for="tpIsim">Görünecek isminiz</label><input id="tpIsim" maxlength="40" autocomplete="nickname" placeholder="Örn. Ahmet K." required></div>` : ''}
        <div class="form-field"><label for="tpEposta">E-posta</label><input id="tpEposta" type="email" autocomplete="email" required></div>
        <div class="form-field"><label for="tpSifre">Şifre</label><input id="tpSifre" type="password" autocomplete="${sekme==='kayit'?'new-password':'current-password'}" minlength="6" required></div>
        ${sekme==='kayit' ? `<label class="tp-onay"><input type="checkbox" id="tpKabul"> <span><a href="#/gizlilik" data-tp="gizlilik">Gizlilik ve Kullanım Şartları</a>'nı ve yorum âdâbını okudum, kabul ediyorum.</span></label>` : ''}
        <div class="tp-hata" id="tpHata" role="alert"></div>
        <button type="submit" class="tp-btn tp-btn-ana tp-genis">${sekme==='kayit'?'Üye ol':'Giriş yap'}</button>
        ${sekme==='giris' ? `<button type="button" class="tp-link" data-tp="sifre">Şifremi unuttum</button>` : ''}
      </form>`;
    const o = pencere('Üyelik', govde);
    const hata = (m)=>{ o.querySelector('#tpHata').textContent = m; };
    o.querySelectorAll('[data-sekme]').forEach(b=> b.onclick = ()=> girisPenceresi(b.dataset.sekme));
    o.querySelector('[data-tp="google"]').onclick = async ()=>{
      if(sekme==='kayit' && !o.querySelector('#tpKabul').checked){ hata('Devam etmek için Gizlilik ve Kullanım Şartları\'nı kabul etmelisiniz.'); return; }
      try{ await arka.girisGoogle(); pencereKapat(); bildirimGoster('Giriş yapıldı.'); }catch(e){ hata(hataMesaji(e)); }
    };
    const gz = o.querySelector('[data-tp="gizlilik"]'); if(gz) gz.onclick = ()=> pencereKapat();
    const sf = o.querySelector('[data-tp="sifre"]');
    if(sf) sf.onclick = async ()=>{
      const e = o.querySelector('#tpEposta').value.trim();
      if(!e){ hata('Önce e-posta adresinizi yazın.'); return; }
      try{ await arka.sifreSifirla(e); hata(''); bildirimGoster('Şifre yenileme bağlantısı e-postanıza gönderildi.'); }catch(err){ hata(hataMesaji(err)); }
    };
    o.querySelector('#tpGirisForm').onsubmit = async (ev)=>{
      ev.preventDefault();
      const e = o.querySelector('#tpEposta').value.trim(), p = o.querySelector('#tpSifre').value;
      const btn = ev.target.querySelector('button[type="submit"]');
      try{
        btn.disabled = true;
        if(sekme==='kayit'){
          const isim = o.querySelector('#tpIsim').value.trim();
          if(isim.length < 2){ hata('Lütfen en az 2 harfli bir isim yazın.'); return; }
          if(isimYasak(isim)){ hata(ISIM_YASAK_MESAJ); return; }
          if(!o.querySelector('#tpKabul').checked){ hata('Üye olmak için Gizlilik ve Kullanım Şartları\'nı kabul etmelisiniz.'); return; }
          await arka.kayitEposta(isim, e, p);
          pencereKapat();
          bildirimGoster(arka.tur==='firebase' ? 'Üyeliğiniz oluşturuldu. E-postanıza gelen doğrulama bağlantısına tıklayın.' : 'Üyeliğiniz oluşturuldu.');
        } else {
          await arka.girisEposta(e, p);
          pencereKapat(); bildirimGoster('Giriş yapıldı.');
        }
      }catch(err){ hata(hataMesaji(err)); }
      finally{ btn.disabled = false; }
    };
  }

  function hesabimPenceresi(){
    const govde = `
      <div class="form-field"><label for="tpYeniIsim">Görünecek isminiz</label><input id="tpYeniIsim" maxlength="40" value="${esc(kullanici.isim)}"></div>
      <button class="tp-btn" data-tp="isim-kaydet">İsmi kaydet</button>
      <a class="tp-btn" href="#/profil" data-tp="profil-git" style="margin-left:6px; text-decoration:none;">Profilime git</a>
      <p class="tp-kucuk">E-posta: ${esc(kullanici.eposta||'—')}</p>
      ${kullanici.yonetici ? '' : `<p class="tp-kucuk">Üye numaranız (yönetici yetkisi verilirken gerekir): <code>${esc(kullanici.uid)}</code></p>`}
      <div class="tp-pencere-alt">
        <button class="tp-btn" data-tp="cikis">Çıkış yap</button>
        <button class="tp-link tp-tehlike" data-tp="sil">Hesabımı ve yorumlarımı sil</button>
      </div>`;
    const o = pencere('Hesabım', govde);
    o.querySelector('[data-tp="isim-kaydet"]').onclick = async ()=>{
      const v = o.querySelector('#tpYeniIsim').value.trim();
      if(v.length < 2){ bildirimGoster('İsim en az 2 harf olmalı.'); return; }
      if(isimYasak(v)){ bildirimGoster(ISIM_YASAK_MESAJ); return; }
      try{ await arka.isimDegistir(v); pencereKapat(); bildirimGoster('İsminiz güncellendi. Yeni yorumlarınızda bu isim görünecek.'); }catch(e){ bildirimGoster(hataMesaji(e)); }
    };
    o.querySelector('[data-tp="profil-git"]').onclick = ()=> pencereKapat();
    o.querySelector('[data-tp="cikis"]').onclick = async ()=>{ await arka.cikis(); pencereKapat(); bildirimGoster('Çıkış yapıldı.'); };
    o.querySelector('[data-tp="sil"]').onclick = async ()=>{
      if(!confirm('Hesabınız ve yazdığınız tüm yorumlar kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?')) return;
      try{ await arka.hesabiSil(); pencereKapat(); bildirimGoster('Hesabınız silindi.'); }catch(e){ bildirimGoster(hataMesaji(e)); }
    };
  }

  /* ---------------- YAZI LİSTESİ ---------------- */
  async function renderListe(yenidenCizim){
    setRoute('yazilar');
    gorunum = {tur:'liste'}; temizle();
    if(!acikMi()){ kapaliSayfa(); return; }
    if(!arka){ yukleniyor(); try{ await hazirla(); }catch(e){ baglantiHatasi(); return; } }
    if(activeSection!=='yazilar' || !gorunum || gorunum.tur!=='liste') return;
    const y = yenidenCizim ? window.scrollY : 0;
    icerik().innerHTML = `
      <div class="crumb"><b>Topluluk</b><span class="sep">›</span>Yazılar</div>
      ${sekmelerHtml('yazilar')}
      <div class="tp-giris-kart">
        <span class="eyebrow">Yazılar ve Müzâkere</span>
        <h2>Duyurular, hatırlatmalar ve faydalı yazılar</h2>
        <p>Site yönetiminin paylaştığı yazıları okuyabilir, üye olarak altlarına yorum yazabilir ve «Allah razı olsun» diyerek duâ ile karşılık verebilirsiniz.</p>
      </div>
      ${oturumCubuguHtml()}
      ${kullanici && kullanici.yonetici ? yonetimPaneliHtml() : ''}
      <div id="tpYaziListesi" class="tp-liste"><div class="tp-bos">Yazılar yükleniyor…</div></div>
      ${footerHtml()}`;
    oturumCubuguBagla(); sekmeleriBagla();
    if(kullanici && kullanici.yonetici) yonetimPaneliBagla();
    window.scrollTo({top:y});
    const kutu = document.getElementById('tpYaziListesi');
    const sayaclar = {};
    dinleyiciler.push(arka.yazilariDinle(yazilar=>{
      if(!yazilar.length){ kutu.innerHTML = `<div class="tp-bos">Henüz yazı paylaşılmadı.</div>`; return; }
      kutu.innerHTML = yazilar.map(y=>`
        <article class="yazi-kart" data-id="${esc(y.id)}">
          <div class="yazi-kart-ust"><span class="tp-rozet">${esc(y.etiket||'Yazı')}</span><span class="tp-tarih" title="${esc(tamTarih(y.tarih))}">${esc(tarihYaz(y.tarih))}</span></div>
          <h3>${esc(y.baslik)}</h3>
          <p>${esc(ozet(y.govde, 220))}</p>
          <div class="yazi-kart-alt"><span class="tp-yorum-sayi" data-sayi="${esc(y.id)}">${sayaclar[y.id]!=null ? sayaclar[y.id]+' yorum' : ''}</span><span class="tp-devam">Devamını oku ›</span></div>
        </article>`).join('');
      kutu.querySelectorAll('.yazi-kart').forEach(k=> k.onclick = ()=> renderYazi(k.dataset.id));
      yazilar.forEach(async y=>{
        if(sayaclar[y.id]==null){ const n = await arka.yorumSayisi(y.id); if(n==null) return; sayaclar[y.id] = n; }
        const s = kutu.querySelector(`[data-sayi="${CSS.escape(y.id)}"]`); if(s) s.textContent = sayaclar[y.id] ? sayaclar[y.id]+' yorum' : 'Henüz yorum yok';
      });
    }, ()=>{ kutu.innerHTML = `<div class="tp-bos">Yazılar yüklenemedi. Bağlantınızı kontrol edin.</div>`; }));
  }

  /* ---------------- YÖNETİM PANELİ ---------------- */
  function yaziFormuHtml(y){
    return `<form class="tp-form tp-yazi-form" id="tpYaziForm">
      <div class="form-field"><label for="tpBaslik">Başlık</label><input id="tpBaslik" maxlength="160" required value="${esc(y?y.baslik:'')}"></div>
      <div class="form-field"><label for="tpEtiket">Tür</label><select id="tpEtiket">${ETIKETLER.map(e=>`<option${y&&y.etiket===e?' selected':''}>${e}</option>`).join('')}</select></div>
      <div class="form-field"><label for="tpGovde">Metin</label><textarea id="tpGovde" rows="9" required placeholder="Paragrafları boş satırla ayırın. **kalın** yazmak için yıldız kullanabilirsiniz.">${esc(y?y.govde:'')}</textarea></div>
      <div class="tp-satir"><button type="submit" class="tp-btn tp-btn-ana">${y?'Değişiklikleri kaydet':'Yayınla'}</button><button type="button" class="tp-btn" data-tp="vazgec">Vazgeç</button></div>
    </form>`;
  }
  function yaziFormuBagla(y, bitince){
    const f = document.getElementById('tpYaziForm');
    f.querySelector('[data-tp="vazgec"]').onclick = bitince;
    f.onsubmit = async (e)=>{
      e.preventDefault();
      const veri = { baslik:f.querySelector('#tpBaslik').value.trim(), etiket:f.querySelector('#tpEtiket').value, govde:f.querySelector('#tpGovde').value.trim(), yazar:'Site Yönetimi' };
      if(!veri.baslik || !veri.govde){ bildirimGoster('Başlık ve metin boş olamaz.'); return; }
      try{
        if(y){ await arka.yaziGuncelle(y.id, veri); bildirimGoster('Yazı güncellendi.'); bitince(); }
        else { const id = await arka.yaziEkle(veri); bildirimGoster('Yazı yayınlandı.'); renderYazi(id); }
      }catch(err){ bildirimGoster(hataMesaji(err)); }
    };
  }
  function yonetimPaneliHtml(){
    return `<div class="tp-yonetim">
      <div class="tp-yonetim-bas"><b>Yönetim</b>
        <button class="tp-btn tp-btn-ana" data-tp="yeni-yazi">+ Yeni yazı</button>
      </div>
      <div id="tpYeniYaziAlani"></div>
      <label class="tp-onay"><input type="checkbox" id="tpOnayAyar" ${ayarlar.yorumOnayi?'checked':''}> <span>Yorumlar yayınlanmadan önce yönetici onayı beklesin</span></label>
      <details class="tp-bildirimler" id="tpBildirimler"><summary>Şikâyet edilen yorumlar</summary><div class="tp-bildirim-liste">Yükleniyor…</div></details>
    </div>`;
  }
  function yonetimPaneliBagla(){
    const alan = document.getElementById('tpYeniYaziAlani');
    document.querySelector('[data-tp="yeni-yazi"]').onclick = ()=>{ alan.innerHTML = yaziFormuHtml(null); yaziFormuBagla(null, ()=>{ alan.innerHTML=''; }); alan.querySelector('input').focus(); };
    document.getElementById('tpOnayAyar').onchange = async (e)=>{
      try{ await arka.ayarKaydet({yorumOnayi:e.target.checked}); ayarlar.yorumOnayi = e.target.checked; bildirimGoster(e.target.checked ? 'Yeni yorumlar artık onayınızdan sonra yayınlanacak.' : 'Yorumlar artık hemen yayınlanacak.'); }
      catch(err){ bildirimGoster(hataMesaji(err)); e.target.checked = !e.target.checked; }
    };
    const det = document.getElementById('tpBildirimler');
    det.addEventListener('toggle', async ()=>{
      if(!det.open) return;
      const liste = det.querySelector('.tp-bildirim-liste');
      try{
        const l = await arka.bildirimleriGetir();
        if(!l.length){ liste.textContent = 'Şikâyet yok.'; return; }
        liste.innerHTML = l.map(b=>`<div class="tp-bildirim"><span>${esc(tarihYaz(b.tarih))} — ${esc(b.neden||'Sebep belirtilmedi')}</span>
          ${b.odaId ? `<button class="tp-link" data-oda-git="${esc(b.odaId)}">Sohbete git</button>` : `<button class="tp-link" data-git="${esc(b.yaziId)}">Yoruma git</button>`} · <button class="tp-link" data-kaldir="${esc(b.id)}">Kaldır</button></div>`).join('');
        liste.querySelectorAll('[data-git]').forEach(x=> x.onclick = ()=> renderYazi(x.dataset.git));
        liste.querySelectorAll('[data-oda-git]').forEach(x=> x.onclick = ()=> renderOda(x.dataset.odaGit));
        liste.querySelectorAll('[data-kaldir]').forEach(x=> x.onclick = async ()=>{ await arka.bildirimSil(x.dataset.kaldir); x.closest('.tp-bildirim').remove(); });
      }catch(e){ liste.textContent = hataMesaji(e); }
    });
  }

  /* ---------------- TEK YAZI + YORUMLAR ---------------- */
  async function renderYazi(id, yenidenCizim){
    setRoute('yazilar/'+encodeURIComponent(id));
    gorunum = {tur:'yazi', id}; temizle();
    if(!acikMi()){ kapaliSayfa(); return; }
    if(!arka || !yenidenCizim) yukleniyor();
    let y;
    try{ await hazirla(); y = await arka.yaziGetir(id); }catch(e){ baglantiHatasi(); return; }
    if(activeSection!=='yazilar' || !gorunum || gorunum.id!==id) return;
    if(!y){
      icerik().innerHTML = `<div class="crumb" id="tpGeri"><b>Yazılar</b></div><div class="empty-card"><div class="glyph">۞</div><h2>Yazı bulunamadı</h2><p>Bu yazı kaldırılmış olabilir.</p></div>${footerHtml()}`;
      document.getElementById('tpGeri').onclick = ()=> goSection('yazilar');
      return;
    }
    const kaydirma = yenidenCizim ? window.scrollY : 0;
    const yonetici = kullanici && kullanici.yonetici;
    icerik().innerHTML = `
      <div class="back-bar"><button class="back-btn" id="tpGeri">‹ Yazılar</button><span class="back-current">${esc(y.baslik)}</span></div>
      <article class="tp-yazi">
        <div class="yazi-kart-ust"><span class="tp-rozet">${esc(y.etiket||'Yazı')}</span><span class="tp-tarih">${esc(tamTarih(y.tarih))}${y.duzenlendi?' · düzenlendi':''}</span></div>
        <h2>${esc(y.baslik)}</h2>
        <div class="tp-yazar">${esc(y.yazar||'Site Yönetimi')}</div>
        <div class="tp-yazi-govde" id="tpYaziGovde">${yaziBicimle(y.govde)}</div>
        <div class="tp-yazi-aksiyon">
          <button class="tp-btn tp-tesekkur" id="tpTesekkur" aria-pressed="false">🤲 Allah razı olsun <span id="tpTesekkurSayi"></span></button>
          <button class="tp-btn" id="tpPaylas">Paylaş</button>
          ${yonetici ? `<span class="tp-bosluk"></span><button class="tp-link" id="tpDuzenle">Düzenle</button> · <button class="tp-link tp-tehlike" id="tpSil">Sil</button>` : ''}
        </div>
      </article>
      <section class="tp-yorumlar" aria-labelledby="tpYorumBaslik">
        <h3 id="tpYorumBaslik">Yorumlar <span id="tpYorumSayi"></span></h3>
        ${oturumCubuguHtml()}
        <details class="tp-adab"><summary>Yorum âdâbı</summary>
          <ul>
            <li>Yorumlarınızda edebe, hürmete ve ihlâsa riâyet ediniz; kimseyi incitecek, gıybet veya tartışma çıkaracak ifadelerden sakınınız.</li>
            <li>Fıkhî meselelerde kesin hüküm için ehline danışınız; burada yazılanlar fetvâ yerine geçmez.</li>
            <li>Reklam, bağlantı, siyâsî propaganda ve kişisel bilgi (telefon, adres vb.) paylaşmayınız.</li>
            <li>Kurallara uymayan yorumlar yönetim tarafından kaldırılabilir; uygunsuz gördüğünüz yorumları «Bildir» ile iletebilirsiniz.</li>
          </ul>
        </details>
        <div id="tpYorumFormAlani"></div>
        <div id="tpYorumListe" class="tp-yorum-liste"><div class="tp-bos">Yorumlar yükleniyor…</div></div>
      </section>
      ${footerHtml()}`;
    window.scrollTo({top:kaydirma});
    oturumCubuguBagla();
    document.getElementById('tpGeri').onclick = ()=> goSection('yazilar');
    document.getElementById('tpPaylas').onclick = ()=> paylas('yazilar/'+encodeURIComponent(id), y.baslik);
    if(yonetici){
      document.getElementById('tpSil').onclick = async ()=>{
        if(!confirm('Bu yazı ve altındaki tüm yorumlar kalıcı olarak silinecek. Emin misiniz?')) return;
        try{ await arka.yaziSil(id); bildirimGoster('Yazı silindi.'); goSection('yazilar'); }catch(e){ bildirimGoster(hataMesaji(e)); }
      };
      document.getElementById('tpDuzenle').onclick = ()=>{
        const g = document.getElementById('tpYaziGovde');
        g.innerHTML = yaziFormuHtml(y);
        yaziFormuBagla(y, ()=> renderYazi(id, true));
      };
    }
    // Allah razı olsun
    const tb = document.getElementById('tpTesekkur');
    const tDurum = async ()=>{
      const d = await arka.tesekkurDurumu(id);
      document.getElementById('tpTesekkurSayi') && (document.getElementById('tpTesekkurSayi').textContent = d.sayi ? `(${d.sayi})` : '');
      tb.classList.toggle('aktif', d.benim); tb.setAttribute('aria-pressed', String(d.benim));
      tb.dataset.benim = d.benim ? '1' : '';
    };
    tDurum();
    tb.onclick = async ()=>{
      if(!kullanici){ girisPenceresi(); return; }
      if(!kullanici.dogrulandi){ bildirimGoster('Önce e-posta adresinizi doğrulayın.'); return; }
      try{ await arka.tesekkurDegistir(id, !!tb.dataset.benim); await tDurum(); }catch(e){ bildirimGoster(hataMesaji(e)); }
    };
    // yorum formu
    const formAlani = document.getElementById('tpYorumFormAlani');
    if(kullanici && kullanici.dogrulandi){
      formAlani.innerHTML = `<form class="tp-yorum-form" id="tpYorumForm">
        <span class="tp-avatar" aria-hidden="true">${basHarf(kullanici.isim)}</span>
        <div class="tp-yorum-form-sag">
          <label for="tpYorumMetin" class="tp-gizli">Yorumunuz</label>
          <textarea id="tpYorumMetin" rows="3" maxlength="${YORUM_AZAMI}" placeholder="Yorumunuzu yazın…"></textarea>
          <div class="tp-satir"><span class="tp-kucuk" id="tpKarakter">0 / ${YORUM_AZAMI}</span>${ayarlar.yorumOnayi ? '<span class="tp-kucuk">Yorumunuz onaylandıktan sonra yayınlanır.</span>' : ''}<span class="tp-bosluk"></span><button type="submit" class="tp-btn tp-btn-ana">Gönder</button></div>
        </div>
      </form>`;
      const f = document.getElementById('tpYorumForm'), t = f.querySelector('textarea');
      t.oninput = ()=>{ document.getElementById('tpKarakter').textContent = `${t.value.length} / ${YORUM_AZAMI}`; };
      f.onsubmit = async (e)=>{
        e.preventDefault();
        const metin = t.value.trim();
        if(metin.length < 2){ bildirimGoster('Yorum çok kısa.'); return; }
        const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
        try{ await arka.yorumEkle(id, metin); t.value = ''; t.oninput(); bildirimGoster(ayarlar.yorumOnayi ? 'Yorumunuz alındı, onaylandıktan sonra yayınlanacak.' : 'Yorumunuz yayınlandı.'); }
        catch(err){ bildirimGoster(hataMesaji(err)); }
        finally{ btn.disabled = false; }
      };
    }
    // yorum listesi (canlı)
    const liste = document.getElementById('tpYorumListe');
    dinleyiciler.push(arka.yorumlariDinle(id, yorumlar=>{
      const yayinda = yorumlar.filter(c=>c.durum==='yayinda').length;
      const ys = document.getElementById('tpYorumSayi'); if(ys) ys.textContent = yayinda ? `(${yayinda})` : '';
      if(!yorumlar.length){ liste.innerHTML = `<div class="tp-bos">Henüz yorum yok. İlk yorumu siz yazın.</div>`; return; }
      liste.innerHTML = yorumlar.map(c=>{
        const benim = kullanici && c.uid===kullanici.uid;
        const durumRozet = c.durum==='bekliyor' ? '<span class="tp-rozet tp-rozet-bekliyor">Onay bekliyor</span>' : c.durum==='gizli' ? '<span class="tp-rozet tp-rozet-gizli">Gizlendi</span>' : '';
        const aksiyon = [];
        if(yonetici){
          if(c.durum!=='yayinda') aksiyon.push(`<button class="tp-link" data-durum="yayinda" data-id="${esc(c.id)}">Onayla</button>`);
          if(c.durum!=='gizli') aksiyon.push(`<button class="tp-link" data-durum="gizli" data-id="${esc(c.id)}">Gizle</button>`);
        }
        if(yonetici || benim) aksiyon.push(`<button class="tp-link tp-tehlike" data-sil="${esc(c.id)}">Sil</button>`);
        if(kullanici && !benim && !yonetici) aksiyon.push(`<button class="tp-link" data-bildir="${esc(c.id)}">Bildir</button>`);
        return `<div class="tp-yorum${c.durum!=='yayinda'?' tp-yorum-soluk':''}" id="yorum-${esc(c.id)}">
          <span class="tp-avatar" aria-hidden="true">${basHarf(c.isim)}</span>
          <div class="tp-yorum-sag">
            <div class="tp-yorum-ust"><a class="tp-isim" href="#/uye/${encodeURIComponent(c.uid)}">${esc(c.isim)}</a>${benim?' <span class="tp-kucuk">(siz)</span>':''} <span class="tp-tarih" title="${esc(tamTarih(c.tarih))}">${esc(tarihYaz(c.tarih))}</span> ${durumRozet}</div>
            <div class="tp-yorum-metin">${yorumBicimle(c.metin)}</div>
            ${aksiyon.length ? `<div class="tp-yorum-aksiyon">${aksiyon.join(' · ')}</div>` : ''}
          </div>
        </div>`;
      }).join('');
      liste.querySelectorAll('[data-durum]').forEach(b=> b.onclick = async ()=>{ try{ await arka.yorumDurum(id, b.dataset.id, b.dataset.durum); }catch(e){ bildirimGoster(hataMesaji(e)); } });
      liste.querySelectorAll('[data-sil]').forEach(b=> b.onclick = async ()=>{
        if(!confirm('Bu yorum silinsin mi?')) return;
        try{ await arka.yorumSil(id, b.dataset.sil); bildirimGoster('Yorum silindi.'); }catch(e){ bildirimGoster(hataMesaji(e)); }
      });
      liste.querySelectorAll('[data-bildir]').forEach(b=> b.onclick = async ()=>{
        const neden = prompt('Bu yorumu neden uygunsuz buluyorsunuz? (isteğe bağlı)');
        if(neden===null) return;
        try{ await arka.yorumBildir(id, b.dataset.bildir, neden); bildirimGoster('Bildiriminiz yönetime iletildi. Teşekkür ederiz.'); }catch(e){ bildirimGoster(hataMesaji(e)); }
      });
    }, ()=>{ liste.innerHTML = `<div class="tp-bos">Yorumlar yüklenemedi.</div>`; }));
  }

  function kapaliSayfa(){
    icerik().innerHTML = `<div class="crumb"><b>Yazılar</b></div>
      <div class="empty-card"><div class="glyph">۞</div><h2>Yazılar ve Müzâkere</h2><p>Bu bölüm inşâallah yakında açılacak.</p></div>${footerHtml()}`;
  }

  /* ---------------- ana sayfa kartı ---------------- */
  async function sonYaziKartiDoldur(yer){
    if(!yer || !acikMi()) return;
    try{
      await hazirla();
      const y = await arka.sonYazi();
      if(!y || !document.body.contains(yer)) return;
      yer.innerHTML = `<div class="ana-kart" data-yazi="${esc(y.id)}"><div class="ana-kart-baslik">Son Yazı · ${esc(tarihYaz(y.tarih))}</div><div class="ana-kart-isim">${esc(y.baslik)}</div></div>`;
      yer.querySelector('.ana-kart').onclick = ()=>{ activeSection='yazilar'; buildTopnav(); renderYazi(y.id); };
    }catch(e){ /* sessizce geç */ }
  }

  /* ---------------- TOPLULUK SEKMELERİ ---------------- */
  function sekmelerHtml(aktif){
    const s = [['yazilar','Yazılar'],['sohbet','Sohbet Odaları'],['profil','Profilim']];
    return `<div class="evrad-sekmeler" role="tablist" aria-label="Topluluk">${s.map(([id,ad])=>`<button type="button" role="tab" class="evrad-sekme${aktif===id?' aktif':''}" aria-selected="${aktif===id}" data-tp-sekme="${id}">${ad}</button>`).join('')}</div>`;
  }
  function sekmeleriBagla(){
    icerik().querySelectorAll('[data-tp-sekme]').forEach(b=> b.onclick = ()=>{
      const id = b.dataset.tpSekme;
      if(id==='yazilar') renderListe(); else if(id==='sohbet') renderSohbetListe(); else renderProfil();
    });
  }
  function saatYaz(t){
    if(!t) return '';
    const d = t instanceof Date ? t : new Date(t);
    const bugun = new Date();
    const saat = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    if(d.toDateString()===bugun.toDateString()) return saat;
    return `${d.getDate()} ${MILADI_AYLAR[d.getMonth()]} ${saat}`;
  }
  function cevrimiciYaz(t){
    if(!t) return '';
    const fark = (Date.now() - (t instanceof Date ? t : new Date(t)).getTime())/60000;
    return fark < 5 ? '<span class="cevrimici-nokta" aria-hidden="true"></span>Çevrimiçi' : 'Son görülme: ' + esc(tarihYaz(t));
  }
  async function hazirMi(){
    if(!acikMi()){ kapaliSayfa(); return false; }
    if(!arka){ yukleniyor(); try{ await hazirla(); }catch(e){ baglantiHatasi(); return false; } }
    return true;
  }

  /* ---------------- SOHBET ODALARI ---------------- */
  async function renderSohbetListe(yenidenCizim){
    setRoute('sohbet');
    gorunum = {tur:'sohbet'}; temizle();
    if(!(await hazirMi())) return;
    if(activeSection!=='yazilar' || !gorunum || gorunum.tur!=='sohbet') return;
    icerik().innerHTML = `
      <div class="crumb"><b>Topluluk</b><span class="sep">›</span>Sohbet Odaları</div>
      ${sekmelerHtml('sohbet')}
      <div class="tp-giris-kart">
        <span class="eyebrow">Sohbet Odaları</span>
        <h2>Kardeşlerinizle canlı sohbet</h2>
        <p>Odalardaki mesajlar anında görünür. Üye olarak sohbete katılabilir, duâ isteyebilir, birlikte vird takibi yapabilirsiniz. <span id="tpCevrimici"></span></p>
      </div>
      ${oturumCubuguHtml()}
      <div class="sohbet-odalar">${SOHBET_ODALARI.map(o=>`
        <button type="button" class="sohbet-oda-kart" data-oda="${esc(o.id)}">
          <span class="sohbet-oda-ikon" aria-hidden="true">${esc(o.ad[0])}</span>
          <span class="sohbet-oda-govde"><span class="sohbet-oda-ad">${esc(o.ad)}</span><span class="sohbet-oda-aciklama">${esc(o.aciklama)}</span><span class="sohbet-oda-son" data-son="${esc(o.id)}"></span></span>
          <span class="tp-devam" aria-hidden="true">›</span>
        </button>`).join('')}</div>
      ${arka.ses ? `<h3 class="sohbet-grup-baslik">Sesli Odalar</h3>
      <div class="sohbet-odalar">${SESLI_ODALAR.map(o=>`
        <button type="button" class="sohbet-oda-kart sesli" data-oda="${esc(o.id)}">
          <span class="sohbet-oda-ikon" aria-hidden="true">${IKON_MIKROFON}</span>
          <span class="sohbet-oda-govde"><span class="sohbet-oda-ad">${esc(o.ad)}</span><span class="sohbet-oda-aciklama">${esc(o.aciklama)}</span><span class="sohbet-oda-son" data-sesli="${esc(o.id)}"></span></span>
          <span class="tp-devam" aria-hidden="true">›</span>
        </button>`).join('')}</div>` : ''}
      ${footerHtml()}`;
    oturumCubuguBagla(); sekmeleriBagla();
    if(arka.ses) SESLI_ODALAR.forEach(async o=>{
      const n = await arka.ses.aktifSayisi(o.id);
      const e = icerik().querySelector(`[data-sesli="${o.id}"]`);
      if(e) e.innerHTML = n ? `<span class="cevrimici-nokta" aria-hidden="true"></span>Şu an ${n} kişi konuşuyor` : 'Şu an kimse yok — ilk siz katılın';
    });
    if(!yenidenCizim) window.scrollTo({top:0});
    icerik().querySelectorAll('[data-oda]').forEach(b=> b.onclick = ()=> renderOda(b.dataset.oda));
    arka.cevrimiciSayisi().then(n=>{ const e = document.getElementById('tpCevrimici'); if(e && n) e.innerHTML = `<span class="cevrimici-nokta" aria-hidden="true"></span>Şu an ${n} üye çevrimiçi.`; });
    SOHBET_ODALARI.forEach(async o=>{
      const m = await arka.odaOzeti(o.id);
      const e = icerik().querySelector(`[data-son="${o.id}"]`);
      if(e) e.textContent = m ? `${m.isim}: ${ozet(m.metin, 60)} · ${tarihYaz(m.tarih)}` : 'Henüz mesaj yok';
    });
  }

  async function renderOda(odaId, yenidenCizim){
    if(SESLI_ODALAR.some(o=>o.id===odaId)) return renderSesliOda(odaId, yenidenCizim);
    const oda = SOHBET_ODALARI.find(o=>o.id===odaId);
    if(!oda){ renderSohbetListe(); return; }
    setRoute('sohbet/'+odaId);
    gorunum = {tur:'oda', id:odaId}; temizle();
    if(!(await hazirMi())) return;
    if(activeSection!=='yazilar' || !gorunum || gorunum.id!==odaId) return;
    const yazabilir = kullanici && kullanici.dogrulandi;
    icerik().innerHTML = `
      <div class="back-bar"><button class="back-btn" id="tpGeri">‹ Sohbet Odaları</button><span class="back-current">${esc(oda.ad)}</span></div>
      <div class="sohbet-oda">
        <div class="sohbet-bas">
          <div><h2>${esc(oda.ad)}</h2><div class="tp-kucuk">${esc(oda.aciklama)} <span id="tpCevrimici"></span></div></div>
        </div>
        ${oturumCubuguHtml()}
        <details class="tp-adab"><summary>Sohbet âdâbı</summary>
          <ul>
            <li>Selâmlaşmaya, edebe ve hürmete riâyet ediniz; tartışma, gıybet ve siyâsî konulardan sakınınız.</li>
            <li>Telefon, adres gibi kişisel bilgilerinizi paylaşmayınız.</li>
            <li>Uygunsuz mesajları «Bildir» ile yönetime iletebilirsiniz. Kurallara uymayan mesajlar silinir.</li>
          </ul>
        </details>
        <div class="sohbet-mesajlar" id="tpMesajlar" aria-live="polite" aria-label="Mesajlar"><div class="tp-bos">Mesajlar yükleniyor…</div></div>
        ${yazabilir ? `<form class="sohbet-yaz" id="tpSohbetForm">
            <label for="tpSohbetMetin" class="tp-gizli">Mesajınız</label>
            <textarea id="tpSohbetMetin" rows="1" maxlength="${MESAJ_AZAMI}" placeholder="Mesajınızı yazın… (Enter ile gönderilir)"></textarea>
            <button type="submit" class="tp-btn tp-btn-ana" aria-label="Gönder">Gönder</button>
          </form>`
          : `<div class="sohbet-giris">${kullanici ? 'Mesaj yazmak için e-posta adresinizi doğrulayın.' : 'Sohbete katılmak için <button class="tp-link" data-tp="giris">giriş yapın veya üye olun</button>.'}</div>`}
      </div>
      ${footerHtml()}`;
    oturumCubuguBagla();
    icerik().querySelectorAll('.sohbet-giris [data-tp="giris"]').forEach(b=> b.onclick = ()=> girisPenceresi());
    document.getElementById('tpGeri').onclick = ()=> renderSohbetListe();
    if(!yenidenCizim) window.scrollTo({top:0});
    arka.cevrimiciSayisi().then(n=>{ const e = document.getElementById('tpCevrimici'); if(e && n) e.innerHTML = ` · <span class="cevrimici-nokta" aria-hidden="true"></span>${n} üye çevrimiçi`; });

    const kutu = document.getElementById('tpMesajlar');
    let ilkYukleme = true;
    dinleyiciler.push(arka.mesajlariDinle(odaId, mesajlar=>{
      const altta = kutu.scrollHeight - kutu.scrollTop - kutu.clientHeight < 80;
      if(!mesajlar.length){ kutu.innerHTML = `<div class="tp-bos">Henüz mesaj yok. İlk selâmı siz verin.</div>`; return; }
      let oncekiGun = '';
      kutu.innerHTML = mesajlar.map(m=>{
        const benim = kullanici && m.uid===kullanici.uid;
        const yonetici = kullanici && kullanici.yonetici;
        const gun = m.tarih ? new Date(m.tarih).toDateString() : '';
        const ayrac = gun && gun!==oncekiGun ? `<div class="sohbet-gun"><span>${esc(tarihYaz(m.tarih)==='az önce' || new Date(m.tarih).toDateString()===new Date().toDateString() ? 'Bugün' : tamTarih(m.tarih).split(',')[0])}</span></div>` : '';
        oncekiGun = gun || oncekiGun;
        const aks = [];
        if(benim || yonetici) aks.push(`<button class="tp-link tp-tehlike" data-msil="${esc(m.id)}">Sil</button>`);
        if(kullanici && !benim) aks.push(`<button class="tp-link" data-mbildir="${esc(m.id)}">Bildir</button>`);
        return `${ayrac}<div class="sohbet-mesaj${benim?' benim':''}">
          ${benim ? '' : `<a class="tp-avatar" href="#/uye/${encodeURIComponent(m.uid)}" aria-label="${esc(m.isim)} profili">${basHarf(m.isim)}</a>`}
          <div class="sohbet-balon">
            ${benim ? '' : `<a class="tp-isim" href="#/uye/${encodeURIComponent(m.uid)}">${esc(m.isim)}</a>`}
            <div class="sohbet-metin">${yorumBicimle(m.metin)}</div>
            <div class="sohbet-alt"><span class="tp-tarih">${esc(saatYaz(m.tarih))}</span>${aks.length ? `<span class="sohbet-aks">${aks.join(' · ')}</span>` : ''}</div>
          </div>
        </div>`;
      }).join('');
      if(ilkYukleme || altta){ kutu.scrollTop = kutu.scrollHeight; }
      ilkYukleme = false;
      kutu.querySelectorAll('[data-msil]').forEach(b=> b.onclick = async ()=>{
        if(!confirm('Bu mesaj silinsin mi?')) return;
        try{ await arka.mesajSil(odaId, b.dataset.msil); }catch(e){ bildirimGoster(hataMesaji(e)); }
      });
      kutu.querySelectorAll('[data-mbildir]').forEach(b=> b.onclick = async ()=>{
        const neden = prompt('Bu mesajı neden uygunsuz buluyorsunuz? (isteğe bağlı)');
        if(neden===null) return;
        try{ await arka.mesajBildir(odaId, b.dataset.mbildir, neden); bildirimGoster('Bildiriminiz yönetime iletildi.'); }catch(e){ bildirimGoster(hataMesaji(e)); }
      });
    }, ()=>{ kutu.innerHTML = `<div class="tp-bos">Mesajlar yüklenemedi.</div>`; }));

    const f = document.getElementById('tpSohbetForm');
    if(f){
      const t = f.querySelector('textarea');
      const boyutla = ()=>{ t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; };
      t.addEventListener('input', boyutla);
      t.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); f.requestSubmit(); } });
      f.onsubmit = async (e)=>{
        e.preventDefault();
        const metin = t.value.trim();
        if(!metin) return;
        if(Date.now() - sonMesajZamani < 3000){ bildirimGoster('Lütfen biraz yavaş yazın.'); return; }
        sonMesajZamani = Date.now();
        const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
        try{ await arka.mesajGonder(odaId, metin); t.value = ''; boyutla(); kutu.scrollTop = kutu.scrollHeight; }
        catch(err){ bildirimGoster(hataMesaji(err)); }
        finally{ btn.disabled = false; t.focus(); }
      };
    }
  }

  /* ---------------- SESLİ ODALAR ---------------- */
  const IKON_MIKROFON = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const IKON_MIKROFON_KAPALI = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5M3 3l14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  function oturumKimligi(){ return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function aktifMi(k){ return k.sonGorulme && (Date.now() - k.sonGorulme.getTime()) < SES_AKTIF_MS; }

  // Odadan çık (sayfadan ayrılırken de çağrılır)
  function sesliAyril(sessizce){
    if(!sesli) return;
    const s = sesli; sesli = null;
    clearInterval(s.nabizZ);
    try{ s.motor && s.motor.kapat(); }catch(e){}
    Object.values(s.sesler).forEach(a=>{ try{ a.srcObject = null; a.remove(); }catch(e){} });
    window.removeEventListener('pagehide', s.sayfaKapandi);
    if(arka && arka.ses) arka.ses.ayril(s.odaId);
    if(!sessizce) bildirimGoster('Odadan ayrıldınız.');
  }

  async function renderSesliOda(odaId, yenidenCizim){
    const oda = SESLI_ODALAR.find(o=>o.id===odaId);
    if(!oda){ renderSohbetListe(); return; }
    setRoute('sohbet/'+odaId);
    gorunum = {tur:'sesli', id:odaId};
    if(sesli && sesli.odaId===odaId){ dinleyiciler.forEach(f=>{ try{ f(); }catch(e){} }); dinleyiciler = []; }  // odadayken sadece dinleyicileri yenile
    else temizle();
    if(!(await hazirMi())) return;
    if(activeSection!=='yazilar' || !gorunum || gorunum.id!==odaId) return;
    if(!arka.ses){ renderSohbetListe(); return; }
    const destek = SesMotoru.mikrofonDestekliMi();
    const katilabilir = kullanici && kullanici.dogrulandi;
    icerik().innerHTML = `
      <div class="back-bar"><button class="back-btn" id="tpGeri">‹ Sohbet Odaları</button><span class="back-current">${esc(oda.ad)}</span></div>
      <div class="sohbet-oda sesli-oda">
        <div class="sohbet-bas"><div><h2>${esc(oda.ad)}</h2><div class="tp-kucuk">${esc(oda.aciklama)} · en fazla ${SES_AZAMI} kişi</div></div></div>
        ${oturumCubuguHtml()}
        <details class="tp-adab"><summary>Sesli oda âdâbı</summary>
          <ul>
            <li>Konuşmadığınız zaman mikrofonunuzu kapalı tutun; sırayla ve edeple konuşun.</li>
            <li>Mümkünse kulaklık kullanın; böylece yankı ve uğultu olmaz.</li>
            <li>Konuşmalar kaydedilmez ve sunucudan geçmez; ses doğrudan katılımcılar arasında iletilir.</li>
            <li>Uygunsuz davranan kişiyi yönetim odadan çıkarabilir.</li>
          </ul>
        </details>
        <div class="sesli-kisiler" id="sesKisiler" aria-live="polite"><div class="tp-bos">Odadakiler yükleniyor…</div></div>
        <div class="sesli-kontrol" id="sesKontrol"></div>
        <div class="tp-kucuk sesli-not" id="sesNot"></div>
      </div>
      ${footerHtml()}`;
    oturumCubuguBagla();
    document.getElementById('tpGeri').onclick = ()=> renderSohbetListe();
    if(!yenidenCizim) window.scrollTo({top:0});

    let kisiler = [];
    const durumlar = {};
    function kontrolCiz(){
      const k = document.getElementById('sesKontrol'); if(!k) return;
      const aktifler = kisiler.filter(aktifMi);
      const icerde = !!(sesli && sesli.odaId===odaId);
      if(icerde){
        const acik = sesli.motor && sesli.motor.mikrofonAcikMi();
        k.innerHTML = `<button type="button" class="tp-btn sesli-mik${acik?' acik':''}" id="sesMik" aria-pressed="${acik}">${acik?IKON_MIKROFON:IKON_MIKROFON_KAPALI}<span>${acik?'Mikrofon açık':'Mikrofon kapalı'}</span></button>
          <button type="button" class="tp-btn tp-tehlike-btn" id="sesAyril">Odadan ayrıl</button>`;
        document.getElementById('sesMik').onclick = ()=>{
          if(!sesli || !sesli.motor) return;
          const yeni = !sesli.motor.mikrofonAcikMi();
          sesli.motor.mikrofon(yeni);
          arka.ses.nabiz(odaId, !yeni).catch(()=>{});
          kontrolCiz();
        };
        document.getElementById('sesAyril').onclick = ()=>{ sesliAyril(); kontrolCiz(); kisileriCiz(); };
      } else if(!destek){
        k.innerHTML = `<div class="sohbet-giris">Bu tarayıcı sesli sohbeti desteklemiyor. Güncel Chrome, Safari veya Edge kullanın.</div>`;
      } else if(!kullanici){
        k.innerHTML = `<div class="sohbet-giris">Sesli sohbete katılmak için <button class="tp-link" data-tp="giris">giriş yapın veya üye olun</button>.</div>`;
        k.querySelector('[data-tp="giris"]').onclick = ()=> girisPenceresi();
      } else if(!katilabilir){
        k.innerHTML = `<div class="sohbet-giris">Sesli sohbete katılmak için e-posta adresinizi doğrulayın.</div>`;
      } else if(aktifler.length >= SES_AZAMI){
        k.innerHTML = `<div class="sohbet-giris">Oda şu an dolu (${SES_AZAMI} kişi). Biraz sonra tekrar deneyin.</div>`;
      } else {
        k.innerHTML = `<button type="button" class="tp-btn tp-btn-ana sesli-katil" id="sesKatil">${IKON_MIKROFON}<span>Odaya katıl</span></button>
          <span class="tp-kucuk">Odaya mikrofonunuz kapalı olarak girersiniz.</span>`;
        document.getElementById('sesKatil').onclick = katil;
      }
    }
    function kisileriCiz(){
      const kutu = document.getElementById('sesKisiler'); if(!kutu) return;
      const aktifler = kisiler.filter(aktifMi).sort((a,b)=>(a.giris||0)-(b.giris||0));
      const yonetici = kullanici && kullanici.yonetici;
      if(!aktifler.length){ kutu.innerHTML = `<div class="tp-bos">Odada şu an kimse yok. İlk siz katılın.</div>`; return; }
      kutu.innerHTML = aktifler.map(k=>{
        const ben = kullanici && k.uid===kullanici.uid;
        const d = durumlar[k.uid];
        const baglaniyor = sesli && !ben && d && d!=='connected';
        return `<div class="sesli-kisi${k.sessiz?' sessiz':''}" data-kisi="${esc(k.uid)}">
          <span class="sesli-avatar">${basHarf(k.isim)}<span class="sesli-mik-rozet" aria-label="${k.sessiz?'Mikrofon kapalı':'Mikrofon açık'}">${k.sessiz?IKON_MIKROFON_KAPALI:IKON_MIKROFON}</span></span>
          <span class="sesli-isim">${esc(k.isim)}${ben?' <span class="tp-kucuk">(siz)</span>':''}</span>
          ${baglaniyor ? `<span class="tp-kucuk sesli-durum">${d==='failed'?'bağlanamadı':'bağlanıyor…'}</span>` : ''}
          ${yonetici && !ben ? `<button class="tp-link tp-tehlike" data-cikar="${esc(k.uid)}">Odadan çıkar</button>` : ''}
        </div>`;
      }).join('');
      kutu.querySelectorAll('[data-cikar]').forEach(b=> b.onclick = async ()=>{
        if(!confirm('Bu kişi odadan çıkarılsın mı?')) return;
        try{ await arka.ses.cikar(odaId, b.dataset.cikar); }catch(e){ bildirimGoster(hataMesaji(e)); }
      });
    }
    function seviyeGoster(uid, seviye){
      const e = document.querySelector(`.sesli-kisi[data-kisi="${CSS.escape(uid)}"] .sesli-avatar`);
      if(e) e.style.setProperty('--seviye', seviye > 0.08 ? Math.min(1, seviye).toFixed(2) : '0');
    }

    async function katil(){
      const btn = document.getElementById('sesKatil'); if(btn) btn.disabled = true;
      const not = document.getElementById('sesNot');
      if(not) not.textContent = 'Mikrofon izni isteniyor…';
      const oturum = oturumKimligi();
      try{
        const ice = await SesMotoru.iceSunuculariAl(typeof SES_TURN_ADRESI!=='undefined' ? SES_TURN_ADRESI : '', ()=> arka.ses.tokenAl());
        const durum = { odaId, oturum, sesler:{}, motor:null, nabizZ:null, sayfaKapandi:null, gorulduBen:false };
        durum.motor = await SesMotoru.baslat({
          benim:{ uid:kullanici.uid, oturum }, ice:ice.liste,
          adaptor: arka.ses.adaptor(odaId, oturum),
          olaylar:{
            durum(uid, d){ durumlar[uid] = d; kisileriCiz(); },
            seviye: seviyeGoster,
            akis(uid, akis){
              let a = durum.sesler[uid];
              if(!akis){ if(a){ a.srcObject = null; a.remove(); delete durum.sesler[uid]; } return; }
              if(!a){ a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline',''); a.className = 'tp-gizli'; document.body.appendChild(a); durum.sesler[uid] = a; }
              a.srcObject = akis;
              a.play().catch(()=>{ const n = document.getElementById('sesNot'); if(n) n.innerHTML = 'Sesi duymak için <button class="tp-link" id="sesOynat">buraya dokunun</button>.'; const b = document.getElementById('sesOynat'); if(b) b.onclick = ()=>{ Object.values(durum.sesler).forEach(x=> x.play().catch(()=>{})); n.textContent=''; }; });
            }
          }
        });
        sesli = durum;
        await arka.ses.katil(odaId, oturum, true);
        durum.nabizZ = setInterval(()=>{ if(sesli===durum) arka.ses.nabiz(odaId, !durum.motor.mikrofonAcikMi()).catch(()=>{}); }, 15000);
        durum.sayfaKapandi = ()=> sesliAyril(true);
        window.addEventListener('pagehide', durum.sayfaKapandi);
        if(not) not.textContent = ice.turn ? '' : 'Not: Aktarma sunucusu kullanılamadı; bazı mobil hatlarda ses gitmeyebilir.';
        kontrolCiz(); kisileriCiz();
        motoraBildir();
      }catch(e){
        sesliAyril(true);
        const izin = e && (e.name==='NotAllowedError' || e.name==='SecurityError');
        if(not) not.textContent = izin ? 'Mikrofon izni verilmedi. Tarayıcının adres çubuğundaki kilit simgesinden mikrofona izin verip tekrar deneyin.'
                                  : (e && e.name==='NotFoundError') ? 'Cihazda mikrofon bulunamadı.' : 'Odaya katılınamadı: ' + hataMesaji(e);
        if(btn) btn.disabled = false;
        kontrolCiz();
      }
    }
    function motoraBildir(){
      if(!sesli || sesli.odaId!==odaId || !sesli.motor) return;
      sesli.motor.katilimcilariGuncelle(kisiler.filter(k=> aktifMi(k) && k.uid!==kullanici.uid && k.oturum).map(k=>({uid:k.uid, oturum:k.oturum})));
    }

    dinleyiciler.push(arka.ses.katilimcilariDinle(odaId, l=>{
      kisiler = l;
      if(sesli && sesli.odaId===odaId && kullanici){
        const ben = l.find(k=>k.uid===kullanici.uid);
        if(ben) sesli.gorulduBen = true;
        else if(sesli.gorulduBen){ sesliAyril(true); bildirimGoster('Yönetim tarafından odadan çıkarıldınız.'); }
      }
      kontrolCiz(); kisileriCiz(); motoraBildir();
    }, ()=>{ const k = document.getElementById('sesKisiler'); if(k) k.innerHTML = '<div class="tp-bos">Oda bilgisi yüklenemedi.</div>'; }));
    // Odada nabız atmayanları düşürmek için listeyi periyodik yeniden değerlendir
    const yenile = setInterval(()=>{ kisileriCiz(); kontrolCiz(); motoraBildir(); }, 20000);
    dinleyiciler.push(()=> clearInterval(yenile));
    kontrolCiz();
  }

  /* ---------------- ÜYE PROFİLİ ---------------- */
  async function renderProfil(uid, yenidenCizim){
    setRoute(uid ? 'uye/'+encodeURIComponent(uid) : 'profil');
    gorunum = {tur:'profil', id:uid||null}; temizle();
    if(!(await hazirMi())) return;
    const kendi = !uid || (kullanici && uid===kullanici.uid);
    if(kendi && !kullanici){
      icerik().innerHTML = `<div class="crumb"><b>Topluluk</b><span class="sep">›</span>Profilim</div>${sekmelerHtml('profil')}
        <div class="empty-card"><div class="glyph">۞</div><h2>Profiliniz</h2><p>Profil sayfanızı görmek ve sohbetlere katılmak için üye olun veya giriş yapın.</p><p><button class="tp-btn tp-btn-ana" data-tp="giris">Giriş yap / Üye ol</button></p></div>${footerHtml()}`;
      sekmeleriBagla();
      icerik().querySelector('[data-tp="giris"]').onclick = ()=> girisPenceresi();
      return;
    }
    const hedefUid = kendi ? kullanici.uid : uid;
    let p = null;
    try{ p = await arka.profilGetir(hedefUid); }catch(e){}
    if(!gorunum || gorunum.tur!=='profil') return;
    if(!p && !kendi){
      icerik().innerHTML = `<div class="crumb"><b>Topluluk</b></div><div class="empty-card"><div class="glyph">۞</div><h2>Üye bulunamadı</h2><p>Bu üyelik silinmiş olabilir.</p></div>${footerHtml()}`;
      return;
    }
    p = p || {isim:kullanici.isim, hakkinda:'', sehir:''};
    // Kişisel istatistikler (bu cihazda tutulan bilgiler)
    let istat = '';
    if(kendi){
      const z = jsonOku('em_zikirmatik', {}); const fav = favoriler().length; const seri = seriGunSayisi();
      const bugun = (okunanlar()[tarihAnahtari(new Date())]||[]).length;
      istat = `<div class="profil-istat">
        <div><b>${seri}</b><span>gün aralıksız vird</span></div>
        <div><b>${bugun}</b><span>bugün okunan vird</span></div>
        <div><b>${Number(z.toplam||0).toLocaleString('tr-TR')}</b><span>zikirmatik toplamı</span></div>
        <div><b>${fav}</b><span>favori</span></div>
      </div><p class="tp-kucuk" style="text-align:center; margin-top:6px;">Bu istatistikler sadece bu cihazda tutulur ve başkalarına gösterilmez.</p>`;
    }
    icerik().innerHTML = `
      ${kendi ? `<div class="crumb"><b>Topluluk</b><span class="sep">›</span>Profilim</div>${sekmelerHtml('profil')}` : `<div class="back-bar"><button class="back-btn" id="tpGeri">‹ Geri</button><span class="back-current">${esc(p.isim)}</span></div>`}
      <div class="profil-kart">
        <div class="profil-avatar" aria-hidden="true">${basHarf(p.isim)}</div>
        <h2>${esc(p.isim)}${kendi && kullanici.yonetici ? ' <span class="tp-rozet tp-rozet-yonetici">Yönetici</span>' : ''}</h2>
        <div class="tp-kucuk profil-meta">${p.sehir ? esc(p.sehir)+' · ' : ''}${p.katilim ? 'Katılım: '+esc(`${new Date(p.katilim).getDate()} ${MILADI_AYLAR[new Date(p.katilim).getMonth()]} ${new Date(p.katilim).getFullYear()}`) : ''}${!kendi && p.sonGorulme ? ' · '+cevrimiciYaz(p.sonGorulme) : ''}</div>
        ${p.hakkinda ? `<p class="profil-hakkinda">${esc(p.hakkinda)}</p>` : (kendi ? '' : '')}
        ${istat}
      </div>
      ${kendi ? `<form class="tp-form profil-form" id="tpProfilForm">
          <h3>Profilimi düzenle</h3>
          <div class="form-field"><label for="tpPIsim">Görünecek isim</label><input id="tpPIsim" maxlength="40" required value="${esc(p.isim)}"></div>
          <div class="form-field"><label for="tpPSehir">Şehir <span style="font-weight:400;">(isteğe bağlı)</span></label><input id="tpPSehir" maxlength="40" value="${esc(p.sehir||'')}"></div>
          <div class="form-field"><label for="tpPHakkinda">Hakkımda <span style="font-weight:400;">(isteğe bağlı, en fazla 300 harf)</span></label><textarea id="tpPHakkinda" rows="3" maxlength="300">${esc(p.hakkinda||'')}</textarea></div>
          <div class="tp-satir"><button type="submit" class="tp-btn tp-btn-ana">Kaydet</button><span class="tp-bosluk"></span><button type="button" class="tp-btn" data-tp="hesabim">Hesap ayarları</button></div>
        </form>` : ''}
      ${footerHtml()}`;
    if(!yenidenCizim) window.scrollTo({top:0});
    if(kendi){
      sekmeleriBagla();
      icerik().querySelector('[data-tp="hesabim"]').onclick = ()=> hesabimPenceresi();
      document.getElementById('tpProfilForm').onsubmit = async (e)=>{
        e.preventDefault();
        const isim = document.getElementById('tpPIsim').value.trim();
        if(isim.length < 2){ bildirimGoster('İsim en az 2 harf olmalı.'); return; }
        if(isimYasak(isim)){ bildirimGoster(ISIM_YASAK_MESAJ); return; }
        try{
          await arka.profilKaydet({ isim, sehir:document.getElementById('tpPSehir').value.trim(), hakkinda:document.getElementById('tpPHakkinda').value.trim() });
          bildirimGoster('Profiliniz kaydedildi.');
          renderProfil(null, true);
        }catch(err){ bildirimGoster(hataMesaji(err)); }
      };
    } else {
      document.getElementById('tpGeri').onclick = ()=> history.length > 1 ? history.back() : renderSohbetListe();
    }
  }

  /* ---------------- ana sayfa: sohbet odaları kartı ---------------- */
  async function sohbetKartiDoldur(yer){
    if(!yer || !acikMi()) return;
    try{
      await hazirla();
      if(!document.body.contains(yer)) return;
      yer.innerHTML = `<div class="ana-kart ana-kart-liste sohbet-ana">
        <div class="ana-kart-baslik">Sohbet Odaları <span class="sohbet-cevrimici" id="anaCevrimici"></span></div>
        ${SOHBET_ODALARI.map(o=>`<div class="sohbet-oda-satir" data-oda="${esc(o.id)}"><span class="sohbet-oda-ad">${esc(o.ad)}</span><span class="sohbet-oda-son" data-son="${esc(o.id)}">${esc(o.aciklama)}</span></div>`).join('')}
        ${arka.ses ? `<div class="sohbet-oda-satir" data-oda="${esc(SESLI_ODALAR[0].id)}"><span class="sohbet-oda-ad">🎙 Sesli Odalar</span><span class="sohbet-oda-son">${SESLI_ODALAR.map(o=>esc(o.ad)).join(' · ')}</span></div>` : ''}
      </div>`;
      yer.querySelectorAll('[data-oda]').forEach(n=> n.onclick = ()=>{ activeSection = 'yazilar'; buildTopnav(); if(SESLI_ODALAR.some(o=>o.id===n.dataset.oda)) renderSohbetListe(); else renderOda(n.dataset.oda); });
      arka.cevrimiciSayisi().then(n=>{ const e = document.getElementById('anaCevrimici'); if(e && n) e.innerHTML = `<span class="cevrimici-nokta" aria-hidden="true"></span>${n} çevrimiçi`; });
      SOHBET_ODALARI.forEach(async o=>{
        const m = await arka.odaOzeti(o.id);
        const e = yer.querySelector(`[data-son="${o.id}"]`);
        if(e && m) e.textContent = `${m.isim}: ${ozet(m.metin, 48)} · ${tarihYaz(m.tarih)}`;
      });
    }catch(e){}
  }

  return { acikMi, renderListe, renderYazi: (id)=>renderYazi(id), sonYaziKartiDoldur, temizle,
    renderSohbetListe: ()=>renderSohbetListe(), renderOda: (id)=>renderOda(id), renderProfil: (uid)=>renderProfil(uid), sohbetKartiDoldur };
})();
