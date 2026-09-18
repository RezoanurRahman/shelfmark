import cors from 'cors';
import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { ShelfmarkStore, StoreError, ValidationError, isBookStatus } from './store.js';
import {
  BOOK_STATUSES,
  type BookStatus,
  type CreateBookInput,
  type CreateSessionInput,
  type ListBooksOptions,
  type UpdateBookInput,
} from './types.js';

const SERVICE_NAME = 'shelfmark';
const DEFAULT_PORT = 3000;

type RouteHandler = (request: Request, response: Response) => void;

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function pathParam(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function statusFromError(error: unknown): number {
  if (error instanceof StoreError) return error.statusCode;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { status?: unknown; statusCode?: unknown };
    const status = typeof candidate.status === 'number' ? candidate.status : candidate.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 600) return status;
  }
  return 500;
}

function messageFromError(error: unknown, status: number): string {
  if (error instanceof StoreError) return error.message;
  if (status < 500 && error instanceof Error && error.message !== '') {
    if ((error as { type?: unknown }).type === 'entity.parse.failed') return 'Invalid JSON body';
    return error.message;
  }
  return 'Internal server error';
}

function sendError(response: Response, error: unknown): void {
  const status = statusFromError(error);
  if (status >= 500) console.error('[shelfmark] request failed:', error);
  response.status(status).json({ error: messageFromError(error, status) });
}

function guard(handler: RouteHandler): RequestHandler {
  return (request, response, next) => {
    try {
      handler(request, response);
    } catch (error) {
      if (response.headersSent) {
        next(error);
        return;
      }
      sendError(response, error);
    }
  };
}

function resolveDistCandidates(): string[] {
  const candidates: string[] = [];
  if (process.env.SHELFMARK_DIST_DIR) candidates.push(path.resolve(process.env.SHELFMARK_DIST_DIR));
  candidates.push(path.resolve(process.cwd(), 'dist'));
  if (typeof __dirname === 'string') {
    candidates.push(path.resolve(__dirname, '..', 'dist'));
    candidates.push(path.resolve(__dirname, '..', '..', 'dist'));
  }
  return [...new Set(candidates)];
}

export function createApp(store: ShelfmarkStore = new ShelfmarkStore()): Express {
  const app = express();
  const distCandidates = resolveDistCandidates();

  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ ok: true, service: SERVICE_NAME });
  });

  app.get(
    '/api/books',
    guard((request, response) => {
      const requested = firstString(request.query.status) ?? 'all';
      let status: BookStatus | 'all' = 'all';
      if (requested !== 'all') {
        if (!isBookStatus(requested)) {
          throw new ValidationError(`status must be one of all, ${BOOK_STATUSES.join(', ')}`);
        }
        status = requested;
      }
      const options: ListBooksOptions = { status, query: firstString(request.query.query) ?? '' };
      response.json(store.listBooks(options));
    }),
  );

  app.get(
    '/api/books/:id',
    guard((request, response) => {
      const book = store.getBook(pathParam(request.params.id));
      if (!book) {
        response.status(404).json({ error: 'Book not found' });
        return;
      }
      response.json(book);
    }),
  );

  app.post(
    '/api/books',
    guard((request, response) => {
      const book = store.addBook(request.body as CreateBookInput);
      response.status(201).json(book);
    }),
  );

  app.patch(
    '/api/books/:id',
    guard((request, response) => {
      const book = store.updateBook(pathParam(request.params.id), request.body as UpdateBookInput);
      response.json(book);
    }),
  );

  app.delete(
    '/api/books/:id',
    guard((request, response) => {
      if (!store.deleteBook(pathParam(request.params.id))) {
        response.status(404).json({ error: 'Book not found' });
        return;
      }
      response.status(204).end();
    }),
  );

  app.post(
    '/api/books/:id/sessions',
    guard((request, response) => {
      const session = store.addSession(
        pathParam(request.params.id),
        request.body as CreateSessionInput,
      );
      response.status(201).json(session);
    }),
  );

  app.get(
    '/api/stats',
    guard((_request, response) => {
      response.json(store.getStats());
    }),
  );

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });

  for (const directory of distCandidates) {
    app.use(express.static(directory));
  }

  app.use((request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.status(404).json({ error: 'Not found' });
      return;
    }
    const indexHtml = distCandidates
      .map((directory) => path.join(directory, 'index.html'))
      .find((file) => fs.existsSync(file));
    if (!indexHtml) {
      response.status(404).json({ error: 'Not found' });
      return;
    }
    response.sendFile(indexHtml, (error) => {
      if (error) next(error);
    });
  });

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    sendError(response, error);
  });

  return app;
}

export const app = createApp();

export function startServer(port: number = Number(process.env.PORT) || DEFAULT_PORT): Server {
  const server = app.listen(port, () => {
    console.log(`[shelfmark] API listening on http://localhost:${port}`);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error('[shelfmark] server error:', error.message);
    process.exitCode = 1;
  });
  return server;
}

const isTestEnvironment =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST !== undefined ||
  process.env.SHELFMARK_AUTOSTART === 'false';

if (!isTestEnvironment) {
  startServer();
}
