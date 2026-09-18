import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        // API, store, and routing tests run on the server side in a plain Node environment.
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts', 'tests/**/*.test.ts'],
        },
      },
      {
        plugins: [vue()],
        resolve: { alias },
        // Component and composable tests run in a DOM-like environment.
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
});
