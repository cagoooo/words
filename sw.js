const CACHE_NAME = 'words-cache-v3';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/styles.css',
    './js/app_v3.js',
    './manifest.json',
    './pwa_icon_192.png',
    './pwa_icon_512.png',
    './favicon.svg',
    // './audio/bgm.mp3', // 206 Partial Content fixes
    // './audio/stamp.mp3',
    './ink_elements/bamboo.png',
    './ink_elements/tree.png',
    './ink_elements/mountain.png',
    './rice_paper_texture.png',
    './ink_splash.png'
];

// 排除列表：防止攔截開發工具資源
const EXCLUDE_PATTERNS = [
    '/@vite/client',
    '/@react-refresh',
    'node_modules',
    'chrome-extension'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 檢查排除清單
    if (EXCLUDE_PATTERNS.some(pattern => url.pathname.includes(pattern))) {
        return;
    }

    // 跳過非 HTTP(S) 請求 (例如 chrome-extension, data:)
    if (!event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                return response;
            }
            return fetch(event.request).then((fetchResponse) => {
                // 僅快取成功且非 API 的請求
                if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic' || url.pathname.includes('/api/')) {
                    return fetchResponse;
                }

                const responseToCache = fetchResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return fetchResponse;
            });
        })
    );
});
