import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './index.css';

// Explicit SW registration with an hourly update check. Without this, a
// long-lived installed PWA only checks for new versions on the browser's
// own schedule (up to 24h) — field tablets ran stale builds for days.
// 'prompt' mode: a new build downloads quietly and the AppShell Update chip
// applies it when the USER chooses — no surprise reloads mid-form.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    (window as unknown as Record<string, unknown>).__shotlogSwUpdateReady = true;
    (window as unknown as Record<string, unknown>).__shotlogApplySwUpdate = () =>
      void updateSW(true);
    window.dispatchEvent(new Event('shotlog-sw-update-ready'));
  },
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

// (Product catalog seeding happens SERVER-side per company — devices
// receive it via sync on first hydrate.)

// Dev-only: expose the data layer + real creation flows for the
// multi-device test harness (synthetic hand-rolled records miss nested
// shapes the UI relies on — the harness must create data the real way)
if (import.meta.env.DEV) {
  void import('./db').then((m) => {
    (window as unknown as Record<string, unknown>).shotlogDb = m.db;
  });
  void import('./hooks/useBlastDay').then((m) => {
    (window as unknown as Record<string, unknown>).shotlogFlows = {
      createJob: m.createJob,
      createBlastDay: m.createBlastDay,
      addShot: m.addShot,
    };
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
