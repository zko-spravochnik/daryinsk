const CACHE_NAME="spravochnik-v2.3-final";
const CORE=[
"./","./index.html","./style.css","./script.js","./languages.json","./manifest.webmanifest",
"./icon-192.png","./icon-512.png","./baza_darinsk.txt","./baza_baikonys.txt","./baza_rubezhinskoe.txt",
"./baza_volodarskoe.txt","./baza_ozernoe.txt","./reklama.txt"
];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(a=>Promise.all(a.filter(x=>x!==CACHE_NAME).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url); if(u.origin!==location.origin)return;
  if(u.pathname.endsWith("/reklama.txt")||/\/baza_[^/]+\.txt$/.test(u.pathname)){
    e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{const cp=r.clone();caches.open(CACHE_NAME).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)));return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE_NAME).then(k=>k.put(e.request,cp));return r})));
});