import { randomUUID } from 'node:crypto';
import {
  BOOK_FORMATS,
  BOOK_STATUSES,
  type Book,
  type BookFormat,
  type BookStatus,
  type CreateBookInput,
  type CreateSessionInput,
  type ListBooksOptions,
  type ReadingSession,
  type SessionActivity,
  type Stats,
  type UpdateBookInput,
} from './types.js';

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_GENRE = 'Uncategorized';
const DEFAULT_FORMAT: BookFormat = 'Paperback';
const DEFAULT_COVER_COLOR = '#3D5A80';
const RECENT_SESSION_LIMIT = 5;
const COVER_PALETTE = [
  '#3D5A80',
  '#A44A3F',
  '#5B8C5A',
  '#7B6D8D',
  '#C9822D',
  '#2A6F6B',
  '#8C5E58',
  '#4F6D7A',
] as const;

export class StoreError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'StoreError';
    this.statusCode = statusCode;
  }
}

export class ValidationError extends StoreError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends StoreError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export interface StoreOptions {
  seed?: boolean;
  now?: () => Date;
}

export interface SeedData {
  books: Book[];
  sessions: ReadingSession[];
}

export function isBookStatus(value: unknown): value is BookStatus {
  return typeof value === 'string' && (BOOK_STATUSES as readonly string[]).includes(value);
}

export function isBookFormat(value: unknown): value is BookFormat {
  return typeof value === 'string' && (BOOK_FORMATS as readonly string[]).includes(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function toDateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromDateKey(key: string): Date {
  const [year = '1970', month = '01', day = '01'] = key.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
}

function shiftDateKey(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function isValidDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function matchesQuery(book: Book, query: string): boolean {
  return [book.title, book.author, book.genre].some((field) => field.toLowerCase().includes(query));
}

function fallbackCoverColor(seed: string): string {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 1_000_003;
  }
  return COVER_PALETTE[hash % COVER_PALETTE.length] ?? DEFAULT_COVER_COLOR;
}

function normalizeCoverColor(value: unknown, seed: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed;
  }
  return fallbackCoverColor(seed);
}

function resolveSessionDate(value: unknown, now: Date): string {
  if (value === undefined || value === null) return toDateKey(now);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return toDateKey(now);
    if (isValidDateKey(trimmed)) return trimmed;
  }
  throw new ValidationError('date must be a valid YYYY-MM-DD date');
}

function computeStreak(dates: ReadonlySet<string>, todayKey: string): number {
  let cursor = todayKey;
  if (!dates.has(cursor)) cursor = shiftDateKey(cursor, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export function createSeedData(now: Date = new Date()): SeedData {
  const timestamp = (daysAgo: number, hour = 9): string =>
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - daysAgo,
      hour,
      0,
      0,
      0,
    ).toISOString();
  const dayKey = (daysAgo: number): string =>
    toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12, 0, 0, 0));

  const books: Book[] = [
    {
      id: randomUUID(),
      title: 'The Midnight Library',
      author: 'Matt Haig',
      genre: 'Fiction',
      pages: 304,
      currentPage: 304,
      status: 'finished',
      rating: 5,
      format: 'Hardcover',
      addedAt: timestamp(40),
      finishedAt: timestamp(12, 23),
      coverColor: '#3D5A80',
      notes: 'Finished on a rainy weekend. The what-if chapters stayed with me.',
    },
    {
      id: randomUUID(),
      title: 'Project Hail Mary',
      author: 'Andy Weir',
      genre: 'Science Fiction',
      pages: 496,
      currentPage: 244,
      status: 'reading',
      rating: null,
      format: 'Paperback',
      addedAt: timestamp(25),
      finishedAt: null,
      coverColor: '#C9822D',
      notes: 'Trying to make this one last.',
    },
    {
      id: randomUUID(),
      title: 'The Name of the Wind',
      author: 'Patrick Rothfuss',
      genre: 'Fantasy',
      pages: 662,
      currentPage: 88,
      status: 'reading',
      rating: null,
      format: 'Hardcover',
      addedAt: timestamp(18),
      finishedAt: null,
      coverColor: '#2A6F6B',
      notes: '',
    },
    {
      id: randomUUID(),
      title: 'Dune',
      author: 'Frank Herbert',
      genre: 'Science Fiction',
      pages: 412,
      currentPage: 0,
      status: 'backlog',
      rating: null,
      format: 'Paperback',
      addedAt: timestamp(12),
      finishedAt: null,
      coverColor: '#7B6D8D',
      notes: 'Saving this one for a long winter.',
    },
    {
      id: randomUUID(),
      title: 'Educated',
      author: 'Tara Westover',
      genre: 'Memoir',
      pages: 334,
      currentPage: 0,
      status: 'backlog',
      rating: null,
      format: 'Ebook',
      addedAt: timestamp(8),
      finishedAt: null,
      coverColor: '#5B8C5A',
      notes: '',
    },
    {
      id: randomUUID(),
      title: 'The Hobbit',
      author: 'J. R. R. Tolkien',
      genre: 'Fantasy',
      pages: 310,
      currentPage: 310,
      status: 'finished',
      rating: 4,
      format: 'Audiobook',
      addedAt: timestamp(60),
      finishedAt: timestamp(30, 19),
      coverColor: '#A44A3F',
      notes: 'A comfort re-read on the commute.',
    },
  ];

  const bookId = (title: string): string => {
    const match = books.find((book) => book.title === title);
    if (!match) throw new Error(`Unknown seed book: ${title}`);
    return match.id;
  };

  const session = (
    title: string,
    daysAgo: number,
    pagesRead: number,
    minutes: number,
    note: string,
    hour = 21,
  ): ReadingSession => ({
    id: randomUUID(),
    bookId: bookId(title),
    pagesRead,
    minutes,
    date: dayKey(daysAgo),
    note,
    createdAt: timestamp(daysAgo, hour),
  });

  const sessions: ReadingSession[] = [
    session('The Midnight Library', 20, 84, 65, 'Read the first third in one sitting.', 21),
    session('The Midnight Library', 16, 110, 80, 'The middle chapters moved fast.', 22),
    session('The Midnight Library', 12, 110, 95, 'Finished at midnight.', 23),
    session('Project Hail Mary', 9, 96, 70, 'Could not put it down.', 21),
    session('Project Hail Mary', 4, 60, 45, '', 20),
    session('Project Hail Mary', 2, 56, 40, 'The Rocky chapters are the best.', 22),
    session('Project Hail Mary', 0, 32, 25, 'A quiet morning read.', 8),
    session('The Name of the Wind', 6, 48, 55, 'Slow start, beautiful prose.', 21),
    session('The Name of the Wind', 1, 40, 35, '', 22),
    session('The Hobbit', 40, 150, 120, 'First half on the train.', 8),
    session('The Hobbit', 30, 160, 130, 'Finished on a walk.', 19),
  ];

  return { books, sessions };
}

