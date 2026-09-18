import type {
  Book,
  BookFormat,
  BookStatus,
  CreateBookInput,
  CreateSessionInput,
  ReadingSession,
  SessionActivity,
  Stats,
  UpdateBookInput,
} from './types';

const API_BASE = '/api';

/** The API validates capitalized format names; the UI speaks lowercase. */
const API_FORMATS: Record<string, string> = {
  paperback: 'Paperback',
  hardcover: 'Hardcover',
  ebook: 'Ebook',
  audiobook: 'Audiobook',
  other: 'Paperback',
};

const DEFAULT_GENRE = 'Uncategorized';

const COVER_COLORS = [
  '#3d5a80',
  '#a44a3f',
  '#5b8c5a',
  '#7b6d8d',
  '#c9822d',
  '#2a6f6b',
  '#8c5e58',
  '#4f6d7a',
];

export interface BookQueryParams {
  status?: BookStatus | 'all';
  search?: string;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstString(source: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

function firstNumber(source: JsonRecord, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function firstStringArray(source: JsonRecord, keys: string[]): string[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
    }
    if (typeof value === 'string' && value.trim() !== '') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function asBookStatus(value: string): BookStatus {
  return (['backlog', 'reading', 'finished'] as string[]).includes(value)
    ? (value as BookStatus)
    : 'backlog';
}

function asBookFormat(value: string): BookFormat {
  return (['paperback', 'hardcover', 'ebook', 'audiobook', 'other'] as string[]).includes(value)
    ? (value as BookFormat)
    : 'other';
}

function coverColorFor(seed: string, provided: string | null): string {
  if (provided) return provided;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100_000;
  }
  return COVER_COLORS[hash % COVER_COLORS.length] ?? '#4d51c4';
}

function normalizeBook(raw: unknown, index: number): Book {
  const source = isRecord(raw) ? raw : {};
  const id = firstString(source, ['id', '_id', 'slug']) ?? `book-${index + 1}`;
  const title = firstString(source, ['title', 'name']) ?? 'Untitled';
  const totalPages = Math.max(0, Math.round(firstNumber(source, ['totalPages', 'pages'], 0)));
  const currentPage = Math.max(0, Math.round(firstNumber(source, ['currentPage', 'page'], 0)));
  const rating = firstNumber(source, ['rating'], Number.NaN);
  const tags = firstStringArray(source, ['tags', 'genre']).filter(
    (tag) => tag.toLowerCase() !== DEFAULT_GENRE.toLowerCase(),
  );

  return {
    id,
    title,
    author: firstString(source, ['author', 'writer']) ?? 'Unknown author',
    status: asBookStatus((firstString(source, ['status']) ?? 'backlog').toLowerCase()),
    format: asBookFormat((firstString(source, ['format', 'type']) ?? 'paperback').toLowerCase()),
    totalPages,
    currentPage,
    rating: Number.isFinite(rating) ? rating : null,
    coverColor: coverColorFor(id || title, firstString(source, ['coverColor', 'cover', 'color'])),
    notes: firstString(source, ['notes', 'note']) ?? '',
    tags,
    addedAt:
      firstString(source, ['addedAt', 'createdAt', 'created_at']) ?? new Date().toISOString(),
    finishedAt: firstString(source, ['finishedAt', 'finished_at']),
    pages: totalPages,
    genre: tags.join(', ') || DEFAULT_GENRE,
  };
}

function normalizeActivity(raw: unknown, index: number): SessionActivity {
  const source = isRecord(raw) ? raw : {};
  const id = firstString(source, ['sessionId', 'id', '_id']) ?? `session-${index + 1}`;
  return {
    sessionId: id,
    id,
    bookId: firstString(source, ['bookId', 'book_id']) ?? 'unknown-book',
    bookTitle: firstString(source, ['bookTitle', 'title']) ?? 'Untitled',
    bookAuthor: firstString(source, ['bookAuthor', 'author']) ?? '',
    bookColor: firstString(source, ['bookColor']) ?? '',
    pagesRead: Math.max(0, Math.round(firstNumber(source, ['pagesRead', 'pages'], 0))),
    minutes: Math.max(0, Math.round(firstNumber(source, ['minutes', 'duration'], 0))),
    date: firstString(source, ['date', 'sessionDate', 'readAt']) ?? '',
    note: firstString(source, ['note', 'notes']) ?? '',
  };
}

function normalizeSession(raw: unknown): ReadingSession {
  const source = isRecord(raw) ? raw : {};
  return {
    id: firstString(source, ['id', '_id']) ?? 'session',
    bookId: firstString(source, ['bookId', 'book_id']) ?? '',
    pagesRead: Math.max(0, Math.round(firstNumber(source, ['pagesRead', 'pages'], 0))),
    minutes: Math.max(0, Math.round(firstNumber(source, ['minutes', 'duration'], 0))),
    date: firstString(source, ['date', 'sessionDate']) ?? '',
    note: firstString(source, ['note', 'notes']) ?? '',
    createdAt: firstString(source, ['createdAt', 'created_at']) ?? '',
  };
}

function toApiFormat(value: BookFormat | string | undefined): string {
  if (typeof value === 'string') {
    const mapped = API_FORMATS[value] ?? API_FORMATS[value.toLowerCase()];
    if (mapped) return mapped;
  }
  return 'Paperback';
}

function extractList(payload: unknown, key: string): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload)) {
    for (const candidate of [key, 'items', 'data', 'results']) {
      if (Array.isArray(payload[candidate])) return payload[candidate] as unknown[];
    }
  }
  throw new Error(`Unexpected response from ${API_BASE}/${key}: expected a list of items.`);
}

