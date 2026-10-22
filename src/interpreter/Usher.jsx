import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, onValue, update, push, remove, get, set, serverTimestamp } from 'firebase/database';
import QRCode from 'qrcode';
import { auth, db } from '../firebase.js';
import { waLink, waNum, fmtJam, fmtTgl, DEFAULT_PESAN, contactLink, isEmail, rcvNorm, rcvKey, RCV_OK } from './util.js';

const natural = (a, b) => String(a.receiver).localeCompare(String(b.receiver), undefined, { numeric: true });

function Login({ onOk }) {
  const [nama, setNama] = useState('');
  const [hp, setHp] = useState('');
  const [em, setEm] = useState('');
  const [pw, setPw] = useState('');
  const [admin, setAdmin] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const masuk = async (e) => {
    e.preventDefault();
    setErr('');
    const key = waNum(hp);
    if (!nama.trim() || !/^62[0-9]{8,13}$/.test(key)) return setErr('Isi nama dan nomor HP/WhatsApp dengan benar.');
    setBusy(true);
    try {
      const u = auth.currentUser || (await signInAnonymously(auth)).user;
      const s = await get(ref(db, 'interpreter/usherDaftar/' + key));
      const cocok = s.exists() && String(s.val()).trim().toLowerCase() === nama.trim().toLowerCase();
      if (!cocok) {
        setErr('Nama atau nomor HP belum terdaftar sebagai Usher. Minta Usher lain menambahkan Anda di tab Pengaturan.');
      } else {
        await set(ref(db, 'interpreter/usher/' + u.uid), key);
        onOk();
      }
    } catch (e2) { setErr('Gagal masuk (kode: ' + (e2.code || 'tidak diketahui') + '). Cek internet lalu coba lagi.'); }
    setBusy(false);
  };

  const masukAdmin = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, em.trim(), pw);
      const s = await get(ref(db, 'interpreter/usher/' + cred.user.uid));
      if (s.exists()) onOk();
      else setErr('Email & password benar, tapi akun ini belum terdaftar sebagai admin. Tambahkan UID ini di Firebase: interpreter/usher/' + cred.user.uid + ' = true');
    } catch (e2) {
      const c = e2.code || 'tidak diketahui';
      const peta = {
        'auth/invalid-credential': 'Email atau password salah (atau akun belum dibuat di Firebase).',
        'auth/wrong-password': 'Password salah.',
        'auth/user-not-found': 'Email belum terdaftar di Firebase Authentication.',
        'auth/invalid-email': 'Format email tidak valid.',
        'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.',
        'auth/network-request-failed': 'Koneksi internet bermasalah.',
        'auth/operation-not-allowed': 'Metode Email/Password belum diaktifkan di Firebase.',
        'auth/unauthorized-domain': 'Domain ini belum ditambahkan di Firebase Authentication > Settings > Authorized domains.',
        'PERMISSION_DENIED': 'Login berhasil tapi database menolak membaca. Cek Rules di Firebase.',
      };
      setErr((peta[c] || 'Gagal masuk.') + ' (kode: ' + c + ')');
    }
    setBusy(false);
  };

  return (
    <div className="wrap">
      {!admin ? (
        <form className="card" onSubmit={masuk}>
          <h2>Login Usher</h2>
          <label>Nama<input value={nama} onChange={(e) => setNama(e.target.value)} autoComplete="name" required /></label>
          <label>Nomor HP / WhatsApp<input value={hp} onChange={(e) => setHp(e.target.value)} type="tel" inputMode="tel" placeholder="08123456789" required /></label>
          {err && <div className="err">{err}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
          <button type="button" className="link" onClick={() => { setAdmin(true); setErr(''); }}>Login admin (email)</button>
        </form>
      ) : (
        <form className="card" onSubmit={masukAdmin}>
          <h2>Login Admin</h2>
          <label>Email<input value={em} onChange={(e) => setEm(e.target.value)} type="email" autoCapitalize="none" autoCorrect="off" required /></label>
          <label>Password<input value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoCapitalize="none" autoCorrect="off" required /></label>
          {err && <div className="err" style={{ wordBreak: 'break-all' }}>{err}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
          <button type="button" className="link" onClick={() => { setAdmin(false); setErr(''); }}>Kembali ke login Usher</button>
        </form>
      )}
    </div>
  );
}

function Pengaturan({ cfg, total, onCsv, onReset }) {
  const [acara, setAcara] = useState(cfg.acara || '');
  const [batas, setBatas] = useState(cfg.batasJam || '');
  const [pesan, setPesan] = useState(cfg.pesan || DEFAULT_PESAN);
  const [nama, setNama] = useState('');
  const [hp, setHp] = useState('');
  const [tNama, setTNama] = useState(cfg.teknisi?.nama || '');
  const [tHp, setTHp] = useState(cfg.teknisi?.hp || '');
  const [qr, setQr] = useState('');
  const [resetBuka, setResetBuka] = useState(false);
  const [ketik, setKetik] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const link = location.origin + location.pathname.replace(/[^/]*$/, '') + '#/';
  const bantuan = Object.entries(cfg.bantuan || {});

  useEffect(() => { QRCode.toDataURL(link, { width: 480, margin: 2 }).then(setQr).catch(() => {}); }, [link]);

  const simpan = async () => {
    await update(ref(db, 'interpreter/config'), { acara: acara.trim(), batasJam: batas, pesan });
    alert('Tersimpan.');
  };
  const simpanTeknisi = async () => {
    if (!/^62[0-9]{8,13}$/.test(waNum(tHp))) return alert('Nomor WhatsApp teknisi tidak valid. Contoh: 08123456789');
    try {
      await update(ref(db, 'interpreter/config'), { teknisi: { nama: tNama.trim(), hp: tHp.trim() } });
      alert('Nomor teknisi tersimpan. Tombol bantuan di halaman tamu sekarang langsung ke WhatsApp teknisi ini.');
    } catch { alert('Gagal menyimpan nomor teknisi.'); }
  };
  const tambah = async () => {
    if (!nama.trim() || !hp.trim()) return;
    const key = waNum(hp);
    if (!/^62[0-9]{8,13}$/.test(key)) return alert('Nomor HP tidak valid.');
    const id = push(ref(db, 'interpreter/config/bantuan')).key;
    try {
      await update(ref(db, 'interpreter'), {
        ['config/bantuan/' + id]: { nama: nama.trim(), hp: hp.trim() },
        ['usherDaftar/' + key]: nama.trim(),
      });
      setNama(''); setHp('');
    } catch { alert('Gagal menambah Usher.'); }
  };

  return (
    <>
      <div className="card" style={{ borderColor: cfg.teknisi?.hp ? undefined : '#B45309' }}>
        <h3>🛟 Nomor teknisi (wajib diisi)</h3>
        <p className="muted">Tamu yang mengalami kendala menekan satu tombol di halaman tamu dan langsung tersambung ke WhatsApp teknisi ini.</p>
        <input placeholder="Nama teknisi (opsional)" value={tNama} onChange={(e) => setTNama(e.target.value)} />
        <input placeholder="Nomor WhatsApp teknisi, mis. 08123456789" type="tel" value={tHp} onChange={(e) => setTHp(e.target.value)} />
        <button className="btn primary" onClick={simpanTeknisi}>Simpan nomor teknisi</button>
        {tHp && <a className="link" href={waLink(tHp, 'Tes dari halaman Usher TST Indonesia')} target="_blank" rel="noreferrer">Tes buka WhatsApp</a>}
      </div>

      <div className="card">
        <h3>Daftar Usher</h3>
        <p className="muted">Nama + nomor WA. Usher di daftar ini bisa login, dan nomornya tampil di halaman tamu sebagai tombol WhatsApp.</p>
        {bantuan.map(([id, u]) => (
          <div className="row" key={id}>
            <span>{u.nama} · {u.hp}</span>
            <button className="link danger" onClick={() => update(ref(db, 'interpreter'), { ['config/bantuan/' + id]: null, ['usherDaftar/' + waNum(u.hp)]: null }).catch(() => alert('Gagal menghapus.'))}>Hapus</button>
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

      <div className="card" style={{ borderColor: '#7F1D1D' }}>
        <h3>🗑️ Reset data peminjaman</h3>
        <p className="muted">Menghapus semua data peminjaman, status, dan penilaian ({total} data) untuk acara baru. Daftar Usher, nomor teknisi, dan pengaturan acara tetap ada. Tidak bisa dibatalkan.</p>
        {!resetBuka ? (
          <button className="btn" style={{ borderColor: '#B91C1C', color: '#FCA5A5' }} onClick={() => { setResetBuka(true); setKetik(''); }}>Reset data…</button>
        ) : (
          <>
            <div className="err">Konfirmasi: {total} data akan dihapus permanen. Unduh CSV dulu bila masih dibutuhkan.</div>
            <button className="btn" onClick={onCsv}>⬇ Unduh CSV dulu</button>
            <label>Ketik <b>RESET</b> untuk melanjutkan
              <input value={ketik} onChange={(e) => setKetik(e.target.value)} autoCapitalize="characters" autoCorrect="off" placeholder="RESET" />
            </label>
            <div className="actions">
              <button className="btn" style={{ background: '#B91C1C', borderColor: '#B91C1C' }} disabled={ketik.trim().toUpperCase() !== 'RESET' || resetBusy}
                onClick={async () => {
                  if (!confirm(`Yakin? ${total} data peminjaman akan dihapus PERMANEN.`)) return;
                  setResetBusy(true);
                  const ok = await onReset();
                  setResetBusy(false);
                  if (ok) { setResetBuka(false); setKetik(''); }
                }}>{resetBusy ? 'Menghapus…' : 'Ya, hapus semua'}</button>
              <button className="btn" onClick={() => { setResetBuka(false); setKetik(''); }}>Batal</button>
            </div>
          </>
        )}
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

const bintang = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const rata = (arr) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '-');

function Penilaian({ nilai, loans }) {
  const byId = Object.fromEntries(loans.map((l) => [l.id, l]));
  const rows = Object.entries(nilai).map(([id, v]) => ({ id, ...v, loan: byId[id] }))
    .sort((a, b) => (b.waktu || 0) - (a.waktu || 0));
  return (
    <>
      <div className="nilai">
        <div><b>{rata(rows.map((r) => r.pelayanan))}</b><span>Pelayanan (1-5)</span></div>
        <div><b>{rata(rows.map((r) => r.alat))}</b><span>Alat (1-5)</span></div>
        <div><b>{rows.length}</b><span>Penilaian masuk</span></div>
      </div>
      {!rows.length && <p className="muted center">Belum ada penilaian. Penilaian muncul setelah tamu mengembalikan alat.</p>}
      {rows.map((r) => (
        <div className="loan" key={r.id}>
          <div className="no">{r.loan?.receiver || '?'}</div>
          <div className="info">
            <b>{r.loan?.nama || 'Tamu'}</b>
            <span>Pelayanan <span className="star-sm">{bintang(r.pelayanan)}</span></span>
            <span>Alat <span className="star-sm">{bintang(r.alat)}</span></span>
            {r.komentar && <span style={{ color: '#E8EEF8' }}>“{r.komentar}”</span>}
            <span className="muted">{fmtTgl(r.waktu)}</span>
          </div>
        </div>
      ))}
    </>
  );
}

function Dashboard({ user }) {
  const [loans, setLoans] = useState([]);
  const [nilai, setNilai] = useState({});
  const [cfg, setCfg] = useState({});
  const [tab, setTab] = useState('aktif');
  const [q, setQ] = useState('');
  const [queue, setQueue] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const a = onValue(ref(db, 'interpreter/pinjam'), (s) =>
      setLoans(Object.entries(s.val() || {}).map(([id, v]) => ({ id, ...v }))), () => {});
    const b = onValue(ref(db, 'interpreter/config'), (s) => setCfg(s.val() || {}), () => {});
    const c = onValue(ref(db, 'interpreter/nilai'), (s) => setNilai(s.val() || {}), () => {});
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => { a(); b(); c(); clearInterval(t); };
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
    const sk = rcvKey(s).toLowerCase();
    const r = !s ? arr : arr.filter((l) =>
      String(l.receiver).toLowerCase().includes(s) || (sk && rcvKey(l.receiver).toLowerCase() === sk) || (l.nama || '').toLowerCase().includes(s) ||
      (l.hp || '').includes(s) || (l.institusi || '').toLowerCase().includes(s));
    return [...r].sort((a, b) => {
      const ea = String(a.receiver).toLowerCase() === s || rcvKey(a.receiver).toLowerCase() === sk ? 0 : 1;
      const eb = String(b.receiver).toLowerCase() === s || rcvKey(b.receiver).toLowerCase() === sk ? 0 : 1;
      return ea - eb || natural(a, b);
    });
  };

  // kunci di node "aktif" (data lama memakai nomor apa adanya)
  const kAlat = (l) => l.kunci || l.receiver;

  const sudahKembali = async (l) => {
    if (!confirm(`Receiver ${l.receiver} (${l.nama}) sudah kembali?`)) return;
    try {
      await update(ref(db, 'interpreter'), {
        [`pinjam/${l.id}/status`]: 'kembali',
        [`pinjam/${l.id}/kembaliWaktu`]: serverTimestamp(),
        [`aktif/${kAlat(l)}`]: null,
      });
      setQ('');
    } catch { alert('Gagal menyimpan. Cek internet lalu coba lagi.'); }
  };

  const batalKembali = async (l) => {
    const s = await get(ref(db, `interpreter/aktif/${kAlat(l)}`));
    if (s.exists()) return alert(`Nomor ${l.receiver} sekarang sedang dipinjam orang lain.`);
    try {
      await update(ref(db, 'interpreter'), {
        [`pinjam/${l.id}/status`]: 'dipinjam',
        [`pinjam/${l.id}/kembaliWaktu`]: null,
        [`aktif/${kAlat(l)}`]: l.id,
      });
    } catch { alert('Gagal membatalkan.'); }
  };

  // satu orang (kontak sama) bisa membawa lebih dari satu alat
  const kunci = (l) => (isEmail(l.hp) ? String(l.hp).trim().toLowerCase() : waNum(l.hp));
  const grup = useMemo(() => {
    const m = {};
    aktif.forEach((l) => { (m[kunci(l)] = m[kunci(l)] || []).push(l); });
    return m;
  }, [aktif]);
  const saudara = (l) => [...(grup[kunci(l)] || [l])].sort(natural);
  const daftarNo = (l) => saudara(l).map((x) => x.receiver).join(', ');

  const pesan = (l) => (cfg.pesan || DEFAULT_PESAN)
    .replaceAll('{nama}', l.nama).replaceAll('{no}', daftarNo(l)).replaceAll('{acara}', cfg.acara || 'acara ini');

  // satu pengingat untuk semua alat orang yang sama (tidak kirim berkali-kali)
  const ingatkan = (l) => {
    const sau = saudara(l);
    window.open(contactLink(l.hp, pesan(l), 'Pengingat pengembalian receiver interpreter'), '_blank');
    const upd = {};
    sau.forEach((x) => {
      upd[`pinjam/${x.id}/reminderTerakhir`] = serverTimestamp();
      upd[`pinjam/${x.id}/reminderJumlah`] = (x.reminderJumlah || 0) + 1;
    });
    update(ref(db, 'interpreter'), upd).catch(() => {});
    const ids = sau.map((x) => x.id);
    setQueue((x) => x.filter((id) => !ids.includes(id)));
  };

  // ganti nomor alat (alat bermasalah / salah ketik nomor)
  const jalankanGanti = async (l, baruRaw, alasan = '') => {
    const baru = rcvNorm(baruRaw);
    if (!baru) return false;
    if (!RCV_OK.test(baru)) { alert('Nomor alat tidak valid (huruf/angka, maks. 8 karakter).'); return false; }
    if (rcvKey(baru) === rcvKey(l.receiver)) { alert('Nomornya sama dengan yang sekarang.'); return false; }
    const pakai = aktif.find((x) => rcvKey(x.receiver) === rcvKey(baru));
    if (pakai) { alert(`No. ${baru} sedang dipinjam oleh ${pakai.nama}. Pilih nomor lain, atau tandai alat itu kembali dulu.`); return false; }
    if (!confirm(`Tukar alat ${l.nama}:\nNo. ${l.receiver} → No. ${baru}${alasan ? `\nAlasan: ${alasan}` : ''}\n\n(No. ${l.receiver} akan bebas dipinjam lagi — pastikan alat yang error dipisahkan.)`)) return false;
    try {
      await update(ref(db, 'interpreter'), {
        [`pinjam/${l.id}/receiver`]: baru,
        [`pinjam/${l.id}/kunci`]: rcvKey(baru),
        [`pinjam/${l.id}/catatanGanti`]: ((l.catatanGanti ? l.catatanGanti + '; ' : '') + `${l.receiver}→${baru}${alasan ? ' [' + alasan + ']' : ''} (${fmtJam(Date.now())})`).slice(-200),
        [`aktif/${kAlat(l)}`]: null,
        [`aktif/${l.receiver}`]: null,
        [`aktif/${rcvKey(baru)}`]: l.id,
      });
      return true;
    } catch { alert('Gagal menukar alat. Pastikan Rules Firebase terbaru sudah di-Publish, lalu coba lagi.'); return false; }
  };
  const gantiAlat = (l) => jalankanGanti(l, prompt(`Tukar alat untuk ${l.nama}.\nNomor sekarang: ${l.receiver}\n\nMasukkan nomor alat PENGGANTI (mis. A001, B001, 01):`, '') || '');

  const [tukar, setTukar] = useState(null); // panel "Tukar alat": { lama, baru, alasan }
  const targetTukar = tukar && tukar.lama ? aktif.find((x) => rcvKey(x.receiver) === rcvKey(tukar.lama)) : null;
  const prosesTukar = async () => {
    if (!targetTukar) return alert(`No. ${tukar.lama || '?'} tidak sedang dipinjam. Cek nomor alat yang error.`);
    if (await jalankanGanti(targetTukar, tukar.baru, tukar.alasan.trim())) setTukar(null);
  };

  const kembaliSemua = async (l) => {
    const sau = saudara(l);
    if (!confirm(`${sau.length} alat atas nama ${l.nama} (No. ${daftarNo(l)}) sudah kembali semua?`)) return;
    try {
      const upd = {};
      sau.forEach((x) => {
        upd[`pinjam/${x.id}/status`] = 'kembali';
        upd[`pinjam/${x.id}/kembaliWaktu`] = serverTimestamp();
        upd[`aktif/${kAlat(x)}`] = null;
      });
      await update(ref(db, 'interpreter'), upd);
      setQ('');
    } catch { alert('Gagal menyimpan. Cek internet lalu coba lagi.'); }
  };

  const antrean = queue.map((id) => aktif.find((l) => l.id === id)).filter(Boolean);
  const cur = antrean[0];

  const csv = () => {
    const rows = [['Receiver', 'Nama', 'WhatsApp/Email', 'Institusi', 'Status', 'Waktu pinjam', 'Waktu kembali', 'Nilai pelayanan', 'Nilai alat', 'Komentar']]
      .concat([...loans].sort(natural).map((l) => [l.receiver, l.nama, l.hp, l.institusi, l.status, fmtTgl(l.waktu), fmtTgl(l.kembaliWaktu), nilai[l.id]?.pelayanan ?? '', nilai[l.id]?.alat ?? '', nilai[l.id]?.komentar ?? '']));
    const text = rows.map((r) => r.map((c) => `"${String(c ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv' }));
    a.download = 'interpreter-peminjaman.csv';
    a.click();
  };

  const resetSemua = async () => {
    try {
      await update(ref(db, 'interpreter'), {
        pinjam: null, aktif: null, nilai: null,
        'config/resetAt': serverTimestamp(),
      });
      setQueue([]); setQ('');
      alert('Data peminjaman sudah direset. Siap untuk acara baru.');
      return true;
    } catch { alert('Gagal mereset. Cek internet lalu coba lagi.'); return false; }
  };

  const list = cari(tab === 'aktif' ? aktif : kembali);

  const keluar = async () => {
    try { if (user.isAnonymous) await remove(ref(db, 'interpreter/usher/' + user.uid)); } catch { /* abaikan */ }
    signOut(auth);
  };

  return (
    <div className="wrap wide">
      <div className="head">
        <div>
          <h1>Usher · Interpreter</h1>
          <div className="muted">{cfg.acara || 'Usher'}</div>
        </div>
        <button className="link" onClick={keluar}>Keluar</button>
      </div>

      <div className="stats">
        <div><b>{aktif.length}</b><span>Belum kembali</span></div>
        <div><b>{kembali.length}</b><span>Sudah kembali</span></div>
        <div><b>{loans.length}</b><span>Total</span></div>
      </div>

      <div className="card" style={{ borderColor: '#2F5FB3' }}>
        {!tukar ? (
          <button className="btn primary" style={{ width: '100%' }} onClick={() => setTukar({ lama: '', baru: '', alasan: '' })}>🔁 Tukar alat (alat error)</button>
        ) : (
          <>
            <h3>🔁 Tukar alat</h3>
            <p className="muted">Tamu tidak perlu scan atau daftar ulang. Cukup isi nomor alat yang error dan nomor penggantinya.</p>
            <input placeholder="No. alat LAMA (yang error), mis. A001" value={tukar.lama} autoCapitalize="characters" onChange={(e) => setTukar({ ...tukar, lama: rcvNorm(e.target.value) })} />
            {tukar.lama && (targetTukar
              ? <div className="muted">✓ Peminjam: <b>{targetTukar.nama}</b>{targetTukar.institusi ? ` · ${targetTukar.institusi}` : ''}</div>
              : <div className="muted">Nomor ini tidak sedang dipinjam.</div>)}
            <input placeholder="No. alat BARU (pengganti), mis. B001" value={tukar.baru} autoCapitalize="characters" onChange={(e) => setTukar({ ...tukar, baru: rcvNorm(e.target.value) })} />
            <input placeholder="Alasan (opsional), mis. suara putus-putus" maxLength={60} value={tukar.alasan} onChange={(e) => setTukar({ ...tukar, alasan: e.target.value })} />
            <div className="actions">
              <button className="btn primary" disabled={!targetTukar || !tukar.baru} onClick={prosesTukar}>Tukar sekarang</button>
              <button className="btn" onClick={() => setTukar(null)}>Batal</button>
            </div>
          </>
        )}
      </div>

      {!cfg.teknisi?.hp && (
        <div className="warn">
          🛟 Nomor teknisi belum diisi — tombol bantuan di halaman tamu belum mengarah ke teknisi.
          <button className="btn" onClick={() => setTab('atur')}>Isi nomor teknisi</button>
        </div>
      )}

      {lewatBatas && aktif.length > 0 && (
        <div className="warn">
          ⏰ Lewat batas pengembalian ({cfg.batasJam}) — {aktif.length} alat belum kembali.
          <button className="btn" onClick={() => setQueue(Object.values(grup).map((g) => g[0].id))}>Ingatkan semua via WA</button>
        </div>
      )}

      {cur && (
        <div className="queue">
          <div>Pengingat berikutnya ({antrean.length} sisa):<br /><b>#{daftarNo(cur)} · {cur.nama}</b></div>
          <div className="actions">
            <button className="btn wa" onClick={() => ingatkan(cur)}>{isEmail(cur.hp) ? 'Kirim email' : 'Kirim WA'}</button>
            <button className="btn" onClick={() => setQueue((x) => x.filter((id) => id !== cur.id))}>Lewati</button>
            <button className="btn" onClick={() => setQueue([])}>Stop</button>
          </div>
        </div>
      )}

      <div className="tabs">
        {[['aktif', 'Dipinjam'], ['kembali', 'Sudah kembali'], ['nilai', 'Penilaian'], ['atur', 'Pengaturan']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>

      {tab === 'atur' ? <Pengaturan cfg={cfg} total={loans.length} onCsv={csv} onReset={resetSemua} /> : tab === 'nilai' ? <Penilaian nilai={nilai} loans={loans} /> : (
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
                {tab === 'aktif' && saudara(l).length > 1 && <span className="group">📦 {saudara(l).length} alat atas nama ini: No. {daftarNo(l)}</span>}
                {l.catatanGanti && <span className="group">🔁 Ganti alat: {l.catatanGanti}</span>}
                <span>{l.hp} · pinjam {fmtJam(l.waktu)}{l.kembaliWaktu ? ` · kembali ${fmtJam(l.kembaliWaktu)}` : ''}</span>
                {nilai[l.id] && <span>Nilai: pelayanan <span className="star-sm">{nilai[l.id].pelayanan}★</span> · alat <span className="star-sm">{nilai[l.id].alat}★</span></span>}
                {l.reminderJumlah > 0 && <span className="muted">Diingatkan {l.reminderJumlah}× (terakhir {fmtJam(l.reminderTerakhir)})</span>}
              </div>
              <div className="actions">
                {tab === 'aktif' ? (
                  <>
                    <button className="btn primary" onClick={() => sudahKembali(l)}>✓ Sudah kembali</button>
                    <button className="btn" onClick={() => gantiAlat(l)}>✎ Ganti no. alat</button>
                    {saudara(l).length > 1 && <button className="btn" onClick={() => kembaliSemua(l)}>✓ Semua ({saudara(l).length})</button>}
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
  const [ver, setVer] = useState(0);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u || null)), []);
  useEffect(() => {
    if (!user) { setOk(null); return; }
    let batal = false;
    get(ref(db, 'interpreter/usher/' + user.uid))
      .then((s) => { if (!batal) setOk(s.exists()); })
      .catch(() => { if (!batal) setOk(false); });
    return () => { batal = true; };
  }, [user, ver]);

  if (user === undefined) return <div className="wrap"><p className="muted center">Memuat…</p></div>;
  if (!user || ok === false) return <Login onOk={() => setVer((v) => v + 1)} />;
  if (ok === null) return <div className="wrap"><p className="muted center">Memeriksa akses…</p></div>;
  return <Dashboard user={user} />;
}
