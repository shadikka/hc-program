import type { Session } from "./schedule.js";

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayLabelFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

export function formatTime(input: string | number | Date): string {
  return timeFormatter.format(new Date(input));
}

/** Local calendar day as YYYY-MM-DD — the same format Session.day uses. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** `day` is a YYYY-MM-DD string; appending a bare local time avoids it being parsed as UTC midnight, which can shift a day back in negative-offset timezones. */
export function formatDayLabel(day: string): string {
  return dayLabelFormatter.format(new Date(`${day}T00:00:00`));
}

/**
 * A single point in time for "instant" sessions, a start–end range otherwise.
 * Always plain times — a range running past midnight ("18:30–02:00") reads
 * fine without a date. (Not formatRange: it silently expands to full
 * datetimes when the endpoints fall on different days.) Only when the
 * session *starts* on a different day than `contextDay` (YYYY-MM-DD) is the
 * start's day label prefixed; omit `contextDay` where the surrounding UI
 * already pins the day (the full schedule view groups sessions by day).
 */
export function formatTimeRange(session: Session, contextDay?: string): string {
  const range =
    session.kind === "instant"
      ? formatTime(session.start)
      : `${formatTime(session.start)}–${formatTime(session.end)}`;
  return contextDay !== undefined && session.day !== contextDay ? `${formatDayLabel(session.day)} ${range}` : range;
}

/** Time range plus author/location, e.g. "10:00–11:00 · Aino Koskinen". */
export function sessionMeta(session: Session, contextDay?: string): string {
  const extras = [session.author, session.location].filter((v): v is string => !!v);
  const time = formatTimeRange(session, contextDay);
  return extras.length > 0 ? `${time} · ${extras.join(" · ")}` : time;
}
