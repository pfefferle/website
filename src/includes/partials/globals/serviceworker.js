const staticCacheName = version + '::' + 'static';
const pagesCacheName = 'pages';
const imagesCacheName = 'images';

const cacheList = [
  staticCacheName,
  pagesCacheName,
  imagesCacheName
];

const offlinePages = [
  '/',
  '/impressum/',
  '/datenschutz/',
  '/offline/'
];

function updateStaticCache() {
  return caches.open(staticCacheName)
    .then( cache => {
      // These items won't block the installation of the Service Worker
      cache.addAll([
        'assets/fonts/GT-Eesti-Display-Bold.woff2',
        'assets/fonts/GT-Eesti-Display-Regular.woff2',
        'assets/fonts/space-mono-v6-latin-regular.woff2'
      ].concat(offlinePages));
      // These items must be cached for the Service Worker to complete installation
      return cache.addAll([
        'assets/scripts/countdown.js?ver=' + version
      ]);
    });
}

function stashInCache(cacheName, request, response) {
    caches.open(cacheName)
        .then( cache => cache.put(request, response) );
}

// Limit the number of items in a specified cache.
function trimCache(cacheName, maxItems) {
    caches.open(cacheName)
        .then( cache => {
            cache.keys()
                .then(keys => {
                    if (keys.length > maxItems) {
                        cache.delete(keys[0])
                            .then(trimCache(cacheName, maxItems));
                    }
                });
        });
}

// Remove caches whose name is no longer valid
function clearOldCaches() {
    return caches.keys()
        .then( keys => {
            return Promise.all(keys
                .filter(key => !cacheList.includes(key))
                .map(key => caches.delete(key))
            );
        });
}

self.addEventListener('install', event => {
    event.waitUntil(updateStaticCache()
        .then( () => self.skipWaiting() )
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(clearOldCaches()
        .then( () => self.clients.claim() )
    );
});

self.addEventListener('message', event => {
    if (event.data.command == 'trimCaches') {
        trimCache(pagesCacheName, 30);
        trimCache(imagesCacheName, 60);
    }
});

self.addEventListener('fetch', event => {
    let request = event.request;
    let url = new URL(request.url);

    // Ignore non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // For HTML requests, try the network first, fall back to the cache, finally the offline page
    if (request.headers.get('Accept') != null) {
        if (request.headers.get('Accept').includes('text/html')) {

            event.respondWith(
                fetch(request)
                    .then( response => {
                        // NETWORK
                        // Stash a copy of this page in the pages cache
                        let copy = response.clone();
                        if (offlinePages.includes(url.pathname) || offlinePages.includes(url.pathname + '/')) {
                            stashInCache(staticCacheName, request, copy);
                        } else {
                            stashInCache(pagesCacheName, request, copy);
                        }
                        return response;
                    })
                    .catch( () => {
                        // CACHE or FALLBACK
                        return caches.match(request)
                            .then( response => response || caches.match('/offline/') );
                    })
            );
            return;
        }
    }

    // For non-HTML requests, look in the cache first, fall back to the network
    event.respondWith(
        caches.match(request)
            .then(response => {
                // CACHE
                return response || fetch(request)
                    .then( response => {
                        // NETWORK
                        // If the request is for an image, stash a copy of this image in the images cache
                        if (request.headers.get('Accept').includes('image')) {
                            let copy = response.clone();
                            stashInCache(imagesCacheName, request, copy);
                        }
                        return response;
                    })
                    .catch( () => {
                        // OFFLINE
                        // If the request is for an image, show an offline placeholder
                        if (request.headers.get('Accept').includes('image')) {
                            return new Response('<svg role="img" aria-labelledby="offline-title" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"><title id="offline-title">Offline</title><g fill="none" fill-rule="evenodd"><path fill="#D8D8D8" d="M0 0h400v300H0z"/><text fill="#9B9B9B" font-family="Helvetica Neue,Arial,Helvetica,sans-serif" font-size="72" font-weight="bold"><tspan x="93" y="172">offline</tspan></text></g></svg>', {headers: {'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store'}});
                        }
                    });
            })
    );
});
