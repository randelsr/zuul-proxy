import { defineConfig } from 'vitest/config';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file for tests
dotenv.config();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/index.ts',
      ],
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90,
      all: true,
      skipFull: false,
    },
    include: ['tests/**/*.ts'],
    exclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
