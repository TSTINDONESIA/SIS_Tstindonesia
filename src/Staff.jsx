import React, { useCallback, useEffect, useState } from 'react';
import { ref, get, set, remove } from 'firebase/database';
import { db, ready } from './firebase.js';
import { Brand, Spinner } from './ui.jsx';
import { normHp } from './util.js';
import { Dashboard, DaftarAcara } from './Usher.jsx';
import Admin from './Admin.jsx';

// Sesi petugas: HP tersimpan di sis/sesi/<uid> (hanya bisa ditulis bila nomornya terdaftar di Rules)
export function useSesi() {
  const [s, setS] = useState({ loading: true, uid: null, hp: null, isSuper: false });
  const muat = useCallback(async () => {
    const u = await ready;
    const sn = await get(ref(db, 'sis/sesi/' + u.uid));
    const hp = sn.val();
    let isSuper = false;
    if (hp) {
      try { isSuper = (await get(ref(db, 'sis/superDaftar/' + hp))).exists(); } catch { isSuper = false; }
    }
    setS({ loading: false, uid: u.uid, hp: hp || null, isSuper });
  }, []);
  useEffect(() => { muat().catch(() => setS({ loading: false, uid: null, hp: null, isSuper: false, error: true })); }, [muat]);
  const login = async (raw) => {
    const hp = normHp(raw);
    if (!hp) throw new Error('Nomor HP tidak valid. Contoh: 0812 3456 7890');
    try { await set(ref(db, 'sis/sesi/' + s.uid), hp); }
    catch (e) {
      if (e && e.code === 'PERMISSION_DENIED') throw new Error('Nomor ini belum terdaftar. Minta Super Admin memasukkan nomor Anda ke daftar petugas acara. (Jika Anda Super Admin: cek sis/superDaftar/' + hp + ' = true dan Rules sudah di-Publish.)');
      throw new Error('Gagal masuk (' + ((e && (e.code || e.message)) || 'tidak diketahui') + '). Cek internet, lalu coba lagi.');
    }
    await muat();
  };
  const logout = async () => { try { await remove(ref(db, 'sis/sesi/' + s.uid)); } catch {} await muat(); };
  return { ...s, login, logout };
}

function Login({ sesi }) {
  const [hp, setHp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const masuk = async () => {
    setErr(''); setBusy(true);
    try { await sesi.login(hp); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div className="wrap">
      <Brand sub="Usher & Super Admin" />
      <div className="card">
        <h2>Masuk</h2>
        <p className="muted">Masukkan nomor HP Anda yang sudah didaftarkan Super Admin.</p>
        <label>Nomor HP
          <input value={hp} inputMode="tel" placeholder="0812 3456 7890" onChange={(e) => setHp(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && masuk()} />
        </label>
        {err ? <div className="err">{err}</div> : null}
        <button className="btn primary" disabled={busy || !hp.trim()} onClick={masuk}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
      </div>
    </div>
  );
}

export default function Staff({ hash }) {
  const sesi = useSesi();
  if (sesi.loading) return <div className="wrap"><Spinner /></div>;
  if (sesi.error) return <div className="wrap"><div className="err">Tidak bisa terhubung ke Firebase. Periksa koneksi dan pengaturan Authentication (Anonymous).</div></div>;
  if (!sesi.hp) return <Login sesi={sesi} />;
  const ma = hash.match(/^#\/admin(?:\/([a-z]+))?/);
  if (ma) {
    if (!sesi.isSuper) {
      return (
        <div className="wrap"><Brand sub="Super Admin" />
          <div className="card center"><div className="big">🔒</div><p>Nomor Anda bukan Super Admin.</p>
            <a className="btn" href="#/usher">Ke halaman Usher</a></div></div>
      );
    }
    return <Admin sesi={sesi} sub={ma[1] || ''} />;
  }
  const mu = hash.match(/^#\/usher\/([a-z0-9]{4,12})/);
  if (mu) return <Dashboard key={mu[1]} eid={mu[1]} sesi={sesi} />;
  return <DaftarAcara sesi={sesi} />;
}
