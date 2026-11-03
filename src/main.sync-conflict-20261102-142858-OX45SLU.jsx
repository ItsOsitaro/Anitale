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
