import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, onValue, update, push, remove, get, serverTimestamp } from 'firebase/database';
import QRCode from 'qrcode';
import { auth, db } from '../firebase.js';
import { waLink, fmtJam, fmtTgl, DEFAULT_PESAN } from './util.js';

const natural = (a, b) => String(a.receiver).localeCompare(String(b.receiver), undefined, { numeric: true });

function Login() {
  const [em, setEm] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const go = async (e) => {
    e.preventDefault();
    setErr('');
    try { await signInWithEmailAndPassword(auth, em.trim(), pw); }
    catch { setErr('Email atau password salah.'); }
  };
  return (
    <div className="wrap">
      <form className="card" onSubmit={go}>
        <h2>Login Usher</h2>
        <label>Email<input value={em} onChange={(e) => setEm(e.target.value)} type="email" required /></label>
        <label>Password<input value={pw} onChange={(e) => setPw(e.target.value)} type="password" required /></label>
        {err && <div className="err">{err}</div>}
        <button className="btn primary">Masuk</button>
      </form>
    </div>
  );
}

function Pengaturan({ cfg }) {
  const [acara, setAcara] = useState(cfg.acara || '');
  const [batas, setBatas] = useState(cfg.batasJam || '');
  const [pesan, setPesan] = useState(cfg.pesan || DEFAULT_PESAN);
  const [nama, setNama] = useState('');
  const [hp, setHp] = useState('');
  const [qr, setQr] = useState('');
  const link = location.origin + location.pathname.replace(/[^/]*$/, '') + '#/';
  const bantuan = Object.entries(cfg.bantuan || {});

  useEffect(() => { QRCode.toDataURL(link, { width: 480, margin: 2 }).then(setQr).catch(() => {}); }, [link]);

  const simpan = async () => {
    await update(ref(db, 'interpreter/config'), { acara: acara.trim(), batasJam: batas, pesan });
    alert('Tersimpan.');
  };
  const tambah = async () => {
    if (!nama.trim() || !hp.trim()) return;
    await push(ref(db, 'interpreter/config/bantuan'), { nama: nama.trim(), hp: hp.trim() });
    setNama(''); setHp('');
  };

  return (
    <>
      <div className="card">
        <h3>Nomor Usher untuk bantuan tamu</h3>
        <p className="muted">Tampil di halaman tamu sebagai tombol WhatsApp.</p>
        {bantuan.map(([id, u]) => (
          <div className="row" key={id}>
            <span>{u.nama} · {u.hp}</span>
            <button className="link danger" onClick={() => remove(ref(db, 'interpreter/config/bantuan/' + id))}>Hapus</button>
          </div>
        ))}
        <input placeholder="Nama usher" value={nama} onChange={(e) => setNama(e.target.value)} />
        <input placeholder="Nomor WhatsApp" type="tel" value={hp} onChange={(e) => setHp(e.target.value)} />
        <button className="btn" onClick={tambah}>+ Tambah</button>
      </div>

      <div className="card">
        <h3>Acara & pengingat</h3>
        <label>Nama acara<input value={acara} onChange={(e) => setAcara(e.target.value)} /></label>
        <label>Batas pengembalian (jam)<input type="time" value={batas} onChange={(e) => setBatas(e.target.value)} /></label>
        <label>Teks pengingat WA
          <textarea rows={4} value={pesan} onChange={(e) => setPesan(e.target.value)} />
        </label>
        <p className="muted">Kode: {'{nama}'} {'{no}'} {'{acara}'}</p>
        <button className="btn primary" onClick={simpan}>Simpan</button>
      </div>

      <div className="card center">
        <h3>QR untuk tamu</h3>
        {qr && <img className="qr" src={qr} alt="QR" />}
        <p className="muted" style={{ wordBreak: 'break-all' }}>{link}</p>
        <button className="btn" onClick={() => window.print()}>Cetak</button>
      </div>
    </>
  );
}

