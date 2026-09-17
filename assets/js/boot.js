
/* v50 - header search */
(function(){
  const input=document.getElementById('globalAppSearch');
  if(!input) return;

  function runGlobalSearch(){
    const q=(input.value||'').trim();
    const siteSearch=document.getElementById('siteSearch');
    if(siteSearch){
      siteSearch.value=q;
      siteSearch.dispatchEvent(new Event('input',{bubbles:true}));
    }

    if(q && typeof route==='function'){
      try{ route('sites'); }catch(_){}
    }
  }

  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      runGlobalSearch();
    }
  });
})();

/* Trackers Workspace PWA install */
(function(){
  let deferredInstallPrompt = null;
  const installRow = document.getElementById('installAppSettingRow');
  const installSubtitle = document.getElementById('installAppSubtitle');

  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const setInstallState = () => {
    if (!installSubtitle) return;
    if (isStandalone()) {
      installSubtitle.textContent = 'Sudah terinstal di perangkat';
      return;
    }
    if (deferredInstallPrompt) {
      installSubtitle.textContent = 'Siap diinstal di Android / perangkat ini';
      return;
    }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      installSubtitle.textContent = 'Buka dari HTTPS / GitHub Pages untuk menginstal';
      return;
    }
    installSubtitle.textContent = 'Install Trackers Workspace di perangkat ini';
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallState();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setInstallState();
    if (typeof toast === 'function') toast('Trackers Workspace berhasil diinstal');
  });

  if (installRow) {
    installRow.addEventListener('click', async () => {
      if (isStandalone()) {
        if (typeof toast === 'function') toast('Trackers Workspace sudah terinstal');
        return;
      }
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        try { await deferredInstallPrompt.userChoice; } catch (_) {}
        deferredInstallPrompt = null;
        setInstallState();
        return;
      }
      const msg = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? 'Jika tombol install belum muncul, buka menu Chrome lalu pilih Install app / Tambahkan ke layar utama.'
        : 'Untuk instal di Android, buka Trackers Workspace dari HTTPS seperti GitHub Pages.';
      if (typeof toast === 'function') toast(msg); else alert(msg);
    });
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(window.TRACKERS_APP_ROOT ? new URL('sw.js', window.TRACKERS_APP_ROOT).href : './sw.js', {updateViaCache:'none'}).then(reg => {
        try { reg.update(); } catch (_) {}
      }).catch(err => console.warn('Trackers Workspace service worker gagal didaftarkan', err));
    });
  }

  setInstallState();
})();
