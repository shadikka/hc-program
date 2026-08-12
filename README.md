# hc-program

A small now/next schedule PWA for Hakkerileiri 2026. It shows the current and
upcoming session for each track (workshops, talks, leisure, other camp
events), works offline once loaded, and can be installed to a home screen.

Live at [shadikka.github.io/hc-program](https://shadikka.github.io/hc-program/).

## Structure

- `src/` — TypeScript app source: schedule state and now/next logic
  (`schedule.ts`, `full-schedule.ts`), rendering (`render.ts`, `dom.ts`),
  day-tab navigation (`day-tabs.ts`), formatting/time helpers
  (`format.ts`, `time.ts`), and service worker registration
  (`sw-register.ts`).
- `sw.ts` — service worker source (compiled separately from the main app).
- `public/` — static assets copied into the build as-is: `index.html`,
  `styles.css`, `manifest.webmanifest`, icons, and `schedule.json` (the
  program data, see below).
- `scripts/` — the esbuild-based build (`build.mjs`), a dev server with
  live rebuild (`dev.mjs`), and PWA icon generation (`generate-icons.mjs`).
- `.github/workflows/deploy.yml` — builds the app and deploys it to
  GitHub Pages on every push to `main`.

## Development

```
npm install
npm run dev        # local dev server with live rebuild
npm run build       # production build to dist/
npm run typecheck
```

## Schedule data

`public/schedule.json` isn't hand-edited. It's derived from an external,
organizer-maintained spreadsheet that isn't linked from this repo. Turning
that spreadsheet into `schedule.json` involves a few intermediate steps —
parsing its day/track layout, resolving a handful of sheet-specific quirks
and conventions, and normalizing everything into the session schema the app
expects — carried out with LLM assistance (see below) and reviewed before
being committed, rather than by a script checked into this repository.

## LLM usage

This repository — including the application code, the build tooling, and
the schedule-data conversion process described above — was built with
substantial assistance from an LLM (Claude, via Claude Code).

## License

MIT — see [LICENSE](LICENSE).
