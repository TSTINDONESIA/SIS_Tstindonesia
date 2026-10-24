import React from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import Guest from './Guest.jsx';
import Staff from './Staff.jsx';
import { useHash } from './ui.jsx';
import { ambilEvent, simpanEvent } from './util.js';

// Tamu hanya masuk lewat QR meja Usher (#/e/<kode-acara>). HP mengingat acaranya.
function Root() {
  const h = useHash();
  const m = h.match(/^#\/e\/([a-z0-9]{4,12})/);
  if (m) {
    simpanEvent(m[1]);
    return <Guest key={'e' + m[1]} eid={m[1]} />;
  }
  if (h.startsWith('#/usher') || h.startsWith('#/admin')) return <Staff hash={h} />;
  return <Guest key="home" eid={ambilEvent()} />;
}

createRoot(document.getElementById('root')).render(<Root />);
