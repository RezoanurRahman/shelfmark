# Shelfmark

**A calm personal reading log.** Shelfmark keeps track of the books on your shelf, the sessions
you actually read, how far you have got, and what your habits add up to — without feeds,
follower counts, or a single notification badge.

![Vue 3](https://img.shields.io/badge/Vue-3-42b883?logo=vuedotjs&logoColor=white)
![Express 5](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-2f6f4f)

## Why Shelfmark

Most reading trackers optimise for comparison. Shelfmark optimises for a quiet ten minutes on the
sofa: what am I reading, how much did I read this week, and is this book worth finishing? Progress
is presented as a page count and a streak of days, never as a leaderboard.

## Features

- **Shelf management** — add books with title, author, genre, page count, format, cover colour, and
  notes; move them between `backlog`, `reading`, and `finished`; remove them when they leave the
  shelf.
- **Reading sessions** — log a session with date, minutes, pages read, and an optional note. The
  book's current page advances with each session, a backlog book moves to `reading`, and the book
  is marked `finished` once its last page is logged.
- **Progress at a glance** — per-book progress bars, status filters for the three reading states,
  and free-text search across title, author, and genre.
- **Insights** — pages read all time and this month, current day streak, minutes this week, recent
  average session length, a seven-day chart, and a shelf breakdown by status, all computed from the
  session history on `GET /api/stats`.
- **Ratings and notes** — each card shows a 1–5 star rating and any notes; the API accepts a rating
  (1–5 or `null`) and notes on `PATCH /api/books/:id`.
- **Calm UI** — paper-toned palette, generous whitespace, keyboard-friendly dialogs, and no
  account, email, or sign-up step.

## Tech stack

| Layer    | Choice                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| Frontend | Vue 3 (`<script setup>` SFCs) + Vite 7, plain CSS                              |
| Backend  | Express 5 on Node.js 20+, TypeScript, `NodeNext` build output to `dist-server` |
| Storage  | In-memory store seeded with sample books and sessions — no database            |
| Tooling  | TypeScript strict mode, ESLint 9 + Prettier, Vitest, GitHub Actions CI         |

## Quick start

```bash
git clone https://github.com/RezoanurRahman/shelfmark.git
cd shelfmark
npm install && npm run dev
```

Open **http://localhost:5173** for the app. Vite proxies every `/api/*` request to the Express
server on port 3000, so the API answers at **http://127.0.0.1:3000/api/health** with
`{"ok":true,"service":"shelfmark"}`.

Requires Node.js 20.19 or newer (`^20.19.0 || >=22.12.0`, matching Vite 7). There are no external
services, no database containers, and no API keys to configure.

## Scripts

| Command              | What it does                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`        | Runs the Express API (`tsx watch`) and the Vite dev server together                         |
| `npm run build`      | Builds the client into `dist/`, then compiles the server into `dist-server/`                |
| `npm start`          | Runs the compiled API and serves the built client from `dist-server/server/index.js`        |
| `npm run lint`       | ESLint over TypeScript/Vue sources, then a Prettier format check                            |
| `npm run format`     | Rewrites files with Prettier                                                                |
| `npm run typecheck`  | `vue-tsc --noEmit` for the client and `tsc -p tsconfig.server.json --noEmit` for the server |
| `npm test`           | `vitest run` — the store suite under Vitest's Node environment                              |
| `npm run test:watch` | Vitest in watch mode                                                                        |
| `npm run preview`    | Serves the production client build alone on port 4173                                       |

## Production build

```bash
npm run build
npm start          # http://127.0.0.1:3000
curl http://127.0.0.1:3000/api/health
# {"ok":true,"service":"shelfmark"}
```

`vite build` emits the static client to `dist/`, and `tsc -p tsconfig.server.json` emits the server
plus source maps to `dist-server/`, preserving the `server/` directory. `npm start` therefore runs
exactly `dist-server/server/index.js`: it serves `/api/*`, then `dist/` as static files, and falls
back to `dist/index.html` for client-side routes. The API listens on port 3000 (override with
`PORT`; set `SHELFMARK_DIST_DIR` to point at a different client build).

## Architecture

```
Browser ──► Vite dev server :5173 ──► /api proxy ──► Express :3000 ──► in-memory store
   (Vue SFCs, fetch('/api/...'))        (server/index.ts)      (server/store.ts)
```

- **Client** — a Vue 3 single-page app mounted from `src/main.ts` into `#app`, with a Library view
  and an Insights view in `src/App.vue`. Components call the API through `src/api.ts` using
  relative `/api/...` URLs, so the same code works behind the Vite proxy in development and against
  the compiled server in production. The `@` alias points at `src/`.
- **Server** — Express 5 built by `createApp()` in `server/index.ts`. Routes validate and shape
  HTTP, `ShelfmarkStore` in `server/store.ts` owns the reading logic and the in-memory collections,
  and `server/types.ts` defines the shared API types. All state lives in process memory, so
  restarting the server resets the shelf to its seeded sample data.
- **Tests** — the suite currently lives in `server/store.test.ts` and runs under Vitest's `node`
  environment, covering seed data, filtering, validation, sessions, deletion, and stats. There are
  no component tests yet; `vitest.config.ts` also defines a `jsdom` project for `src/**` tests when
  they arrive.

### API/client naming

The API and the client use slightly different vocabularies, bridged in `src/api.ts`:

- the server stores `pages` and `genre`, while the client works with `totalPages` and `tags` (the
  raw fields are kept on the client object so payloads round-trip unchanged);
- the API validates capitalised formats — `Hardcover`, `Paperback`, `Ebook`, `Audiobook` — while
  the UI form and labels use lowercase names.

## API

All endpoints are JSON under `/api` and never require authentication.

| Method   | Endpoint                  | Purpose                                                                    |
| -------- | ------------------------- | -------------------------------------------------------------------------- |
| `GET`    | `/api/health`             | Liveness probe: `{ "ok": true, "service": "shelfmark" }`                   |
| `GET`    | `/api/books`              | List the shelf; optional `status` and `query` filters (see below)          |
| `GET`    | `/api/books/:id`          | Fetch one book, or `404` when it does not exist                            |
| `POST`   | `/api/books`              | Add a book to the shelf (`201`)                                            |
| `PATCH`  | `/api/books/:id`          | Update a book's `status`, `rating`, or `notes`                             |
| `DELETE` | `/api/books/:id`          | Remove a book and its sessions (`204`)                                     |
| `POST`   | `/api/books/:id/sessions` | Log a reading session and advance the book's progress (`201`)              |
| `GET`    | `/api/stats`              | Aggregated pages, streak, week minutes, status counts, and recent activity |

`GET /api/books` accepts two query parameters:

- `status` — one of `backlog`, `reading`, `finished`, or `all` (default `all`).
- `query` — case-insensitive text matched against title, author, and genre.

Examples:

```bash
curl http://127.0.0.1:3000/api/health
# {"ok":true,"service":"shelfmark"}

curl -X POST http://127.0.0.1:3000/api/books \
  -H 'Content-Type: application/json' \
  -d '{"title":"The Left Hand of Darkness","author":"Ursula K. Le Guin","genre":"Science fiction","pages":304,"format":"Paperback"}'

curl 'http://127.0.0.1:3000/api/books?status=reading&query=le%20guin'
```

A `POST /api/books` body requires `title`, `author`, and a positive `pages` count; `genre`
defaults to `Uncategorized` and `format` defaults to `Paperback`. Invalid input returns
`400 { "error": "..." }`, a missing book returns `404`, and unknown `/api` routes return
`404 { "error": "Not found" }`.

### Data model

- **Book** — `id`, `title`, `author`, `genre`, `pages`, `currentPage`, `status`
  (`backlog` | `reading` | `finished`), `rating` (1–5 or `null`), `format`
  (`Hardcover` | `Paperback` | `Ebook` | `Audiobook`), `addedAt`, `finishedAt`, `coverColor`, and
  `notes`.
- **ReadingSession** — `id`, `bookId`, `pagesRead`, `minutes`, `date` (`YYYY-MM-DD`), `note`, and
  `createdAt`.
- **Stats** — `totalBooks`, `backlog`, `reading`, `finished`, `totalPagesRead`,
  `pagesReadThisMonth`, `currentStreak`, `weeklyMinutes`, and `recentSessions` (the five newest
  sessions enriched with book title and colour). Everything is computed from the in-memory
  collections on request.

## Project structure

```
.
├── server/
│   ├── index.ts            # createApp(), routes, static SPA fallback, startServer()
│   ├── store.ts            # ShelfmarkStore: books, sessions, derived stats
│   ├── types.ts            # Shared API types and input contracts
│   └── store.test.ts       # Vitest (Node) suite for the store
├── src/
│   ├── api.ts              # fetch wrapper and API/client naming normalisation
│   ├── App.vue             # Library and Insights views
│   ├── main.ts             # Vue app entry
│   ├── types.ts            # Client-facing types, status and format labels
│   └── components/         # BookCard, BookFormModal, SessionModal, ActivityList, StatCard, …
├── index.html              # Vite HTML shell and #app mount point
├── vite.config.ts          # Port 5173, /api proxy to http://127.0.0.1:3000
├── vitest.config.ts        # Node project for server tests, jsdom project for src tests
├── tsconfig.json           # Strict client config (bundler resolution, Vue SFCs)
├── tsconfig.server.json    # Strict NodeNext server build into dist-server/
├── eslint.config.js        # Flat ESLint 9 config for TypeScript + Vue, Prettier-compatible
└── .github/workflows/ci.yml
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request with Node.js 22:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. Boots the compiled server in the background and retries
   `curl http://127.0.0.1:3000/api/health` once per second for up to 30 seconds, killing the
   process afterwards.

## Notes

- Storage is intentionally in-memory: the shelf resets on every server restart, which keeps the
  project dependency-free and easy to demo.
- No external services are contacted at runtime, and no API keys are needed. The only network
  request the page makes is an optional Google Fonts stylesheet, which falls back to system fonts
  when offline.

## License

[MIT](LICENSE) © 2026 Shelfmark contributors
