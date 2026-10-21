import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { ref, onValue, push, update, serverTimestamp } from 'firebase/database';
import { auth, db } from '../firebase.js';
import { waLink } from './util.js';

const KEY = 'tst-interpreter-last';
const logo = import.meta.env.BASE_URL + 'logo.png';

function Bantuan({ list }) {
  if (!list.length) return null;
  return (
    <div className="card">
      <b>Ada kendala dengan alat?</b>
      <p className="muted">Hubungi Usher via WhatsApp:</p>
      {list.map((u) => (
        <a key={u.id} className="btn wa" href={waLink(u.hp, 'Halo Usher, saya butuh bantuan dengan receiver interpreter.')} target="_blank" rel="noreferrer">
          💬 {u.nama} · {u.hp}
        </a>
      ))}
    </div>
  );
}

export default function Guest() {
  const [ready, setReady] = useState(false);
  const [cfg, setCfg] = useState({});
  const [f, setF] = useState({ nama: '', hp: '', institusi: '', receiver: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  });

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (u) setReady(true);
    else signInAnonymously(auth).catch(() => setErr('Tidak bisa terhubung. Periksa internet Anda lalu muat ulang halaman.'));
  }), []);

  useEffect(() => {
    if (!ready) return;
    return onValue(ref(db, 'interpreter/config'), (s) => setCfg(s.val() || {}), () => {});
  }, [ready]);

  const bantuan = Object.entries(cfg.bantuan || {}).map(([id, v]) => ({ id, ...v }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const kirim = async (e) => {
    e.preventDefault();
    setErr('');
    const d = {
      nama: f.nama.trim(),
      hp: f.hp.trim(),
      institusi: f.institusi.trim(),
      receiver: f.receiver.trim().toUpperCase(),
    };
    if (!d.nama || !d.institusi) return setErr('Nama dan institusi wajib diisi.');
    if (!/^[0-9+ -]{6,20}$/.test(d.hp)) return setErr('Nomor HP tidak valid (hanya angka).');
    if (!/^[A-Z0-9-]{1,6}$/.test(d.receiver)) return setErr('Nomor receiver tidak valid (angka pada alat, maks. 6 karakter).');
    setBusy(true);
    try {
      const id = push(ref(db, 'interpreter/pinjam')).key;
      // satu penulisan atomik: catatan peminjam + kunci nomor receiver
      // (gagal otomatis bila nomor receiver itu masih tercatat dipinjam orang lain)
      await update(ref(db, 'interpreter'), {
        ['pinjam/' + id]: { ...d, waktu: serverTimestamp(), status: 'dipinjam' },
        ['aktif/' + d.receiver]: id,
      });
      const rec = { nama: d.nama, receiver: d.receiver };
      try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* abaikan */ }
      setDone(rec);
    } catch {
      setErr(`Receiver No. ${d.receiver} gagal dicatat. Kemungkinan nomor itu sedang tercatat dipinjam tamu lain, atau sinyal terputus. Cek kembali angka pada alat, atau hubungi Usher.`);
    }
    setBusy(false);
  };

  const head = (
    <div className="head">
      <img src={logo} alt="" />
      <div>
        <h1>TST Interpreter</h1>
        {cfg.acara && <div className="muted">{cfg.acara}</div>}
      </div>
    </div>
  );

  if (done) {
    return (
      <div className="wrap">
        {head}
        <div className="card center">
          <div className="big">🙏</div>
          <h2>Terima kasih, {done.nama}!</h2>
          <p>
            Receiver <b>No. {done.receiver}</b> sudah tercatat atas nama Anda.
            Selamat menikmati acara — semoga terjemahannya membantu.
          </p>
          <p className="muted">Mohon kembalikan alat ke meja Usher setelah acara selesai.</p>
        </div>
        <Bantuan list={bantuan} />
        <button className="link" onClick={() => { try { localStorage.removeItem(KEY); } catch { /* */ } setDone(null); setF({ nama: '', hp: '', institusi: '', receiver: '' }); }}>
          Isi untuk alat lain
        </button>
      </div>
    );
  }

  return (
    <div className="wrap">
      {head}
      <form className="card" onSubmit={kirim}>
        <h2>Alat sudah Anda terima?</h2>
        <p className="muted">Lengkapi data singkat ini agar alat tercatat atas nama Anda.</p>
        <label>Nama lengkap
          <input value={f.nama} onChange={set('nama')} autoComplete="name" maxLength={80} required />
        </label>
        <label>Nomor HP / WhatsApp
          <input value={f.hp} onChange={set('hp')} type="tel" inputMode="tel" placeholder="08xxxxxxxxxx" autoComplete="tel" required />
        </label>
        <label>Institusi / Lembaga
          <input value={f.institusi} onChange={set('institusi')} maxLength={100} required />
        </label>
        <label>Nomor receiver (tertera di alat)
          <input value={f.receiver} onChange={set('receiver')} inputMode="numeric" maxLength={6} className="rcv" required />
        </label>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy || !ready}>{busy ? 'Menyimpan…' : 'Konfirmasi alat diterima'}</button>
      </form>
      <Bantuan list={bantuan} />
    </div>
  );
}
