import 'core-js/es/array/flat-map.js';
import '@fontsource-variable/vazirmatn';
import './tailwind.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import 'swiper/css';
import 'swiper/css/navigation';
import '../style.css';

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
