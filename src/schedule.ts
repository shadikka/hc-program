import { DATA_CACHE } from "./cache-names.js";

export interface Track {
  id: string;
  name: string;
}

export type SessionKind = "block" | "instant";

export interface Session {
  id: string;
  day: string;
  track: string;
  kind: SessionKind;
  start: string;
  end: string;
  author: string | null;
  title: string;
  location?: string;
  note?: string;
}

export interface Schedule {
  event: string;
  timezone: string;
  year_assumed: number;
  note: string;
  tracks: Track[];
  usage: string;
  sessions: Session[];
  notes: string[];
}

const SCHEDULE_URL = "schedule.json";

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["day"] === "string" &&
    typeof v["track"] === "string" &&
    (v["kind"] === "block" || v["kind"] === "instant") &&
    typeof v["start"] === "string" &&
    typeof v["end"] === "string" &&
    (typeof v["author"] === "string" || v["author"] === null) &&
    typeof v["title"] === "string" &&
    (v["location"] === undefined || typeof v["location"] === "string") &&
    (v["note"] === undefined || typeof v["note"] === "string")
  );
}

function isTrack(value: unknown): value is Track {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v["id"] === "string" && typeof v["name"] === "string";
}

export function parseSchedule(data: unknown): Schedule {
  if (typeof data !== "object" || data === null) {
    throw new Error("schedule.json: expected an object");
  }
  const v = data as Record<string, unknown>;
  if (!Array.isArray(v["tracks"]) || !v["tracks"].every(isTrack)) {
    throw new Error("schedule.json: invalid or missing tracks[]");
  }
  if (!Array.isArray(v["sessions"]) || !v["sessions"].every(isSession)) {
    throw new Error("schedule.json: invalid or missing sessions[]");
  }
  return {
    event: typeof v["event"] === "string" ? v["event"] : "",
    timezone: typeof v["timezone"] === "string" ? v["timezone"] : "",
    year_assumed: typeof v["year_assumed"] === "number" ? v["year_assumed"] : 0,
    note: typeof v["note"] === "string" ? v["note"] : "",
    tracks: v["tracks"],
    usage: typeof v["usage"] === "string" ? v["usage"] : "",
    sessions: v["sessions"],
    notes: Array.isArray(v["notes"]) ? v["notes"].filter((n): n is string => typeof n === "string") : [],
  };
}

/** Groups sessions by track id, sorted by start time ascending. Consumers render by iterating schedule.tracks and tolerate a missing entry, so tracks without sessions are simply absent. */
export function groupByTrack(schedule: Schedule): Map<string, Session[]> {
  const byTrack = Map.groupBy(schedule.sessions, (session) => session.track);
  for (const list of byTrack.values()) {
    list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
  return byTrack;
}

/** Unique session days, ascending (YYYY-MM-DD strings sort correctly as-is). */
export function getDays(schedule: Schedule): string[] {
  return [...new Set(schedule.sessions.map((s) => s.day))].sort();
}

/** All sessions on `day`, sorted by start time (ties broken by track id for a stable order). */
export function sessionsForDay(schedule: Schedule, day: string): Session[] {
  return schedule.sessions
    .filter((s) => s.day === day)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.track.localeCompare(b.track));
}

/** `day`'s sessions, grouped by track id, each list already in start-time order. */
export function groupDayByTrack(schedule: Schedule, day: string): Map<string, Session[]> {
  return Map.groupBy(sessionsForDay(schedule, day), (session) => session.track);
}

export interface FetchResult {
  schedule: Schedule;
  source: "network" | "cache";
}

/**
 * Fetches schedule.json fresh (`cache: "no-store"` skips the HTTP cache).
 * Falls back to whatever the service worker (or the browser's own offline
 * handling) can still serve from cache when the network is unavailable.
 *
 * When a service worker is controlling the page, a network failure still
 * resolves with a normal 200 (its own cache fallback) rather than a thrown
 * error, so `source` is read from the `Schedule-Source` response header the
 * worker tags its response with, not inferred from whether fetch() threw.
 */
export async function fetchSchedule(): Promise<FetchResult> {
  try {
    const response = await fetch(SCHEDULE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`schedule.json: HTTP ${response.status}`);
    const source = response.headers.get("Schedule-Source") === "cache" ? "cache" : "network";
    return { schedule: parseSchedule(await response.json()), source };
  } catch (networkError) {
    const cached = await readCachedSchedule();
    if (cached) return { schedule: cached, source: "cache" };
    throw networkError;
  }
}

async function readCachedSchedule(): Promise<Schedule | null> {
  if (!("caches" in globalThis)) return null;
  try {
    const cache = await caches.open(DATA_CACHE);
    const response = await cache.match(SCHEDULE_URL);
    if (!response) return null;
    return parseSchedule(await response.json());
  } catch {
    return null;
  }
}
