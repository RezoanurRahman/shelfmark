import { describe, expect, it } from 'vitest';
import {
  NotFoundError,
  ShelfmarkStore,
  ValidationError,
  createSeedData,
  createStore,
} from './store.js';
import type {
  Book,
  BookFormat,
  BookStatus,
  CreateBookInput,
  CreateSessionInput,
  ReadingSession,
} from './types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FIXED_NOW = new Date(2026, 8, 18, 12, 0, 0, 0);

function fixedNow(): Date {
  return new Date(FIXED_NOW.getTime());
}

function seededStore(): ShelfmarkStore {
  return createStore({ now: fixedNow });
}

function emptyStore(): ShelfmarkStore {
  return new ShelfmarkStore({ seed: false, now: fixedNow });
}

const BOOK_INPUT: CreateBookInput = {
  title: 'Test Book',
  author: 'Test Author',
  genre: 'Fiction',
  pages: 300,
  format: 'Paperback',
};

const SESSION_INPUT: CreateSessionInput = { pagesRead: 25, minutes: 20 };

function bookByTitle(store: ShelfmarkStore, title: string): Book {
  const book = store.listBooks().find((candidate) => candidate.title === title);
  if (!book) throw new Error(`Expected a book titled "${title}"`);
  return book;
}

function firstSession(store: ShelfmarkStore, bookId?: string): ReadingSession {
  const session = store.listSessions(bookId)[0];
  if (!session) throw new Error('Expected at least one session');
  return session;
}

function seedShape(data: { books: Book[]; sessions: ReadingSession[] }): unknown {
  const titles = new Map(data.books.map((book) => [book.id, book.title]));
  return {
    books: data.books.map((book) => ({
      title: book.title,
      author: book.author,
      genre: book.genre,
      pages: book.pages,
      currentPage: book.currentPage,
      status: book.status,
      rating: book.rating,
      format: book.format,
      addedAt: book.addedAt,
      finishedAt: book.finishedAt,
      coverColor: book.coverColor,
      notes: book.notes,
    })),
    sessions: data.sessions.map((session) => ({
      book: titles.get(session.bookId),
      date: session.date,
      pagesRead: session.pagesRead,
      minutes: session.minutes,
      note: session.note,
      createdAt: session.createdAt,
    })),
  };
}

