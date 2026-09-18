<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import type { Book, CreateSessionInput } from '../types';

const props = defineProps<{ open: boolean; book: Book | null }>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'save', input: CreateSessionInput): void;
}>();

interface SessionFormState {
  pagesRead: string;
  minutes: string;
  date: string;
  note: string;
}

type FieldErrors = Partial<Record<'pagesRead' | 'minutes' | 'date', string>>;

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function createEmptyForm(): SessionFormState {
  return { pagesRead: '', minutes: '', date: todayKey(), note: '' };
}

const form = reactive<SessionFormState>(createEmptyForm());
const errors = reactive<FieldErrors>({});
const submitting = ref(false);

const dialogRef = ref<HTMLElement | null>(null);
const pagesInput = ref<HTMLInputElement | null>(null);
const minutesInput = ref<HTMLInputElement | null>(null);
const dateInput = ref<HTMLInputElement | null>(null);

const fieldRefs = { pagesRead: pagesInput, minutes: minutesInput, date: dateInput } as const;

const pagesErrorId = 'session-form-pages-error';
const minutesErrorId = 'session-form-minutes-error';
const dateErrorId = 'session-form-date-error';

const bookTitle = computed(() => props.book?.title ?? '');

const progressPercent = computed(() => {
  const book = props.book;
  if (!book || !Number.isFinite(book.totalPages) || book.totalPages <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((book.currentPage / book.totalPages) * 100)));
});

let previousOverflow: string | null = null;
let previouslyFocused: HTMLElement | null = null;

function resetForm(): void {
  Object.assign(form, createEmptyForm());
  errors.pagesRead = undefined;
  errors.minutes = undefined;
  errors.date = undefined;
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

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
  );
}

function validate(): boolean {
  errors.pagesRead =
    parsePositiveInteger(form.pagesRead) === null
      ? 'Pages read must be a positive whole number.'
      : undefined;
  errors.minutes =
    parsePositiveInteger(form.minutes) === null
      ? 'Minutes must be a positive whole number.'
      : undefined;
  errors.date = isValidDateKey(form.date) ? undefined : 'Pick a valid date.';
  return !errors.pagesRead && !errors.minutes && !errors.date;
}

function focusFirstInvalid(): void {
  const order: ReadonlyArray<keyof FieldErrors> = ['pagesRead', 'minutes', 'date'];
  const first = order.find((field) => errors[field]);
  if (first) fieldRefs[first].value?.focus();
}

function requestClose(): void {
  emit('close');
}

function handleSubmit(): void {
  if (props.book === null || !validate()) {
    focusFirstInvalid();
    return;
  }
  const pagesRead = parsePositiveInteger(form.pagesRead);
  const minutes = parsePositiveInteger(form.minutes);
  if (pagesRead === null || minutes === null) return;

  const input: CreateSessionInput = {
    pagesRead,
    minutes,
    date: form.date,
    note: form.note.trim(),
  };
  submitting.value = true;
  emit('save', input);
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
  [() => props.open, () => props.book],
  ([isOpen]) => {
    lockScroll(isOpen);
    if (isOpen) {
      resetForm();
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.addEventListener('keydown', onKeydown);
      void nextTick(() => pagesInput.value?.focus());
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
    <div v-if="open && book" class="modal-backdrop" @click.self="requestClose">
      <div
        ref="dialogRef"
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-form-heading"
      >
        <header class="modal-header">
          <div class="session-modal__heading">
            <p class="session-modal__eyebrow">Log a reading session</p>
            <h2 id="session-form-heading">{{ bookTitle }}</h2>
            <p class="session-modal__progress-text">
              Page {{ book.currentPage }} of {{ book.totalPages }} · {{ progressPercent }}% complete
            </p>
            <div class="progress-bar session-modal__progress" role="presentation">
              <span :style="{ width: `${progressPercent}%` }"></span>
            </div>
          </div>
          <button
            type="button"
            class="modal-close"
            aria-label="Close log session dialog"
            @click="requestClose"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <form class="session-form" novalidate @submit.prevent="handleSubmit">
          <div class="session-form__row">
            <div class="form-field">
              <label class="form-field__label" for="session-form-pages-input">
                Pages read <span class="form-field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="session-form-pages-input"
                ref="pagesInput"
                v-model="form.pagesRead"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                placeholder="24"
                aria-required="true"
                :aria-invalid="Boolean(errors.pagesRead)"
                :aria-describedby="errors.pagesRead ? pagesErrorId : undefined"
                @input="clearError('pagesRead')"
              />
              <p v-if="errors.pagesRead" :id="pagesErrorId" class="form-error">
                {{ errors.pagesRead }}
              </p>
            </div>

            <div class="form-field">
              <label class="form-field__label" for="session-form-minutes-input">
                Minutes <span class="form-field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="session-form-minutes-input"
                ref="minutesInput"
                v-model="form.minutes"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                placeholder="35"
                aria-required="true"
                :aria-invalid="Boolean(errors.minutes)"
                :aria-describedby="errors.minutes ? minutesErrorId : undefined"
                @input="clearError('minutes')"
              />
              <p v-if="errors.minutes" :id="minutesErrorId" class="form-error">
                {{ errors.minutes }}
              </p>
            </div>
          </div>

          <div class="form-field">
            <label class="form-field__label" for="session-form-date-input">Date</label>
            <input
              id="session-form-date-input"
              ref="dateInput"
              v-model="form.date"
              type="date"
              :aria-invalid="Boolean(errors.date)"
              :aria-describedby="errors.date ? dateErrorId : undefined"
              @input="clearError('date')"
            />
            <p v-if="errors.date" :id="dateErrorId" class="form-error">{{ errors.date }}</p>
          </div>

          <div class="form-field">
            <label class="form-field__label" for="session-form-note-textarea"
              >Note (optional)</label
            >
            <textarea
              id="session-form-note-textarea"
              v-model="form.note"
              rows="3"
              placeholder="A passage worth keeping, a thought, where you read…"
            ></textarea>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn--ghost" @click="requestClose">Cancel</button>
            <button type="submit" class="btn btn--primary" :disabled="submitting">
              {{ submitting ? 'Saving…' : 'Save session' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.session-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.session-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.session-modal__heading {
  min-width: 0;
}

.session-modal__eyebrow {
  margin-bottom: 0.2rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--coral);
}

.session-modal__progress-text {
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: var(--ink-soft);
}

.session-modal__progress {
  width: min(18rem, 100%);
  margin-top: 0.5rem;
}

.session-modal__progress > span {
  background: var(--coral);
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

@media (max-width: 28rem) {
  .session-form__row {
    grid-template-columns: 1fr;
  }
}
</style>
