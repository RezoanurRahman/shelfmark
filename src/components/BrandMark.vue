<script setup lang="ts">
// The Shelfmark mark: three book spines with a bookmark, beside the wordmark.
</script>

<template>
  <span class="brand-mark">
    <span class="brand-mark__glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <rect
          class="brand-mark__book"
          x="3.4"
          y="7.6"
          width="4.6"
          height="11.6"
          rx="1.1"
          opacity="0.78"
        />
        <rect class="brand-mark__book" x="9.5" y="4.4" width="5" height="14.8" rx="1.2" />
        <rect
          class="brand-mark__book"
          x="16.1"
          y="9.6"
          width="4.3"
          height="9.6"
          rx="1.1"
          opacity="0.68"
        />
        <rect class="brand-mark__shelf" x="2.4" y="19.5" width="19.2" height="1.7" rx="0.85" />
        <path class="brand-mark__ribbon" d="M11 6.1h2.2v6.5l-1.1-1.1-1.1 1.1z" />
      </svg>
    </span>
    <span class="brand-mark__name">Shelf<span class="brand-mark__accent">mark</span></span>
  </span>
</template>

<style scoped>
.brand-mark__book,
.brand-mark__shelf {
  fill: currentColor;
}

.brand-mark__ribbon {
  fill: #ffe3b3;
}

.brand-mark__accent {
  color: var(--indigo);
}
</style>
