import type { Session } from "./schedule.js";

export interface NowNext {
  /** Every session currently in progress for this track — a track can have more than one concurrent program (e.g. two Thursday-night sauna sessions running at once). */
  current: Session[];
  /** All sessions sharing the earliest upcoming start time — plural for the same reason as `current`. */
  next: Session[];
  /** An "instant" session (e.g. a checkout deadline) not yet reached. */
  upcomingInstant: Session | null;
}

/**
 * `sessions` must already be sorted by `start` ascending (see groupByTrack).
 * Implements the now/next rules from program_schema.md: block sessions use
 * a start<=now<end window; instant (zero-width) sessions never match that
 * window and are surfaced separately as an upcoming reminder. A track's
 * `current`/`next` are arrays, not single sessions, because concurrent
 * programs on the same track are allowed by design.
 */
export function computeNowNext(sessions: Session[], nowMs: number): NowNext {
  const current: Session[] = [];
  let next: Session[] = [];
  let nextStartMs = Infinity;
  let upcomingInstant: Session | null = null;

  for (const session of sessions) {
    const startMs = Date.parse(session.start);
    const endMs = Date.parse(session.end);

    if (session.kind === "instant") {
      if (startMs > nowMs && !upcomingInstant) {
        upcomingInstant = session;
      }
      continue;
    }

    if (startMs <= nowMs && nowMs < endMs) {
      current.push(session);
    } else if (startMs > nowMs && startMs <= nextStartMs) {
      if (startMs < nextStartMs) next = [];
      next.push(session);
      nextStartMs = startMs;
    }
  }

  return { current, next, upcomingInstant };
}