function Dashboard({ user }) {
  const [loans, setLoans] = useState([]);
  const [cfg, setCfg] = useState({});
  const [tab, setTab] = useState('aktif');
  const [q, setQ] = useState('');
  const [queue, setQueue] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const a = onValue(ref(db, 'interpreter/pinjam'), (s) =>
      setLoans(Object.entries(s.val() || {}).map(([id, v]) => ({ id, ...v }))), () => {});
    const b = onValue(ref(db, 'interpreter/config'), (s) => setCfg(s.val() || {}), () => {});
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => { a(); b(); clearInterval(t); };
  }, []);

  const aktif = useMemo(() => loans.filter((l) => l.status === 'dipinjam'), [loans]);
  const kembali = useMemo(() => loans.filter((l) => l.status === 'kembali'), [loans]);

  const lewatBatas = useMemo(() => {
    if (!cfg.batasJam) return false;
    const [h, m] = cfg.batasJam.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return now > d.getTime();
  }, [cfg.batasJam, now]);

  const cari = (arr) => {
    const s = q.trim().toLowerCase();
    const r = !s ? arr : arr.filter((l) =>
      String(l.receiver).toLowerCase().includes(s) || (l.nama || '').toLowerCase().includes(s) ||
      (l.hp || '').includes(s) || (l.institusi || '').toLowerCase().includes(s));
    return [...r].sort((a, b) => {
      const ea = String(a.receiver).toLowerCase() === s ? 0 : 1;
      const eb = String(b.receiver).toLowerCase() === s ? 0 : 1;
      return ea - eb || natural(a, b);
    });
  };

  const sudahKembali = async (l) => {
    if (!confirm(`Receiver ${l.receiver} (${l.nama}) sudah kembali?`)) return;
    try {
      await update(ref(db, 'interpreter'), {
        [`pinjam/${l.id}/status`]: 'kembali',
        [`pinjam/${l.id}/kembaliWaktu`]: serverTimestamp(),
        [`aktif/${l.receiver}`]: null,
      });
      setQ('');
    } catch { alert('Gagal menyimpan. Cek internet lalu coba lagi.'); }
  };

  const batalKembali = async (l) => {
    const s = await get(ref(db, `interpreter/aktif/${l.receiver}`));
    if (s.exists()) return alert(`Nomor ${l.receiver} sekarang sedang dipinjam orang lain.`);
    try {
      await update(ref(db, 'interpreter'), {
        [`pinjam/${l.id}/status`]: 'dipinjam',
        [`pinjam/${l.id}/kembaliWaktu`]: null,
        [`aktif/${l.receiver}`]: l.id,
      });
    } catch { alert('Gagal membatalkan.'); }
  };

  const pesan = (l) => (cfg.pesan || DEFAULT_PESAN)
    .replaceAll('{nama}', l.nama).replaceAll('{no}', l.receiver).replaceAll('{acara}', cfg.acara || 'acara ini');

  const ingatkan = (l) => {
    window.open(waLink(l.hp, pesan(l)), '_blank');
    update(ref(db, 'interpreter/pinjam/' + l.id), {
      reminderTerakhir: serverTimestamp(), reminderJumlah: (l.reminderJumlah || 0) + 1,
    }).catch(() => {});
    setQueue((x) => x.filter((id) => id !== l.id));
  };

  const antrean = queue.map((id) => aktif.find((l) => l.id === id)).filter(Boolean);
  const cur = antrean[0];

  const csv = () => {
    const rows = [['Receiver', 'Nama', 'HP', 'Institusi', 'Status', 'Waktu pinjam', 'Waktu kembali']]
      .concat([...loans].sort(natural).map((l) => [l.receiver, l.nama, l.hp, l.institusi, l.status, fmtTgl(l.waktu), fmtTgl(l.kembaliWaktu)]));
    const text = rows.map((r) => r.map((c) => `"${String(c ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv' }));
    a.download = 'interpreter-peminjaman.csv';
    a.click();
  };

  const list = cari(tab === 'aktif' ? aktif : kembali);

  return (
    <div className="wrap wide">
      <div className="head">
        <div>
          <h1>Usher · Interpreter</h1>
          <div className="muted">{cfg.acara || user.email}</div>
        </div>
        <button className="link" onClick={() => signOut(auth)}>Keluar</button>
      </div>

      <div className="stats">
        <div><b>{aktif.length}</b><span>Belum kembali</span></div>
        <div><b>{kembali.length}</b><span>Sudah kembali</span></div>
        <div><b>{loans.length}</b><span>Total</span></div>
      </div>

      {lewatBatas && aktif.length > 0 && (
        <div className="warn">
          ⏰ Lewat batas pengembalian ({cfg.batasJam}) — {aktif.length} alat belum kembali.
          <button className="btn" onClick={() => setQueue(aktif.map((l) => l.id))}>Ingatkan semua via WA</button>
        </div>
      )}

      {cur && (
        <div className="queue">
          <div>Pengingat berikutnya ({antrean.length} sisa):<br /><b>#{cur.receiver} · {cur.nama}</b></div>
          <div className="actions">
            <button className="btn wa" onClick={() => ingatkan(cur)}>Kirim WA</button>
            <button className="btn" onClick={() => setQueue((x) => x.filter((id) => id !== cur.id))}>Lewati</button>
            <button className="btn" onClick={() => setQueue([])}>Stop</button>
          </div>
        </div>
      )}

      <div className="tabs">
        {[['aktif', 'Dipinjam'], ['kembali', 'Sudah kembali'], ['atur', 'Pengaturan']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>

      {tab === 'atur' ? <Pengaturan cfg={cfg} /> : (
        <>
          <input className="search" placeholder="🔍 Cari nomor receiver / nama / HP" value={q}
            onChange={(e) => setQ(e.target.value)} inputMode="search" />
          {!list.length && <p className="muted center">{q ? 'Tidak ditemukan.' : 'Belum ada data.'}</p>}
          {list.map((l) => (
            <div className={'loan' + (tab === 'aktif' && lewatBatas ? ' late' : '')} key={l.id}>
              <div className="no">{l.receiver}</div>
              <div className="info">
                <b>{l.nama}</b>
                <span>{l.institusi}</span>
                <span>{l.hp} · pinjam {fmtJam(l.waktu)}{l.kembaliWaktu ? ` · kembali ${fmtJam(l.kembaliWaktu)}` : ''}</span>
                {l.reminderJumlah > 0 && <span className="muted">Diingatkan {l.reminderJumlah}× (terakhir {fmtJam(l.reminderTerakhir)})</span>}
              </div>
              <div className="actions">
                {tab === 'aktif' ? (
                  <>
                    <button className="btn primary" onClick={() => sudahKembali(l)}>✓ Sudah kembali</button>
                    <button className="btn" onClick={() => ingatkan(l)}>🔔 Ingatkan</button>
                  </>
                ) : (
                  <button className="link" onClick={() => batalKembali(l)}>Batalkan</button>
                )}
              </div>
            </div>
          ))}
          <button className="link" onClick={csv}>⬇ Unduh CSV</button>
        </>
      )}
    </div>
  );
}

export default function Usher() {
  const [user, setUser] = useState(undefined);
  const [ok, setOk] = useState(null);

  // tamu (anonim) tidak dianggap login usher
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u && !u.isAnonymous ? u : null)), []);
  useEffect(() => {
    if (!user) { setOk(null); return; }
    get(ref(db, 'interpreter/usher/' + user.uid)).then((s) => setOk(s.val() === true)).catch(() => setOk(false));
  }, [user]);

  if (user === undefined) return <div className="wrap"><p className="muted center">Memuat…</p></div>;
  if (!user) return <Login />;
  if (ok === null) return <div className="wrap"><p className="muted center">Memeriksa akses…</p></div>;
  if (!ok) {
    return (
      <div className="wrap"><div className="card center">
        <h2>Tidak ada akses</h2>
        <p className="muted">Akun ini belum didaftarkan sebagai Usher.<br />UID: {user.uid}</p>
        <button className="btn" onClick={() => signOut(auth)}>Keluar</button>
      </div></div>
    );
  }
  return <Dashboard user={user} />;
}
