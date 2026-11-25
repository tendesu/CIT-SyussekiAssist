// ファイルを更新したらVERSIONを上げる
const VERSION = "v1";
const CACHE = "cit-syusseki-" + VERSION;
const ASSETS = [
    "./",
    "./index.html",
    "./manifest.json",
    "./icon-192.png",
    "./link/icon/cit_portal.png",
    "./link/icon/manaba.png",
    "./link/icon/gohan.png",
    "./link/icon/bus.png",
    "./link/icon/siryou.png",
];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
    self.skipWaiting();
});

// 古いバージョンのキャッシュを削除
self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

// キャッシュから即返し、裏で最新版を取得してキャッシュを更新
self.addEventListener("fetch", (e) => {
    if (e.request.method !== "GET") return;
    if (new URL(e.request.url).origin !== location.origin) return;

    e.respondWith(
        caches.open(CACHE).then((cache) =>
            cache.match(e.request, { ignoreSearch: true }).then((cached) => {
                const network = fetch(e.request)
                    .then((res) => {
                        if (res.ok) cache.put(e.request, res.clone());
                        return res;
                    })
                    .catch(() => cached);
                if (cached) {
                    e.waitUntil(network);
                    return cached;
                }
                return network;
            }),
        ),
    );
});
