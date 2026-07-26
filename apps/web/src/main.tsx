import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './index.css';
import { seedProductCatalog } from './db/seed';

// Explicit SW registration with an hourly update check. Without this, a
// long-lived installed PWA only checks for new versions on the browser's
// own schedule (up to 24h) — field tablets ran stale builds for days.
// autoUpdate mode reloads the app automatically when a new build activates.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) {
      window.setInterval(() => void registration.update(), 60 * 60 * 1000);
    }
  },
});

// Request persistent storage so the browser never evicts IndexedDB.
// Field data is the system of record while offline — eviction would be data loss.
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((persisted) => {
    if (!persisted) {
      navigator.storage.persist().then((granted) => {
        if (!granted) {
          console.warn('Persistent storage not granted — data may be evicted under storage pressure');
        }
      });
    }
  });
}

// Seed product catalog on first launch
seedProductCatalog();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
