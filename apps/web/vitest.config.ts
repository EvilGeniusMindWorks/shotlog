import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Standalone config: the app's vite.config pulls in PWA/react plugins that
// the node-environment facade tests neither need nor tolerate.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
