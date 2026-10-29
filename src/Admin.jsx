import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ref, get, update } from 'firebase/database';
import QRCode from 'qrcode';
import { db } from './firebase.js';
import { Brand, Modal, Spinner } from './ui.jsx';
import { Icon } from './icons.jsx';
import { pdfLabel, pdfQrMeja, bukaCetak, qrSvgPath, TATA_LETAK } from './labels.js';
import { daftarUnit, eventUrl, jadwalText, newEid, normHp, parseKontak, tampilHp, JAMINAN_DEFAULT } from './util.js';

const hariIni = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const gabung = (lama, baru) => {
  const m = new Map(lama.map((p) => [p.hp, { ...p }]));
  baru.forEach((p) => {
    if (!m.has(p.hp)) m.set(p.hp, { ...p });
    else if (!m.get(p.hp).nama && p.nama) m.get(p.hp).nama = p.nama;
  });
  return [...m.values()];
};
const namaPetugas = (p) => (p.nama && p.nama.trim()) || 'Petugas ' + p.hp.slice(-4);

// ================= Editor daftar petugas (tempel dari kontak HP) =================
function EditorPetugas({ list, setList }) {
  const [teks, setTeks] = useState('');
  const [hasil, setHasil] = useState('');
  const bisaKontak = typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
  const tambahTeks = () => {
    const baru = parseKontak(teks);
    if (!baru.length) { setHasil('Tidak ada nomor HP yang dikenali. Salin dari aplikasi Kontak: nama dan nomor.'); return; }
    const sebelum = list.length;
    const g = gabung(list, baru);
    setList(g);
    setHasil(`${baru.length} nomor dikenali, ${g.length - sebelum} ditambahkan.`);
    setTeks('');
  };
  const pilihKontak = async () => {
    try {
      const pilih = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      const baru = [];
      pilih.forEach((c) => (c.tel || []).forEach((t) => { const hp = normHp(t); if (hp) baru.push({ hp, nama: (c.name && c.name[0]) || '' }); }));
      setList(gabung(list, baru));
      setHasil(`${baru.length} nomor dipilih dari kontak.`);
    } catch { /* dibatalkan */ }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>Daftar Usher</b>
      <span className="muted fine">Salin kontak dari HP (nama dan nomor, bisa banyak sekaligus), lalu tempel di sini. Nomor ini dipakai Usher untuk masuk.</span>
      {bisaKontak ? <button className="btn" type="button" onClick={pilihKontak}><Icon name="user" size={20} /> Pilih dari kontak HP</button> : null}
      <textarea className="paste" value={teks} placeholder={'Budi Santoso 0812-3456-7890\nSiti Aminah\n+62 813 1111 2222'} onChange={(e) => setTeks(e.target.value)} />
      <button className="btn" type="button" disabled={!teks.trim()} onClick={tambahTeks}>Tambahkan ke daftar</button>
      {hasil ? <div className="muted">{hasil}</div> : null}
      <div className="muted">{list.length} petugas</div>
      <div className="plist">
        {list.map((p) => (
          <div key={p.hp} className="prow">
            <span className="hp">{tampilHp(p.hp)}</span>
            <input value={p.nama} maxLength={80} placeholder="Nama" onChange={(e) => setList(list.map((x) => (x.hp === p.hp ? { ...x, nama: e.target.value } : x)))} />
            <button type="button" aria-label="hapus" onClick={() => setList(list.filter((x) => x.hp !== p.hp))}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= Buat acara =================
function FormAcara({ acara, onClose, onSelesai }) {
  const [f, setF] = useState({ nama: '', tanggal: hariIni(), tanggalSelesai: hariIni(), mulai: '09:00', selesai: '17:00', dipesan: '', teknisiNama: '', teknisiWa: '' });
  const [petugas, setPetugas] = useState([]);
  const [cfgSalin, setCfgSalin] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function salinDari(eid) {
    if (!eid) { setCfgSalin(null); return; }
    const [c, p] = await Promise.all([get(ref(db, `sis/acara/${eid}/config`)), get(ref(db, `sis/acara/${eid}/petugas`))]);
    const cfg = c.val() || {};
    setCfgSalin(cfg);
    setF((x) => ({ ...x, teknisiNama: cfg.teknisiNama || '', teknisiWa: cfg.teknisiWa ? tampilHp(cfg.teknisiWa) : '' }));
    setPetugas(Object.entries(p.val() || {}).map(([hp, nama]) => ({ hp, nama })));
  }

  async function simpan() {
    setErr('');
    if (!f.nama.trim()) return setErr('Nama acara wajib diisi.');
    if (!f.tanggal || !f.tanggalSelesai) return setErr('Tanggal mulai dan tanggal selesai wajib diisi.');
    if (f.tanggalSelesai < f.tanggal) return setErr('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if (!f.mulai || !f.selesai) return setErr('Jam mulai dan selesai wajib diisi.');
    if (!petugas.length) return setErr('Tambahkan minimal satu Usher.');
    setBusy(true);
    const eid = newEid();
    const cfg = cfgSalin ? { ...cfgSalin } : { jaminan: { aktif: true, jenis: Object.fromEntries(JAMINAN_DEFAULT.map((k) => [k, true])) } };
    if (f.teknisiNama.trim()) cfg.teknisiNama = f.teknisiNama.trim(); else delete cfg.teknisiNama;
    const w = normHp(f.teknisiWa);
    if (w) cfg.teknisiWa = w; else delete cfg.teknisiWa;
    const meta = { nama: f.nama.trim().slice(0, 80), tanggal: f.tanggal, mulai: f.mulai, selesai: f.selesai, dibuat: Date.now() };
    if (f.tanggalSelesai > f.tanggal) meta.tanggalSelesai = f.tanggalSelesai;
    if (Number(f.dipesan) > 0) meta.dipesan = Math.min(100000, Math.floor(Number(f.dipesan)));
    const upd = {};
    upd[`indeks/${eid}`] = true;
    upd[`acara/${eid}/meta`] = meta;
    upd[`acara/${eid}/status`] = 'aktif';
    upd[`acara/${eid}/config`] = cfg;
    petugas.forEach((p) => {
      upd[`acara/${eid}/petugas/${p.hp}`] = namaPetugas(p).slice(0, 80);
      upd[`nomor/${p.hp}`] = true;
      upd[`tugas/${p.hp}/${eid}`] = true;
    });
    try { await update(ref(db, 'sis'), upd); onSelesai(eid); } catch (e) { setErr('Gagal menyimpan: ' + (e.message || e)); setBusy(false); }
  }

  return (
    <Modal wide>
      <h2>Buat acara</h2>
      {acara.length ? (
        <label>Salin pengaturan dan Usher dari acara sebelumnya (opsional)
          <select defaultValue="" onChange={(e) => salinDari(e.target.value)}>
            <option value="">— mulai kosong —</option>
            {acara.map((a) => <option key={a.id} value={a.id}>{a.meta.nama} ({a.meta.tanggal})</option>)}
          </select>
        </label>
      ) : null}
      <label>Nama acara<input value={f.nama} maxLength={80} onChange={(e) => setF({ ...f, nama: e.target.value })} /></label>
      <div className="rowbtn">
        <label>Tanggal mulai<input type="date" value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value, tanggalSelesai: f.tanggalSelesai < e.target.value ? e.target.value : f.tanggalSelesai })} /></label>
        <label>Tanggal selesai<input type="date" min={f.tanggal} value={f.tanggalSelesai} onChange={(e) => setF({ ...f, tanggalSelesai: e.target.value })} /></label>
      </div>
      <div className="rowbtn">
        <label>Jam mulai (tiap hari)<input type="time" value={f.mulai} onChange={(e) => setF({ ...f, mulai: e.target.value })} /></label>
        <label>Jam selesai (tiap hari)<input type="time" value={f.selesai} onChange={(e) => setF({ ...f, selesai: e.target.value })} /></label>
      </div>
      <label>Jumlah receiver yang dipesan (opsional)<input type="number" inputMode="numeric" min="0" value={f.dipesan} onChange={(e) => setF({ ...f, dipesan: e.target.value })} /></label>
      <div className="rowbtn">
        <label>Nama teknisi (opsional)<input value={f.teknisiNama} maxLength={60} onChange={(e) => setF({ ...f, teknisiNama: e.target.value })} /></label>
        <label>WhatsApp teknisi (opsional)<input value={f.teknisiWa} inputMode="tel" onChange={(e) => setF({ ...f, teknisiWa: e.target.value })} /></label>
      </div>
      <EditorPetugas list={petugas} setList={setPetugas} />
      {err ? <div className="err">{err}</div> : null}
      <button className="btn primary" disabled={busy} onClick={simpan}>{busy ? 'Menyimpan…' : 'Buat acara'}</button>
      <button className="btn" onClick={onClose}>Batal</button>
    </Modal>
  );
}

// ================= Ubah jadwal acara (kode & QR meja tidak berubah) =================
function UbahJadwal({ a, onClose, onSelesai }) {
  const [f, setF] = useState({ tanggal: a.meta.tanggal || hariIni(), tanggalSelesai: a.meta.tanggalSelesai || a.meta.tanggal || hariIni(), mulai: a.meta.mulai || '09:00', selesai: a.meta.selesai || '17:00' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function simpan() {
    setErr('');
    if (!f.tanggal || !f.tanggalSelesai || !f.mulai || !f.selesai) return setErr('Semua tanggal dan jam wajib diisi.');
    if (f.tanggalSelesai < f.tanggal) return setErr('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    setBusy(true);
    try {
      await update(ref(db, `sis/acara/${a.id}/meta`), { tanggal: f.tanggal, tanggalSelesai: f.tanggalSelesai > f.tanggal ? f.tanggalSelesai : null, mulai: f.mulai, selesai: f.selesai });
      onSelesai();
    } catch (e) { setErr('Gagal menyimpan: ' + (e.message || e)); setBusy(false); }
  }
  return (
    <Modal>
      <h2>Ubah jadwal acara</h2>
      <div className="muted">{a.meta.nama}</div>
      <div className="rowbtn">
        <label>Tanggal mulai<input type="date" value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value, tanggalSelesai: f.tanggalSelesai < e.target.value ? e.target.value : f.tanggalSelesai })} /></label>
        <label>Tanggal selesai<input type="date" min={f.tanggal} value={f.tanggalSelesai} onChange={(e) => setF({ ...f, tanggalSelesai: e.target.value })} /></label>
      </div>
      <div className="rowbtn">
        <label>Jam mulai (tiap hari)<input type="time" value={f.mulai} onChange={(e) => setF({ ...f, mulai: e.target.value })} /></label>
        <label>Jam selesai (tiap hari)<input type="time" value={f.selesai} onChange={(e) => setF({ ...f, selesai: e.target.value })} /></label>
      </div>
      <p className="muted">Kode acara dan QR meja yang sudah dicetak tidak berubah.</p>
      {err ? <div className="err">{err}</div> : null}
      <button className="btn primary" disabled={busy} onClick={simpan}>{busy ? 'Menyimpan…' : 'Simpan jadwal'}</button>
      <button className="btn" onClick={onClose}>Batal</button>
    </Modal>
  );
}

// ================= Ubah daftar Usher =================
function UbahPetugas({ a, onClose, onSelesai }) {
  const [list, setList] = useState(a.petugas.map((p) => ({ ...p })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function simpan() {
    setBusy(true); setErr('');
    const upd = {};
    const baruHp = new Set(list.map((p) => p.hp));
    a.petugas.forEach((p) => { if (!baruHp.has(p.hp)) { upd[`acara/${a.id}/petugas/${p.hp}`] = null; upd[`tugas/${p.hp}/${a.id}`] = null; } });
    list.forEach((p) => { upd[`acara/${a.id}/petugas/${p.hp}`] = namaPetugas(p).slice(0, 80); upd[`nomor/${p.hp}`] = true; upd[`tugas/${p.hp}/${a.id}`] = true; });
    try { await update(ref(db, 'sis'), upd); onSelesai(); } catch (e) { setErr('Gagal menyimpan: ' + (e.message || e)); setBusy(false); }
  }
  return (
    <Modal wide>
      <h2>Usher: {a.meta.nama}</h2>
      <EditorPetugas list={list} setList={setList} />
      {err ? <div className="err">{err}</div> : null}
      <button className="btn primary" disabled={busy || !list.length} onClick={simpan}>Simpan</button>
      <button className="btn" onClick={onClose}>Batal</button>
    </Modal>
  );
}

function QrAcara({ a, onClose }) {
  const [img, setImg] = useState('');
  const url = eventUrl(a.id);
  useEffect(() => { QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 520 }).then(setImg).catch(() => {}); }, [url]);
  return (
    <Modal onClose={onClose}>
      <h2>QR meja Usher</h2>
      <div className="muted">{a.meta.nama}</div>
      {img ? <img className="qrimg" src={img} alt="QR" /> : <Spinner />}
      <div className="note" style={{ wordBreak: 'break-all' }}>{url}</div>
      <button className="btn primary" onClick={() => bukaCetak(pdfQrMeja({ nama: a.meta.nama, jadwal: jadwalText(a.meta), url }))}>Cetak QR meja (PDF)</button>
      <button className="btn" onClick={() => navigator.clipboard && navigator.clipboard.writeText(url)}>Salin link</button>
      <button className="btn" onClick={onClose}>Tutup</button>
    </Modal>
  );
}

// ================= Beranda Super Admin =================
function Beranda({ sesi }) {
  const [acara, setAcara] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [err, setErr] = useState('');
  const [busyBuka, setBusyBuka] = useState(false);
  const muat = useCallback(async () => {
    try {
      const sn = await get(ref(db, 'sis/indeks'));
      const rows = await Promise.all(Object.keys(sn.val() || {}).map(async (id) => {
        const [m, s, p] = await Promise.all([get(ref(db, `sis/acara/${id}/meta`)), get(ref(db, `sis/acara/${id}/status`)), get(ref(db, `sis/acara/${id}/petugas`))]);
        if (!m.exists()) return { id, meta: { nama: '(data hilang)', tanggal: '' }, status: null, petugas: [], rusak: true };
        return { id, meta: m.val(), status: s.val(), petugas: Object.entries(p.val() || {}).map(([hp, nama]) => ({ hp, nama })) };
      }));
      setAcara(rows.sort((a, b) => (a.status === 'aktif' ? 0 : 1) - (b.status === 'aktif' ? 0 : 1) || String(b.meta.tanggal).localeCompare(String(a.meta.tanggal))));
    } catch (e) { setErr('Gagal memuat: ' + (e.message || e)); setAcara([]); }
  }, []);
  useEffect(() => { muat(); }, [muat]);

  async function hapus(a) {
    const upd = { [`acara/${a.id}`]: null, [`indeks/${a.id}`]: null };
    a.petugas.forEach((p) => { upd[`tugas/${p.hp}/${a.id}`] = null; });
    try {
      const pj = await get(ref(db, `sis/acara/${a.id}/pinjam`));
      Object.values(pj.val() || {}).forEach((l) => { if (l.status === 'dipinjam') upd[`unitAktif/${l.receiver}`] = null; });
      await update(ref(db, 'sis'), upd);
      setDlg(null); muat();
    } catch (e) { setErr('Gagal menghapus: ' + (e.message || e)); }
  }

  // Buka kembali acara yang sudah ditandai selesai. Kode acara TIDAK berubah, jadi QR meja lama tetap berlaku.
  async function bukaKembali(a) {
    setErr(''); setBusyBuka(true);
    try {
      // Langkah 1: status kembali aktif (aturan database mensyaratkan status aktif sebelum kunci alat bisa dipasang).
      await update(ref(db, 'sis'), { [`acara/${a.id}/status`]: 'aktif' });
      // Langkah 2: receiver yang tadi ditandai "tidak kembali" saat acara ditutup dipulihkan menjadi "dipinjam"
      // dan kuncinya dipasang lagi, kecuali alat itu sudah dipinjam acara/orang lain.
      const pj = (await get(ref(db, `sis/acara/${a.id}/pinjam`))).val() || {};
      const upd = {}; let bentrok = 0;
      for (const [id, l] of Object.entries(pj)) {
        if (!l || l.status !== 'tidakKembali') continue;
        const k = (await get(ref(db, 'sis/unitAktif/' + l.receiver))).val();
        if (k && !(k.acara === a.id && k.loan === id)) { bentrok++; continue; }
        upd[`acara/${a.id}/pinjam/${id}/status`] = 'dipinjam';
        upd[`unitAktif/${l.receiver}`] = { acara: a.id, loan: id };
      }
      if (Object.keys(upd).length) await update(ref(db, 'sis'), upd);
      if (bentrok) setErr(`Acara dibuka kembali. ${bentrok} receiver tidak dipulihkan karena sedang dipinjam di acara lain; periksa di tab Stok.`);
      setDlg(null); muat();
    } catch (e) { setErr('Gagal membuka kembali: ' + (e.message || e)); }
    setBusyBuka(false);
  }

  return (
    <div className="wrap wide">
      <Brand sub="Super Admin" />
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted">Nomor: {tampilHp(sesi.hp)}</span>
        <span><a className="link" href="#/usher">Halaman Usher</a> · <button className="link" onClick={sesi.logout}>Keluar</button></span>
      </div>
      <div className="rowbtn" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={() => setDlg({ j: 'baru' })}><Icon name="calendar" size={20} /> Buat acara</button>
        <a className="btn" href="#/admin/cetak"><Icon name="tag" size={20} /> Cetak barcode alat</a>
      </div>
      {err ? <div className="err">{err}</div> : null}
      {acara === null ? <Spinner /> : !acara.length ? (
        <div className="card center"><div className="big"><Icon name="calendar" size={44} /></div><p>Belum ada acara. Buat acara pertama.</p></div>
      ) : acara.map((a) => (
        <div key={a.id} className={'ev' + (a.status === 'aktif' ? '' : ' done')}>
          <div className="row"><span className="t">{a.meta.nama}</span><span className={'pill ' + (a.status === 'aktif' ? 'on' : 'off')}>{a.status === 'aktif' ? 'Aktif' : 'Selesai'}</span></div>
          <div className="s">{jadwalText(a.meta)} · {a.petugas.length} Usher</div>
          <div className="rowbtn">
            <a className="btn primary" href={'#/usher/' + a.id}>Buka</a>
            <button className="btn" onClick={() => setDlg({ j: 'qr', a })}>QR meja</button>
          </div>
          <div className="rowbtn">
            <button className="btn" onClick={() => setDlg({ j: 'jadwal', a })}>Jadwal</button>
            <button className="btn" onClick={() => setDlg({ j: 'usher', a })}>Usher</button>
            <button className="btn" onClick={() => setDlg({ j: 'hapus', a })}>Hapus</button>
          </div>
          {a.status === 'selesai' ? (
            <div className="rowbtn">
              <button className="btn primary" onClick={() => setDlg({ j: 'buka', a })}><Icon name="undo" size={20} /> Buka kembali acara</button>
            </div>
          ) : null}
        </div>
      ))}

      {dlg && dlg.j === 'baru' ? <FormAcara acara={(acara || []).filter((a) => !a.rusak)} onClose={() => setDlg(null)} onSelesai={(eid) => { setDlg(null); muat(); location.hash = '#/usher/' + eid; }} /> : null}
      {dlg && dlg.j === 'jadwal' ? <UbahJadwal a={dlg.a} onClose={() => setDlg(null)} onSelesai={() => { setDlg(null); muat(); }} /> : null}
      {dlg && dlg.j === 'usher' ? <UbahPetugas a={dlg.a} onClose={() => setDlg(null)} onSelesai={() => { setDlg(null); muat(); }} /> : null}
      {dlg && dlg.j === 'qr' ? <QrAcara a={dlg.a} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg.j === 'buka' ? (
        <Modal onClose={() => setDlg(null)}>
          <h2>Buka kembali acara?</h2>
          <p>"{dlg.a.meta.nama}" akan kembali Aktif. QR meja yang sudah dicetak tetap bisa dipakai peserta (kode acara tidak berubah). Receiver yang tadi ditandai "tidak kembali" dikembalikan menjadi "dipinjam".</p>
          <button className="btn primary" disabled={busyBuka} onClick={() => bukaKembali(dlg.a)}>{busyBuka ? 'Memproses…' : 'Ya, buka kembali'}</button>
          <button className="btn" onClick={() => setDlg(null)}>Batal</button>
        </Modal>
      ) : null}
      {dlg && dlg.j === 'hapus' ? (
        <Modal onClose={() => setDlg(null)}>
          <h2>Hapus acara?</h2>
          <p>"{dlg.a.meta.nama}" beserta seluruh data peminjaman, stok, dan penilaian akan dihapus permanen. Unduh laporannya dulu bila perlu.</p>
          <button className="btn primary" style={{ background: '#B91C1C' }} onClick={() => hapus(dlg.a)}>Ya, hapus permanen</button>
          <button className="btn" onClick={() => setDlg(null)}>Batal</button>
        </Modal>
      ) : null}
    </div>
  );
}

// ================= Cetak barcode alat =================
function Cetak() {
  const [huruf, setHuruf] = useState('A');
  const [dari, setDari] = useState('1');
  const [sampai, setSampai] = useState('100');
  const [garis, setGaris] = useState(false);
  const [lanjut, setLanjut] = useState(false);
  const [L, setL] = useState({ ...TATA_LETAK });
  const d = Number(dari), s = Number(sampai);
  const valid = Number.isInteger(d) && Number.isInteger(s) && d >= 1 && s <= 100 && d <= s;
  const kode = useMemo(() => (valid ? daftarUnit(huruf, d, s) : []), [huruf, d, s, valid]);
  const per = L.kol * L.baris;
  const halaman = kode.length ? Math.ceil(kode.length / per) : 0;
  const prev = useMemo(() => kode.slice(0, 12).map((k) => ({ k, ...qrSvgPath(k, 'Q') })), [kode]);
  const set = (k) => (e) => setL({ ...L, [k]: Number(e.target.value) || 0 });
  const buat = () => pdfLabel({ kode, letak: L, garis });
  return (
    <div className="wrap wide">
      <Brand sub="Cetak barcode alat" />
      <a className="link" href="#/admin"><Icon name="back" size={18} /> Super Admin</a>
      <div className="card" style={{ marginTop: 10 }}>
        <h2>Rentang label</h2>
        <div className="rowbtn">
          <label>Huruf<select value={huruf} onChange={(e) => setHuruf(e.target.value)}>{'ABCDEFGHIJ'.split('').map((h) => <option key={h}>{h}</option>)}</select></label>
          <label>Dari nomor<input type="number" min="1" max="100" value={dari} onChange={(e) => setDari(e.target.value)} /></label>
          <label>Sampai<input type="number" min="1" max="100" value={sampai} onChange={(e) => setSampai(e.target.value)} /></label>
        </div>
        {valid ? <div className="jamdone">{kode.length} label · {kode[0]} sampai {kode[kode.length - 1]} · {halaman} lembar A4</div> : <div className="err">Isi rentang 1 sampai 100, dan "dari" tidak boleh lebih besar dari "sampai".</div>}
        <div className="muted fine">QR di label hanya berisi nomor alat (contoh: {kode[0] || 'A001'}), tanpa alamat situs dan tanpa nama acara. Label tidak perlu dicetak ulang walau alamat situs atau acara berubah.</div>
        <label className="chk"><input type="checkbox" checked={garis} onChange={(e) => setGaris(e.target.checked)} />Tampilkan garis potong tipis</label>
        <button className="link" onClick={() => setLanjut(!lanjut)}>{lanjut ? 'Sembunyikan' : 'Atur'} ukuran label dan lembar stiker</button>
        {lanjut ? (
          <div className="rowbtn" style={{ flexWrap: 'wrap' }}>
            {[['w', 'Lebar label (mm)'], ['h', 'Tinggi label (mm)'], ['kol', 'Kolom'], ['baris', 'Baris'], ['mkiri', 'Margin kiri (mm)'], ['matas', 'Margin atas (mm)'], ['gx', 'Jarak horizontal (mm)'], ['gy', 'Jarak vertikal (mm)']].map(([k, t]) => (
              <label key={k} style={{ minWidth: 130 }}>{t}<input type="number" step="0.5" value={L[k]} onChange={set(k)} /></label>
            ))}
          </div>
        ) : null}
        <div className="rowbtn">
          <button className="btn primary" disabled={!valid} onClick={() => bukaCetak(buat())}><Icon name="printer" size={20} /> Cetak</button>
          <button className="btn" disabled={!valid} onClick={() => buat().save(`label-${huruf}${String(d).padStart(3, '0')}-${huruf}${String(s).padStart(3, '0')}.pdf`)}>Simpan PDF</button>
        </div>
      </div>
      {prev.length ? (
        <div className="card">
          <h3>Pratinjau (12 pertama)</h3>
          <div className="sheet-prev">
            {prev.map((p) => (
              <svg key={p.k} viewBox="0 0 30 35">
                <rect x="0" y="0" width="30" height="35" fill="#fff" />
                <g transform={`translate(2.5,2.5) scale(${25 / p.n})`}><path d={p.d} fill="#000" shapeRendering="crispEdges" /></g>
                <text x="15" y="33" textAnchor="middle" fontSize="5.4" fontWeight="700" fontFamily="Courier New, monospace">{p.k}</text>
              </svg>
            ))}
          </div>
          <p className="muted fine">Tips: cetak 1 lembar percobaan dulu, tempel di beberapa alat, lalu uji scan dengan beberapa HP sebelum mencetak semuanya. Pakai stiker polyester/vinyl matte dengan printer laser atau thermal transfer.</p>
        </div>
      ) : null}
    </div>
  );
}

export default function Admin({ sesi, sub }) {
  return sub === 'cetak' ? <Cetak /> : <Beranda sesi={sesi} />;
}
