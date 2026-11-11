/* One service worker: offline cache + push notifications (Firebase Cloud Messaging). */
const CFG=__CONFIG__;
if(CFG){
  importScripts("https://www.gstatic.com/firebasejs/__FBV__/firebase-app-compat.js","https://www.gstatic.com/firebasejs/__FBV__/firebase-messaging-compat.js");
  firebase.initializeApp(CFG);firebase.messaging();
}
self.addEventListener("notificationclick",e=>{e.notification.close();const d=e.notification.data||{},link=(d.FCM_MSG&&d.FCM_MSG.data&&d.FCM_MSG.data.link)||d.link||"/";
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{for(const c of cs){if("navigate" in c&&link!=="/")return c.navigate(link).then(x=>x&&x.focus());if("focus" in c)return c.focus()}return clients.openWindow(link)}))});
const CACHE="sahibi-v2";
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(["/","/index.html","/app.js","/manifest.webmanifest","/icons/icon-192.png"])).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
/* network first, cache as fallback, so every deploy reaches users right away.
   The Quran text is cached only when the answer is the real file (plain text; 1.4 MB, or a few hundred KB when compressed): a page from a captive portal or a proxy must not replace the good copy. */
const cacheable=(req,r)=>{if(!r)return false;if(r.type==="opaque")return true;if(!r.ok)return false;
  if(/\/quran-uthmani\.txt$/.test(new URL(req.url).pathname)){const ct=r.headers.get("content-type")||"",len=+r.headers.get("content-length")||0;return /text\/plain/i.test(ct)&&(len===0||len>100000)}
  return true};
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||(u.origin!==location.origin&&u.hostname.indexOf("fonts.")!==0))return;
  e.respondWith(fetch(e.request).then(r=>{if(cacheable(e.request,r)){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(h=>h||caches.match("/index.html"))));
});
