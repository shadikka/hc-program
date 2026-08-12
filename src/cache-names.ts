// Shared by sw.ts (which owns these caches) and schedule.ts (which reads
// DATA_CACHE directly as a fallback when there's no controlling SW yet).
// Keeping one definition avoids the two drifting out of sync, which would
// silently break the offline fallback.
//
// Routine content edits never require bumping either name: shell assets are
// served stale-while-revalidate (an edit lands in the cache on the next
// visit and is shown the visit after), and the single schedule.json entry
// is overwritten on every successful fetch and re-validated by parseSchedule
// when read back. Bump SHELL_CACHE only to purge entries for assets that
// were renamed or removed; DATA_CACHE should never need a bump.
export const SHELL_CACHE = "hc-shell-v4";
export const DATA_CACHE = "hc-data-v2";
