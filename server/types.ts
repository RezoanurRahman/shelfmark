export const BOOK_STATUSES = ['backlog', 'reading', 'finished'] as const;

export type BookStatus = (typeof BOOK_STATUSES)[number];

export const BOOK_FORMATS = ['Hardcover', 'Paperback', 'Ebook', 'Audiobook'] as const;

export type BookFormat = (typeof BOOK_FORMATS)[number];

export interface Book {
  id: string;
  title: string;
  author: string;
  genre: string;
  pages: number;
  currentPage: number;
  status: BookStatus;
  rating: number | null;
  format: BookFormat;
  addedAt: string;
  finishedAt: string | null;
  coverColor: string;
  notes: string;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  pagesRead: number;
  minutes: number;
  date: string;
  note: string;
  createdAt: string;
}

export interface SessionActivity {
  sessionId: string;
  bookId: string;
  bookTitle: string;
  bookColor: string;
  pagesRead: number;
  minutes: number;
  date: string;
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
  recentSessions: SessionActivity[];
}

export interface CreateBookInput {
  title: string;
  author: string;
  genre: string;
  pages: number;
  format: BookFormat;
  coverColor?: string;
  notes?: string;
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

export interface ListBooksOptions {
  status?: BookStatus | 'all';
  query?: string;
}
