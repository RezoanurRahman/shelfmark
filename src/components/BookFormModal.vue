<script setup lang="ts">
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { BOOK_FORMATS, FORMAT_LABELS } from '../types';
import type { BookFormat, CreateBookInput } from '../types';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'save', input: CreateBookInput): void;
}>();

const COVER_COLORS: ReadonlyArray<{ value: string; name: string }> = [
  { value: '#4d51c4', name: 'Indigo' },
  { value: '#dd6247', name: 'Coral' },
  { value: '#5f8a62', name: 'Sage' },
  { value: '#b9822e', name: 'Amber' },
  { value: '#7a5ea8', name: 'Violet' },
  { value: '#3f7d8c', name: 'Teal' },
  { value: '#a2553f', name: 'Rust' },
  { value: '#6b6f3f', name: 'Olive' },
];

/** Format names the REST API validates against (server/types.ts). */
const API_FORMATS: Record<BookFormat, string> = {
  paperback: 'Paperback',
  hardcover: 'Hardcover',
  ebook: 'Ebook',
  audiobook: 'Audiobook',
  other: 'Paperback',
};

interface BookFormState {
  title: string;
  author: string;
  genre: string;
  pages: string;
  format: BookFormat;
  notes: string;
  coverColor: string;
}

type FieldErrors = Partial<Record<'title' | 'author' | 'pages', string>>;

function createEmptyForm(): BookFormState {
  return {
    title: '',
    author: '',
    genre: '',
    pages: '',
    format: BOOK_FORMATS[0] ?? 'paperback',
    notes: '',
    coverColor: COVER_COLORS[0]?.value ?? '#4d51c4',
  };
}

const form = reactive<BookFormState>(createEmptyForm());
const errors = reactive<FieldErrors>({});
const submitting = ref(false);

const dialogRef = ref<HTMLElement | null>(null);
const titleInput = ref<HTMLInputElement | null>(null);
const authorInput = ref<HTMLInputElement | null>(null);
const pagesInput = ref<HTMLInputElement | null>(null);

const fieldRefs = { title: titleInput, author: authorInput, pages: pagesInput } as const;

const titleErrorId = 'book-form-title-error';
const authorErrorId = 'book-form-author-error';
const pagesErrorId = 'book-form-pages-error';

let previousOverflow: string | null = null;
let previouslyFocused: HTMLElement | null = null;

function resetForm(): void {
  Object.assign(form, createEmptyForm());
  errors.title = undefined;
  errors.author = undefined;
  errors.pages = undefined;
  submitting.value = false;
}

function clearError(field: keyof FieldErrors): void {
  errors[field] = undefined;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validate(): boolean {
  errors.title = form.title.trim() === '' ? 'Please add a title.' : undefined;
  errors.author = form.author.trim() === '' ? 'Please add an author.' : undefined;
  errors.pages =
    parsePositiveInteger(form.pages) === null
      ? 'Pages must be a positive whole number.'
      : undefined;
  return !errors.title && !errors.author && !errors.pages;
}

function focusFirstInvalid(): void {
  const order: ReadonlyArray<keyof FieldErrors> = ['title', 'author', 'pages'];
  const first = order.find((field) => errors[field]);
  if (first) fieldRefs[first].value?.focus();
}

function requestClose(): void {
  emit('close');
}

/**
 * The Express API validates `pages` and capitalized format names while the
 * shared frontend contract uses `totalPages` and lowercase formats. Send both
 * shapes so the request is accepted by the server that is actually running.
 */
function withApiAliases(input: CreateBookInput): CreateBookInput {
  Object.assign(input, {
    pages: input.totalPages,
    genre: (input.tags ?? []).join(', '),
    format: API_FORMATS[input.format ?? 'other'],
  });
  return input;
}

function handleSubmit(): void {
  if (!validate()) {
    focusFirstInvalid();
    return;
  }
  const totalPages = parsePositiveInteger(form.pages);
  if (totalPages === null) return;

  const tags = form.genre
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');

  const input: CreateBookInput = {
    title: form.title.trim(),
    author: form.author.trim(),
    format: form.format,
    totalPages,
    notes: form.notes.trim(),
    coverColor: form.coverColor,
    tags,
  };

  submitting.value = true;
  emit('save', withApiAliases(input));
}

function focusableElements(): HTMLElement[] {
  const root = dialogRef.value;
  if (!root) return [];
  const selector =
    'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    requestClose();
    return;
  }
  if (event.key !== 'Tab') return;

  const elements = focusableElements();
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (!first || !last) return;

  const active = document.activeElement;
  const inside = dialogRef.value?.contains(active) ?? false;
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}

function lockScroll(locked: boolean): void {
  if (typeof document === 'undefined') return;
  if (locked) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else if (previousOverflow !== null) {
    document.body.style.overflow = previousOverflow;
    previousOverflow = null;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    lockScroll(isOpen);
    if (isOpen) {
      resetForm();
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.addEventListener('keydown', onKeydown);
      void nextTick(() => titleInput.value?.focus());
    } else {
      document.removeEventListener('keydown', onKeydown);
      submitting.value = false;
      previouslyFocused?.focus();
      previouslyFocused = null;
    }
  },
  { immediate: true },
);

