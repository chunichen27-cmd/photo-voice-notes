importScripts('version.js');
const V=self.APP_CACHE;
const SHELL=['./','index.html','version.js','app.js','worker.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-512-maskable.png','apple-touch-icon.png','favicon.ico','favicon-32.png','vendor/transformers.min.js','vendor/ort-wasm-simd-threaded.jsep.mjs','vendor/ort-wasm-simd-threaded.jsep.wasm','vendor/cn2t.js','vendor/jszip.min.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL))));
self.addEventListener('message',e=>{if(e.data&&e.data.type==='skip-waiting') self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('shell-')&&k!==V).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url); if(e.request.method!=='GET')return;
  const model=false;
  if(u.origin!==location.origin)return; // model files are cached by transformers.js in Cache Storage 'transformers-cache'
  e.respondWith(caches.match(e.request,{ignoreSearch:!model}).then(r=>r||fetch(e.request).then(res=>{
    if(res.ok&&(model||u.origin===location.origin)){const c=res.clone();caches.open(model?'model-v1':V).then(x=>x.put(e.request,c));}
    return res;}).catch(()=>caches.match('index.html'))));
});
