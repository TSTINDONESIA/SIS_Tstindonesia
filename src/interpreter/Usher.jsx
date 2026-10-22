import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, onValue, update, push, remove, get, set, serverTimestamp } from 'firebase/database';
import QRCode from 'qrcode';
import { auth, db } from '../firebase.js';
import { waLink, waNum, fmtJam, fmtTgl, DEFAULT_PESAN, pilihPesan, salamWaktu, contactLink, isEmail, rcvNorm, rcvKey, RCV_OK, basePath, slug, statusRuang, jadwalText } from './util.js';

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

function Pengaturan({ cfg, total, onCsv, onPdf, onReset, rid, isSuper }) {
  const B = basePath(rid);
  const PX = rid ? 'rooms/' + rid + '/' : '';
  const [acara, setAcara] = useState(cfg.acara || '');
  const [batas, setBatas] = useState(cfg.batasJam || '');
  const [pesan, setPesan] = useState(pilihPesan(cfg.pesan));
  const [nama, setNama] = useState('');
  const [hp, setHp] = useState('');
  const [tNama, setTNama] = useState(cfg.teknisi?.nama || '');
  const [tHp, setTHp] = useState(cfg.teknisi?.hp || '');
  const [chs, setChs] = useState(() => Object.values(cfg.channels || {})
    .sort((a, b) => Number(a.ch) - Number(b.ch)).map((v) => ({ ch: String(v.ch), bahasa: v.bahasa })));
  const [qr, setQr] = useState('');
  const [resetBuka, setResetBuka] = useState(false);
  const [ketik, setKetik] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const link = location.origin + location.pathname.replace(/[^/]*$/, '') + '#/' + (rid ? 'r/' + rid : '');
  const bantuan = Object.entries(cfg.bantuan || {});

  useEffect(() => { QRCode.toDataURL(link, { width: 480, margin: 2 }).then(setQr).catch(() => {}); }, [link]);

  const simpan = async () => {
    await update(ref(db, B + '/config'), { acara: acara.trim(), batasJam: batas, pesan });
    alert('Tersimpan.');
  };
  const simpanTeknisi = async () => {
    if (!/^62[0-9]{8,13}$/.test(waNum(tHp))) return alert('Nomor WhatsApp teknisi tidak valid. Contoh: 08123456789');
    try {
      await update(ref(db, B + '/config'), { teknisi: { nama: tNama.trim(), hp: tHp.trim() } });
      alert('Nomor teknisi tersimpan. Tombol bantuan di halaman tamu sekarang langsung ke WhatsApp teknisi ini.');
    } catch { alert('Gagal menyimpan nomor teknisi.'); }
  };
  const ubahCh = (i, k, v) => setChs(chs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const simpanCh = async () => {
    const baris = chs.map((c) => ({ ch: String(c.ch).replace(/\D/g, '').slice(0, 2), bahasa: c.bahasa.trim() })).filter((c) => c.ch || c.bahasa);
    if (baris.some((c) => !c.ch || !c.bahasa)) return alert('Setiap baris harus punya nomor channel dan nama bahasa.');
    if (new Set(baris.map((c) => Number(c.ch))).size !== baris.length) return alert('Ada nomor channel yang dobel.');
    const data = {};
    baris.forEach((c) => { data['c' + Number(c.ch)] = { ch: Number(c.ch), bahasa: c.bahasa.slice(0, 40) }; });
    try {
      await set(ref(db, B + '/config/channels'), baris.length ? data : null);
      alert('Daftar channel tersimpan. Langsung tampil di panduan halaman tamu.');
    } catch { alert('Gagal menyimpan daftar channel.'); }
  };
  const tambah = async () => {
    if (!nama.trim() || !hp.trim()) return;
    const key = waNum(hp);
    if (!/^62[0-9]{8,13}$/.test(key)) return alert('Nomor HP tidak valid.');
    const id = push(ref(db, B + '/config/bantuan')).key;
    try {
      await update(ref(db, 'interpreter'), {
        [PX + 'config/bantuan/' + id]: { nama: nama.trim(), hp: hp.trim() },
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
        <h3>📻 Channel bahasa</h3>
        <p className="muted">Isi manual sesuai pengaturan di lokasi, mis. Channel 1 = Indonesia, Channel 2 = English. Daftar ini tampil di tombol "Baca tata cara penggunaan" pada halaman tamu.</p>
        {chs.map((c, i) => (
          <div className="chedit" key={i}>
            <input className="chno" inputMode="numeric" placeholder="No" maxLength={2} value={c.ch} onChange={(e) => ubahCh(i, 'ch', e.target.value.replace(/\D/g, ''))} />
            <input placeholder="Bahasa, mis. Indonesia" maxLength={40} value={c.bahasa} onChange={(e) => ubahCh(i, 'bahasa', e.target.value)} />
            <button className="link danger" onClick={() => setChs(chs.filter((_, j) => j !== i))}>Hapus</button>
          </div>
        ))}
        <button className="btn" onClick={() => setChs([...chs, { ch: String(chs.length ? Math.max(...chs.map((c) => Number(c.ch) || 0)) + 1 : 1), bahasa: '' }])}>+ Tambah channel</button>
        <button className="btn primary" onClick={simpanCh}>Simpan channel</button>
      </div>

      {rid ? (
        <div className="card">
          <h3>Petugas ruangan</h3>
          <p className="muted">Petugas ruangan ini diatur oleh Super Admin.</p>
          {bantuan.map(([id, u]) => <div className="row" key={id}><span>{u.nama} · {u.hp}</span></div>)}
          {isSuper && <a className="btn" href="#/admin">Atur petugas di panel Super Admin</a>}
        </div>
      ) : (
      <div className="card">
        <h3>Daftar Usher</h3>
        <p className="muted">{rid ? 'Usher ruangan ini: nomornya tampil di halaman tamu ruangan ini. Menghapus di sini tidak mencabut hak login Usher.' : 'Nama + nomor WA. Usher di daftar ini bisa login, dan nomornya tampil di halaman tamu sebagai tombol WhatsApp.'}</p>
        {bantuan.map(([id, u]) => (
          <div className="row" key={id}>
            <span>{u.nama} · {u.hp}</span>
            <button className="link danger" onClick={() => update(ref(db, 'interpreter'), rid ? { [PX + 'config/bantuan/' + id]: null } : { ['config/bantuan/' + id]: null, ['usherDaftar/' + waNum(u.hp)]: null }).catch(() => alert('Gagal menghapus.'))}>Hapus</button>
          </div>
        ))}
        <input placeholder="Nama usher" value={nama} onChange={(e) => setNama(e.target.value)} />
        <input placeholder="Nomor WhatsApp" type="tel" value={hp} onChange={(e) => setHp(e.target.value)} />
        <button className="btn" onClick={tambah}>+ Tambah</button>
      </div>
      )}

      <div className="card">
        <h3>Acara & pengingat</h3>
        <label>Nama acara<input value={acara} onChange={(e) => setAcara(e.target.value)} /></label>
        <label>Batas pengembalian (jam)<input type="time" value={batas} onChange={(e) => setBatas(e.target.value)} /></label>
        <label>Teks pengingat WA
          <textarea rows={4} value={pesan} onChange={(e) => setPesan(e.target.value)} />
        </label>
        <p className="muted">Kode: {'{salam}'} {'{nama}'} {'{no}'} {'{acara}'}</p>
        <button className="btn primary" onClick={simpan}>Simpan</button>
      </div>

      <div className="card" style={{ borderColor: '#7F1D1D' }}>
        <h3>🗑️ Reset data peminjaman</h3>
        <p className="muted">Menghapus semua data peminjaman, status, dan penilaian ({total} data) untuk acara baru. Daftar Usher, nomor teknisi, dan pengaturan acara tetap ada. Tidak bisa dibatalkan.</p>
        {!resetBuka ? (
          <button className="btn" style={{ borderColor: '#B91C1C', color: '#FCA5A5' }} onClick={() => { setResetBuka(true); setKetik(''); }}>Reset data…</button>
        ) : (
          <>
            <div className="err">Konfirmasi: {total} data akan dihapus permanen. Unduh laporan PDF/CSV dulu bila masih dibutuhkan.</div>
            <div className="actions">
              <button className="btn" onClick={onPdf}>⬇ Unduh PDF dulu</button>
              <button className="btn" onClick={onCsv}>⬇ Unduh CSV</button>
            </div>
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

function Dashboard({ user, rid, isSuper, myKey }) {
  const B = basePath(rid);
  const [rooms, setRooms] = useState([]);
  const [denied, setDenied] = useState(false);
  const [loans, setLoans] = useState([]);
  const [nilai, setNilai] = useState({});
  const [cfg, setCfg] = useState({});
  const [tab, setTab] = useState('aktif');
  const [q, setQ] = useState('');
  const [queue, setQueue] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [namaSaya, setNamaSaya] = useState('');

  // nama petugas yang sedang login (dari daftar Usher; akun email memakai emailnya)
  useEffect(() => {
    let batal = false;
    if (!myKey) { setNamaSaya(user.email || ''); return; }
    get(ref(db, 'interpreter/usherDaftar/' + myKey))
      .then((s) => { if (!batal) setNamaSaya(s.exists() ? String(s.val()) : ''); })
      .catch(() => {});
    return () => { batal = true; };
  }, [myKey, user]);
  const penerima = () => ({ kembaliOleh: namaSaya || 'Usher', kembaliOlehHp: myKey || null });

  useEffect(() => {
    const a = onValue(ref(db, B + '/pinjam'), (s) =>
      setLoans(Object.entries(s.val() || {}).map(([id, v]) => ({ id, ...v }))), () => setDenied(true));
    const b = onValue(ref(db, B + '/config'), (s) => setCfg(s.val() || {}), () => {});
    const c = onValue(ref(db, B + '/nilai'), (s) => setNilai(s.val() || {}), () => {});
    const d = onValue(ref(db, 'interpreter/ruangan'), (s) =>
      setRooms(Object.entries(s.val() || {}).map(([id, v]) => ({ id, ...v })).sort((x, y) => (x.tanggal + x.mulai).localeCompare(y.tanggal + y.mulai))), () => {});
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => { a(); b(); c(); d(); clearInterval(t); };
  }, [B]);

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
      await update(ref(db, B), {
        [`pinjam/${l.id}/status`]: 'kembali',
        [`pinjam/${l.id}/kembaliWaktu`]: serverTimestamp(),
        [`pinjam/${l.id}/kembaliOleh`]: penerima().kembaliOleh,
        [`pinjam/${l.id}/kembaliOlehHp`]: penerima().kembaliOlehHp,
        [`aktif/${kAlat(l)}`]: null,
      });
      setQ('');
    } catch { alert('Gagal menyimpan. Cek internet lalu coba lagi.'); }
  };

  const batalKembali = async (l) => {
    const s = await get(ref(db, `${B}/aktif/${kAlat(l)}`));
    if (s.exists()) return alert(`Nomor ${l.receiver} sekarang sedang dipinjam orang lain.`);
    try {
      await update(ref(db, B), {
        [`pinjam/${l.id}/status`]: 'dipinjam',
        [`pinjam/${l.id}/kembaliWaktu`]: null,
        [`pinjam/${l.id}/kembaliOleh`]: null,
        [`pinjam/${l.id}/kembaliOlehHp`]: null,
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

  const pesan = (l) => pilihPesan(cfg.pesan)
    .replaceAll('{salam}', salamWaktu()).replaceAll('{nama}', l.nama).replaceAll('{no}', daftarNo(l)).replaceAll('{acara}', cfg.acara || 'acara ini');

  // satu pengingat untuk semua alat orang yang sama (tidak kirim berkali-kali)
  const ingatkan = (l) => {
    const sau = saudara(l);
    window.open(contactLink(l.hp, pesan(l), 'Pengingat pengembalian receiver interpreter'), '_blank');
    const upd = {};
    sau.forEach((x) => {
      upd[`pinjam/${x.id}/reminderTerakhir`] = serverTimestamp();
      upd[`pinjam/${x.id}/reminderJumlah`] = (x.reminderJumlah || 0) + 1;
    });
    update(ref(db, B), upd).catch(() => {});
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
      await update(ref(db, B), {
        [`pinjam/${l.id}/receiver`]: baru,
        [`pinjam/${l.id}/kunci`]: rcvKey(baru),
        [`pinjam/${l.id}/catatanGanti`]: ((l.catatanGanti ? l.catatanGanti + '; ' : '') + `${l.receiver}→${baru}${alasan ? ' [' + alasan + ']' : ''} (${fmtJam(Date.now())})`).slice(-200),
        [`aktif/${kAlat(l)}`]: null,
        [`aktif/${l.receiver}`]: null,
        [`aktif/${rcvKey(baru)}`]: l.id,
      });
      return true;
    } catch (e) {
      const izin = String(e?.code || e?.message || '').toLowerCase().includes('permission');
      alert(izin
        ? 'DITOLAK oleh Firebase (permission denied).\nRules terbaru belum aktif. Buka Firebase Console > Realtime Database > Rules, tempel isi database.rules.json terbaru, klik Publish, lalu coba lagi.'
        : `Gagal menukar alat (kode: ${e?.code || e?.message || '?'}). Cek internet lalu coba lagi.`);
      return false;
    }
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
        upd[`pinjam/${x.id}/kembaliOleh`] = penerima().kembaliOleh;
        upd[`pinjam/${x.id}/kembaliOlehHp`] = penerima().kembaliOlehHp;
        upd[`aktif/${kAlat(x)}`] = null;
      });
      await update(ref(db, B), upd);
      setQ('');
    } catch { alert('Gagal menyimpan. Cek internet lalu coba lagi.'); }
  };

  const antrean = queue.map((id) => aktif.find((l) => l.id === id)).filter(Boolean);
  const cur = antrean[0];

  const csv = () => {
    const rows = [['Receiver', 'Nama', 'WhatsApp/Email', 'Institusi', 'Status', 'Waktu pinjam', 'Waktu kembali', 'Diterima oleh', 'Nilai pelayanan', 'Nilai alat', 'Komentar']]
      .concat([...loans].sort(natural).map((l) => [l.receiver, l.nama, l.hp, l.institusi, l.status, fmtTgl(l.waktu), fmtTgl(l.kembaliWaktu), l.kembaliOleh ?? '', nilai[l.id]?.pelayanan ?? '', nilai[l.id]?.alat ?? '', nilai[l.id]?.komentar ?? '']));
    const text = rows.map((r) => r.map((c) => `"${String(c ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv' }));
    a.download = 'interpreter-peminjaman.csv';
    a.click();
  };

  // laporan PDF (rekap peminjaman + penilaian) untuk diunduh
  const pdf = async () => {
    try {
      const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const autoTable = at.default;
      const b = (v) => String(v ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const urut = [...loans].sort(natural);
      const nv = Object.values(nilai);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text('TST Indonesia - Laporan Peminjaman Receiver Interpreter', 40, 40);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      if (cfg.acara) doc.text(b(cfg.acara), 40, 58);
      doc.text(`Dicetak: ${fmtTgl(Date.now())}`, 40, 72);
      doc.text(
        `Total ${loans.length} alat  |  Masih dipinjam ${aktif.length}  |  Sudah kembali ${loans.length - aktif.length}  |  ` +
        `Rata-rata penilaian: pelayanan ${rata(nv.map((x) => x.pelayanan))}/5, alat ${rata(nv.map((x) => x.alat))}/5 (${nv.length} penilaian)`,
        40, 88);

      const footer = () => {
        doc.setFontSize(8);
        doc.text(`Halaman ${doc.internal.getNumberOfPages()}`, W - 90, H - 18);
        doc.text('TST Indonesia', 40, H - 18);
      };
      autoTable(doc, {
        startY: 102,
        head: [['No. Alat', 'Nama', 'WhatsApp / Email', 'Institusi', 'Status', 'Pinjam', 'Kembali', 'Diterima oleh', 'Pelayanan', 'Alat']],
        body: urut.map((l) => [
          b(l.receiver), b(l.nama), b(l.hp), b(l.institusi),
          l.status === 'kembali' ? 'Kembali' : 'Dipinjam',
          fmtTgl(l.waktu), l.kembaliWaktu ? fmtTgl(l.kembaliWaktu) : '-', b(l.kembaliOleh) || '-',
          nilai[l.id]?.pelayanan ?? '-', nilai[l.id]?.alat ?? '-',
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235] },
        didDrawPage: footer,
      });

      const kom = urut.filter((l) => nilai[l.id]?.komentar);
      if (kom.length) {
        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 24,
          head: [['No. Alat', 'Nama', 'Saran / komentar']],
          body: kom.map((l) => [b(l.receiver), b(l.nama), b(nilai[l.id].komentar)]),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [217, 119, 6] },
          didDrawPage: footer,
        });
      }
      doc.save(`laporan-interpreter-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      if (/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(e?.message || '')) {
        // halaman lama (cache) setelah ada update: muat ulang otomatis
        if (confirm('Halaman ini versi lama karena baru ada pembaruan. Muat ulang sekarang? Setelah itu klik Unduh PDF lagi.')) location.reload();
        return;
      }
      alert('Gagal membuat PDF (' + (e?.message || '?') + '). Pastikan internet aktif lalu coba lagi.');
    }
  };

  const resetSemua = async () => {
    try {
      await update(ref(db, B), {
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

  const boleh = rooms.filter((r) => isSuper || (myKey && r.petugas && r.petugas[myKey]));
  if (denied) {
    return (
      <div className="wrap"><div className="card center"><div className="big">🔒</div>
        <p>Anda belum ditugaskan di ruangan ini. Hubungi Super Admin.</p>
        <a className="btn" href="#/usher">← Acara utama</a></div></div>
    );
  }

  return (
    <div className="wrap wide">
      <div className="head">
        <div>
          <h1>Usher · Interpreter</h1>
          <div className="muted">{cfg.acara || (rid ? rid : 'Usher')}</div>
          {namaSaya && <div className="who">👤 Login sebagai <b>{namaSaya}</b></div>}
        </div>
        <button className="link" onClick={keluar}>Keluar</button>
      </div>

      {(boleh.length > 0 || isSuper) && (
        <div className="roombar">
          <select value={rid} onChange={(e) => { location.hash = e.target.value ? '#/usher/' + e.target.value : '#/usher'; }}>
            <option value="">Acara utama (default)</option>
            {boleh.map((r) => <option key={r.id} value={r.id}>{r.nama} · {r.tanggal} {r.mulai}</option>)}
          </select>
          {isSuper && <a className="link" href="#/admin">⚙️ Kelola ruangan</a>}
        </div>
      )}

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
          {isSuper ? <button className="btn" onClick={() => setTab('atur')}>Isi nomor teknisi</button> : <span>Hubungi Super Admin.</span>}
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
        {[['aktif', 'Dipinjam'], ['kembali', 'Sudah kembali'], ['nilai', 'Penilaian'], ...(isSuper ? [['atur', 'Pengaturan']] : [])].map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>

      {tab === 'atur' && isSuper ? <Pengaturan cfg={cfg} total={loans.length} onCsv={csv} onPdf={pdf} onReset={resetSemua} rid={rid} isSuper={isSuper} /> : tab === 'nilai' ? <Penilaian nilai={nilai} loans={loans} /> : (
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
                {l.status === 'kembali' && l.kembaliOleh && <span className="group">✅ Diterima oleh <b>{l.kembaliOleh}</b></span>}
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
          <button className="btn" onClick={pdf}>⬇ Unduh PDF</button>
          <button className="link" onClick={csv}>⬇ Unduh CSV</button>
        </>
      )}
    </div>
  );
}

function Qr({ text }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(text, { width: 480, margin: 2 }).then(setSrc).catch(() => {}); }, [text]);
  return src ? <img className="qr" src={src} alt="QR" /> : null;
}

const ST = { akan: ['Akan datang', ''], berlangsung: ['Berlangsung', ' ok'], selesai: ['Selesai', ''] };
const hariIni = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Panel Super Admin: buat / ubah / hapus ruangan + jadwal
function Admin() {
  const [rooms, setRooms] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [f, setF] = useState({ nama: '', tanggal: hariIni(), mulai: '', selesai: '' });
  const [edit, setEdit] = useState('');     // id ruangan yang sedang diubah ('' = buat baru)
  const [qrId, setQrId] = useState('');
  const [busy, setBusy] = useState(false);
  const [ptId, setPtId] = useState('');          // ruangan yang panel petugasnya terbuka
  const [pt, setPt] = useState({ nama: '', hp: '' });
  const [utama, setUtama] = useState([]);         // daftar Usher acara utama (untuk pilihan cepat)
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  const linkTamu = (id) => base + '#/r/' + id;

  useEffect(() => {
    const a = onValue(ref(db, 'interpreter/ruangan'), (sn) =>
      setRooms(Object.entries(sn.val() || {}).map(([id, v]) => ({ id, ...v })).sort((x, y) => (x.tanggal + x.mulai).localeCompare(y.tanggal + y.mulai))), () => {});
    const u = onValue(ref(db, 'interpreter/config/bantuan'), (sn) => setUtama(Object.values(sn.val() || {})), () => {});
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => { a(); u(); clearInterval(t); };
  }, []);

  const set_ = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const reset = () => { setEdit(''); setF({ nama: '', tanggal: hariIni(), mulai: '', selesai: '' }); };

  const simpan = async () => {
    const nama = f.nama.trim();
    if (!nama || !f.tanggal || !f.mulai || !f.selesai) return alert('Nama ruangan, tanggal, jam mulai, dan jam selesai wajib diisi.');
    if (f.selesai <= f.mulai) return alert('Jam selesai harus setelah jam mulai.');
    let id = edit;
    if (!id) {
      const dasar = slug(nama) || 'ruangan';
      id = dasar; let n = 2;
      while (rooms.some((r) => r.id === id)) id = (dasar.slice(0, 26) + '-' + n++);
    }
    const data = { nama, tanggal: f.tanggal, mulai: f.mulai, selesai: f.selesai };
    const upd = {
      ['ruangan/' + id + '/nama']: nama,
      ['ruangan/' + id + '/tanggal']: f.tanggal,
      ['ruangan/' + id + '/mulai']: f.mulai,
      ['ruangan/' + id + '/selesai']: f.selesai,
      ['rooms/' + id + '/config/acara']: nama,
      ['rooms/' + id + '/config/batasJam']: f.selesai,
      ['rooms/' + id + '/config/jadwal']: jadwalText(data),
    };
    setBusy(true);
    try {
      if (!edit) {
        // ruangan baru: salin nomor teknisi dan teks pengingat dari acara utama (daftar Usher mulai kosong)
        const c = (await get(ref(db, 'interpreter/config'))).val() || {};
        ['teknisi', 'pesan'].forEach((k) => { if (c[k] != null) upd['rooms/' + id + '/config/' + k] = c[k]; });
      }
      await update(ref(db, 'interpreter'), upd);
      alert(edit ? 'Jadwal ruangan diperbarui.' : 'Ruangan dibuat. Isi daftar channel di dashboard ruangan (tab Pengaturan), lalu cetak QR-nya.');
      reset();
    } catch (e) { alert('Gagal menyimpan (' + (e.code || '?') + '). Pastikan akun ini terdaftar sebagai Super Admin dan Rules terbaru sudah dipasang.'); }
    setBusy(false);
  };

  const tambahPetugas = async (r) => {
    const nama = pt.nama.trim();
    const key = waNum(pt.hp);
    if (!nama || !/^62[0-9]{8,13}$/.test(key)) return alert('Isi nama dan nomor WhatsApp yang valid, mis. 08123456789');
    try {
      // bila nomor sudah terdaftar login, pakai nama yang sudah ada (jangan menimpa nama login)
      const ada = (await get(ref(db, 'interpreter/usherDaftar/' + key))).val();
      const upd = {
        ['ruangan/' + r.id + '/petugas/' + key]: ada || nama,
        ['rooms/' + r.id + '/config/bantuan/' + key]: { nama: ada || nama, hp: pt.hp.trim() },
      };
      if (ada == null) upd['usherDaftar/' + key] = nama;
      await update(ref(db, 'interpreter'), upd);
      setPt({ nama: '', hp: '' });
      if (ada && ada !== nama) alert(`Nomor ini sudah terdaftar atas nama "${ada}". Login memakai nama itu.`);
    } catch { alert('Gagal menambah petugas.'); }
  };
  const lepasPetugas = (r, key) => {
    if (!confirm('Lepas petugas ini dari ruangan? Hak login-nya tidak dicabut.')) return;
    update(ref(db, 'interpreter'), { ['ruangan/' + r.id + '/petugas/' + key]: null, ['rooms/' + r.id + '/config/bantuan/' + key]: null })
      .catch(() => alert('Gagal melepas petugas.'));
  };

  const hapus = async (r) => {
    const ketik = prompt(`HAPUS ruangan "${r.nama}" beserta seluruh data peminjaman & penilaiannya?\nTidak bisa dibatalkan. Ketik nama ruangan untuk melanjutkan:`);
    if (ketik == null) return;
    if (ketik.trim() !== r.nama) return alert('Nama tidak cocok. Tidak ada yang dihapus.');
    try { await update(ref(db, 'interpreter'), { ['ruangan/' + r.id]: null, ['rooms/' + r.id]: null }); }
    catch { alert('Gagal menghapus.'); }
  };
  const salin = (t) => { (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => alert('Link disalin.')).catch(() => prompt('Salin link ini:', t)); };

  // pilihan cepat: Usher acara utama + semua petugas yang pernah ditugaskan di ruangan mana pun (tanpa dobel)
  const pilihan = (() => {
    const m = new Map();
    utama.forEach((u) => m.set(waNum(u.hp), u));
    rooms.forEach((r) => Object.entries(r.petugas || {}).forEach(([k, nm]) => { if (!m.has(k)) m.set(k, { nama: nm, hp: k }); }));
    return [...m.values()];
  })();

  return (
    <div className="wrap wide">
      <div className="head">
        <div><h1>Super Admin · Ruangan & Jadwal</h1><div className="muted">Satu web, banyak ruangan. Data tiap ruangan terpisah.</div></div>
        <a className="link" href="#/usher">← Dashboard</a>
      </div>

      <div className="card">
        <h3>{edit ? 'Ubah jadwal ruangan' : '＋ Ruangan / acara baru'}</h3>
        <label>Nama ruangan / acara<input value={f.nama} onChange={set_('nama')} maxLength={60} placeholder="mis. Ruang B · Seminar Siang" disabled={!!edit} /></label>
        <label>Tanggal<input type="date" value={f.tanggal} onChange={set_('tanggal')} /></label>
        <div className="row2">
          <label>Mulai<input type="time" value={f.mulai} onChange={set_('mulai')} /></label>
          <label>Selesai (batas pengembalian)<input type="time" value={f.selesai} onChange={set_('selesai')} /></label>
        </div>
        {!edit && <p className="muted">Nomor teknisi dan teks pengingat disalin dari acara utama. Daftar Usher dan daftar channel mulai kosong, isi di Pengaturan dashboard ruangan.</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={simpan}>{edit ? 'Simpan perubahan' : 'Buat ruangan'}</button>
          {edit && <button className="btn" onClick={reset}>Batal</button>}
        </div>
      </div>

      <div className="card">
        <h3>Acara utama (default)</h3>
        <p className="muted">Alamat lama <b>#/</b> dan <b>#/usher</b>. Data tetap seperti semula.</p>
        <a className="btn" href="#/usher">Buka dashboard acara utama</a>
      </div>

      {rooms.length === 0 && <p className="muted center">Belum ada ruangan tambahan.</p>}
      {rooms.map((r) => {
        const [lbl, cls] = ST[statusRuang(r, now)];
        return (
          <div className="card" key={r.id}>
            <div className="row"><b>{r.nama}</b><span className={'badge' + cls}>{lbl}</span></div>
            <span className="muted">{jadwalText(r)}</span>
            <span className="muted fine">Link tamu: {linkTamu(r.id)}</span>
            <div className="actions">
              <a className="btn primary" href={'#/usher/' + r.id}>Dashboard</a>
              <button className="btn" onClick={() => salin(linkTamu(r.id))}>Salin link</button>
              <button className="btn" onClick={() => setPtId(ptId === r.id ? '' : r.id)}>👥 Petugas ({Object.keys(r.petugas || {}).length})</button>
              <button className="btn" onClick={() => setQrId(qrId === r.id ? '' : r.id)}>QR</button>
              <button className="btn" onClick={() => { setEdit(r.id); setF({ nama: r.nama, tanggal: r.tanggal, mulai: r.mulai, selesai: r.selesai }); scrollTo(0, 0); }}>Ubah jadwal</button>
              <button className="link danger" onClick={() => hapus(r)}>Hapus</button>
            </div>
            {ptId === r.id && (
              <div className="petugas">
                <b>Petugas ruangan ini</b>
                <span className="muted fine">Hanya petugas di sini (dan Super Admin) yang bisa membuka dashboard ruangan ini.</span>
                {Object.entries(r.petugas || {}).map(([key, nm]) => (
                  <div className="row" key={key}><span>{nm} · {key}</span><button className="link danger" onClick={() => lepasPetugas(r, key)}>Lepas</button></div>
                ))}
                {!Object.keys(r.petugas || {}).length && <span className="muted">Belum ada petugas.</span>}
                {pilihan.length > 0 && (
                  <select value="" onChange={(e) => { const u = pilihan[e.target.value]; if (u) setPt({ nama: u.nama, hp: u.hp }); }}>
                    <option value="">Pilih dari Usher acara utama…</option>
                    {pilihan.map((u, i) => <option key={i} value={i}>{u.nama} · {u.hp}</option>)}
                  </select>
                )}
                <input placeholder="Nama petugas" value={pt.nama} onChange={(e) => setPt({ ...pt, nama: e.target.value })} />
                <input placeholder="Nomor WhatsApp" type="tel" value={pt.hp} onChange={(e) => setPt({ ...pt, hp: e.target.value })} />
                <button className="btn primary" onClick={() => tambahPetugas(r)}>+ Tugaskan</button>
              </div>
            )}
            {qrId === r.id && <div className="center"><Qr text={linkTamu(r.id)} /><p className="muted">Cetak QR ini untuk tamu {r.nama}.</p></div>}
          </div>
        );
      })}
    </div>
  );
}

export default function Usher({ hash = '#/usher' }) {
  const [user, setUser] = useState(undefined);
  const [ok, setOk] = useState(null);
  const [ver, setVer] = useState(0);
  const [isSuper, setIsSuper] = useState(false);
  const [myKey, setMyKey] = useState('');
  const m = hash.match(/^#\/usher\/([a-z0-9-]{1,30})/);
  const rid = m ? m[1] : '';                 // kosong = acara utama
  const modeAdmin = hash.startsWith('#/admin');

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u || null)), []);
  useEffect(() => {
    if (!user) { setOk(null); return; }
    let batal = false;
    get(ref(db, 'interpreter/usher/' + user.uid))
      .then((s) => { if (!batal) setOk(s.exists()); })
      .catch(() => { if (!batal) setOk(false); });
    return () => { batal = true; };
  }, [user, ver]);

  useEffect(() => {
    if (!user || !ok) { setIsSuper(false); setMyKey(''); return; }
    let batal = false;
    (async () => {
      try {
        let sup = (await get(ref(db, 'interpreter/superadmin/' + user.uid))).exists();
        const key = (await get(ref(db, 'interpreter/usher/' + user.uid))).val();
        if (!sup && typeof key === 'string') sup = (await get(ref(db, 'interpreter/superDaftar/' + key))).exists();
        if (!batal) { setIsSuper(sup); setMyKey(typeof key === 'string' ? key : ''); }
      } catch { if (!batal) { setIsSuper(false); setMyKey(''); } }
    })();
    return () => { batal = true; };
  }, [user, ok]);

  if (user === undefined) return <div className="wrap"><p className="muted center">Memuat…</p></div>;
  if (!user || ok === false) return <Login onOk={() => setVer((v) => v + 1)} />;
  if (ok === null) return <div className="wrap"><p className="muted center">Memeriksa akses…</p></div>;
  if (modeAdmin) {
    return isSuper ? <Admin /> : (
      <div className="wrap"><div className="card center"><div className="big">🔒</div>
        <p>Halaman ini hanya untuk Super Admin.</p><a className="btn" href="#/usher">← Ke dashboard</a></div></div>
    );
  }
  return <Dashboard key={rid || '_'} user={user} rid={rid} isSuper={isSuper} myKey={myKey} />;
}
