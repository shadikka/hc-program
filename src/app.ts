import { fetchSchedule, getDays, groupByTrack, groupDayByTrack, type Schedule, type Session } from "./schedule.js";
import { ScheduleRenderer } from "./render.js";
import { DayTimelineRenderer } from "./full-schedule.js";
import { DayTabs } from "./day-tabs.js";
import { registerServiceWorker } from "./sw-register.js";
import { requireById } from "./dom.js";
import { localDay } from "./format.js";

const RENDER_INTERVAL_MS = 20_000;
const FETCH_INTERVAL_MS = 60_000;

const root = requireById("tracks", HTMLElement);
const template = requireById("track-card-template", HTMLTemplateElement);
const nowNextEntryTemplate = requireById("now-next-entry-template", HTMLTemplateElement);
const sessionTemplate = requireById("day-session-template", HTMLTemplateElement);
const notesEl = document.getElementById("notes");
const statusLineEl = document.getElementById("status-line");
const statusEl = document.getElementById("status");
const offlineDotEl = document.getElementById("offline-dot");
const eventNameEl = document.getElementById("event-name");
const liveViewEl = requireById("live-view", HTMLElement);
const fullViewEl = requireById("full-view", HTMLElement);
const viewLiveButton = requireById("view-live", HTMLButtonElement);
const viewFullButton = requireById("view-full", HTMLButtonElement);
const dayTabsEl = requireById("day-tabs", HTMLElement);
const dayPanelEl = requireById("day-panel", HTMLElement);
const dayListEl = requireById("day-list", HTMLElement);

const renderer = new ScheduleRenderer(root, template, nowNextEntryTemplate);
const dayTimeline = new DayTimelineRenderer(dayListEl, sessionTemplate);

let schedule: Schedule | null = null;
let grouped: Map<string, Session[]> = new Map();
let selectedDay = "";
let renderTimer: number | undefined;
let fetchTimer: number | undefined;
let firstFullRender = true;

function pickDefaultDay(days: string[]): string {
  const today = localDay(new Date());
  return days.find((day) => day >= today) ?? days.at(-1) ?? "";
}

const dayTabs = new DayTabs(dayTabsEl, "day-panel", (day) => {
  selectedDay = day;
  dayPanelEl.setAttribute("aria-labelledby", `day-tab-${day}`);
  renderFullView();
});

function renderFullView(): void {
  if (!schedule) return;
  dayTimeline.render(selectedDay, schedule.tracks, groupDayByTrack(schedule, selectedDay));
  // Only on the very first render (page load) — not on every periodic
  // refresh or manual day-tab switch, which would otherwise yank the user's
  // scroll position back every minute.
  if (firstFullRender) {
    firstFullRender = false;
    dayTimeline.scrollToCurrent();
  }
}

function setViewMode(mode: "live" | "full"): void {
  liveViewEl.hidden = mode !== "live";
  fullViewEl.hidden = mode !== "full";
  viewLiveButton.setAttribute("aria-pressed", String(mode === "live"));
  viewFullButton.setAttribute("aria-pressed", String(mode === "full"));
}

viewLiveButton.addEventListener("click", () => setViewMode("live"));
viewFullButton.addEventListener("click", () => {
  const switchingIn = fullViewEl.hidden;
  setViewMode("full");
  if (switchingIn) dayTimeline.scrollToCurrent();
});

function renderNow(): void {
  const nowMs = Date.now();
  if (schedule) renderer.render(schedule, grouped, nowMs);
  dayTimeline.highlightCurrent(nowMs);
}

// Nothing to say while online and up to date — the indicator only takes up
// space once there's actually something worth telling the user about.
function setStatus(message: string, isError = false): void {
  if (statusLineEl instanceof HTMLElement) statusLineEl.hidden = message.length === 0;
  if (!(statusEl instanceof HTMLElement)) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("status-error", isError);
}

/** A small, always-visible dot — not a banner — green while the backend is reachable, red once it isn't. */
function setOffline(offline: boolean): void {
  if (!(offlineDotEl instanceof HTMLElement)) return;
  offlineDotEl.classList.toggle("is-offline", offline);
  offlineDotEl.title = offline ? "Offline — showing the last saved schedule" : "Connected";
}

function renderNotes(notes: string[]): void {
  if (!(notesEl instanceof HTMLElement)) return;
  notesEl.textContent = "";
  if (notes.length === 0) {
    notesEl.hidden = true;
    return;
  }
  notesEl.hidden = false;
  const list = document.createElement("ul");
  for (const note of notes) {
    const item = document.createElement("li");
    item.textContent = note;
    list.append(item);
  }
  notesEl.append(list);
}

async function refreshSchedule(): Promise<void> {
  try {
    const result = await fetchSchedule();
    schedule = result.schedule;
    grouped = groupByTrack(schedule);

    const days = getDays(schedule);
    dayTabs.setDays(days);
    if (!days.includes(selectedDay)) selectedDay = pickDefaultDay(days);
    dayTabs.select(selectedDay);

    if (eventNameEl instanceof HTMLElement) eventNameEl.textContent = schedule.event;
    renderNotes(schedule.notes);
    setOffline(result.source === "cache");
    setStatus(result.source === "cache" ? "Showing the last saved schedule (offline)." : "");
    renderNow();
  } catch (error) {
    setOffline(true);
    setStatus("Couldn't load the schedule.", true);
    console.error(error);
  }
}

function startTimers(): void {
  stopTimers();
  renderTimer = window.setInterval(renderNow, RENDER_INTERVAL_MS);
  fetchTimer = window.setInterval(() => void refreshSchedule(), FETCH_INTERVAL_MS);
}

function stopTimers(): void {
  if (renderTimer !== undefined) window.clearInterval(renderTimer);
  if (fetchTimer !== undefined) window.clearInterval(fetchTimer);
  renderTimer = undefined;
  fetchTimer = undefined;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopTimers();
    return;
  }
  void refreshSchedule();
  startTimers();
});

// Immediate feedback beyond the periodic refetch: the browser's own signal
// flips the dot on right away, and coming back online is only trusted once
// a real fetch of schedule.json actually succeeds (being "online" doesn't
// guarantee the backend is reachable, e.g. behind a captive portal).
window.addEventListener("offline", () => setOffline(true));
window.addEventListener("online", () => void refreshSchedule());

async function boot(): Promise<void> {
  registerServiceWorker();
  await refreshSchedule();
  if (document.visibilityState !== "hidden") startTimers();
}

void boot();
