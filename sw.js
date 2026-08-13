/* FAMILIA PWA — Network First，離線時回退快取 */
/* 版號 = 改檔日期。動任何 SHELL 內的檔案就把這行改掉，
   sw.js 位元組一變，瀏覽器自然重跑 install。 */
const CACHE = 'familia-20260814a';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './FF-caps.woff2',
  './FF-body.woff2',
  './eat.png',
  './lifemoney.png',
  './Remittance.png',
  './month.png',
  './rs-zero.png',
  './gil.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      /* 逐支加，單支失敗不拖累全體；順便把死檔印出來 */
      Promise.all(SHELL.map(u =>
        c.add(u).catch(err => console.warn('[SW] 快取失敗:', u, err.message))
      ))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks =>
      Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;

  // 只管自己家的 GET，GAS 那邊一律直通
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  /* HTML 導航一律繞開瀏覽器 HTTP 快取（坑C） */
  const isNav = req.mode === 'navigate' || /\.html?($|\?)/.test(req.url);
  const hit   = isNav ? fetch(req, { cache: 'no-store' }) : fetch(req);

  e.respondWith(
    hit
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
