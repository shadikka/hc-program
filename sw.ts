/// <reference lib="webworker" />
import { DATA_CACHE, SHELL_CACHE } from "./src/cache-names.js";

declare const self: ServiceWorkerGlobalScope;

const SCHEDULE_FILE = "schedule.json";
const SCHEDULE_TIMEOUT_MS = 5000;

const SHELL_ASSETS = [
  "./",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // "reload" bypasses the HTTP cache, so a (re)install can't precache stale bytes.
      await cache.addAll(SHELL_ASSETS.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isScheduleRequest(url: URL): boolean {
  return url.pathname.endsWith(`/${SCHEDULE_FILE}`);
}

// A network failure here still resolves with a normal 200 (from cache), so
// the page can't tell the two cases apart just by whether fetch() threw.
// Tag the response so it can — this is what the offline indicator relies on.
function withSourceHeader(response: Response, source: "network" | "cache"): Response {
  const headers = new Headers(response.headers);
  headers.set("Schedule-Source", source);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function networkFirstSchedule(request: Request): Promise<Response> {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(SCHEDULE_TIMEOUT_MS) });
    if (response.ok) await cache.put(request, response.clone());
    return withSourceHeader(response, "network");
  } catch {
    const cached = await cache.match(request);
    if (cached) return withSourceHeader(cached, "cache");
    throw new Error("schedule.json unavailable offline");
  }
}

// Stale-while-revalidate: answer from cache immediately, then refresh that
// entry from the network in the background, so an edited shell asset shows
// up one visit later — no SHELL_CACHE bump needed (see cache-names.ts).
async function staleWhileRevalidateShell(event: FetchEvent): Promise<Response> {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request).then(async (response) => {
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  });
  if (!cached) return refresh;
  // Keep the worker alive until the background refresh settles; swallow its
  // failure (e.g. offline) — the cached response has already been served.
  event.waitUntil(refresh.then(() => undefined, () => undefined));
  return cached;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isScheduleRequest(url)) {
    event.respondWith(networkFirstSchedule(request));
    return;
  }
  event.respondWith(staleWhileRevalidateShell(event));
});