interface BookRecord {
  book: Book;
  seq: number;
}

interface SessionRecord {
  session: ReadingSession;
  seq: number;
}

export class ShelfmarkStore {
  private readonly books = new Map<string, BookRecord>();
  private sessions: SessionRecord[] = [];
  private nextSeq = 1;
  private readonly now: () => Date;

  constructor(options: StoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    if (options.seed !== false) {
      const seed = createSeedData(this.now());
      for (const book of seed.books) this.insertBook(book);
      for (const session of seed.sessions) this.insertSession(session);
    }
  }

  private insertBook(book: Book): void {
    this.books.set(book.id, { book: { ...book }, seq: this.nextSeq++ });
  }

  private insertSession(session: ReadingSession): void {
    this.sessions.push({ session: { ...session }, seq: this.nextSeq++ });
  }

  private toActivity(session: ReadingSession): SessionActivity {
    const record = this.books.get(session.bookId);
    return {
      sessionId: session.id,
      bookId: session.bookId,
      bookTitle: record?.book.title ?? 'Unknown book',
      bookColor: record?.book.coverColor ?? DEFAULT_COVER_COLOR,
      pagesRead: session.pagesRead,
      minutes: session.minutes,
      date: session.date,
    };
  }

  listBooks(options: ListBooksOptions = {}): Book[] {
    const status = options.status ?? 'all';
    if (status !== 'all' && !isBookStatus(status)) {
      throw new ValidationError(`status must be one of all, ${BOOK_STATUSES.join(', ')}`);
    }
    const query = typeof options.query === 'string' ? options.query.trim().toLowerCase() : '';
    return [...this.books.values()]
      .filter((record) => status === 'all' || record.book.status === status)
      .filter((record) => query === '' || matchesQuery(record.book, query))
      .sort((left, right) => {
        const byDate = right.book.addedAt.localeCompare(left.book.addedAt);
        return byDate !== 0 ? byDate : right.seq - left.seq;
      })
      .map((record) => ({ ...record.book }));
  }

  getBook(id: string): Book | undefined {
    const record = this.books.get(id);
    return record ? { ...record.book } : undefined;
  }

  listSessions(bookId?: string): ReadingSession[] {
    return this.sessions
      .filter((record) => bookId === undefined || record.session.bookId === bookId)
      .sort((left, right) => {
        const byDate = right.session.date.localeCompare(left.session.date);
        return byDate !== 0 ? byDate : right.seq - left.seq;
      })
      .map((record) => ({ ...record.session }));
  }

  addBook(input: CreateBookInput): Book {
    const raw = (input ?? {}) as Partial<CreateBookInput>;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (title === '') throw new ValidationError('title is required');
    const author = typeof raw.author === 'string' ? raw.author.trim() : '';
    if (author === '') throw new ValidationError('author is required');
    if (!isPositiveNumber(raw.pages)) throw new ValidationError('pages must be a positive number');
    const genre =
      typeof raw.genre === 'string' && raw.genre.trim() !== '' ? raw.genre.trim() : DEFAULT_GENRE;
    let format = DEFAULT_FORMAT;
    if (raw.format !== undefined && raw.format !== null) {
      if (!isBookFormat(raw.format)) {
        throw new ValidationError(`format must be one of ${BOOK_FORMATS.join(', ')}`);
      }
      format = raw.format;
    }
    const book: Book = {
      id: randomUUID(),
      title,
      author,
      genre,
      pages: raw.pages,
      currentPage: 0,
      status: 'backlog',
      rating: null,
      format,
      addedAt: this.now().toISOString(),
      finishedAt: null,
      coverColor: normalizeCoverColor(raw.coverColor, title),
      notes: typeof raw.notes === 'string' ? raw.notes.trim() : '',
    };
    this.insertBook(book);
    return { ...book };
  }

