import type { Session, Track } from "./schedule.js";
import { formatDayLabel, formatTime, sessionMeta } from "./format.js";
import { requireEl, setOptionalText } from "./dom.js";

/** Deterministic hue per track id, so each track reads as a consistent color without hardcoding ids. */
function trackHue(trackId: string): number {
  let hash = 0;
  for (let i = 0; i < trackId.length; i++) {
    hash = (Math.imul(hash, 31) + trackId.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

// "instant" sessions have zero real duration; give them enough visual height
// to stay readable rather than collapsing to a sliver. Also floors genuinely
// tiny block sessions (e.g. 15-minute lightning talks) for the same reason.
// That floor is never stretched past when the next session *in the same lane*
// starts (see `nextStartInLaneMs` in layoutLanes/buildSessionBlock) — so a
// 30-minute ceremony immediately followed by a talk can't be inflated into
// overlapping it. Genuinely long sessions are never capped this way: two
// sessions that really do overlap (e.g. two concurrent Thursday-night sauna
// programs) are laid out side by side instead, via lanes, rather than one
// truncating the other.
const MIN_DURATION_MINUTES = 25;

interface CurrentRef {
  session: Session;
  el: HTMLElement;
}

interface LaneInfo {
  /** 0-based horizontal slot within the sessions it overlaps. */
  lane: number;
  /** Concurrency of the cluster of mutually-overlapping sessions this one belongs to — determines how many lanes share the column's width right now. */
  laneCount: number;
  /** Start time (ms) of the next session assigned to this same lane, if any — used only to cap the MIN_DURATION_MINUTES floor, never a real duration. */
  nextStartInLaneMs: number | null;
}

function sessionEndMs(session: Session): number {
  return session.kind === "instant"
    ? Date.parse(session.start) + MIN_DURATION_MINUTES * 60_000
    : Date.parse(session.end);
}

/**
 * Lays out one track's sessions (already sorted by `start`) into horizontal
 * lanes so sessions that overlap in time render side by side instead of on
 * top of each other. Two passes over the same sorted list:
 *  1. Greedy interval-graph coloring assigns each session the first lane
 *     that's free (its previous occupant already ended). Lanes self-reset to
 *     0 whenever a real time gap opens, since every lane is free again then.
 *     Also records, per lane, the start of the next session sharing it — the
 *     only thing the MIN_DURATION_MINUTES floor is ever capped against.
 *  2. A separate sweep groups sessions into clusters of mutual overlap (by
 *     true end time, not the floored one) so `laneCount` — and thus each
 *     session's width — reflects the concurrency of its own cluster, not the
 *     busiest moment anywhere else that track has that day.
 */
function layoutLanes(sessions: Session[]): Map<Session, LaneInfo> {
  const info = new Map<Session, LaneInfo>();

  const laneEndMs: number[] = [];
  const lastInLane: (Session | null)[] = [];
  for (const session of sessions) {
    const startMs = Date.parse(session.start);
    const endMs = sessionEndMs(session);
    let lane = laneEndMs.findIndex((end) => end <= startMs);
    if (lane === -1) {
      lane = laneEndMs.length;
      laneEndMs.push(endMs);
      lastInLane.push(null);
    } else {
      laneEndMs[lane] = endMs;
    }
    const prev = lastInLane[lane];
    if (prev) info.get(prev)!.nextStartInLaneMs = startMs;
    lastInLane[lane] = session;
    info.set(session, { lane, laneCount: 1, nextStartInLaneMs: null });
  }

  let clusterStart = 0;
  let clusterMaxEnd = -Infinity;
  let clusterLanes = 0;
  const closeCluster = (endIndex: number) => {
    for (let i = clusterStart; i < endIndex; i++) {
      info.get(sessions[i]!)!.laneCount = clusterLanes;
    }
  };
  sessions.forEach((session, index) => {
    const startMs = Date.parse(session.start);
    if (startMs >= clusterMaxEnd) {
      closeCluster(index);
      clusterStart = index;
      clusterMaxEnd = -Infinity;
      clusterLanes = 0;
    }
    clusterLanes = Math.max(clusterLanes, info.get(session)!.lane + 1);
    clusterMaxEnd = Math.max(clusterMaxEnd, sessionEndMs(session));
  });
  closeCluster(sessions.length);

  return info;
}

/**
 * Renders one day as a time axis with one column per track that has
 * anything scheduled that day (empty tracks are omitted): every session is
 * positioned by its actual start offset and sized by its actual duration
 * (via CSS custom properties consumed as `calc(var(--x) * var(--minute-height))`),
 * so a 4-hour sauna block reads as visibly twice the height of a 2-hour one —
 * not by how many other sessions happen to start nearby, the way a
 * boundary-per-row table would. Rebuilt whole on day switch or schedule
 * refresh; `highlightCurrent` is the cheap per-tick update that only toggles
 * a class based on the current time, without touching the structure.
 */
export class DayTimelineRenderer {
  private currentRefs: CurrentRef[] = [];

  constructor(
    private readonly containerEl: HTMLElement,
    private readonly sessionTemplate: HTMLTemplateElement,
  ) {}

  render(day: string, tracks: Track[], byTrack: Map<string, Session[]>): void {
    this.containerEl.textContent = "";
    this.currentRefs = [];
    // The container persists across renders (only its content is rebuilt), so
    // an old day's scroll position would otherwise carry over — e.g. leaving
    // a short day's content scrolled past after switching from a long one.
    this.containerEl.scrollTo(0, 0);

    const visibleTracks = tracks.filter((track) => (byTrack.get(track.id)?.length ?? 0) > 0);
    if (visibleTracks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "day-empty";
      empty.textContent = "Nothing scheduled on this day.";
      this.containerEl.append(empty);
      return;
    }

    const { dayStartMs, totalMinutes } = this.computeBounds(visibleTracks, byTrack);

    const grid = document.createElement("div");
    grid.className = "day-grid";
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", `Full schedule for ${formatDayLabel(day)}`);
    grid.style.setProperty("--track-count", String(visibleTracks.length));
    grid.style.setProperty("--timeline-minutes", String(totalMinutes));

    grid.append(this.buildAxis(dayStartMs, totalMinutes));
    for (const track of visibleTracks) {
      grid.append(this.buildColumn(track, byTrack.get(track.id) ?? [], dayStartMs));
    }

    this.containerEl.append(grid);
    this.highlightCurrent(Date.now());
  }

  /** Toggles the "happening now" style on already-rendered blocks; doesn't rebuild anything. */
  highlightCurrent(nowMs: number): void {
    for (const { session, el } of this.currentRefs) {
      const isCurrent = Date.parse(session.start) <= nowMs && nowMs < Date.parse(session.end);
      el.classList.toggle("day-session-current", isCurrent);
    }
  }

  /**
   * Scrolls the timeline so whichever session is happening right now is in
   * view. A no-op if nothing is currently running — e.g. the displayed day
   * isn't today, or "now" falls in a gap between sessions — since there's no
   * current event to scroll to.
   */
  scrollToCurrent(nowMs = Date.now()): void {
    const current = this.currentRefs.find(
      ({ session }) => Date.parse(session.start) <= nowMs && nowMs < Date.parse(session.end),
    );
    current?.el.scrollIntoView({ block: "center", inline: "nearest" });
  }

  private computeBounds(tracks: Track[], byTrack: Map<string, Session[]>): { dayStartMs: number; totalMinutes: number } {
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const track of tracks) {
      for (const session of byTrack.get(track.id) ?? []) {
        const start = Date.parse(session.start);
        const end =
          session.kind === "instant" ? start + MIN_DURATION_MINUTES * 60_000 : Date.parse(session.end);
        minStart = Math.min(minStart, start);
        maxEnd = Math.max(maxEnd, end);
      }
    }
    // Round the visible window out to the nearest hour so the axis reads cleanly.
    const dayStartMs = Math.floor(minStart / 3_600_000) * 3_600_000;
    const dayEndMs = Math.ceil(maxEnd / 3_600_000) * 3_600_000;
    return { dayStartMs, totalMinutes: (dayEndMs - dayStartMs) / 60_000 };
  }

  private buildAxis(dayStartMs: number, totalMinutes: number): HTMLElement {
    const axis = document.createElement("div");
    axis.className = "day-axis";
    axis.setAttribute("aria-hidden", "true");
    for (let minutes = 0; minutes <= totalMinutes; minutes += 60) {
      const mark = document.createElement("div");
      mark.className = "day-axis-mark";
      mark.style.setProperty("--offset-minutes", String(minutes));
      mark.textContent = formatTime(dayStartMs + minutes * 60_000);
      axis.append(mark);
    }
    return axis;
  }

  private buildColumn(track: Track, sessions: Session[], dayStartMs: number): HTMLElement {
    const column = document.createElement("section");
    column.className = "day-track";
    column.style.setProperty("--track-hue", String(trackHue(track.id)));

    const headingId = `day-track-heading-${track.id}`;
    const heading = document.createElement("h3");
    heading.id = headingId;
    heading.className = "day-track-name";
    heading.textContent = track.name;
    column.setAttribute("aria-labelledby", headingId);
    column.append(heading);

    const body = document.createElement("div");
    body.className = "day-track-body";
    const laneInfo = layoutLanes(sessions);
    for (const session of sessions) {
      body.append(this.buildSessionBlock(session, dayStartMs, laneInfo.get(session)!));
    }
    column.append(body);

    return column;
  }

  private buildSessionBlock(session: Session, dayStartMs: number, lane: LaneInfo): DocumentFragment {
    const fragment = this.sessionTemplate.content.cloneNode(true) as DocumentFragment;
    const el = requireEl<HTMLElement>(fragment, ".day-session");

    const startMs = Date.parse(session.start);
    const offsetMinutes = (startMs - dayStartMs) / 60_000;
    const rawDuration = session.kind === "instant" ? MIN_DURATION_MINUTES : (Date.parse(session.end) - startMs) / 60_000;
    // Only a genuinely short session (below the floor) is ever capped, and
    // only against the next session sharing its lane — a real long duration
    // (e.g. an 8-hour sauna block) is never truncated just because another
    // session overlaps it in a different lane.
    const gapToNext = lane.nextStartInLaneMs !== null ? (lane.nextStartInLaneMs - startMs) / 60_000 : Infinity;
    const durationMinutes = rawDuration >= MIN_DURATION_MINUTES ? rawDuration : Math.min(MIN_DURATION_MINUTES, gapToNext);

    el.style.setProperty("--offset-minutes", String(offsetMinutes));
    el.style.setProperty("--duration-minutes", String(durationMinutes));
    el.style.setProperty("--lane", String(lane.lane));
    el.style.setProperty("--lane-count", String(lane.laneCount));
    if (session.kind === "instant") el.classList.add("day-session-instant");

    requireEl<HTMLElement>(fragment, '[data-field="title"]').textContent = session.title;
    requireEl<HTMLElement>(fragment, '[data-field="meta"]').textContent = sessionMeta(session);

    setOptionalText(requireEl(fragment, '[data-field="note"]'), session.note);

    if (session.kind === "block") this.currentRefs.push({ session, el });

    return fragment;
  }
}
