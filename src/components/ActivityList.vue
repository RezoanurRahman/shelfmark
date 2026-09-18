<script setup lang="ts">
import { computed } from 'vue';
import type { SessionActivity } from '../types';
import EmptyState from './EmptyState.vue';

const props = defineProps<{ items: SessionActivity[] }>();

const FALLBACK_DOT_COLORS: readonly string[] = [
  '#4d51c4',
  '#dd6247',
  '#5f8a62',
  '#b9822e',
  '#7a5ea8',
  '#3f7d8c',
  '#a2553f',
  '#6b6f3f',
];

interface ActivityRow {
  id: string;
  title: string;
  author: string;
  color: string;
  pagesLabel: string;
  minutesLabel: string;
  dateLabel: string;
  dateTime: string;
  note: string;
}

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

function dotColor(item: SessionActivity): string {
  // The REST API may include a `bookColor`; fall back to a stable derived hue.
  const withColor = item as SessionActivity & { bookColor?: string };
  const provided = normalizeHex(withColor.bookColor);
  if (provided) return provided;
  const key = item.bookId || item.bookTitle || item.id;
  return FALLBACK_DOT_COLORS[hashIndex(key, FALLBACK_DOT_COLORS.length)] ?? '#4d51c4';
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const [, year = '', month = '', day = ''] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatHumanDate(value: string): string {
  const date = parseDateKey(value);
  if (!date) return value;
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo > 1 && daysAgo < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
  }
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function formatMinutes(minutes: number): string {
  const safe = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

const rows = computed<ActivityRow[]>(() =>
  props.items.map((item, index) => {
    const pages = Number.isFinite(item.pagesRead) ? Math.max(0, Math.round(item.pagesRead)) : 0;
    return {
      id: item.id || `${item.bookId}-${item.date}-${index}`,
      title: item.bookTitle || 'Untitled book',
      author: item.bookAuthor ?? '',
      color: dotColor(item),
      pagesLabel: `${pages.toLocaleString('en-US')} ${pages === 1 ? 'page' : 'pages'}`,
      minutesLabel: formatMinutes(item.minutes),
      dateLabel: formatHumanDate(item.date),
      dateTime: item.date,
      note: item.note?.trim() ?? '',
    };
  }),
);
</script>

<template>
  <div v-if="rows.length === 0" class="activity-list__empty">
    <EmptyState
      title="No sessions logged yet"
      message="Sessions you record will show up here, newest first, with pages and minutes."
    />
  </div>

  <ul v-else class="activity-list" aria-label="Recent reading sessions">
    <li v-for="row in rows" :key="row.id" class="activity-item">
      <p class="activity-item__title">
        <span
          class="activity-item__dot"
          :style="{ background: row.color }"
          aria-hidden="true"
        ></span>
        <span>{{ row.title }}</span>
        <span v-if="row.author" class="activity-item__author">· {{ row.author }}</span>
      </p>
      <p class="activity-item__meta">
        <span>{{ row.pagesLabel }}</span>
        <span>{{ row.minutesLabel }}</span>
        <time :datetime="row.dateTime">{{ row.dateLabel }}</time>
      </p>
      <p v-if="row.note" class="activity-item__note">{{ row.note }}</p>
    </li>
  </ul>
</template>

<style scoped>
.activity-item__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.activity-item__dot {
  flex: none;
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}

.activity-item__author {
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--ink-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-item__note {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.activity-list__empty {
  padding: 0.25rem 0;
}
</style>
