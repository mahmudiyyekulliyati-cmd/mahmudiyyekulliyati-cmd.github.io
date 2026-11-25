/* =====================================================================
   SESLİ SOHBET MOTORU (WebRTC)
   - Odadaki herkes herkese doğrudan bağlanır ("mesh"); oda başına en fazla 8 kişi.
   - Bağlantı kurma mesajları (teklif / cevap / aday) Firestore üzerinden iletilir;
     ses verisi Firestore'a gitmez, doğrudan üyeler arasında (gerekirse TURN üzerinden) akar.
   - Bu dosya altyapıdan bağımsızdır: Firestore işlemleri "adaptor" ile verilir.
   ===================================================================== */
const SesMotoru = (()=>{
  const SES_KISITI = { audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video:false };
  const YEDEK_ICE = [{ urls:['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

  // TURN sunucusu bilgilerini Worker'dan al; alınamazsa sadece STUN ile devam et.
  async function iceSunuculariAl(adres, tokenAl){
    if(!adres) return { liste:YEDEK_ICE, turn:false };
    try{
      const t = await tokenAl();
      const r = await fetch(adres, { headers:{ Authorization:'Bearer '+t } });
      if(!r.ok) throw new Error('turn '+r.status);
      const d = await r.json();
      let s = d.iceServers;
      if(s && !Array.isArray(s)) s = [s];
      if(!s || !s.length) throw new Error('bos');
      return { liste:s, turn:true };
    }catch(e){ return { liste:YEDEK_ICE, turn:false }; }
  }

  function mikrofonDestekliMi(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); }

  /*
    secenek = {
      benim: { uid, oturum },
      ice: [RTCIceServer],
      adaptor: {
        sinyalGonder(kime, hedefOturum, tur, veri) → Promise,
        sinyalleriDinle(cb(liste)) → kapat(),   // liste: [{id, kimden, oturum, hedefOturum, tur, veri, tarih}]
        sinyalSil(id) → Promise
      },
      olaylar: { durum(uid, durum), seviye(uid, 0..1), akis(uid, MediaStream|null) }
    }
  */
  async function baslat(secenek){
    const { benim, adaptor, olaylar } = secenek;
    const ice = secenek.ice || YEDEK_ICE;
    const yerel = await navigator.mediaDevices.getUserMedia(SES_KISITI);
    yerel.getAudioTracks().forEach(t=> t.enabled = false);   // odaya sessiz girilir

    const esler = new Map();          // uid → {uid, oturum, pc, uzakVar, bekleyen:[], deneme}
    const erkenAdaylar = new Map();   // "uid|oturum" → [aday]  (teklif gelmeden gelen adaylar)
    let kapandi = false;
    let sira = Promise.resolve();

    // ---- ses seviyesi ölçümü (konuşan kişiyi göstermek için) ----
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = AC ? new AC() : null;
    const olcerler = new Map();       // uid → {analiz, kaynak, veri}
    function olcerEkle(uid, akis){
      if(!ctx || !akis || !akis.getAudioTracks().length) return;
      olcerKaldir(uid);
      try{
        const kaynak = ctx.createMediaStreamSource(akis);
        const analiz = ctx.createAnalyser(); analiz.fftSize = 512;
        kaynak.connect(analiz);
        olcerler.set(uid, { kaynak, analiz, veri:new Uint8Array(analiz.fftSize) });
      }catch(e){}
    }
    function olcerKaldir(uid){ const o = olcerler.get(uid); if(o){ try{ o.kaynak.disconnect(); }catch(e){} olcerler.delete(uid); } }
    olcerEkle(benim.uid, yerel);
    const olcumZamanlayici = setInterval(()=>{
      olcerler.forEach((o, uid)=>{
        o.analiz.getByteTimeDomainData(o.veri);
        let t = 0; for(let i=0;i<o.veri.length;i++){ const v = (o.veri[i]-128)/128; t += v*v; }
        const rms = Math.sqrt(t/o.veri.length);
        const yerelSessiz = uid===benim.uid && !yerel.getAudioTracks().some(tr=>tr.enabled);
        olaylar.seviye && olaylar.seviye(uid, yerelSessiz ? 0 : Math.min(1, rms*6));
      });
    }, 180);

    // ---- eş bağlantıları ----
    function esKapat(uid){
      const es = esler.get(uid);
      if(!es) return;
      try{ es.pc.onicecandidate = es.pc.ontrack = es.pc.onconnectionstatechange = null; es.pc.close(); }catch(e){}
      esler.delete(uid);
      olcerKaldir(uid);
      olaylar.akis && olaylar.akis(uid, null);
    }
    function esOlustur(uid, oturum){
      esKapat(uid);
      const pc = new RTCPeerConnection({ iceServers:ice });
      const es = { uid, oturum, pc, uzakVar:false, bekleyen:[], deneme:0, olusma:Date.now() };
      yerel.getTracks().forEach(t=> pc.addTrack(t, yerel));
      pc.onicecandidate = e=>{
        if(e.candidate && !kapandi) adaptor.sinyalGonder(uid, oturum, 'aday', JSON.stringify(e.candidate)).catch(()=>{});
      };
      pc.ontrack = e=>{
        const akis = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
        olaylar.akis && olaylar.akis(uid, akis);
        olcerEkle(uid, akis);
      };
      pc.onconnectionstatechange = ()=>{
        olaylar.durum && olaylar.durum(uid, pc.connectionState);
        if(pc.connectionState==='failed' && benim.uid < uid && es.deneme < 3 && !kapandi){
          const d = es.deneme + 1;
          setTimeout(()=>{ if(kapandi || esler.get(uid)!==es) return; const yeni = esOlustur(uid, oturum); yeni.deneme = d; teklifVer(yeni); }, 1500);
        }
      };
      esler.set(uid, es);
      // teklif gelmeden önce ulaşmış adayları ekle
      const k = uid+'|'+oturum;
      if(erkenAdaylar.has(k)){ es.bekleyen.push(...erkenAdaylar.get(k)); erkenAdaylar.delete(k); }
      olaylar.durum && olaylar.durum(uid, 'new');
      return es;
    }
    async function teklifVer(es){
      try{
        const t = await es.pc.createOffer();
        await es.pc.setLocalDescription(t);
        await adaptor.sinyalGonder(es.uid, es.oturum, 'teklif', JSON.stringify(es.pc.localDescription));
      }catch(e){ olaylar.durum && olaylar.durum(es.uid, 'failed'); }
    }
    async function bekleyenleriEkle(es){
      const l = es.bekleyen.splice(0);
      for(const a of l){ try{ await es.pc.addIceCandidate(a); }catch(e){} }
    }

    // Odadaki kişi listesi değiştikçe çağrılır: [{uid, oturum}] (ben hariç, sadece aktifler)
    function katilimcilariGuncelle(liste){
      if(kapandi) return;
      const simdi = new Set(liste.map(k=>k.uid));
      // Listede olmayanları kapat; yeni kurulan bağlantılara 15 sn pay ver (katılımcı kaydı sinyalden geç gelebilir).
      esler.forEach((es, uid)=>{ if(!simdi.has(uid) && Date.now() - es.olusma > 15000) esKapat(uid); });
      liste.forEach(k=>{
        const es = esler.get(k.uid);
        if(es && es.oturum===k.oturum) return;
        // Çakışmayı önlemek için bağlantıyı her zaman kimliği küçük olan taraf başlatır.
        if(benim.uid < k.uid){ teklifVer(esOlustur(k.uid, k.oturum)); }
        else if(es){ esKapat(k.uid); }
      });
    }

    async function sinyalIsle(s){
      if(s.hedefOturum !== benim.oturum){ adaptor.sinyalSil(s.id).catch(()=>{}); return; }
      let veri = null; try{ veri = JSON.parse(s.veri); }catch(e){}
      adaptor.sinyalSil(s.id).catch(()=>{});
      if(!veri) return;
      let es = esler.get(s.kimden);
      if(s.tur==='teklif'){
        if(!es || es.oturum!==s.oturum || es.pc.signalingState!=='stable') es = esOlustur(s.kimden, s.oturum);
        try{
          await es.pc.setRemoteDescription(veri); es.uzakVar = true;
          await bekleyenleriEkle(es);
          const c = await es.pc.createAnswer();
          await es.pc.setLocalDescription(c);
          await adaptor.sinyalGonder(s.kimden, s.oturum, 'cevap', JSON.stringify(es.pc.localDescription));
        }catch(e){ olaylar.durum && olaylar.durum(s.kimden, 'failed'); }
      } else if(s.tur==='cevap'){
        if(!es || es.oturum!==s.oturum || es.pc.signalingState!=='have-local-offer') return;
        try{ await es.pc.setRemoteDescription(veri); es.uzakVar = true; await bekleyenleriEkle(es); }catch(e){}
      } else if(s.tur==='aday'){
        if(!es || es.oturum!==s.oturum){
          const k = s.kimden+'|'+s.oturum;
          if(!erkenAdaylar.has(k)) erkenAdaylar.set(k, []);
          erkenAdaylar.get(k).push(veri);
          return;
        }
        if(es.uzakVar){ try{ await es.pc.addIceCandidate(veri); }catch(e){} }
        else es.bekleyen.push(veri);
      }
    }
    const sinyalKapat = adaptor.sinyalleriDinle(liste=>{
      liste.sort((a,b)=> (a.tarih||0) - (b.tarih||0));
      liste.forEach(s=>{ sira = sira.then(()=> kapandi ? null : sinyalIsle(s)).catch(()=>{}); });
    });

    return {
      katilimcilariGuncelle,
      mikrofon(acik){ yerel.getAudioTracks().forEach(t=> t.enabled = !!acik); if(ctx && ctx.state==='suspended') ctx.resume().catch(()=>{}); },
      mikrofonAcikMi(){ return yerel.getAudioTracks().some(t=>t.enabled); },
      durumlar(){ const o = {}; esler.forEach((es, uid)=> o[uid] = es.pc.connectionState); return o; },
      kapat(){
        if(kapandi) return; kapandi = true;
        try{ sinyalKapat && sinyalKapat(); }catch(e){}
        clearInterval(olcumZamanlayici);
        Array.from(esler.keys()).forEach(esKapat);
        yerel.getTracks().forEach(t=> t.stop());
        olcerler.clear();
        if(ctx) ctx.close().catch(()=>{});
      }
    };
  }

  return { baslat, iceSunuculariAl, mikrofonDestekliMi };
})();
