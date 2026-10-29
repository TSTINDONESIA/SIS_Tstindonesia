import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import Guest from './Guest.jsx';
import Staff from './Staff.jsx';
import { useHash } from './ui.jsx';
import { ambilEvent, simpanEvent } from './util.js';

// Tamu hanya masuk lewat QR meja Usher (#/e/<kode-acara>). HP mengingat acaranya.
function Halaman({ h }) {
  const m = h.match(/^#\/e\/([a-z0-9]{4,12})/);
  if (m) {
    simpanEvent(m[1]);
    return <Guest key={'e' + m[1]} eid={m[1]} />;
  }
  if (h.startsWith('#/usher') || h.startsWith('#/admin')) return <Staff hash={h} />;
  return <Guest key="home" eid={ambilEvent()} />;
}

const kurangGerak = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Transisi antarhalaman: halaman lama wipe-out singkat (±170 ms), lalu halaman baru wipe-in.
// Komponen tidak di-remount (hanya kelas CSS yang berganti out -> in), jadi state sesi/Firebase tidak ter-reset.
// Dengan prefers-reduced-motion halaman langsung berganti tanpa animasi.
function Root() {
  const h = useHash();
  const [tampil, setTampil] = useState(h);
  const [fase, setFase] = useState('in');   // in | out
  const jam = useRef(0);
  useEffect(() => {
    if (h === tampil) { setFase('in'); return undefined; }
    if (kurangGerak()) { setTampil(h); return undefined; }
    setFase('out');
    jam.current = setTimeout(() => { setTampil(h); setFase('in'); window.scrollTo(0, 0); }, 170);
    return () => clearTimeout(jam.current);
  }, [h]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={'route ' + fase}><Halaman h={tampil} /></div>;
}
createRoot(document.getElementById('root')).render(<Root />);
