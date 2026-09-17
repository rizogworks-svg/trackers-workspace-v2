const CACHE='trackers-workspace-v2-20260918-2';
const APP_SHELL=['./','./index.html','./app-shell.html','./manifest.webmanifest','./projects/','./bast/','./pkbon/','./notes/','./reporting/','./settings/','./assets/css/core.css','./assets/js/entry.js','./assets/js/storage-guard.js','./assets/js/config.js','./assets/js/cloud.js','./assets/js/pkbon.js','./assets/js/app.js','./assets/js/boot.js','./assets/img/icon-192.png','./assets/img/icon-512.png','./assets/img/trackers-logo.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)).catch(()=>{}))});
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url); if(u.origin!==location.origin)return;
 const isDoc=e.request.mode==='navigate';
 e.respondWith((async()=>{
   try{const fresh=await fetch(e.request,{cache:'no-store'});const c=await caches.open(CACHE);c.put(e.request,fresh.clone());return fresh}
   catch(_){const cached=await caches.match(e.request);if(cached)return cached;if(isDoc)return caches.match('./index.html');throw _}
 })());
});