function describeError(status: number, body: unknown): string {
  let detail: string | null = null;
  if (isRecord(body)) {
    detail = firstString(body, ['error', 'message', 'detail']);
  } else if (typeof body === 'string' && body.trim() !== '') {
    detail = body.trim().slice(0, 240);
  }

  const statusText = status >= 500 ? 'The Shelfmark server hit a problem' : 'Request failed';
  return detail ? `${statusText} (${status}): ${detail}` : `${statusText} with status ${status}.`;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new Error('Could not reach the Shelfmark API. Make sure the server is running.');
  }

  const body = await readBody(response);
  if (!response.ok) throw new Error(describeError(response.status, body));
  return body as T;
}

export async function getBooks(params: BookQueryParams = {}): Promise<Book[]> {
  const query = new URLSearchParams();
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.search && params.search.trim() !== '') query.set('query', params.search.trim());
  const queryString = query.toString();
  const payload = await request<unknown>(`/books${queryString ? `?${queryString}` : ''}`);
  return extractList(payload, 'books').map((item, index) => normalizeBook(item, index));
}

export async function getStats(): Promise<Stats> {
  const payload = await request<unknown>('/stats');
  const outer = isRecord(payload) ? payload : {};
  const source = isRecord(outer.stats) ? outer.stats : outer;
  const sessions = [source.recentSessions, source.recentActivity, source.activity].find(
    Array.isArray,
  );

  return {
    totalBooks: firstNumber(source, ['totalBooks', 'bookCount']),
    backlog: firstNumber(source, ['backlog', 'booksBacklog']),
    reading: firstNumber(source, ['reading', 'booksReading']),
    finished: firstNumber(source, ['finished', 'booksFinished']),
    totalPagesRead: firstNumber(source, ['totalPagesRead', 'pagesRead']),
    pagesReadThisMonth: firstNumber(source, ['pagesReadThisMonth', 'monthPages']),
    currentStreak: firstNumber(source, ['currentStreak', 'streak']),
    weeklyMinutes: firstNumber(source, ['weeklyMinutes', 'minutesThisWeek']),
    recentSessions: Array.isArray(sessions)
      ? sessions.map((item, index) => normalizeActivity(item, index))
      : [],
  };
}

export async function createBook(input: CreateBookInput): Promise<Book> {
  const genre = input.genre?.trim() || (input.tags ?? []).join(', ');
  const payload = {
    title: input.title,
    author: input.author,
    genre: genre.trim() || DEFAULT_GENRE,
    pages: Math.round(input.pages ?? input.totalPages ?? 0),
    format: toApiFormat(input.format),
    notes: input.notes ?? '',
    coverColor: input.coverColor,
  };
  const response = await request<unknown>('/books', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const record = isRecord(response) && isRecord(response.book) ? response.book : response;
  return normalizeBook(record, 0);
}

export async function updateBook(id: string, patch: UpdateBookInput): Promise<Book> {
  const payload: UpdateBookInput = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.rating !== undefined) payload.rating = patch.rating;
  if (patch.notes !== undefined) payload.notes = patch.notes;

  const response = await request<unknown>(`/books/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  const record = isRecord(response) && isRecord(response.book) ? response.book : response;
  return normalizeBook(record, 0);
}

export async function deleteBook(id: string): Promise<void> {
  await request<unknown>(`/books/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function createSession(
  bookId: string,
  input: CreateSessionInput,
): Promise<ReadingSession> {
  const payload: Record<string, unknown> = {
    pagesRead: input.pagesRead,
    minutes: input.minutes,
  };
  if (input.date) payload.date = input.date;
  if (input.note !== undefined) payload.note = input.note;

  const response = await request<unknown>(`/books/${encodeURIComponent(bookId)}/sessions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const record = isRecord(response) && isRecord(response.session) ? response.session : response;
  return normalizeSession(record);
}
