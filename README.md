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

- **Shelf management** — add books with title, author, page count, tags, and a reading status
  (`want-to-read`, `reading`, `paused`, `finished`, `abandoned`).
- **Reading sessions** — log a session with date, minutes, pages read, and an optional note; the
  book's current page and status update with it.
- **Progress at a glance** — a per-book progress bar plus a reading-pace estimate derived from the
  sessions logged so far.
- **Ratings and reviews** — finish a book, give it one to five stars, and leave a short take.
- **Insights** — pages read, minutes read, current day streak, books finished, and average rating
  across the shelf, computed from the session history.
- **Calm UI** — paper-toned palette, generous whitespace, keyboard-friendly forms, and no
  account, email, or sign-up step.

## Tech stack

| Layer    | Choice                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| Frontend | Vue 3 (`<script setup>` SFCs) + Vite 7, plain CSS                              |
| Backend  | Express 5 on Node.js 20+, TypeScript, `NodeNext` build output to `dist-server` |
| Storage  | In-memory store seeded with sample books — no database, no migrations          |
| Tooling  | TypeScript strict mode, ESLint 9 + Prettier, Vitest, GitHub Actions CI         |

## Quick start

```bash
git clone https://github.com/your-username/shelfmark.git
cd shelfmark
npm install && npm run dev
```

Then open **http://localhost:5173** for the app. Vite proxies every `/api/*` request to the Express
server on port 3000, so the API responds at **http://127.0.0.1:3000/api/health**.

Requires Node.js 20.19 or newer (`^20.19.0 || >=22.12.0`, matching Vite 7). There are no external
services, no database container, and no API keys to configure.

## Scripts

| Command             | What it does                                                               |
| ------------------- | -------------------------------------------------------------------------- |
| `npm run dev`       | Runs the Express API (`tsx watch`) and the Vite dev server together        |
| `npm run build`     | Builds the client into `dist/` and compiles the server into `dist-server/` |
| `npm start`         | Runs the compiled API from `dist-server/server/index.js`                   |
| `npm run lint`      | ESLint over TypeScript/Vue sources, then a Prettier format check           |
| `npm run format`    | Rewrites files with Prettier                                               |
| `npm run typecheck` | `vue-tsc --noEmit` for the client and `tsc --noEmit` for the server        |
| `npm test`          | Vitest run (server tests in Node, component tests in jsdom)                |
| `npm run preview`   | Serves the production client build on port 4173                            |

## Production build

```bash
npm run build
npm start          # http://127.0.0.1:3000
curl http://127.0.0.1:3000/api/health
```

`vite build` emits the static client to `dist/`, and `tsc -p tsconfig.server.json` emits CommonJS
plus source maps to `dist-server/`, preserving the `server/` directory. `npm start` therefore runs
exactly `dist-server/server/index.js`, which serves the API on port 3000 (override with `PORT`).

## Architecture

```
Browser ──► Vite dev server :5173 ──► /api proxy ──► Express :3000 ──► in-memory store
   (Vue SFCs, fetch('/api/...'))            (server/routes, server/services)
```

- **Client** — Vue 3 single-page app mounted from `src/main.ts` into `#app`. Components call the API
  with relative `/api/...` URLs, so the same code works behind the Vite proxy in development and
  against the compiled server in production. The `@` alias points at `src/`.
- **Server** — Express 5 with a small layered structure: routes validate and shape HTTP, a service
  layer holds the reading logic, and a store module owns the in-memory collections. All state lives
  in process memory, so restarting the server resets the shelf to its seeded sample data.
- **Tests** — API and store tests run under Vitest's `node` environment; component tests run under
  `jsdom` with `@vue/test-utils`. `supertest` is available for HTTP-level tests against the Express
  app.

## API highlights

All endpoints are JSON under `/api` and never require authentication.

| Method   | Endpoint                  | Purpose                                                         |
| -------- | ------------------------- | --------------------------------------------------------------- |
| `GET`    | `/api/health`             | Liveness probe: `{ "status": "ok", ... }` for CI smoke tests    |
| `GET`    | `/api/books`              | List the shelf; supports `status`, `q`, and `sort` query params |
| `POST`   | `/api/books`              | Add a book to the shelf                                         |
| `GET`    | `/api/books/:id`          | Fetch one book with its session history summary                 |
| `PATCH`  | `/api/books/:id`          | Update status, current page, rating, or metadata                |
| `DELETE` | `/api/books/:id`          | Remove a book and its sessions                                  |
| `GET`    | `/api/books/:id/sessions` | List the reading sessions for a book                            |
| `POST`   | `/api/books/:id/sessions` | Log a session (date, minutes, pages) and advance progress       |
| `DELETE` | `/api/sessions/:id`       | Delete a session and roll the book's page count back            |
| `GET`    | `/api/insights`           | Aggregated pages, minutes, streak, finished count, rating       |

Example:

```bash
curl http://127.0.0.1:3000/api/health
# {"status":"ok","uptimeSeconds":12.4,"storage":"in-memory"}

curl -X POST http://127.0.0.1:3000/api/books \
  -H 'Content-Type: application/json' \
  -d '{"title":"The Left Hand of Darkness","author":"Ursula K. Le Guin","totalPages":304}'
```

### Data model

- **Book** — `id`, `title`, `author`, `totalPages`, `currentPage`, `status`, `rating` (1–5 or
  `null`), `tags`, `startedAt`, `finishedAt`, `createdAt`, `updatedAt`.
- **ReadingSession** — `id`, `bookId`, `date`, `minutes`, `pagesRead`, `note`, `createdAt`.
- **Insights** — computed from books and sessions on request; nothing is cached between calls.

## Project structure

```
.
├── server/                 # Express 5 API: index.ts (entry), routes, services, in-memory store
├── src/                    # Vue 3 client: main.ts (entry), App.vue, components, composables
├── index.html              # Vite HTML shell, fonts, and #app mount point
├── vite.config.ts          # Port 5173, /api proxy to http://127.0.0.1:3000
├── vitest.config.ts        # Node project for server tests, jsdom project for client tests
├── tsconfig.json           # Strict client config (bundler resolution, Vue SFCs)
├── tsconfig.server.json    # Strict NodeNext server build into dist-server/
├── eslint.config.js        # Flat ESLint 9 config for TS + Vue, Prettier-compatible
└── .github/workflows/ci.yml
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request with Node.js 22:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. Boots the compiled server in the background and curls `http://127.0.0.1:3000/api/health`,
   killing the process afterwards.

## Notes

- Storage is intentionally in-memory: the shelf resets on every server restart, which keeps the
  project dependency-free and easy to demo.
- No external services are contacted at runtime. The only network request the client makes is an
  optional Google Fonts stylesheet, which falls back to system fonts when offline.

## License

[MIT](LICENSE) © 2026 Shelfmark contributors