describe('seed data', () => {
  it('seeds at least five varied books with coherent fields', () => {
    const store = seededStore();
    const books = store.listBooks();
    expect(books.length).toBeGreaterThanOrEqual(5);
    expect(new Set(books.map((book) => book.status))).toEqual(
      new Set<BookStatus>(['backlog', 'reading', 'finished']),
    );
    for (const book of books) {
      expect(book.id).toMatch(UUID_PATTERN);
      expect(book.pages).toBeGreaterThan(0);
      expect(book.currentPage).toBeGreaterThanOrEqual(0);
      expect(book.currentPage).toBeLessThanOrEqual(book.pages);
      expect(book.coverColor).toMatch(HEX_COLOR_PATTERN);
      expect(['Hardcover', 'Paperback', 'Ebook', 'Audiobook']).toContain(book.format);
      expect(Number.isNaN(Date.parse(book.addedAt))).toBe(false);
      if (book.status === 'finished') {
        expect(book.finishedAt).not.toBeNull();
        expect(book.currentPage).toBe(book.pages);
      } else {
        expect(book.finishedAt).toBeNull();
      }
    }
  });

  it('seeds sessions linked to seeded books', () => {
    const store = seededStore();
    const sessions = store.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(5);
    const bookIds = new Set(store.listBooks().map((book) => book.id));
    for (const session of sessions) {
      expect(session.id).toMatch(UUID_PATTERN);
      expect(bookIds.has(session.bookId)).toBe(true);
      expect(session.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(session.pagesRead).toBeGreaterThan(0);
      expect(session.minutes).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(session.createdAt))).toBe(false);
    }
  });

  it('builds identical content for a fixed clock', () => {
    const first = createSeedData(FIXED_NOW);
    const second = createSeedData(FIXED_NOW);
    expect(seedShape(second)).toEqual(seedShape(first));
    expect(first.books.map((book) => book.title)).toContain('Project Hail Mary');
  });

  it('keeps seeded ids unique', () => {
    const { books, sessions } = createSeedData(FIXED_NOW);
    const ids = [...books.map((book) => book.id), ...sessions.map((session) => session.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('listBooks', () => {
  it('filters by status and supports all', () => {
    const store = seededStore();
    for (const status of ['backlog', 'reading', 'finished'] as const) {
      const books = store.listBooks({ status });
      expect(books.length).toBeGreaterThan(0);
      expect(books.every((book) => book.status === status)).toBe(true);
    }
    expect(store.listBooks({ status: 'all' }).length).toBe(store.listBooks().length);
  });

  it('matches title, author and genre case-insensitively', () => {
    const store = emptyStore();
    const target = store.addBook({
      ...BOOK_INPUT,
      title: 'The Left Hand of Darkness',
      author: 'Ursula K. Le Guin',
      genre: 'Science Fiction',
    });
    store.addBook({ ...BOOK_INPUT, title: 'Other Book', author: 'Someone Else', genre: 'History' });

    expect(store.listBooks({ query: 'LEFT HAND' }).map((book) => book.id)).toEqual([target.id]);
    expect(store.listBooks({ query: 'le guin' }).map((book) => book.id)).toEqual([target.id]);
    expect(store.listBooks({ query: 'science fiction' }).map((book) => book.id)).toEqual([
      target.id,
    ]);
    expect(store.listBooks({ query: '  darkness  ' }).map((book) => book.id)).toEqual([target.id]);
    expect(store.listBooks({ query: 'nothing here' })).toEqual([]);
    expect(store.listBooks({ query: '' }).length).toBe(2);
  });

  it('combines status and query filters', () => {
    const store = emptyStore();
    const reading = store.addBook({ ...BOOK_INPUT, title: 'Reading Now', genre: 'History' });
    const backlog = store.addBook({ ...BOOK_INPUT, title: 'Reading Later', genre: 'History' });
    store.addSession(reading.id, { pagesRead: 10, minutes: 10 });

    expect(store.listBooks({ status: 'reading', query: 'reading' }).map((book) => book.id)).toEqual(
      [reading.id],
    );
    expect(store.listBooks({ status: 'backlog', query: 'reading' }).map((book) => book.id)).toEqual(
      [backlog.id],
    );
  });

  it('returns newest added first', () => {
    const store = emptyStore();
    const oldest = store.addBook({ ...BOOK_INPUT, title: 'Oldest' });
    const middle = store.addBook({ ...BOOK_INPUT, title: 'Middle' });
    const newest = store.addBook({ ...BOOK_INPUT, title: 'Newest' });
    expect(store.listBooks().map((book) => book.id)).toEqual([newest.id, middle.id, oldest.id]);

    const seeded = seededStore()
      .listBooks()
      .map((book) => book.addedAt);
    expect([...seeded].sort().reverse()).toEqual(seeded);
  });

  it('rejects invalid statuses and returns copies', () => {
    const store = seededStore();
    expect(() => store.listBooks({ status: 'paused' as BookStatus })).toThrow(ValidationError);

    const books = store.listBooks();
    const book = books[0];
    if (!book) throw new Error('Expected a seeded book');
    book.title = 'Tampered';
    book.status = 'backlog';
    books.length = 0;
    expect(store.getBook(book.id)?.title).not.toBe('Tampered');
    expect(store.listBooks().length).toBeGreaterThan(0);
  });
});

describe('addBook', () => {
  it('adds a book with sensible defaults', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);

    expect(book.id).toMatch(UUID_PATTERN);
    expect(book.title).toBe('Test Book');
    expect(book.author).toBe('Test Author');
    expect(book.genre).toBe('Fiction');
    expect(book.pages).toBe(300);
    expect(book.currentPage).toBe(0);
    expect(book.status).toBe('backlog');
    expect(book.rating).toBeNull();
    expect(book.format).toBe('Paperback');
    expect(book.addedAt).toBe(FIXED_NOW.toISOString());
    expect(book.finishedAt).toBeNull();
    expect(book.notes).toBe('');
    expect(book.coverColor).toMatch(HEX_COLOR_PATTERN);
    expect(store.getBook(book.id)).toEqual(book);
  });

  it('trims text fields and fills in a genre', () => {
    const store = emptyStore();
    const book = store.addBook({
      ...BOOK_INPUT,
      title: '  Spaced Title  ',
      author: '  Spaced Author  ',
      genre: '   ',
      format: undefined as unknown as BookFormat,
      notes: '  A note.  ',
    });
    expect(book.title).toBe('Spaced Title');
    expect(book.author).toBe('Spaced Author');
    expect(book.genre).toBe('Uncategorized');
    expect(book.format).toBe('Paperback');
    expect(book.notes).toBe('A note.');
  });

  it('rejects invalid input', () => {
    const store = emptyStore();
    const invalid: Array<[string, unknown]> = [
      ['an empty title', { ...BOOK_INPUT, title: '   ' }],
      ['a missing title', { ...BOOK_INPUT, title: undefined }],
      ['a non-string title', { ...BOOK_INPUT, title: 42 }],
      ['an empty author', { ...BOOK_INPUT, author: '' }],
      ['a missing author', { ...BOOK_INPUT, author: undefined }],
      ['zero pages', { ...BOOK_INPUT, pages: 0 }],
      ['negative pages', { ...BOOK_INPUT, pages: -40 }],
      ['a string page count', { ...BOOK_INPUT, pages: '300' }],
      ['NaN pages', { ...BOOK_INPUT, pages: Number.NaN }],
      ['an unknown format', { ...BOOK_INPUT, format: 'Scroll' }],
      ['a null body', null],
    ];
    for (const [label, input] of invalid) {
      expect(() => store.addBook(input as CreateBookInput), label).toThrow(ValidationError);
    }
    expect(store.listBooks()).toEqual([]);
  });

  it('keeps a supplied cover color and invents a stable one otherwise', () => {
    const store = emptyStore();
    const supplied = store.addBook({
      ...BOOK_INPUT,
      coverColor: '#0f766e',
      notes: 'Gift from a friend.',
    });
    expect(supplied.coverColor).toBe('#0f766e');
    expect(supplied.notes).toBe('Gift from a friend.');

    const invalid = store.addBook({ ...BOOK_INPUT, title: 'Bright', coverColor: 'purple' });
    expect(invalid.coverColor).toMatch(HEX_COLOR_PATTERN);

    const first = store.addBook({ ...BOOK_INPUT, title: 'Stable Color' });
    const second = store.addBook({ ...BOOK_INPUT, title: 'Stable Color', author: 'Other Author' });
    expect(second.coverColor).toBe(first.coverColor);
  });
});

describe('updateBook', () => {
  it('updates status, rating and notes', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);
    const updated = store.updateBook(book.id, {
      status: 'reading',
      rating: 4,
      notes: 'Halfway through.',
    });

    expect(updated.status).toBe('reading');
    expect(updated.rating).toBe(4);
    expect(updated.notes).toBe('Halfway through.');
    expect(updated.finishedAt).toBeNull();
    expect(store.getBook(book.id)).toEqual(updated);
  });

  it('marks a book finished, then reopens it', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);
    const finished = store.updateBook(book.id, { status: 'finished' });

    expect(finished.currentPage).toBe(book.pages);
    expect(finished.finishedAt).toBe(FIXED_NOW.toISOString());

    const reopened = store.updateBook(book.id, { status: 'reading' });
    expect(reopened.finishedAt).toBeNull();
  });

  it('validates ratings, statuses and notes', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);

    expect(() => store.updateBook(book.id, { rating: 0 })).toThrow(ValidationError);
    expect(() => store.updateBook(book.id, { rating: 6 })).toThrow(ValidationError);
    expect(() => store.updateBook(book.id, { rating: '5' as unknown as number })).toThrow(
      ValidationError,
    );
    expect(() => store.updateBook(book.id, { status: 'paused' as BookStatus })).toThrow(
      ValidationError,
    );
    expect(() => store.updateBook(book.id, { notes: 42 as unknown as string })).toThrow(
      ValidationError,
    );

    expect(store.updateBook(book.id, { rating: 5 }).rating).toBe(5);
    expect(store.updateBook(book.id, { rating: null }).rating).toBeNull();
    expect(store.updateBook(book.id, {})).toEqual(book);
  });

  it('does not partially apply an invalid patch and rejects unknown ids', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);

    expect(() => store.updateBook(book.id, { status: 'reading', rating: 9 })).toThrow(
      ValidationError,
    );
    expect(store.getBook(book.id)?.status).toBe('backlog');
    expect(() => store.updateBook('missing-id', { rating: 3 })).toThrow(NotFoundError);
  });
});

