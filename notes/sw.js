
/* =========================================================
   DAILY LOG
   Service Worker
   Offline application-shell caching
   ========================================================= */

"use strict";


// ---------------------------------------------------------
// CACHE CONFIGURATION
// ---------------------------------------------------------

const CACHE_NAME = "daily-log-cache-v2";


// Only application files are cached.
// IndexedDB records are never included.

const APP_FILES = [

    "./",

    "./index.html",

    "./styles.css",

    "./db.js",

    "./app.js",

    "./manifest.webmanifest",

    // "./icon.svg"
    "./icon-192.png",
    "./icon-512.png"

];


// ---------------------------------------------------------
// INSTALL EVENT
// ---------------------------------------------------------

self.addEventListener("install", event => {

    console.log("Daily Log service worker installing.");

    event.waitUntil(

        caches.open(CACHE_NAME)
            .then(cache => {

                return cache.addAll(APP_FILES);

            })
            .then(() => {

                console.log(
                    "Daily Log application files cached."
                );

                return self.skipWaiting();

            })

    );

});


// ---------------------------------------------------------
// ACTIVATE EVENT
// ---------------------------------------------------------

self.addEventListener("activate", event => {

    console.log("Daily Log service worker activated.");

    event.waitUntil(

        caches.keys()
            .then(cacheNames => {

                return Promise.all(

                    cacheNames.map(cacheName => {

                        // Remove previous Daily Log caches,
                        // but leave unrelated browser caches alone.

                        if (
                            cacheName.startsWith("daily-log-cache-") &&
                            cacheName !== CACHE_NAME
                        ) {

                            return caches.delete(cacheName);

                        }

                    })

                );

            })
            .then(() => {

                return self.clients.claim();

            })

    );

});


// ---------------------------------------------------------
// FETCH EVENT
// ---------------------------------------------------------

self.addEventListener("fetch", event => {

    const request = event.request;

    // Only handle GET requests.

    if (request.method !== "GET") {
        return;
    }

    const requestURL = new URL(request.url);

    // Never intercept requests to other origins.

    if (requestURL.origin !== self.location.origin) {
        return;
    }

    // Only cache the known application shell.
    // This avoids accidentally caching user data or
    // unrelated resources.

    const isAppFile = APP_FILES.some(path => {

        const fileURL = new URL(path, self.location.href);

        return requestURL.href === fileURL.href;

    });

    if (!isAppFile) {
        return;
    }


    // Cache-first strategy.

    event.respondWith(

        caches.match(request)
            .then(cachedResponse => {

                if (cachedResponse) {

                    return cachedResponse;

                }

                // If no cached version exists, try network.

                return fetch(request)
                    .then(networkResponse => {

                        if (
                            networkResponse &&
                            networkResponse.ok
                        ) {

                            const responseCopy =
                                networkResponse.clone();

                            caches.open(CACHE_NAME)
                                .then(cache => {

                                    cache.put(
                                        request,
                                        responseCopy
                                    );

                                });

                        }

                        return networkResponse;

                    });

            })
            .catch(() => {

                // Offline fallback for the application page.

                if (request.mode === "navigate") {

                    return caches.match("./index.html");

                }

                return new Response(
                    "This resource is unavailable offline.",
                    {
                        status: 503,
                        statusText: "Offline"
                    }
                );

            })

    );

});


// ---------------------------------------------------------
// MESSAGE EVENT
// ---------------------------------------------------------

self.addEventListener("message", event => {

    if (
        event.data &&
        event.data.type === "SKIP_WAITING"
    ) {

        self.skipWaiting();

    }

});
