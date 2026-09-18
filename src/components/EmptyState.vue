<script setup lang="ts">
defineProps<{
  title: string;
  message: string;
  actionLabel?: string;
}>();

const emit = defineEmits<{ (event: 'action'): void }>();

function onAction(): void {
  emit('action');
}
</script>

<template>
  <div class="empty-state">
    <svg
      class="empty-state__art"
      viewBox="0 0 168 116"
      width="168"
      height="116"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse class="empty-state__shadow" cx="84" cy="103" rx="56" ry="6.5" />
      <path
        class="empty-state__book"
        d="M84 33c-9.5-7-25-9.4-35.5-6.6v52.2C59 75.8 74.5 78.2 84 85.2c9.5-7 25-9.4 35.5-6.6V26.4C109 23.6 93.5 26 84 33z"
      />
      <path class="empty-state__page" d="M84 33v52.2" />
      <path class="empty-state__line" d="M57 45h14M57 55h12M97 45h14M97 55h12" />
      <path
        class="empty-state__ribbon"
        d="M84 33v15.5l6.2-5.2 6.3 5.2V28.6c-4.4-.4-8.7 0-12.5 4.4z"
      />
      <path class="empty-state__sprout" d="M132 92c0-11-6.5-18-16-20 0 11 6 18.5 16 20z" />
      <path class="empty-state__stem" d="M132 92c0-7 1-13 4-18" />
    </svg>

    <h2 class="empty-state__title">{{ title }}</h2>
    <p class="empty-state__message">{{ message }}</p>

    <button
      v-if="actionLabel"
      type="button"
      class="btn btn--primary empty-state__action"
      @click="onAction"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.empty-state__art {
  width: 9rem;
  height: auto;
}

.empty-state__shadow {
  fill: var(--sand-soft);
}

.empty-state__book {
  fill: var(--surface);
  stroke: var(--line-strong);
  stroke-width: 1.6;
  stroke-linejoin: round;
}

.empty-state__page,
.empty-state__line {
  fill: none;
  stroke: var(--line-strong);
  stroke-width: 1.6;
  stroke-linecap: round;
}

.empty-state__ribbon {
  fill: var(--coral);
}

.empty-state__sprout {
  fill: var(--sage-soft);
  stroke: var(--sage);
  stroke-width: 1.6;
  stroke-linejoin: round;
}

.empty-state__stem {
  fill: none;
  stroke: var(--sage);
  stroke-width: 1.6;
  stroke-linecap: round;
}
</style>