describe('addSession', () => {
  it('logs a session, defaults the date and moves a backlog book into reading', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);
    const session = store.addSession(book.id, {
      pagesRead: 30,
      minutes: 25,
      note: 'Morning commute.',
    });

    expect(session.id).toMatch(UUID_PATTERN);
    expect(session.bookId).toBe(book.id);
    expect(session.pagesRead).toBe(30);
    expect(session.minutes).toBe(25);
    expect(session.note).toBe('Morning commute.');
    expect(session.date).toBe('2026-09-18');
    expect(session.createdAt).toBe(FIXED_NOW.toISOString());

    const updated = store.getBook(book.id);
    expect(updated?.currentPage).toBe(30);
    expect(updated?.status).toBe('reading');
    expect(updated?.finishedAt).toBeNull();
  });

  it('keeps an explicit date and note', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);
    const session = store.addSession(book.id, {
      pagesRead: 12,
      minutes: 15,
      date: '2026-09-01',
      note: '',
    });
    expect(session.date).toBe('2026-09-01');
    expect(session.note).toBe('');
  });

  it('finishes a book once the last page is read', () => {
    const store = emptyStore();
    const book = store.addBook({ ...BOOK_INPUT, pages: 100 });
    store.addSession(book.id, { pagesRead: 60, minutes: 40, date: '2026-09-17' });
    store.addSession(book.id, { pagesRead: 40, minutes: 30, date: '2026-09-18' });

    const finished = store.getBook(book.id);
    expect(finished?.currentPage).toBe(100);
    expect(finished?.status).toBe('finished');
    expect(finished?.finishedAt).toBe(FIXED_NOW.toISOString());
  });

  it('clamps progress to the page count', () => {
    const store = emptyStore();
    const book = store.addBook({ ...BOOK_INPUT, pages: 100 });
    store.addSession(book.id, { pagesRead: 500, minutes: 200 });
    expect(store.getBook(book.id)?.currentPage).toBe(100);
    expect(store.getBook(book.id)?.status).toBe('finished');
  });

  it('rejects invalid sessions and unknown books', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);
    const invalid: Array<[string, unknown]> = [
      ['zero pages', { pagesRead: 0, minutes: 10 }],
      ['negative pages', { pagesRead: -5, minutes: 10 }],
      ['a string page count', { pagesRead: 'ten', minutes: 10 }],
      ['missing pages', { minutes: 10 }],
      ['zero minutes', { pagesRead: 10, minutes: 0 }],
      ['negative minutes', { pagesRead: 10, minutes: -1 }],
      ['NaN minutes', { pagesRead: 10, minutes: Number.NaN }],
      ['an impossible date', { pagesRead: 10, minutes: 10, date: '2026-02-30' }],
      ['a non-date string', { pagesRead: 10, minutes: 10, date: 'today' }],
      ['a US-style date', { pagesRead: 10, minutes: 10, date: '09/18/2026' }],
      ['a numeric note', { pagesRead: 10, minutes: 10, note: 7 }],
      ['a null body', null],
    ];
    for (const [label, input] of invalid) {
      expect(() => store.addSession(book.id, input as CreateSessionInput), label).toThrow(
        ValidationError,
      );
    }
    expect(() => store.addSession('missing-id', SESSION_INPUT)).toThrow(NotFoundError);
    expect(store.listSessions()).toEqual([]);
  });

  it('keeps a per-book history of copies', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);
    const other = store.addBook({ ...BOOK_INPUT, title: 'Other Book' });
    store.addSession(book.id, { pagesRead: 10, minutes: 10 });
    store.addSession(book.id, { pagesRead: 20, minutes: 15, date: '2026-09-10' });
    store.addSession(other.id, { pagesRead: 5, minutes: 5 });

    const history = store.listSessions(book.id);
    expect(history).toHaveLength(2);
    expect(history.map((session) => session.date)).toEqual(['2026-09-18', '2026-09-10']);

    const session = firstSession(store, book.id);
    session.minutes = 1;
    expect(store.listSessions(book.id).some((candidate) => candidate.minutes === 1)).toBe(false);
  });
});