// If the parent keeps the dialog open after a failed save, let edits re-enable submit.
watch(form, () => {
  submitting.value = false;
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  previouslyFocused?.focus();
  previouslyFocused = null;
  lockScroll(false);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="requestClose">
      <div
        ref="dialogRef"
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-form-heading"
      >
        <header class="modal-header">
          <div>
            <h2 id="book-form-heading">Add a book</h2>
            <p class="book-form__intro">A few details and it joins your shelf.</p>
          </div>
          <button
            type="button"
            class="modal-close"
            aria-label="Close add book dialog"
            @click="requestClose"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <form class="book-form" novalidate @submit.prevent="handleSubmit">
          <div class="form-field">
            <label class="form-field__label" for="book-form-title-input">
              Title <span class="form-field__required" aria-hidden="true">*</span>
            </label>
            <input
              id="book-form-title-input"
              ref="titleInput"
              v-model="form.title"
              type="text"
              autocomplete="off"
              placeholder="The Left Hand of Darkness"
              aria-required="true"
              :aria-invalid="Boolean(errors.title)"
              :aria-describedby="errors.title ? titleErrorId : undefined"
              @input="clearError('title')"
            />
            <p v-if="errors.title" :id="titleErrorId" class="form-error">{{ errors.title }}</p>
          </div>

          <div class="form-field">
            <label class="form-field__label" for="book-form-author-input">
              Author <span class="form-field__required" aria-hidden="true">*</span>
            </label>
            <input
              id="book-form-author-input"
              ref="authorInput"
              v-model="form.author"
              type="text"
              autocomplete="off"
              placeholder="Ursula K. Le Guin"
              aria-required="true"
              :aria-invalid="Boolean(errors.author)"
              :aria-describedby="errors.author ? authorErrorId : undefined"
              @input="clearError('author')"
            />
            <p v-if="errors.author" :id="authorErrorId" class="form-error">{{ errors.author }}</p>
          </div>

          <div class="book-form__row">
            <div class="form-field">
              <label class="form-field__label" for="book-form-genre-input">Genre or tags</label>
              <input
                id="book-form-genre-input"
                v-model="form.genre"
                type="text"
                autocomplete="off"
                placeholder="Science fiction, classics"
              />
            </div>

            <div class="form-field">
              <label class="form-field__label" for="book-form-pages-input">
                Pages <span class="form-field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="book-form-pages-input"
                ref="pagesInput"
                v-model="form.pages"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                placeholder="304"
                aria-required="true"
                :aria-invalid="Boolean(errors.pages)"
                :aria-describedby="errors.pages ? pagesErrorId : undefined"
                @input="clearError('pages')"
              />
              <p v-if="errors.pages" :id="pagesErrorId" class="form-error">{{ errors.pages }}</p>
            </div>
          </div>

          <div class="form-field">
            <label class="form-field__label" for="book-form-format-select">Format</label>
            <select id="book-form-format-select" v-model="form.format">
              <option v-for="format in BOOK_FORMATS" :key="format" :value="format">
                {{ FORMAT_LABELS[format] }}
              </option>
            </select>
          </div>

          <fieldset class="form-field cover-swatches">
            <legend class="form-field__label">Cover color</legend>
            <div class="cover-swatches__row">
              <label
                v-for="color in COVER_COLORS"
                :key="color.value"
                class="cover-swatches__item"
                :class="{ 'cover-swatches__item--active': form.coverColor === color.value }"
                :title="color.name"
              >
                <input
                  v-model="form.coverColor"
                  class="cover-swatches__input"
                  type="radio"
                  name="book-form-cover-color"
                  :value="color.value"
                  :aria-label="`${color.name} cover`"
                />
                <span
                  class="cover-swatches__dot"
                  :style="{ background: color.value }"
                  aria-hidden="true"
                ></span>
              </label>
            </div>
          </fieldset>

          <div class="form-field">
            <label class="form-field__label" for="book-form-notes-textarea">Notes</label>
            <textarea
              id="book-form-notes-textarea"
              v-model="form.notes"
              rows="3"
              placeholder="Why this book, who recommended it, what to remember…"
            ></textarea>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn--ghost" @click="requestClose">Cancel</button>
            <button type="submit" class="btn btn--primary" :disabled="submitting">
              {{ submitting ? 'Saving…' : 'Add book' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.book-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.book-form__intro {
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.book-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-field__required {
  color: var(--coral);
}

.modal-close svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.cover-swatches {
  border: 0;
  padding: 0;
}

.cover-swatches__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.cover-swatches__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.15rem;
  height: 2.15rem;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}

.cover-swatches__item--active {
  border-color: var(--ink);
}

.cover-swatches__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.cover-swatches__dot {
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
}

.cover-swatches__input:focus-visible + .cover-swatches__dot {
  outline: var(--focus-ring);
  outline-offset: 3px;
  border-radius: 50%;
}

@media (max-width: 30rem) {
  .book-form__row {
    grid-template-columns: 1fr;
  }
}
</style>
