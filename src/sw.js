/* One service worker: offline cache + push notifications (Firebase Cloud Messaging). */
const CFG=__CONFIG__;
if(CFG){
  importScripts("https://www.gstatic.com/firebasejs/__FBV__/firebase-app-compat.js","https://www.gstatic.com/firebasejs/__FBV__/firebase-messaging-compat.js");
  firebase.initializeApp(CFG);firebase.messaging();
}
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{for(const c of cs){if("focus" in c)return c.focus()}return clients.openWindow("/")}))});
const CACHE="sahibi-v2";
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(["/","/index.html","/app.js","/manifest.webmanifest","/icons/icon-192.png"])).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
/* network first, cache as fallback, so every deploy reaches users right away */
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||(u.origin!==location.origin&&u.hostname.indexOf("fonts.")!==0))return;
  e.respondWith(fetch(e.request).then(r=>{if(r&&(r.ok||r.type==="opaque")){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(h=>h||caches.match("/index.html"))));
});
