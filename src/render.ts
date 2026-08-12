import type { Schedule, Session, Track } from "./schedule.js";
import { computeNowNext, type NowNext } from "./time.js";
import { formatTimeRange, localDay, sessionMeta } from "./format.js";
import { requireEl, setOptionalText } from "./dom.js";

// The last* fields start as null, meaning "never rendered", so the first
// patch always writes the DOM (an empty list still needs its placeholder
// text). lastInstantKey's null doubles as "no upcoming instant" — safe,
// because the template's initial reminder state (hidden, empty) is exactly
// what the no-instant case would render anyway. Keys include the context
// day, not just session ids, so entries re-render at midnight when a
// "tomorrow" date prefix stops applying.
interface TrackRefs {
  card: HTMLElement;
  nowList: HTMLElement;
  nextList: HTMLElement;
  reminder: HTMLElement;
  lastCurrentKey: string | null;
  lastNextKey: string | null;
  lastInstantKey: string | null;
}

const NOTHING_NOW = "Nothing scheduled right now";
const NOTHING_NEXT = "Nothing else scheduled today";

export class ScheduleRenderer {
  private tracks = new Map<string, TrackRefs>();
  private trackOrder = "";

  constructor(
    private readonly root: HTMLElement,
    private readonly template: HTMLTemplateElement,
    private readonly entryTemplate: HTMLTemplateElement,
  ) {}

  render(schedule: Schedule, grouped: Map<string, Session[]>, nowMs: number): void {
    const order = schedule.tracks.map((t) => t.id).join("|");
    if (order !== this.trackOrder) {
      this.rebuild(schedule.tracks);
    }
    const today = localDay(new Date(nowMs));
    for (const track of schedule.tracks) {
      const refs = this.tracks.get(track.id);
      if (!refs) continue;
      const sessions = grouped.get(track.id) ?? [];
      this.patchTrack(refs, computeNowNext(sessions, nowMs), today);
    }
  }

  private rebuild(tracks: Track[]): void {
    this.root.textContent = "";
    this.tracks.clear();
    this.trackOrder = tracks.map((t) => t.id).join("|");

    for (const track of tracks) {
      const fragment = this.template.content.cloneNode(true) as DocumentFragment;
      const card = requireEl<HTMLElement>(fragment, ".track-card");
      const heading = requireEl<HTMLElement>(fragment, ".track-name");
      const headingId = `track-heading-${track.id}`;
      heading.id = headingId;
      heading.textContent = track.name;
      card.setAttribute("aria-labelledby", headingId);

      const refs: TrackRefs = {
        card,
        nowList: requireEl(fragment, '[data-field="now-list"]'),
        nextList: requireEl(fragment, '[data-field="next-list"]'),
        reminder: requireEl(fragment, '[data-field="reminder"]'),
        lastCurrentKey: null,
        lastNextKey: null,
        lastInstantKey: null,
      };

      this.tracks.set(track.id, refs);
      this.root.append(fragment);
    }
  }

  /** Fills `container` with one entry per session (or a placeholder when empty), cloning `entryTemplate` for each. */
  private renderList(container: HTMLElement, sessions: Session[], emptyText: string, today: string): void {
    container.textContent = "";
    if (sessions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "slot-title slot-empty";
      empty.textContent = emptyText;
      container.append(empty);
      return;
    }
    for (const session of sessions) {
      const fragment = this.entryTemplate.content.cloneNode(true) as DocumentFragment;
      requireEl<HTMLElement>(fragment, '[data-field="title"]').textContent = session.title;
      requireEl<HTMLElement>(fragment, '[data-field="meta"]').textContent = sessionMeta(session, today);
      setOptionalText(requireEl(fragment, '[data-field="note"]'), session.note);
      container.append(fragment);
    }
  }

  private patchTrack(refs: TrackRefs, nowNext: NowNext, today: string): void {
    refs.card.hidden = nowNext.current.length === 0 && nowNext.next.length === 0;

    const currentKey = [today, ...nowNext.current.map((s) => s.id)].join("|");
    if (currentKey !== refs.lastCurrentKey) {
      this.renderList(refs.nowList, nowNext.current, NOTHING_NOW, today);
      refs.lastCurrentKey = currentKey;
    }

    const nextKey = [today, ...nowNext.next.map((s) => s.id)].join("|");
    if (nextKey !== refs.lastNextKey) {
      this.renderList(refs.nextList, nowNext.next, NOTHING_NEXT, today);
      refs.lastNextKey = nextKey;
    }

    const instant = nowNext.upcomingInstant;
    const instantKey = instant ? `${today}|${instant.id}` : null;
    if (instantKey !== refs.lastInstantKey) {
      const note = instant?.note ? ` — ${instant.note}` : "";
      setOptionalText(refs.reminder, instant ? `${instant.title}: ${formatTimeRange(instant, today)}${note}` : undefined);
      refs.lastInstantKey = instantKey;
    }
  }
}
