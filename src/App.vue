<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ActivityList from './components/ActivityList.vue';
import BookCard from './components/BookCard.vue';
import BookFormModal from './components/BookFormModal.vue';
import BrandMark from './components/BrandMark.vue';
import EmptyState from './components/EmptyState.vue';
import SessionModal from './components/SessionModal.vue';
import StatCard from './components/StatCard.vue';
import { createBook, createSession, deleteBook, getBooks, getStats, updateBook } from './api';
import { STATUS_LABELS } from './types';
import type {
  Book,
  BookStatus,
  CreateBookInput,
  CreateSessionInput,
  SessionActivity,
  Stats,
} from './types';

type View = 'library' | 'insights';
type StatusFilter = BookStatus | 'all';

interface DaySummary {
  key: string;
  label: string;
  fullLabel: string;
  minutes: number;
  pages: number;
  sessions: number;
}

interface Notice {
  message: string;
  tone: 'info' | 'error';
}

const statusTabs: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'reading', label: 'Reading' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'finished', label: 'Finished' },
];

const books = ref<Book[]>([]);
const stats = ref<Stats | null>(null);
const loading = ref(true);
const refreshing = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const view = ref<View>('library');
const statusFilter = ref<StatusFilter>('all');
const search = ref('');
const bookModalOpen = ref(false);
const sessionBook = ref<Book | null>(null);
const pendingDelete = ref<Book | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const notice = ref<Notice | null>(null);
let noticeTimer: number | undefined;

const numberFormat = new Intl.NumberFormat();

function formatNumber(value: number): string {
  return numberFormat.format(Math.round(value));
}

function relativeError(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function flash(message: string, tone: Notice['tone'] = 'info'): void {
  notice.value = { message, tone };
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.value = null;
  }, 3800);
}

/* ------------------------------------------------------------------ loading */

