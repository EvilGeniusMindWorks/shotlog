import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  optimizeDeps: {
    // Required by @powersync/web (wasm workers must not be pre-bundled)
    exclude: ['@journeyapps/wa-sqlite', '@powersync/web'],
  },
  worker: {
    format: 'es',
  },
  define: {
    // Shown in Settings so any device can prove which build it runs
    __BUILD_ID__: JSON.stringify(
      new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    ),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': new builds download quietly and an Update chip lets the
      // user choose when to restart — no surprise reloads mid-form
      registerType: 'prompt',
      // Brand assets from the final kit (public/): favicon.ico + favicon.svg,
      // apple-touch-icon (180, square navy tile — iOS rounds it), icon-192 /
      // icon-512 (square navy tile), icon-512-maskable (mark inside the 80 %
      // safe zone so Android's adaptive shapes never clip the cloud)
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'shotlog-*.svg', 'shotlog-*.png'],
      manifest: {
        name: 'ShotLog',
        short_name: 'ShotLog',
        description: 'Blasting logs, drill logs and daily reports for the crew — works with no signal',
        theme_color: '#1C3859',
        background_color: '#1C3859',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // gz/wasm.js cover the self-hosted OCR assets (public/ocr) so
        // printout scanning works fully offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,gz}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // SPA fallback: offline deep links (bookmarks, shared URLs) render the
        // app shell instead of a browser error page. API is cross-origin, so
        // no denylist is needed.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.weather\.gov\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
