import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { auth, db } from '../firebase.js';
import Guest from './Guest.jsx';
import Usher from './Usher.jsx';
import './interpreter.css';

// Alamat tanpa ID acara (#/ atau #/?no=A001 dari stiker): arahkan ke acara yang sedang berlangsung
function Arahkan() {
  const [st, setSt] = useState('muat');   // muat | kosong | gagal
  useEffect(() => {
    let batal = false;
    const jalan = async () => {
      try {
        // 1) acara yang sedang berlangsung menurut rentang tanggal; 2) acara cadangan; 3) acara terdekat berikutnya
        const jad = (await get(ref(db, 'interpreter/jadwalPublik'))).val() || {};
        const now = Date.now();
        const list = Object.entries(jad).filter(([, v]) => v && !v.a);
        const jalan_ = list.filter(([, v]) => v.s <= now && now <= v.e).sort((x, y) => y[1].s - x[1].s)[0];
        let id = jalan_ ? jalan_[0] : (await get(ref(db, 'interpreter/aktifAcara'))).val();
        if (!id) { const next = list.filter(([, v]) => v.s > now).sort((x, y) => x[1].s - y[1].s)[0]; id = next ? next[0] : ''; }
        if (batal) return;
        if (typeof id === 'string' && id) {
          const q = location.hash.includes('?') ? '?' + location.hash.split('?')[1] : '';
          location.replace('#/r/' + id + q);
        } else setSt('kosong');
      } catch { if (!batal) setSt('gagal'); }
    };
    const off = onAuthStateChanged(auth, (u) => {
      if (u) jalan(); else signInAnonymously(auth).catch(() => { if (!batal) setSt('gagal'); });
    });
    return () => { batal = true; off(); };
  }, []);
  return (
    <div className="wrap"><div className="card center">
      {st === 'muat' && <p className="muted">Memuat… / Loading…</p>}
      {st === 'kosong' && <><div className="big">📷</div><p>Belum ada acara yang berlangsung. Scan QR dari petugas di acara Anda.</p><p className="muted">No event is open right now. Please scan the QR code from our staff.</p></>}
      {st === 'gagal' && <><div className="big">⚠️</div><p>Tidak bisa terhubung. Periksa internet lalu muat ulang halaman.</p><p className="muted">Connection failed. Please check your internet and reload.</p></>}
    </div></div>
  );
}

function Root() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  if (h.startsWith('#/usher') || h.startsWith('#/admin') || h.startsWith('#/cetak')) return <Usher hash={h} />;
  const m = h.match(/^#\/r\/([a-z0-9-]{1,30})/);
  if (!m) return <Arahkan />;
  return <Guest key={m[1]} rid={m[1]} />;
}
createRoot(document.getElementById('root')).render(<Root />);
