import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'components/features/search/search-modal.tsx',
        'components/layout/navbar.tsx',
        'lib/security/access-control.ts',
        'pages/video-detail.tsx',
      ],
      thresholds: {
        lines: 35,
        functions: 20,
        branches: 30,
        statements: 35,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
