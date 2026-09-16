/* FAMILIA PWA — Network First，離線時回退快取 */
/* 版號 = 改檔日期。動任何 SHELL 內的檔案就把這行改掉，
   sw.js 位元組一變，瀏覽器自然重跑 install。 */
const CACHE = 'familia-20260916c';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/icons/app/icon-192.png',
  './assets/icons/app/icon-512.png',
  './assets/icons/app/apple-touch-icon.png',
  './assets/icons/app/icon-maskable-512.png',
  './assets/icons/app/icon-maskable-192.png',
  './assets/icons/menu/icon-ledger.png',
  './assets/icons/menu/icon-accounts.png',
  './assets/icons/menu/icon-recurring.png',
  './assets/icons/menu/icon-forecast.png',
  './assets/icons/menu/icon-reconcile.png',
  './assets/icons/menu/icon-split.png',
  './assets/icons/menu/icon-insights.png',
  './assets/icons/menu/icon-budget.png',
  './assets/icons/menu/icon-remittance.png',
  './assets/icons/menu/icon-loan.png',
  './assets/icons/menu/icon-calendar.png',
  './assets/icons/menu/icon-diary.png',
  './assets/icons/menu/icon-notify.png',
  './FF-caps.woff2',
  './FF-body.woff2',
  './rs-zero.png'
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
    )
    /* 每次啟動都拿真新的 SHELL 覆蓋備胎，版號就不必再動 */
    .then(() => caches.open(CACHE).then(c =>
      Promise.all(SHELL.map(u =>
        fetch(u, { cache: 'no-store' })
          .then(r => r.ok ? c.put(u, r) : null)
          .catch(() => {})
      ))
    ))
    .then(() => self.clients.claim())
  );
});

/* ══ 推播 ══════════════════════════════════════
   Worker 送過來的是 {title, body, url, tag} 的 JSON。

   ⚠️ 一定要 showNotification，不能收了不顯示 ——
      我們訂閱時宣告了 userVisibleOnly:true，
      靜靜吃掉幾次之後瀏覽器會直接把訂閱撤銷，而且不會告訴你。 */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { d = { body: e.data ? e.data.text() : '' }; }

  e.waitUntil(self.registration.showNotification(d.title || '家菜金', {
    body:  d.body || '',
    icon:  './assets/icons/app/icon-192.png',
    badge: './assets/icons/app/icon-192.png',
    tag:   d.tag || 'familia',
    renotify: true,
    data:  { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
      /* 已經開著就切過去，不要再開一個分頁 */
      for (const w of ws) {
        if (w.url.indexOf(self.registration.scope) === 0) {
          if (w.navigate) { try { w.navigate(url); } catch (_) {} }
          return w.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;

  // 只管自己家的 GET，GAS 那邊一律直通
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  /* 影片一律直通，不要碰。
     Safari 抓影片是用 Range 分段要的（回 206 Partial Content），
     SW 插手會把分段搞掉，而且 206 根本存不進 Cache —— 影片就轉圈圈轉到死。 */
  if (req.destination === 'video' || req.destination === 'audio') return;
  if (/\.(mp4|m4v|mov|mp3|m4a)($|\?)/i.test(req.url)) return;

  /* HTML 導航一律繞開瀏覽器 HTTP 快取（坑C） */
  const isNav = req.mode === 'navigate' || /\.html?($|\?)/.test(req.url);
  const hit   = isNav ? fetch(req, { cache: 'no-store' }) : fetch(req);

  e.respondWith(
    hit
      .then(res => {
        /* 🔴 只存「真的成功」的回應。
           以前沒檢查，所以 GitHub Pages 還在發佈時回的 404
           會被當成正常內容存進快取，之後就一直拿那份 404。 */
        if (res && res.ok && res.status === 200 && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => {
        if (r) return r;
        /* 🔴 只有「開頁面」才可以回 index.html。
           以前不管什麼都回它 —— 圖片拿到一份 HTML 就是破圖、
           影片拿到一份 HTML 就是永遠不播，而且錯誤訊息完全看不出原因。
           2026-09-16 的「logo 不見、背景全黑、影片不載」就是這個。 */
        if (isNav) return caches.match('./index.html');
        return Response.error();
      }))
  );
});
