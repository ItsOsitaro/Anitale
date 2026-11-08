import 'core-js/es/array/flat-map.js';
import '@fontsource-variable/vazirmatn';
import './tailwind.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import 'swiper/css';
import 'swiper/css/navigation';
import '../style.css';

// Tell the server when a visitor's browser hits an uncaught error (a few per minute at most), so a broken release is noticed.
let reported = 0;
const report = (message, source) => {
  if (reported >= 3) return;
  reported += 1;
  try {
    navigator.sendBeacon?.('/api/client-error', new Blob([JSON.stringify({ message: String(message || '').slice(0, 200), source: String(source || '').slice(0, 60), page: location.pathname.slice(0, 80) })], { type: 'application/json' }));
  } catch { /* reporting must never throw */ }
};
window.addEventListener('error', (e) => { if (e.message) report(e.message, e.filename ? e.filename.split('/').pop() : ''); });
window.addEventListener('unhandledrejection', (e) => report(e.reason?.message || e.reason, 'promise'));

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Offline shell + faster repeat visits. Production only, so the Vite dev server
// never serves stale modules.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
