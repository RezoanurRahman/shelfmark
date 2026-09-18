<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import { FORMAT_LABELS, STATUS_LABELS } from '../types';
import type { Book, BookStatus } from '../types';

const props = defineProps<{ book: Book }>();

const emit = defineEmits<{
  (event: 'log', book: Book): void;
  (event: 'status', payload: { book: Book; status: BookStatus }): void;
  (event: 'delete', book: Book): void;
}>();

const STATUS_OPTIONS: ReadonlyArray<BookStatus> = ['reading', 'backlog', 'finished'];

const STARS: readonly number[] = [1, 2, 3, 4, 5];

const FALLBACK_COVER_COLORS: readonly string[] = [
  '#4d51c4',
  '#dd6247',
  '#5f8a62',
  '#b9822e',
  '#7a5ea8',
  '#3f7d8c',
  '#a2553f',
  '#6b6f3f',
];

function normalizeHex(value: string | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    const [r = '0', g = '0', b = '0'] = raw.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function hashIndex(value: string, modulo: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100_000;
  }
  return Math.abs(hash) % modulo;
}

function mixHex(hex: string, target: readonly [number, number, number], weight: number): string {
  const channel = (start: number) => Number.parseInt(hex.slice(start, start + 2), 16);
  const blend = (value: number, other: number) => Math.round(value * (1 - weight) + other * weight);
  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toHex(blend(channel(1), target[0]))}${toHex(blend(channel(3), target[1]))}${toHex(
    blend(channel(5), target[2]),
  )}`;
}

const statusLabel = computed(() => STATUS_LABELS[props.book.status] || props.book.status);

const formatLabel = computed(() => FORMAT_LABELS[props.book.format] || props.book.format);

const tags = computed(() =>
  Array.isArray(props.book.tags)
    ? props.book.tags.filter((tag) => typeof tag === 'string' && tag.trim() !== '')
    : [],
);

const percent = computed(() => {
  const total = Number(props.book.totalPages);
  const current = Number(props.book.currentPage);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
});

const initials = computed(() => {
  const words = props.book.title
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const first = words[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1] ?? first) : first;
  const letters = words.length > 1 ? first.charAt(0) + last.charAt(0) : first.slice(0, 2);
  return (letters || '?').toUpperCase();
});

const rating = computed(() => (typeof props.book.rating === 'number' ? props.book.rating : null));

const ratingLabel = computed(() =>
  rating.value === null ? 'Not rated yet' : `Rated ${rating.value} out of 5`,
);

const coverStyle = computed<CSSProperties>(() => {
  const provided = normalizeHex(props.book.coverColor);
  const fallback =
    FALLBACK_COVER_COLORS[
      hashIndex(props.book.id || props.book.title, FALLBACK_COVER_COLORS.length)
    ] ??
    FALLBACK_COVER_COLORS[0] ??
    '#4d51c4';
  const base = provided ?? fallback;
  const light = mixHex(base, [255, 255, 255], 0.32);
  const dark = mixHex(base, [44, 38, 33], 0.24);
  return { background: `linear-gradient(150deg, ${light} 0%, ${base} 58%, ${dark} 100%)` };
});

function onStatusChange(event: Event): void {
  const select = event.target as HTMLSelectElement;
  const status = select.value as BookStatus;
  if (status !== props.book.status) emit('status', { book: props.book, status });
}

function onLog(): void {
  emit('log', props.book);
}

function onDelete(): void {
  emit('delete', props.book);
}
</script>

<template>
  <article class="book-card">
    <div
      class="book-card__cover"
      :style="coverStyle"
      role="img"
      :aria-label="`Cover of ${book.title}`"
    >
      <span class="book-card__initials" aria-hidden="true">{{ initials }}</span>
    </div>

    <div class="book-card__top">
      <h3 class="book-card__title">{{ book.title }}</h3>
      <span class="badge" :class="`badge--${book.status}`">{{ statusLabel }}</span>
    </div>

    <p class="book-card__author">by {{ book.author }}</p>

    <p class="book-card__meta">
      <span>{{ formatLabel }}</span>
      <template v-if="tags.length > 0">
        <span aria-hidden="true">·</span>
        <span>{{ tags.slice(0, 2).join(', ') }}</span>
      </template>
      <span aria-hidden="true">·</span>
      <span>{{ book.totalPages }} pages</span>
    </p>

    <div class="book-card__progress">
      <div class="book-card__progress-head">
        <span>Page {{ book.currentPage }} of {{ book.totalPages }}</span>
        <span class="book-card__percent">{{ percent }}%</span>
      </div>
      <div
        class="progress-bar"
        role="progressbar"
        :aria-valuemin="0"
        :aria-valuemax="book.totalPages"
        :aria-valuenow="book.currentPage"
        :aria-label="`Reading progress for ${book.title}`"
      >
        <span :style="{ width: `${percent}%` }"></span>
      </div>
    </div>

    <p class="book-card__rating">
      <span class="book-card__stars" role="img" :aria-label="ratingLabel">
        <svg
          v-for="star in STARS"
          :key="star"
          class="book-card__star"
          :class="{ 'book-card__star--on': rating !== null && star <= rating }"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          focusable="false"
        >
          <path
            d="M12 3.4l2.5 5.1 5.6.8-4.05 3.95.96 5.55L12 16.2l-5.01 2.6.96-5.55L3.9 9.3l5.6-.8z"
          />
        </svg>
      </span>
      <span class="book-card__rating-text">{{
        rating === null ? 'Not rated' : `${rating}/5`
      }}</span>
    </p>

    <footer class="book-card__actions">
      <button type="button" class="btn btn--primary btn--sm" @click="onLog">
        <svg
          class="btn__icon book-card__stroke-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Log session
      </button>

      <label class="book-card__status">
        <span class="sr-only">Change status for {{ book.title }}</span>
        <select class="book-card__select" :value="book.status" @change="onStatusChange">
          <option v-for="option in STATUS_OPTIONS" :key="option" :value="option">
            {{ STATUS_LABELS[option] }}
          </option>
        </select>
      </label>

      <button
        type="button"
        class="icon-btn book-card__delete"
        :aria-label="`Delete ${book.title}`"
        title="Delete book"
        @click="onDelete"
      >
        <svg
          class="book-card__stroke-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </svg>
      </button>
    </footer>
  </article>
</template>

<style scoped>
.book-card__cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 6.5rem;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.book-card__cover::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 0.4rem;
  background: rgba(0, 0, 0, 0.18);
}

.book-card__initials {
  color: rgba(255, 255, 255, 0.95);
  font-family: var(--font-display);
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.22);
}

.book-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
}

.book-card__top .badge {
  flex: none;
}

.book-card__progress {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.book-card__progress-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.76rem;
  color: var(--ink-faint);
}

.book-card__percent {
  font-weight: 700;
  color: var(--ink-soft);
}

.book-card--reading .progress-bar > span {
  background: var(--coral);
}

.book-card--finished .progress-bar > span {
  background: var(--sage);
}

.book-card__rating {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.book-card__stars {
  display: inline-flex;
  gap: 0.1rem;
}

.book-card__star {
  fill: var(--line-strong);
}

.book-card__star--on {
  fill: var(--sand);
}

.book-card__rating-text {
  font-size: 0.76rem;
  color: var(--ink-faint);
}

.book-card__status {
  display: inline-flex;
}

.book-card__select {
  width: auto;
  padding: 0.42rem 0.6rem;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
}

.book-card__delete {
  width: 2.1rem;
  height: 2.1rem;
  margin-left: auto;
}

.book-card__stroke-icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