describe('deleteBook', () => {
  it('removes the book, its sessions and its activity', () => {
    const store = seededStore();
    const target = bookByTitle(store, 'Project Hail Mary');

    expect(store.listSessions(target.id).length).toBeGreaterThan(0);
    expect(store.deleteBook(target.id)).toBe(true);

    expect(store.getBook(target.id)).toBeUndefined();
    expect(store.listSessions(target.id)).toEqual([]);
    expect(store.listBooks().some((book) => book.id === target.id)).toBe(false);
    expect(store.getStats().recentSessions.some((entry) => entry.bookId === target.id)).toBe(false);
    expect(store.deleteBook(target.id)).toBe(false);
  });
});

describe('getStats', () => {
  interface StatsFixture {
    store: ShelfmarkStore;
    shelf: Book;
    second: Book;
  }

  function statsFixture(): StatsFixture {
    const store = emptyStore();
    const shelf = store.addBook({ ...BOOK_INPUT, title: 'Shelf Book', pages: 300 });
    const second = store.addBook({ ...BOOK_INPUT, title: 'Second Book', pages: 200 });
    store.addSession(shelf.id, { pagesRead: 20, minutes: 30, date: '2026-09-18' });
    store.addSession(shelf.id, { pagesRead: 10, minutes: 15, date: '2026-09-17' });
    store.addSession(shelf.id, { pagesRead: 10, minutes: 15, date: '2026-09-16' });
    store.addSession(second.id, { pagesRead: 50, minutes: 45, date: '2026-09-11' });
    store.addSession(second.id, { pagesRead: 40, minutes: 60, date: '2026-08-30' });
    store.updateBook(shelf.id, { status: 'finished' });
    return { store, shelf, second };
  }

  it('returns an empty summary for an empty shelf', () => {
    expect(emptyStore().getStats()).toEqual({
      totalBooks: 0,
      backlog: 0,
      reading: 0,
      finished: 0,
      totalPagesRead: 0,
      pagesReadThisMonth: 0,
      currentStreak: 0,
      weeklyMinutes: 0,
      recentSessions: [],
    });
  });

  it('counts books, pages, the month, the streak and the week', () => {
    const { store } = statsFixture();
    const stats = store.getStats();

    expect(stats.totalBooks).toBe(2);
    expect(stats.backlog).toBe(0);
    expect(stats.reading).toBe(1);
    expect(stats.finished).toBe(1);
    expect(stats.totalPagesRead).toBe(130);
    expect(stats.pagesReadThisMonth).toBe(90);
    expect(stats.currentStreak).toBe(3);
    expect(stats.weeklyMinutes).toBe(60);
  });

  it('counts a streak that ends yesterday', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);
    store.addSession(book.id, { pagesRead: 10, minutes: 10, date: '2026-09-17' });
    expect(store.getStats().currentStreak).toBe(1);
  });

  it('breaks a streak on a missing day', () => {
    const store = emptyStore();
    const book = store.addBook(BOOK_INPUT);
    store.addSession(book.id, { pagesRead: 10, minutes: 10, date: '2026-09-16' });
    expect(store.getStats().currentStreak).toBe(0);
  });

  it('returns the five most recent sessions enriched with book details', () => {
    const { store, shelf, second } = statsFixture();
    const recent = store.getStats().recentSessions;

    expect(recent).toHaveLength(5);
    expect(recent.map((entry) => entry.date)).toEqual([
      '2026-09-18',
      '2026-09-17',
      '2026-09-16',
      '2026-09-11',
      '2026-08-30',
    ]);
    expect(recent[0]?.bookId).toBe(shelf.id);
    expect(recent[0]?.bookTitle).toBe('Shelf Book');
    expect(recent[0]?.bookColor).toMatch(HEX_COLOR_PATTERN);
    expect(recent[0]?.pagesRead).toBe(20);
    expect(recent[0]?.minutes).toBe(30);
    expect(recent[0]?.sessionId).toMatch(UUID_PATTERN);
    expect(recent[4]?.bookId).toBe(second.id);
    expect(recent[4]?.bookTitle).toBe('Second Book');
  });

  it('summarises a seeded shelf without depending on its order', () => {
    const store = seededStore();
    const stats = store.getStats();
    const books = store.listBooks();
    const sessions = store.listSessions();

    expect(stats.totalBooks).toBe(books.length);
    expect(stats.backlog + stats.reading + stats.finished).toBe(books.length);
    expect(stats.totalPagesRead).toBe(
      sessions.reduce((total, session) => total + session.pagesRead, 0),
    );
    expect(stats.pagesReadThisMonth).toBeGreaterThan(0);
    expect(stats.currentStreak).toBeGreaterThanOrEqual(2);
    expect(stats.weeklyMinutes).toBeGreaterThan(0);
    expect(stats.recentSessions).toHaveLength(5);
    for (const entry of stats.recentSessions) {
      expect(entry.bookTitle.length).toBeGreaterThan(0);
      expect(entry.bookColor).toMatch(HEX_COLOR_PATTERN);
      expect(entry.pagesRead).toBeGreaterThan(0);
    }
    const recentDates = stats.recentSessions.map((entry) => entry.date);
    expect([...recentDates].sort().reverse()).toEqual(recentDates);
  });
});
