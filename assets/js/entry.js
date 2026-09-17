/* Trackers Workspace v2 - shared route entry loader */
(async function(){
  const current=document.currentScript;
  const route=current?.dataset?.route||'dashboard';
  const root=new URL('../../', current.src);
  window.TRACKERS_ENTRY_ROUTE=route;
  window.TRACKERS_APP_ROOT=root.href;
  window.TRACKERS_ROUTE_READY=false;
  window.TRACKERS_ROUTE_URLS={
    dashboard:'',sites:'projects/',bastprocess:'bast/',pkbon:'pkbon/',notes:'notes/',reporting:'reporting/',settings:'settings/'
  };

  const mount=document.getElementById('app-root');
  try{
    const res=await fetch(new URL('app-shell.html?v=2.1.2',root),{cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    mount.innerHTML=await res.text();
    // shell paths must resolve from repository root, not from /projects etc.
    mount.querySelectorAll('[src]').forEach(el=>{
      const v=el.getAttribute('src');
      if(v && v.startsWith('assets/')) el.src=new URL(v,root).href;
    });
  }catch(err){
    mount.innerHTML='<main class="v2-load-error"><h1>Trackers Workspace</h1><p>Gagal memuat aplikasi.</p><button onclick="location.reload()">Coba Lagi</button></main>';
    console.error(err); return;
  }

  function loadScript(src, attrs={}){
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=src; Object.entries(attrs).forEach(([k,v])=>s.setAttribute(k,v));
      s.onload=resolve; s.onerror=()=>reject(new Error('Gagal memuat '+src));
      document.body.appendChild(s);
    });
  }

  try{
    await loadScript(new URL('assets/js/storage-guard.js?v=2.1.2',root));
    // XLSX is optional. A CDN failure must never prevent the workspace from booting.
    if(route==='sites' || route==='pkbon'){
      await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js')
        .catch(err=>console.warn('Library Excel gagal dimuat; fitur import/export Excel saja yang dinonaktifkan.',err));
    }
    // cloud.js owns the Supabase SDK fallback loader, so boot does not depend on one CDN.
    await loadScript(new URL('assets/js/config.js?v=2.1.2',root));
    await loadScript(new URL('assets/js/cloud.js?v=2.1.2',root));
    await loadScript(new URL('assets/js/pkbon.js?v=2.1.2',root));
    await loadScript(new URL('assets/js/app.js?v=2.1.2',root));
    await loadScript(new URL('assets/js/boot.js?v=2.1.2',root));
    window.TRACKERS_ROUTE_READY=true;
    document.body.dataset.page=route;

    // Project search may be handed off from another route.
    if(route==='sites'){
      const q=new URLSearchParams(location.search).get('q')||sessionStorage.getItem('trackers:projectSearch')||'';
      sessionStorage.removeItem('trackers:projectSearch');
      const input=document.getElementById('siteSearch');
      if(input&&q){input.value=q;input.dispatchEvent(new Event('input',{bubbles:true}));}
    }

    // Load route-local JS after the stable core. New feature work belongs here.
    const pageJs=new URL(`assets/js/pages/${route}.js?v=2.1.2`,root);
    await loadScript(pageJs).catch(()=>{});
  }catch(err){console.error('Trackers v2 boot failed',err);}
})();