async function loadAll(options: { silent?: boolean } = {}): Promise<void> {
  if (options.silent) refreshing.value = true;
  else loading.value = true;
  error.value = null;

  try {
    const [bookList, statsData] = await Promise.all([getBooks(), getStats()]);
    books.value = bookList;
    stats.value = statsData;
  } catch (cause) {
    if (options.silent && books.value.length > 0) {
      flash(relativeError(cause, 'Could not refresh your shelf.'), 'error');
    } else {
      error.value = relativeError(cause, 'Something went wrong while loading your shelf.');
    }
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

onMounted(() => {
  void loadAll();
  window.addEventListener('keydown', handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.clearTimeout(noticeTimer);
  document.body.classList.remove('is-modal-open');
});

/* ------------------------------------------------------------- derived data */

const counts = computed<Record<StatusFilter, number>>(() => ({
  all: books.value.length,
  reading: books.value.filter((book) => book.status === 'reading').length,
  backlog: books.value.filter((book) => book.status === 'backlog').length,
  finished: books.value.filter((book) => book.status === 'finished').length,
}));

const filteredBooks = computed(() => {
  const query = search.value.trim().toLowerCase();
  return books.value.filter((book) => {
    if (statusFilter.value !== 'all' && book.status !== statusFilter.value) return false;
    if (query === '') return true;
    const haystack = [book.title, book.author, ...(book.tags ?? [])].join(' ').toLowerCase();
    return haystack.includes(query);
  });
});

const readingBooks = computed(() =>
  books.value.filter((book) => book.status === 'reading').slice(0, 4),
);

/** The API exposes the most recent sessions (newest first) on /api/stats. */
const activity = computed<SessionActivity[]>(() => stats.value?.recentSessions ?? []);

const totalPagesRead = computed(() => {
  const fromServer = stats.value?.totalPagesRead ?? 0;
  if (fromServer > 0) return fromServer;
  return books.value.reduce((sum, book) => sum + Math.max(0, book.currentPage || 0), 0);
});

const pagesReadThisMonth = computed(() => stats.value?.pagesReadThisMonth ?? 0);
const weeklyMinutes = computed(() => stats.value?.weeklyMinutes ?? 0);
const recordedSessions = computed(() => activity.value.length);

const averageSessionMinutes = computed(() => {
  if (activity.value.length === 0) return 0;
  const total = activity.value.reduce((sum, item) => sum + (item.minutes || 0), 0);
  return Math.round(total / activity.value.length);
});

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function dateKeyOf(value: string): string {
  return (value ?? '').slice(0, 10);
}

const weekDays = computed<DaySummary[]>(() => {
  const totals = new Map<string, { minutes: number; pages: number; sessions: number }>();
  for (const item of activity.value) {
    const key = dateKeyOf(item.date);
    if (key === '') continue;
    const entry = totals.get(key) ?? { minutes: 0, pages: 0, sessions: 0 };
    entry.minutes += item.minutes || 0;
    entry.pages += item.pagesRead || 0;
    entry.sessions += 1;
    totals.set(key, entry);
  }

  const today = new Date();
  const days: DaySummary[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = dayKey(date);
    const entry = totals.get(key) ?? { minutes: 0, pages: 0, sessions: 0 };
    days.push({
      key,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      fullLabel: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      ...entry,
    });
  }
  return days;
});

const weekMax = computed(() => Math.max(1, ...weekDays.value.map((day) => day.minutes)));

function weekBarWidth(minutes: number): string {
  if (minutes <= 0) return '0%';
  return `${Math.max(12, Math.round((minutes / weekMax.value) * 100))}%`;
}

const currentStreak = computed(() => {
  const fromServer = stats.value?.currentStreak ?? 0;
  if (fromServer > 0) return fromServer;
  const keys = new Set(activity.value.map((item) => dateKeyOf(item.date)).filter(Boolean));
  if (keys.size === 0) return 0;

  const cursor = new Date();
  if (!keys.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (keys.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
});

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up, reader';
  if (hour < 12) return 'Good morning, reader';
  if (hour < 18) return 'Good afternoon, reader';
  return 'Good evening, reader';
});

const progressSummary = computed(() => {
  if (books.value.length === 0) return 'Your shelf is waiting for its first book.';
  const parts = [`${formatNumber(totalPagesRead.value)} pages read`];
  if (pagesReadThisMonth.value > 0)
    parts.push(`${formatNumber(pagesReadThisMonth.value)} this month`);
  if (weeklyMinutes.value > 0) parts.push(`${formatNumber(weeklyMinutes.value)} minutes this week`);
  if (currentStreak.value > 1) parts.push(`${currentStreak.value}-day streak`);
  return `${parts.join(' · ')}.`;
});

const insightSummary = computed(() => {
  if (books.value.length === 0) return 'Your shelf is waiting for its first book.';
  if (recordedSessions.value === 0) {
    return 'Log a few sessions and this page will start to show your reading rhythm.';
  }
  return `${formatNumber(totalPagesRead.value)} pages read so far · ${formatNumber(
    pagesReadThisMonth.value,
  )} this month · ${formatNumber(weeklyMinutes.value)} minutes this week.`;
});

const finishedPercent = computed(() =>
  counts.value.all === 0 ? 0 : Math.round((counts.value.finished / counts.value.all) * 100),
);

const readingDetail = computed(() =>
  counts.value.reading === 0
    ? 'Nothing in progress'
    : `${formatNumber(weeklyMinutes.value)} minutes this week`,
);

const finishedDetail = computed(() =>
  counts.value.all === 0 ? 'Finish one to celebrate' : `${finishedPercent.value}% of your shelf`,
);

const weekSummary = computed(() => {
  if (weeklyMinutes.value === 0) return 'No minutes logged in the last seven days.';
  return `${formatNumber(weeklyMinutes.value)} minutes logged in the last seven days.`;
});

const averageDetail = computed(() =>
  recordedSessions.value === 0
    ? 'Log a session to see this'
    : `Over your last ${recordedSessions.value} ${
        recordedSessions.value === 1 ? 'session' : 'sessions'
      }`,
);

const breakdown = computed(() => {
  const total = Math.max(1, counts.value.all);
  return [
    { status: 'reading', label: STATUS_LABELS.reading, count: counts.value.reading },
    { status: 'backlog', label: STATUS_LABELS.backlog, count: counts.value.backlog },
    { status: 'finished', label: STATUS_LABELS.finished, count: counts.value.finished },
  ].map((row) => ({ ...row, percent: Math.round((row.count / total) * 100) }));
});

function countFor(value: StatusFilter): number {
  return counts.value[value];
}

/* --------------------------------------------------------------- behaviour */

function clearFilters(): void {
  statusFilter.value = 'all';
  search.value = '';
}

function startSessionFor(book: Book): void {
  sessionBook.value = book;
}

function startQuickSession(): void {
  const candidate = books.value.find((book) => book.status === 'reading') ?? books.value[0];
  if (!candidate) {
    flash('Add a book to your shelf before logging a session.', 'error');
    bookModalOpen.value = true;
    return;
  }
  sessionBook.value = candidate;
}

async function handleSaveBook(input: CreateBookInput): Promise<void> {
  saving.value = true;
  try {
    const created = await createBook(input);
    bookModalOpen.value = false;
    flash(`Added “${created.title}” to your shelf.`);
    await loadAll({ silent: true });
  } catch (cause) {
    // The modal contract has no error state, so surface the failure as a toast
    // and close it rather than leaving a permanently disabled save button.
    bookModalOpen.value = false;
    flash(relativeError(cause, 'Could not add that book.'), 'error');
  } finally {
    saving.value = false;
  }
}

async function handleSaveSession(input: CreateSessionInput): Promise<void> {
  const book = sessionBook.value;
  if (!book) return;
  saving.value = true;
  try {
    await createSession(book.id, input);
    sessionBook.value = null;
    flash(`Logged ${formatNumber(input.minutes)} minutes on “${book.title}”.`);
    await loadAll({ silent: true });
  } catch (cause) {
    sessionBook.value = null;
    flash(relativeError(cause, 'Could not log that session.'), 'error');
  } finally {
    saving.value = false;
  }
}

async function handleStatusChange(payload: { book: Book; status: BookStatus }): Promise<void> {
  if (payload.book.status === payload.status) return;
  try {
    const updated = await updateBook(payload.book.id, { status: payload.status });
    flash(`“${updated.title}” moved to ${STATUS_LABELS[payload.status]}.`);
    await loadAll({ silent: true });
  } catch (cause) {
    flash(relativeError(cause, 'Could not update that book.'), 'error');
  }
}

function askDelete(book: Book): void {
  pendingDelete.value = book;
}

async function confirmDelete(): Promise<void> {
  const book = pendingDelete.value;
  if (!book) return;
  saving.value = true;
  try {
    await deleteBook(book.id);
    pendingDelete.value = null;
    flash(`Removed “${book.title}” from your shelf.`);
    await loadAll({ silent: true });
  } catch (cause) {
    flash(relativeError(cause, 'Could not remove that book.'), 'error');
  } finally {
    saving.value = false;
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && pendingDelete.value) pendingDelete.value = null;
}

watch(pendingDelete, async (book) => {
  if (!book) return;
  await nextTick();
  cancelButton.value?.focus();
});

watch([bookModalOpen, sessionBook, pendingDelete], () => {
  const anyOpen = bookModalOpen.value || sessionBook.value !== null || pendingDelete.value !== null;
  document.body.classList.toggle('is-modal-open', anyOpen);
});
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main">Skip to content</a>

    <aside class="rail" aria-label="Shelfmark">
      <BrandMark />

      <nav class="rail__nav" aria-label="Primary">
        <button
          class="rail__link"
          :class="{ 'is-active': view === 'library' }"
          type="button"
          :aria-current="view === 'library' ? 'page' : undefined"
          @click="view = 'library'"
        >
          <svg class="rail__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
            <path
              d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
          </svg>
          <span>Library</span>
          <span class="rail__count">{{ counts.all }}</span>
        </button>

        <button
          class="rail__link"
          :class="{ 'is-active': view === 'insights' }"
          type="button"
          :aria-current="view === 'insights' ? 'page' : undefined"
          @click="view = 'insights'"
        >
          <svg class="rail__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 20V10m6 10V4m6 16v-7"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M3 21h18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
          <span>Insights</span>
        </button>
      </nav>

      <div class="rail__section">
        <p class="rail__section-title">Continue reading</p>
        <ul v-if="readingBooks.length > 0" class="rail__books">
          <li v-for="book in readingBooks" :key="book.id">
            <button
              class="rail__book"
              type="button"
              :title="`Log a session for ${book.title}`"
              @click="startSessionFor(book)"
            >
              <span class="rail__book-title">{{ book.title }}</span>
              <span class="rail__book-meta">
                {{ formatNumber(book.currentPage) }}/{{ formatNumber(book.totalPages) }} pages
              </span>
            </button>
          </li>
        </ul>
        <p v-else class="rail__empty">Nothing in progress yet — pick up a book to begin.</p>
      </div>

      <div class="rail__footer">
        <button class="btn btn--primary btn--block" type="button" @click="bookModalOpen = true">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" class="btn__icon">
            <path
              d="M10 4v12M4 10h12"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
          Add a book
        </button>
        <p class="rail__note">A private reading log — no feeds, no scores.</p>
      </div>
    </aside>

    <div class="app-body">
      <header class="mobile-bar">
        <BrandMark />
        <nav class="mobile-bar__nav" aria-label="Primary">
          <button
            class="chip"
            :class="{ 'is-active': view === 'library' }"
            type="button"
            :aria-current="view === 'library' ? 'page' : undefined"
            @click="view = 'library'"
          >
            Library
          </button>
          <button
            class="chip"
            :class="{ 'is-active': view === 'insights' }"
            type="button"
            :aria-current="view === 'insights' ? 'page' : undefined"
            @click="view = 'insights'"
          >
            Insights
          </button>
          <button
            class="icon-btn"
            type="button"
            aria-label="Add a book"
            title="Add a book"
            @click="bookModalOpen = true"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path
                d="M10 4v12M4 10h12"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </nav>
      </header>

      <main id="main" class="content">
        <div v-if="loading" class="state-panel" role="status" aria-live="polite">
          <span class="spinner" aria-hidden="true" />
          <p class="state-panel__title">Gathering your shelf…</p>
          <div class="skeleton-grid" aria-hidden="true">
            <span v-for="cell in 3" :key="cell" class="skeleton-card" />
          </div>
        </div>

        <div v-else-if="error" class="state-panel state-panel--error" role="alert">
          <p class="state-panel__eyebrow">Connection trouble</p>
          <h1 class="state-panel__title">We could not load your shelf</h1>
          <p class="state-panel__message">{{ error }}</p>
          <button class="btn btn--primary" type="button" @click="loadAll()">Try again</button>
        </div>

        <template v-else>
          <section v-if="view === 'library'" class="view" aria-labelledby="library-title">
            <header class="hero">
              <p class="hero__eyebrow">{{ greeting }}</p>
              <h1 id="library-title" class="hero__title">
                Your shelf, <em>{{ counts.all }}</em>
                {{ counts.all === 1 ? 'book' : 'books' }} deep.
              </h1>
              <p class="hero__summary">{{ progressSummary }}</p>
              <div
                class="hero__meter"
                role="img"
                :aria-label="`${finishedPercent}% of your shelf finished`"
              >
                <span class="hero__meter-fill" :style="{ width: `${finishedPercent}%` }" />
              </div>
              <p class="hero__meter-caption">
                {{ counts.finished }} finished · {{ counts.reading }} in progress ·
                {{ counts.backlog }} waiting
              </p>
              <div class="hero__actions">
                <button class="btn btn--primary" type="button" @click="bookModalOpen = true">
                  Add a book
                </button>
                <button class="btn btn--ghost" type="button" @click="startQuickSession">
                  Log a session
                </button>
                <span v-if="refreshing" class="sync-note" role="status">Refreshing…</span>
              </div>
            </header>

            <div class="stat-grid">
              <StatCard
                label="On the shelf"
                :value="counts.all"
                detail="books tracked"
                tone="indigo"
                icon="▤"
              />
              <StatCard
                label="Reading now"
                :value="counts.reading"
                :detail="readingDetail"
                tone="coral"
                icon="◐"
              />
              <StatCard
                label="Finished"
                :value="counts.finished"
                :detail="finishedDetail"
                tone="sage"
                icon="✓"
              />
              <StatCard
                label="Pages read"
                :value="formatNumber(totalPagesRead)"
                :detail="`${formatNumber(pagesReadThisMonth)} pages this month`"
                tone="sand"
                icon="∿"
              />
            </div>

            <div class="library-layout">
              <div class="library-main">
                <div class="toolbar">
                  <div class="tabs" role="group" aria-label="Filter books by status">
                    <button
                      v-for="tab in statusTabs"
                      :key="tab.value"
                      class="tab"
                      :class="{ 'is-active': statusFilter === tab.value }"
                      type="button"
                      :aria-pressed="statusFilter === tab.value"
                      @click="statusFilter = tab.value"
                    >
                      {{ tab.label }}
                      <span class="tab__count">{{ countFor(tab.value) }}</span>
                    </button>
                  </div>
                  <label class="search">
                    <svg
                      class="search__icon"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <circle
                        cx="9"
                        cy="9"
                        r="5.2"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                      />
                      <path
                        d="m13 13 3.4 3.4"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                      />
                    </svg>
                    <span class="sr-only">Search your shelf</span>
                    <input
                      v-model="search"
                      class="search__input"
                      type="search"
                      placeholder="Search title, author or tag"
                      autocomplete="off"
                    />
                  </label>
                </div>

                <div v-if="filteredBooks.length > 0" class="book-grid">
                  <BookCard
                    v-for="book in filteredBooks"
                    :key="book.id"
                    :book="book"
                    @log="startSessionFor"
                    @status="handleStatusChange"
                    @delete="askDelete"
                  />
                </div>
                <EmptyState
                  v-else-if="books.length === 0"
                  title="Your shelf is empty"
                  message="Add the first book you would like to keep track of and Shelfmark will hold the rest."
                  action-label="Add a book"
                  @action="bookModalOpen = true"
                />
                <EmptyState
                  v-else
                  title="No books match"
                  message="Try another search term, or clear the filters to see the whole shelf again."
                  action-label="Clear filters"
                  @action="clearFilters"
                />
              </div>

              <aside class="activity-rail" aria-label="Recent reading activity">
                <div class="panel__header">
                  <h2 class="panel__title">Recent activity</h2>
                  <p class="panel__subtitle">
                    {{
                      activity.length > 0
                        ? `${activity.length} recent ${activity.length === 1 ? 'session' : 'sessions'}`
                        : 'Nothing logged yet'
                    }}
                  </p>
                </div>
                <ActivityList v-if="activity.length > 0" :items="activity" />
                <EmptyState
                  v-else
                  title="No sessions yet"
                  message="Log your first reading session and it will show up here."
                  action-label="Log a session"
                  @action="startQuickSession"
                />
                <button
                  v-if="activity.length > 0"
                  class="btn btn--ghost btn--block"
                  type="button"
                  @click="view = 'insights'"
                >
                  See all activity
                </button>
              </aside>
            </div>
          </section>

          <section v-else class="view" aria-labelledby="insights-title">
            <header class="hero hero--compact">
              <p class="hero__eyebrow">Shelfmark · Insights</p>
              <h1 id="insights-title" class="hero__title">How your reading is going</h1>
              <p class="hero__summary">{{ insightSummary }}</p>
            </header>

            <div class="stat-grid">
              <StatCard
                label="Reading streak"
                :value="`${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}`"
                :detail="currentStreak > 0 ? 'Keep the page turning' : 'A session starts it'"
                tone="coral"
                icon="◔"
              />
              <StatCard
                label="Minutes this week"
                :value="formatNumber(weeklyMinutes)"
                :detail="`Across ${recordedSessions} recent ${
                  recordedSessions === 1 ? 'session' : 'sessions'
                }`"
                tone="indigo"
                icon="◷"
              />
              <StatCard
                label="Pages this month"
                :value="formatNumber(pagesReadThisMonth)"
                :detail="`${formatNumber(totalPagesRead)} all time`"
                tone="sand"
                icon="∿"
              />
              <StatCard
                label="Recent average"
                :value="`${formatNumber(averageSessionMinutes)} min`"
                :detail="averageDetail"
                tone="sage"
                icon="≈"
              />
            </div>

            <div class="insights-grid">
              <section class="panel panel--week" aria-labelledby="week-title">
                <div class="panel__header">
                  <h2 id="week-title" class="panel__title">Last seven days</h2>
                  <p class="panel__subtitle">{{ weekSummary }}</p>
                </div>
                <ol class="week-chart">
                  <li v-for="day in weekDays" :key="day.key" class="week-row">
                    <span class="week-row__label">
                      {{ day.label }}
                      <span class="week-row__date">{{ day.fullLabel }}</span>
                    </span>
                    <span class="week-row__track">
                      <span class="week-row__fill" :style="{ width: weekBarWidth(day.minutes) }" />
                    </span>
                    <span class="week-row__value">
                      {{ day.minutes > 0 ? `${day.minutes}m` : '—' }}
                    </span>
                  </li>
                </ol>
                <p class="panel__footnote">
                  Bars use your {{ recordedSessions }} most recent
                  {{ recordedSessions === 1 ? 'session' : 'sessions' }}; the weekly total above is
                  all-time accurate.
                </p>
              </section>

              <section class="panel panel--breakdown" aria-labelledby="breakdown-title">
                <div class="panel__header">
                  <h2 id="breakdown-title" class="panel__title">Shelf breakdown</h2>
                  <p class="panel__subtitle">{{ counts.all }} books tracked</p>
                </div>
                <ul class="breakdown">
                  <li v-for="row in breakdown" :key="row.status" class="breakdown__row">
                    <span class="breakdown__label">
                      <span class="dot" :class="`dot--${row.status}`" aria-hidden="true" />
                      {{ row.label }}
                    </span>
                    <span class="bar-track">
                      <span
                        class="bar-fill"
                        :class="`bar-fill--${row.status}`"
                        :style="{ width: `${row.percent}%` }"
                      />
                    </span>
                    <span class="breakdown__value">{{ row.count }}</span>
                  </li>
                </ul>
                <p class="panel__footnote">
                  {{ finishedPercent }}% of the shelf is finished and {{ counts.reading }} books are
                  in progress right now.
                </p>
              </section>
            </div>

            <section class="panel" aria-labelledby="activity-title">
              <div class="panel__header">
                <h2 id="activity-title" class="panel__title">All activity</h2>
                <p class="panel__subtitle">
                  {{ recordedSessions }} recent
                  {{ recordedSessions === 1 ? 'session' : 'sessions' }}
                </p>
              </div>
              <ActivityList v-if="activity.length > 0" :items="activity" />
              <EmptyState
                v-else
                title="No activity to show"
                message="Once you log reading sessions, your most recent ones will live here."
                action-label="Log a session"
                @action="startQuickSession"
              />
            </section>
          </section>
        </template>
      </main>
    </div>

    <Transition name="toast">
      <p
        v-if="notice"
        class="toast"
        :class="notice.tone === 'error' ? 'toast--error' : 'toast--info'"
        role="status"
        aria-live="polite"
      >
        {{ notice.message }}
      </p>
    </Transition>

    <BookFormModal :open="bookModalOpen" @close="bookModalOpen = false" @save="handleSaveBook" />
    <SessionModal
      :open="sessionBook !== null"
      :book="sessionBook"
      @close="sessionBook = null"
      @save="handleSaveSession"
    />

    <div v-if="pendingDelete" class="modal-backdrop" @click.self="pendingDelete = null">
      <div
        class="modal modal--confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <h2 id="confirm-title" class="modal__title">Remove “{{ pendingDelete.title }}”?</h2>
        <p id="confirm-message" class="modal__message">
          This deletes the book and its reading sessions from your shelf. It cannot be undone.
        </p>
        <div class="modal__actions">
          <button
            ref="cancelButton"
            class="btn btn--ghost"
            type="button"
            :disabled="saving"
            @click="pendingDelete = null"
          >
            Keep it
          </button>
          <button class="btn btn--danger" type="button" :disabled="saving" @click="confirmDelete">
            {{ saving ? 'Removing…' : 'Remove book' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
