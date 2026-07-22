import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { seedProductCatalog } from './db/seed';

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
