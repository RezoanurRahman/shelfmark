<script setup lang="ts">
import { computed } from 'vue';

type StatTone = 'indigo' | 'coral' | 'sage' | 'sand';

const props = withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    detail?: string;
    tone?: StatTone;
    icon?: string;
  }>(),
  { detail: undefined, tone: 'indigo', icon: undefined },
);

const toneClass = computed(() => `stat-card--${props.tone}`);
</script>

<template>
  <dl class="stat-card" :class="toneClass" :data-tone="tone">
    <dt class="stat-card__label">
      {{ label }}
      <span v-if="icon" class="stat-card__icon" aria-hidden="true">{{ icon }}</span>
    </dt>
    <dd class="stat-card__body">
      <span class="stat-card__value">{{ value }}</span>
      <span v-if="detail" class="stat-card__detail">{{ detail }}</span>
    </dd>
  </dl>
</template>

<style scoped>
.stat-card__body {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}
</style>
