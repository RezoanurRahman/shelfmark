/**
 * Shared frontend contract for Shelfmark.
 *
 * Mirrors the Express API (server/types.ts):
 *   GET    /api/books?status=&query=   -> Book[]
 *   GET    /api/stats                  -> Stats
 *   POST   /api/books                  -> Book            (CreateBookInput)
 *   PATCH  /api/books/:id              -> Book            (UpdateBookInput)
 *   DELETE /api/books/:id              -> 204
 *   POST   /api/books/:id/sessions     -> ReadingSession  (CreateSessionInput)
 *
 * Two naming notes, handled by src/api.ts:
 *   - the API stores `pages`/`genre`; the UI works with `totalPages`/`tags`
 *   - the API stores capitalized formats ('Paperback'); the UI uses lowercase
 */

export const BOOK_STATUSES = ['backlog', 'reading', 'finished'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const BOOK_FORMATS = ['paperback', 'hardcover', 'ebook', 'audiobook', 'other'] as const;
export type BookFormat = (typeof BOOK_FORMATS)[number];

export interface Book {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  format: BookFormat;
  /** Client-facing alias for the API's `pages`. */
  totalPages: number;
  currentPage: number;
  rating: number | null;
  coverColor: string;
  notes: string;
  /** Client-facing alias for the API's `genre` (comma separated). */
  tags: string[];
  addedAt: string;
  finishedAt: string | null;
  /** Raw API alias, kept so payloads round-trip unchanged. */
  pages?: number;
  genre?: string;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  pagesRead: number;
  minutes: number;
  /** YYYY-MM-DD date the reading happened. */
  date: string;
  note: string;
  createdAt: string;
}

/** A reading session enriched with the book it belongs to, for activity feeds. */
export interface SessionActivity {
  sessionId: string;
  /** Alias of `sessionId` used as the list key by ActivityList. */
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookColor: string;
  pagesRead: number;
  minutes: number;
  date: string;
  note: string;
}

export interface Stats {
  totalBooks: number;
  backlog: number;
  reading: number;
  finished: number;
  totalPagesRead: number;
  pagesReadThisMonth: number;
  currentStreak: number;
  weeklyMinutes: number;
  /** The API keeps the most recent sessions here (newest first). */
  recentSessions: SessionActivity[];
}

export interface CreateBookInput {
  title: string;
  author: string;
  genre?: string;
  tags?: string[];
  pages?: number;
  totalPages?: number;
  format?: BookFormat;
  coverColor?: string;
  notes?: string;
  status?: BookStatus;
}

export interface UpdateBookInput {
  status?: BookStatus;
  rating?: number | null;
  notes?: string;
}

export interface CreateSessionInput {
  pagesRead: number;
  minutes: number;
  date?: string;
  note?: string;
}

export const STATUS_LABELS: Record<BookStatus, string> = {
  backlog: 'Backlog',
  reading: 'Reading',
  finished: 'Finished',
};

export const FORMAT_LABELS: Record<BookFormat, string> = {
  paperback: 'Paperback',
  hardcover: 'Hardcover',
  ebook: 'E-book',
  audiobook: 'Audiobook',
  other: 'Other',
};
