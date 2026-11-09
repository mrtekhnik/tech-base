/* Service worker «Моей технической базы».
   Данные пользователя здесь не хранятся: они лежат в localStorage страницы.
   Воркер кэширует файлы программы, чтобы она открывалась без сети.
   Номер версии в CACHE подставляется сборкой автоматически. Новая версия ждёт,
   пока пользователь нажмёт «Обновить» в программе. */
const CACHE = 'techbase-pwa-v1.64';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-192.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  // самовосстановление: страница сообщает, что в кэше нет файлов программы
  if (e.data.type === 'REPAIR') {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).catch(() => {}));
  }
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('techbase-pwa-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const OFFLINE_HTML = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Моя техническая база</title></head><body style="font-family:sans-serif;padding:32px 20px;color:#222"><h2>Программа пока не загружена</h2><p>Файлы программы не найдены в памяти устройства. Включите интернет и нажмите кнопку: программа загрузится и дальше будет открываться без сети. Ваши записи на устройстве не затронуты.</p><button onclick="location.reload()" style="font-size:18px;padding:12px 24px">Повторить</button></body></html>';

// ищем страницу программы в кэше всеми способами
async function pageFromCache(req) {
  let r = await caches.match('./index.html');
  if (r) return r;
  r = await caches.match('./');
  if (r) return r;
  r = await caches.match(req, { ignoreSearch: true });
  if (r) return r;
  for (const k of await caches.keys()) {
    if (!k.startsWith('techbase-pwa-')) continue;
    const c = await caches.open(k);
    r = (await c.match('./index.html', { ignoreSearch: true })) || (await c.match('./', { ignoreSearch: true }));
    if (r) return r;
  }
  return null;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // страница: из кэша текущей версии, чтобы версия страницы совпадала с версией воркера;
    // если кэша нет, берём из сети и восстанавливаем кэш; без сети показываем понятную заглушку
    e.respondWith((async () => {
      try { const hit = await pageFromCache(req); if (hit) return hit; } catch (err) {}
      try {
        const r = await fetch(req);
        if (r.ok) {
          const copy = r.clone();
          e.waitUntil(caches.open(CACHE).then(c => Promise.all([
            c.put('./index.html', copy),
            c.addAll(FILES.filter(f => f !== './index.html' && f !== './').map(f => new Request(f, { cache: 'reload' })))
          ])).catch(() => {}));
        }
        return r;
      } catch (err) {
        return new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    }))
  );
});