  updateBook(id: string, patch: UpdateBookInput): Book {
    const record = this.books.get(id);
    if (!record) throw new NotFoundError(`Book ${id} not found`);
    const raw = (patch ?? {}) as Partial<UpdateBookInput>;
    const next: Book = { ...record.book };
    if (raw.status !== undefined) {
      if (!isBookStatus(raw.status)) {
        throw new ValidationError(`status must be one of ${BOOK_STATUSES.join(', ')}`);
      }
      next.status = raw.status;
    }
    if (raw.rating !== undefined) {
      if (raw.rating === null) {
        next.rating = null;
      } else if (
        typeof raw.rating === 'number' &&
        Number.isFinite(raw.rating) &&
        raw.rating >= 1 &&
        raw.rating <= 5
      ) {
        next.rating = raw.rating;
      } else {
        throw new ValidationError('rating must be between 1 and 5 or null');
      }
    }
    if (raw.notes !== undefined) {
      if (typeof raw.notes !== 'string') throw new ValidationError('notes must be a string');
      next.notes = raw.notes;
    }
    if (next.status === 'finished') {
      next.currentPage = next.pages;
      next.finishedAt = next.finishedAt ?? this.now().toISOString();
    } else {
      next.finishedAt = null;
    }
    record.book = next;
    return { ...next };
  }

  deleteBook(id: string): boolean {
    const existed = this.books.delete(id);
    if (existed) this.sessions = this.sessions.filter((record) => record.session.bookId !== id);
    return existed;
  }

  addSession(bookId: string, input: CreateSessionInput): ReadingSession {
    const record = this.books.get(bookId);
    if (!record) throw new NotFoundError(`Book ${bookId} not found`);
    const raw = (input ?? {}) as Partial<CreateSessionInput>;
    if (!isPositiveNumber(raw.pagesRead)) {
      throw new ValidationError('pagesRead must be a positive number');
    }
    if (!isPositiveNumber(raw.minutes)) {
      throw new ValidationError('minutes must be a positive number');
    }
    if (raw.note !== undefined && typeof raw.note !== 'string') {
      throw new ValidationError('note must be a string');
    }
    const date = resolveSessionDate(raw.date, this.now());
    const session: ReadingSession = {
      id: randomUUID(),
      bookId,
      pagesRead: raw.pagesRead,
      minutes: raw.minutes,
      date,
      note: typeof raw.note === 'string' ? raw.note.trim() : '',
      createdAt: this.now().toISOString(),
    };
    this.insertSession(session);
    const book = record.book;
    book.currentPage = Math.min(book.pages, book.currentPage + raw.pagesRead);
    if (book.currentPage >= book.pages) {
      book.status = 'finished';
      book.finishedAt = book.finishedAt ?? this.now().toISOString();
    } else if (book.status === 'backlog') {
      book.status = 'reading';
    }
    return { ...session };
  }

  getStats(): Stats {
    const now = this.now();
    const todayKey = toDateKey(now);
    const monthPrefix = todayKey.slice(0, 7);
    const weekStartKey = shiftDateKey(todayKey, -6);
    const books = [...this.books.values()].map((record) => record.book);
    const sessions = this.sessions.map((record) => record.session);

    let backlog = 0;
    let reading = 0;
    let finished = 0;
    for (const book of books) {
      if (book.status === 'backlog') backlog += 1;
      else if (book.status === 'reading') reading += 1;
      else finished += 1;
    }

    const totalPagesRead = sessions.reduce((total, session) => total + session.pagesRead, 0);
    const pagesReadThisMonth = sessions
      .filter((session) => session.date.startsWith(monthPrefix))
      .reduce((total, session) => total + session.pagesRead, 0);
    const weeklyMinutes = sessions
      .filter((session) => session.date >= weekStartKey && session.date <= todayKey)
      .reduce((total, session) => total + session.minutes, 0);
    const currentStreak = computeStreak(new Set(sessions.map((session) => session.date)), todayKey);
    const recentSessions = [...this.sessions]
      .sort((left, right) => {
        const byDate = right.session.date.localeCompare(left.session.date);
        return byDate !== 0 ? byDate : right.seq - left.seq;
      })
      .slice(0, RECENT_SESSION_LIMIT)
      .map((record) => this.toActivity(record.session));

    return {
      totalBooks: books.length,
      backlog,
      reading,
      finished,
      totalPagesRead,
      pagesReadThisMonth,
      currentStreak,
      weeklyMinutes,
      recentSessions,
    };
  }
}

export function createStore(options: StoreOptions = {}): ShelfmarkStore {
  return new ShelfmarkStore(options);
}
