import React, { useEffect, useMemo, useState } from 'react';
import { ref, onValue, get, set, update, push, serverTimestamp } from 'firebase/database';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from './firebase.js';
import { Brand, Modal, Scanner, Spinner } from './ui.jsx';
import { pinjamUnit } from './pinjam.js';
import { pdfQrMeja, bukaCetak } from './labels.js';
import {
  ALASAN, JAMINAN, JAMINAN_DEFAULT, DEFAULT_PESAN, contactLink, eventUrl, fmtJam, fmtTgl, isiPesan, jadwalText, jaminanAktif,
  jaminanInfo, normHp, salamWaktu, tampilHp, unitFromScan, unitNorm, validContact, waLink,
} from './util.js';

const STATUS_TEKS = { dipinjam: 'Dipinjam', kembali: 'Kembali', tidakKembali: 'Tidak kembali' };

// ================= Daftar acara milik petugas =================
export function DaftarAcara({ sesi }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const sn = await get(ref(db, sesi.isSuper ? 'sis/indeks' : 'sis/tugas/' + sesi.hp));
        const ids = Object.keys(sn.val() || {});
        const rows = await Promise.all(ids.map(async (id) => {
          const [m, s] = await Promise.all([get(ref(db, `sis/acara/${id}/meta`)), get(ref(db, `sis/acara/${id}/status`))]);
          return m.exists() ? { id, meta: m.val(), status: s.val() } : null;
        }));
        setList(rows.filter(Boolean).sort((a, b) => (a.status === 'aktif' ? 0 : 1) - (b.status === 'aktif' ? 0 : 1) || String(b.meta.tanggal).localeCompare(String(a.meta.tanggal))));
      } catch (e) { setErr('Gagal memuat acara: ' + (e.message || e)); setList([]); }
    })();
  }, [sesi.hp, sesi.isSuper]);
  return (
    <div className="wrap">
      <Brand sub="Usher" />
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted">Nomor: {tampilHp(sesi.hp)}{sesi.isSuper ? ' · Super Admin' : ''}</span>
        <button className="link" onClick={sesi.logout}>Keluar</button>
      </div>
      {sesi.isSuper ? <a className="btn primary" style={{ width: '100%', marginBottom: 12 }} href="#/admin">⚙️ Super Admin</a> : null}
      {err ? <div className="err">{err}</div> : null}
      {list === null ? <Spinner /> : list.length === 0 ? (
        <div className="card center"><div className="big">📭</div><p>Belum ada acara yang ditugaskan kepada Anda.</p></div>
      ) : list.map((e) => (
        <a key={e.id} href={'#/usher/' + e.id} className={'ev' + (e.status === 'aktif' ? '' : ' done')} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="row"><span className="t">{e.meta.nama}</span><span className={'pill ' + (e.status === 'aktif' ? 'on' : 'off')}>{e.status === 'aktif' ? 'Aktif' : 'Selesai'}</span></div>
          <div className="s">{jadwalText(e.meta)}</div>
        </a>
      ))}
    </div>
  );
}

// ================= Dialog: isi nama (wajib, sekali per acara) =================
function DialogNama({ saran, onSimpan }) {
  const [n, setN] = useState(saran || '');
  const [busy, setBusy] = useState(false);
  const ok = n.trim().length >= 2;
  return (
    <Modal>
      <h2>Siapa nama Anda?</h2>
      <p className="muted">Nama ini dicatat di riwayat stok dan pengembalian. Cukup diisi sekali; tidak ditanya lagi sampai acara ini selesai.</p>
      <label>Nama petugas<input value={n} maxLength={80} autoFocus onChange={(e) => setN(e.target.value)} /></label>
      <button className="btn primary" disabled={!ok || busy} onClick={async () => { setBusy(true); await onSimpan(n.trim()); setBusy(false); }}>Simpan dan lanjut</button>
    </Modal>
  );
}

// ================= Dialog: pengembalian =================
function DialogKembali({ grup, fokus, onClose, onKembali, onTukar }) {
  const buka = grup.items.filter((l) => l.status === 'dipinjam');
  const [sel, setSel] = useState(() => new Set(fokus ? [fokus] : buka.map((l) => l.id)));
  const [tukar, setTukar] = useState(null);
  const [baru, setBaru] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const jam = jaminanInfo(grup.jaminan);
  const pilih = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const dipilih = buka.filter((l) => sel.has(l.id));
  async function simpan() {
    setBusy(true); setErr('');
    try { await onKembali(dipilih); onClose(); } catch (e) { setErr('Gagal menyimpan: ' + (e.message || e)); }
    setBusy(false);
  }
  async function doTukar(l) {
    setErr('');
    const u = unitNorm(baru);
    if (!u) return setErr('Nomor pengganti tidak valid (contoh A001).');
    try { await onTukar(l, u); setTukar(null); setBaru(''); } catch (e) { setErr(e.message || 'Gagal menukar.'); }
  }
  if (!buka.length) return <Modal onClose={onClose}><p>Semua receiver {grup.nama} sudah kembali.</p><button className="btn" onClick={onClose}>Tutup</button></Modal>;
  return (
    <Modal onClose={onClose}>
      <h2>Pengembalian</h2>
      <div>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{grup.nama}</div>
        <div className="muted">{grup.institusi} · {grup.hp}</div>
      </div>
      {jam ? <div className="jam"><span className="jic">{jam.ic}</span><span>Kembalikan jaminan: {jam.id}</span></div> : null}
      <div className="muted">Pilih receiver yang dikembalikan:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {buka.map((l) => (
          <div key={l.id} className="devrow row">
            <label className="chk" style={{ flexDirection: 'row' }}>
              <input type="checkbox" checked={sel.has(l.id)} onChange={() => pilih(l.id)} />
              <span className="chip">{l.receiver}</span>
              <span className="muted">{fmtJam(l.waktu)}</span>
            </label>
            <button className="link" onClick={() => { setTukar(tukar === l.id ? null : l.id); setErr(''); }}>Tukar</button>
            {tukar === l.id ? (
              <div className="chedit" style={{ width: '100%' }}>
                <input value={baru} placeholder="Nomor pengganti" maxLength={6} style={{ textTransform: 'uppercase' }} onChange={(e) => setBaru(e.target.value.toUpperCase())} />
                <button className="btn" onClick={() => doTukar(l)}>Tukar</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {buka.length > 1 ? <button className="link" onClick={() => setSel(new Set(buka.map((l) => l.id)))}>Pilih semua ({buka.length})</button> : null}
      {err ? <div className="err">{err}</div> : null}
      <button className="btn primary" disabled={!dipilih.length || busy} onClick={simpan}>
        {dipilih.length === buka.length && buka.length > 1 ? `Kembalikan semua (${buka.length})` : `Kembalikan terpilih (${dipilih.length})`}
      </button>
      <button className="btn" onClick={onClose}>Batal</button>
    </Modal>
  );
}

// ================= Dialog: catat peminjaman manual oleh Usher =================
function DialogManual({ eid, uid, cfg, awal, onClose }) {
  const jams = jaminanAktif(cfg);
  const [f, setF] = useState({ nama: '', hp: '', institusi: '', jaminan: '' });
  const [units, setUnits] = useState(awal ? [awal] : []);
  const [ketik, setKetik] = useState('');
  const [scan, setScan] = useState(false);
  const [err, setErr] = useState([]);
  const [busy, setBusy] = useState(false);
  const tambah = (u) => setUnits((c) => (c.includes(u) ? c : [...c, u]));
  async function simpan() {
    const e = [];
    if (!f.nama.trim()) e.push('Nama wajib diisi.');
    if (!validContact(f.hp.trim())) e.push('Kontak harus nomor WhatsApp atau email yang valid.');
    if (!f.institusi.trim()) e.push('Institusi wajib diisi.');
    if (jams.length && !f.jaminan) e.push('Pilih jaminan.');
    if (!units.length) e.push('Tambahkan nomor receiver.');
    if (e.length) return setErr(e);
    setBusy(true);
    const gagal = [];
    for (const u of units) {
      try { await pinjamUnit({ eid, uid, nama: f.nama.trim(), hp: f.hp.trim(), institusi: f.institusi.trim(), jaminan: jams.length ? f.jaminan : '', unit: u }); }
      catch (x) { gagal.push(x.message === 'TAKEN' ? `${u}: sedang dipinjam.` : `${u}: gagal dicatat.`); }
    }
    setBusy(false);
    if (gagal.length) setErr(gagal); else onClose();
  }
  return (
    <Modal onClose={onClose}>
      <h2>Catat peminjaman manual</h2>
      <label>Nama<input value={f.nama} maxLength={80} onChange={(e) => setF({ ...f, nama: e.target.value })} /></label>
      <label>No. WhatsApp atau email<input value={f.hp} maxLength={100} onChange={(e) => setF({ ...f, hp: e.target.value })} /></label>
      <label>Institusi<input value={f.institusi} maxLength={100} onChange={(e) => setF({ ...f, institusi: e.target.value })} /></label>
      {jams.length ? (
        <div className="jamopts">
          {jams.map((j) => <button key={j.k} type="button" className={'jamopt' + (f.jaminan === j.k ? ' on' : '')} onClick={() => setF({ ...f, jaminan: j.k })}><span className="jic">{j.ic}</span>{j.id}</button>)}
        </div>
      ) : null}
      <div className="muted">Nomor receiver</div>
      {units.length ? <div className="chips">{units.map((u) => <span key={u} className="chip">{u}<button type="button" onClick={() => setUnits((c) => c.filter((x) => x !== u))}>×</button></span>)}</div> : null}
      <div className="chedit">
        <input value={ketik} placeholder="A001" maxLength={6} style={{ textTransform: 'uppercase' }} onChange={(e) => setKetik(e.target.value.toUpperCase())} />
        <button className="btn" onClick={() => { const u = unitNorm(ketik); if (u) { tambah(u); setKetik(''); } }}>Tambah</button>
        <button className="btn" onClick={() => setScan(!scan)}>📷</button>
      </div>
      {scan ? <Scanner onCode={(t) => { const u = unitFromScan(t); if (u) tambah(u); }} hint="Scan receiver satu per satu" /> : null}
      {err.map((x, i) => <div key={i} className="err">{x}</div>)}
      <button className="btn primary" disabled={busy} onClick={simpan}>{busy ? 'Menyimpan…' : 'Simpan peminjaman'}</button>
      <button className="btn" onClick={onClose}>Batal</button>
    </Modal>
  );
}

// ================= Dialog: terima dari teknisi =================
function DialogTerima({ susulan, meta, cfg, onClose, onSimpan }) {
  const [jml, setJml] = useState(meta && meta.dipesan ? String(meta.dipesan) : '');
  const [tek, setTek] = useState(cfg.teknisiNama || '');
  const [cat, setCat] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(jml);
  const ok = Number.isInteger(n) && n >= 1 && n <= 9999;
  return (
    <Modal onClose={onClose}>
      <h2>{susulan ? 'Tambah penerimaan susulan' : 'Terima dari teknisi'}</h2>
      <label>Jumlah receiver diterima<input type="number" inputMode="numeric" min="1" value={jml} onChange={(e) => setJml(e.target.value)} /></label>
      <label>Nama teknisi<input value={tek} maxLength={80} onChange={(e) => setTek(e.target.value)} /></label>
      <label>Catatan (opsional)<input value={cat} maxLength={100} onChange={(e) => setCat(e.target.value)} /></label>
      <button className="btn primary" disabled={!ok || !tek.trim() || busy} onClick={async () => { setBusy(true); await onSimpan({ jumlah: n, teknisi: tek.trim(), catatan: cat.trim() }); }}>Terima {ok ? n : ''} receiver</button>
      <button className="btn" onClick={onClose}>Batal</button>
    </Modal>
  );
}

// ================= Dialog: kembalikan ke teknisi =================
function DialogRetur({ diterima, buka, cfg, onClose, onSimpan }) {
  const [jml, setJml] = useState(String(Math.max(0, diterima - buka.length)));
  const [tek, setTek] = useState(cfg.teknisiNama || '');
  const [alasan, setAlasan] = useState(ALASAN[0]);
  const [ket, setKet] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(jml);
  const valid = Number.isInteger(n) && n >= 0 && n <= diterima;
  const kurang = valid ? diterima - n : 0;
  const tanpaPeminjam = Math.max(0, kurang - buka.length);
  const catatan = useMemo(() => {
    const p = [];
    if (kurang > 0) buka.forEach((l) => p.push(`${l.receiver} belum kembali: ${l.nama} (${l.hp})`));
    if (tanpaPeminjam > 0) p.push(`${tanpaPeminjam} unit tanpa peminjam: ${alasan}${ket.trim() ? ' (' + ket.trim() + ')' : ''}`);
    return p.join('; ').slice(0, 600);
  }, [kurang, buka, tanpaPeminjam, alasan, ket]);
  return (
    <Modal onClose={onClose}>
      <h2>Kembalikan ke teknisi</h2>
      <div className="stat4" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div><b>{diterima}</b><span>Diterima</span></div>
        <div><b style={{ color: '#86EFAC' }}>{valid ? n : '-'}</b><span>Dikembalikan</span></div>
        <div><b style={{ color: kurang ? '#FCA5A5' : '#86EFAC' }}>{kurang}</b><span>Kurang</span></div>
      </div>
      <label>Jumlah receiver yang diserahkan kembali<input type="number" inputMode="numeric" min="0" max={diterima} value={jml} onChange={(e) => setJml(e.target.value)} /></label>
      <label>Nama teknisi<input value={tek} maxLength={80} onChange={(e) => setTek(e.target.value)} /></label>
      {!valid ? <div className="err">Jumlah harus antara 0 dan {diterima}.</div> : null}
      {kurang > 0 && buka.length ? (
        <div className="warn"><b>Belum kembali dari peminjam ({buka.length})</b>
          {buka.map((l) => <div key={l.id}>{l.receiver} · {l.nama} · {l.hp}</div>)}
        </div>
      ) : null}
      {kurang < buka.length && valid ? <div className="warn">Masih ada {buka.length} peminjam yang belum mengembalikan, tetapi jumlah yang diserahkan lengkap. Periksa kembali.</div> : null}
      {tanpaPeminjam > 0 ? (
        <>
          <div className="warn">{tanpaPeminjam} unit kurang tanpa peminjam tercatat. Pilih alasannya.</div>
          <select value={alasan} onChange={(e) => setAlasan(e.target.value)}>{ALASAN.map((a) => <option key={a}>{a}</option>)}</select>
          <input value={ket} maxLength={80} placeholder="Keterangan, misalnya nomor unit (opsional)" onChange={(e) => setKet(e.target.value)} />
        </>
      ) : null}
      {catatan ? <div className="note">{catatan}</div> : null}
      <button className="btn primary" disabled={!valid || !tek.trim() || busy} onClick={async () => { setBusy(true); await onSimpan({ jumlah: n, kurang, teknisi: tek.trim(), catatan }); }}>Konfirmasi dan kembalikan</button>
      <button className="btn" onClick={onClose}>Batal</button>
    </Modal>
  );
}

// ================= Export laporan =================
const unduh = (nama, blob) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nama;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
};
const csvSel = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

function eksporCsv(meta, loans) {
  const baris = [['No', 'Nama', 'Kontak', 'Institusi', 'Jaminan', 'Receiver', 'Status', 'Waktu pinjam', 'Waktu kembali', 'Dikembalikan oleh', 'Catatan']];
  loans.forEach((l, i) => baris.push([i + 1, l.nama, l.hp, l.institusi, (jaminanInfo(l.jaminan) || {}).id || '', l.receiver, STATUS_TEKS[l.status] || l.status, fmtTgl(l.waktu), l.kembaliWaktu ? fmtTgl(l.kembaliWaktu) : '', l.kembaliOleh || '', l.catatanGanti || '']));
  const teks = '\ufeff' + baris.map((r) => r.map(csvSel).join(',')).join('\r\n');
  unduh(`laporan-${meta.nama.replace(/[^a-z0-9]+/gi, '-')}.csv`, new Blob([teks], { type: 'text/csv;charset=utf-8' }));
}

function eksporPdf(meta, loans, logs, diterima, nilaiRata) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(15);
  doc.text('Laporan Receiver Interpreter', 14, 14);
  doc.setFontSize(10);
  doc.text(`${meta.nama} | ${jadwalText(meta)}`, 14, 21);
  const buka = loans.filter((l) => l.status === 'dipinjam').length;
  doc.text(`Peminjaman: ${loans.length} | Kembali: ${loans.filter((l) => l.status === 'kembali').length} | Belum kembali: ${loans.filter((l) => l.status !== 'kembali').length} | Sedang dipinjam: ${buka} | Diterima dari teknisi: ${diterima}${nilaiRata ? ' | Rata-rata penilaian: ' + nilaiRata : ''}`, 14, 27);
  autoTable(doc, {
    startY: 32,
    head: [['No', 'Nama', 'Kontak', 'Institusi', 'Jaminan', 'Receiver', 'Status', 'Pinjam', 'Kembali', 'Oleh']],
    body: loans.map((l, i) => [i + 1, l.nama, l.hp, l.institusi, (jaminanInfo(l.jaminan) || {}).id || '-', l.receiver, STATUS_TEKS[l.status] || l.status, fmtTgl(l.waktu), l.kembaliWaktu ? fmtTgl(l.kembaliWaktu) : '-', l.kembaliOleh || '-']),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [18, 41, 77] },
  });
  if (logs.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Waktu', 'Jenis', 'Jumlah', 'Kurang', 'Teknisi', 'Dicatat oleh', 'Catatan']],
      body: logs.map((l) => [fmtTgl(l.waktu), l.jenis, l.jumlah, l.kurang != null ? l.kurang : '-', l.teknisi || '-', l.oleh, l.catatan || '']),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [47, 111, 219] },
    });
  }
  unduh(`laporan-${meta.nama.replace(/[^a-z0-9]+/gi, '-')}.pdf`, doc.output('blob'));
}

// ================= Pengaturan acara (teknisi, jaminan, channel, pesan) =================
function Pengaturan({ eid, meta, cfg, loans, logs, diterima, nilaiRata }) {
  const [tek, setTek] = useState(cfg.teknisiNama || '');
  const [wa, setWa] = useState(cfg.teknisiWa ? tampilHp(cfg.teknisiWa) : '');
  const [pesan, setPesan] = useState(cfg.pesan || '');
  const [jam, setJam] = useState(() => ({ aktif: !!(cfg.jaminan && cfg.jaminan.aktif), jenis: { ...(cfg.jaminan && cfg.jaminan.jenis ? cfg.jaminan.jenis : Object.fromEntries(JAMINAN_DEFAULT.map((k) => [k, true]))) } }));
  const [chs, setChs] = useState(() => Object.values(cfg.channels || {}).map((c) => ({ nama: c.nama, no: c.no })));
  const [msg, setMsg] = useState('');
  const [qr, setQr] = useState('');
  const url = eventUrl(eid);
  useEffect(() => { QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 520 }).then(setQr).catch(() => {}); }, [url]);
  async function simpan() {
    const o = {};
    if (tek.trim()) o.teknisiNama = tek.trim();
    const w = normHp(wa);
    if (w) o.teknisiWa = w;
    if (pesan.trim()) o.pesan = pesan.trim().slice(0, 500);
    const jenis = {};
    JAMINAN.forEach((j) => { if (jam.jenis[j.k]) jenis[j.k] = true; });
    o.jaminan = { aktif: jam.aktif && Object.keys(jenis).length > 0, jenis };
    const c = {};
    chs.filter((x) => x.nama.trim() && x.no.trim()).forEach((x, i) => { c['c' + i] = { nama: x.nama.trim().slice(0, 40), no: x.no.trim().slice(0, 8) }; });
    if (Object.keys(c).length) o.channels = c;
    try { await set(ref(db, `sis/acara/${eid}/config`), o); setMsg('Tersimpan ✓'); } catch (e) { setMsg('Gagal menyimpan: ' + (e.message || e)); }
  }
  return (
    <>
      <div className="card">
        <h3>QR meja Usher</h3>
        <p className="muted">Tamu scan QR ini untuk membuka halaman peminjaman acara ini. HP tamu mengingat acaranya, jadi scan receiver berikutnya langsung masuk ke acara yang benar.</p>
        {qr ? <img className="qrimg" src={qr} alt="QR meja" /> : <Spinner />}
        <div className="note" style={{ wordBreak: 'break-all' }}>{url}</div>
        <div className="rowbtn">
          <button className="btn" onClick={() => navigator.clipboard && navigator.clipboard.writeText(url)}>Salin link</button>
          <button className="btn primary" onClick={() => bukaCetak(pdfQrMeja({ nama: meta.nama, jadwal: jadwalText(meta), url }))}>Cetak QR meja</button>
        </div>
      </div>

      <div className="card">
        <h3>Teknisi dan pesan pengingat</h3>
        <label>Nama teknisi<input value={tek} maxLength={60} onChange={(e) => setTek(e.target.value)} /></label>
        <label>WhatsApp teknisi (tombol bantuan di halaman tamu)<input value={wa} inputMode="tel" placeholder="0812…" onChange={(e) => setWa(e.target.value)} /></label>
        <label>Teks pengingat ke tamu<textarea rows={5} maxLength={500} placeholder={DEFAULT_PESAN} value={pesan} onChange={(e) => setPesan(e.target.value)} /></label>
        <span className="muted fine">Variabel: {'{salam} {nama} {acara} {no}'}. Kosongkan untuk memakai teks bawaan.</span>
      </div>

      <div className="card">
        <h3>Jaminan</h3>
        <div className="jamset">
          <label className="chk"><input type="checkbox" checked={jam.aktif} onChange={(e) => setJam({ ...jam, aktif: e.target.checked })} />Wajibkan jaminan</label>
          {jam.aktif ? JAMINAN.map((j) => (
            <label key={j.k} className="chk"><input type="checkbox" checked={!!jam.jenis[j.k]} onChange={(e) => setJam({ ...jam, jenis: { ...jam.jenis, [j.k]: e.target.checked } })} />{j.ic} {j.id}</label>
          )) : null}
        </div>
      </div>

      <div className="card">
        <h3>Channel bahasa (tampil di panduan tamu)</h3>
        {chs.map((c, i) => (
          <div key={i} className="chedit">
            <input className="chno" value={c.no} maxLength={8} placeholder="1" onChange={(e) => setChs(chs.map((x, j) => (j === i ? { ...x, no: e.target.value } : x)))} />
            <input value={c.nama} maxLength={40} placeholder="Bahasa, mis. English" onChange={(e) => setChs(chs.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
            <button className="link danger" onClick={() => setChs(chs.filter((_, j) => j !== i))}>Hapus</button>
          </div>
        ))}
        <button className="btn" onClick={() => setChs([...chs, { nama: '', no: '' }])}>+ Tambah channel</button>
      </div>

      {msg ? <div className={msg.startsWith('Gagal') ? 'err' : 'jamdone'}>{msg}</div> : null}
      <button className="btn primary" onClick={simpan}>Simpan pengaturan</button>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Laporan</h3>
        <div className="rowbtn">
          <button className="btn" onClick={() => eksporCsv(meta, loans)}>Unduh CSV</button>
          <button className="btn" onClick={() => eksporPdf(meta, loans, logs, diterima, nilaiRata)}>Unduh PDF</button>
        </div>
      </div>
    </>
  );
}

// ================= Dashboard acara =================
export function Dashboard({ eid, sesi }) {
  const { hp, uid } = sesi;
  const b = `sis/acara/${eid}`;
  const [meta, setMeta] = useState(undefined);
  const [cfg, setCfg] = useState({});
  const [status, setStatus] = useState(undefined);
  const [pinjam, setPinjam] = useState({});
  const [stok, setStok] = useState({});
  const [nilai, setNilai] = useState({});
  const [aktif, setAktif] = useState(undefined);
  const [saran, setSaran] = useState('');
  const [ditolak, setDitolak] = useState(false);
  const [tab, setTab] = useState('pinjam');
  const [cari, setCari] = useState('');
  const [dlg, setDlg] = useState(null);
  const [info, setInfo] = useState('');
  const [scan, setScan] = useState(false);
  const [ketik, setKetik] = useState('');
  const [konfSelesai, setKonfSelesai] = useState(false);

  useEffect(() => {
    const e = () => setDitolak(true);
    const o = [
      onValue(ref(db, b + '/meta'), (s) => setMeta(s.val()), e),
      onValue(ref(db, b + '/config'), (s) => setCfg(s.val() || {}), e),
      onValue(ref(db, b + '/status'), (s) => setStatus(s.val()), e),
      onValue(ref(db, b + '/pinjam'), (s) => setPinjam(s.val() || {}), e),
      onValue(ref(db, b + '/stok'), (s) => setStok(s.val() || {}), e),
      onValue(ref(db, b + '/nilai'), (s) => setNilai(s.val() || {}), () => {}),
      onValue(ref(db, b + '/petugasAktif/' + hp), (s) => setAktif(s.val()), e),
      onValue(ref(db, b + '/petugas/' + hp), (s) => setSaran(s.val() || ''), () => {}),
    ];
    return () => o.forEach((f) => f());
  }, [eid, hp]);

  const loans = useMemo(() => Object.entries(pinjam).map(([id, v]) => ({ id, ...v })).sort((a, c) => (c.waktu || 0) - (a.waktu || 0)), [pinjam]);
  const buka = useMemo(() => loans.filter((l) => l.status === 'dipinjam'), [loans]);
  const logs = useMemo(() => Object.entries((stok && stok.log) || {}).map(([id, v]) => ({ id, ...v })).sort((a, c) => (a.waktu || 0) - (c.waktu || 0)), [stok]);
  const diterima = logs.filter((l) => l.jenis === 'terima' || l.jenis === 'susulan').reduce((s, l) => s + (l.jumlah || 0), 0);
  const adaTerima = logs.some((l) => l.jenis === 'terima');
  const adaRetur = logs.some((l) => l.jenis === 'retur');
  const tersedia = Math.max(0, diterima - buka.length);
  const nama = (aktif && aktif.nama) || saran || tampilHp(hp);

  const grup = useMemo(() => {
    const m = new Map();
    loans.forEach((l) => {
      const k = l.grup || l.hp;
      if (!m.has(k)) m.set(k, { key: k, nama: l.nama, hp: l.hp, institusi: l.institusi, jaminan: l.jaminan, items: [] });
      m.get(k).items.push(l);
    });
    return [...m.values()];
  }, [loans]);
  const q = cari.trim().toLowerCase();
  const tampil = grup.filter((g) => !q || [g.nama, g.hp, g.institusi, ...g.items.map((l) => l.receiver)].join(' ').toLowerCase().includes(q));
  const grupBuka = tampil.filter((g) => g.items.some((l) => l.status === 'dipinjam'));
  const grupTutup = tampil.filter((g) => !g.items.some((l) => l.status === 'dipinjam'));

  const rata = useMemo(() => {
    const v = Object.values(nilai || {});
    if (!v.length) return null;
    const a = (k) => (v.reduce((s, x) => s + (x[k] || 0), 0) / v.length).toFixed(1);
    return { n: v.length, pel: a('pelayanan'), alat: a('alat'), list: v };
  }, [nilai]);

  async function kembalikan(items) {
    const upd = {};
    items.forEach((l) => {
      upd[`${b}/pinjam/${l.id}/status`] = 'kembali';
      upd[`${b}/pinjam/${l.id}/kembaliWaktu`] = serverTimestamp();
      upd[`${b}/pinjam/${l.id}/kembaliOleh`] = nama;
      upd[`unitAktif/${l.receiver}`] = null;
    });
    await update(ref(db, 'sis'), upd);
  }
  async function tukar(l, baru) {
    const k = await get(ref(db, 'sis/unitAktif/' + baru));
    if (k.exists()) throw new Error(`${baru} sedang dipinjam.`);
    try {
      await update(ref(db, 'sis'), {
        [`${b}/pinjam/${l.id}/receiver`]: baru,
        [`${b}/pinjam/${l.id}/unitAsal`]: l.unitAsal || l.receiver,
        [`${b}/pinjam/${l.id}/catatanGanti`]: `Tukar ${l.receiver} ke ${baru} oleh ${nama}`.slice(0, 200),
        [`unitAktif/${l.receiver}`]: null,
        [`unitAktif/${baru}`]: { acara: eid, loan: l.id },
      });
    } catch { throw new Error('Gagal menukar. Periksa nomor pengganti.'); }
  }
  async function catatLog(o) {
    const id = push(ref(db, b + '/stok/log')).key;
    const d = { jenis: o.jenis, jumlah: o.jumlah, oleh: nama, waktu: serverTimestamp() };
    if (o.kurang != null) d.kurang = o.kurang;
    if (o.teknisi) d.teknisi = o.teknisi;
    if (o.catatan) d.catatan = o.catatan;
    await set(ref(db, `${b}/stok/log/${id}`), d);
  }
  async function acaraSelesai() {
    const upd = {};
    buka.forEach((l) => { upd[`${b}/pinjam/${l.id}/status`] = 'tidakKembali'; upd[`unitAktif/${l.receiver}`] = null; });
    upd[`${b}/status`] = 'selesai';
    const id = push(ref(db, b + '/stok/log')).key;
    upd[`${b}/stok/log/${id}`] = { jenis: 'selesai', jumlah: 0, oleh: nama, waktu: serverTimestamp(), catatan: buka.length ? `${buka.length} receiver belum kembali saat acara ditutup` : '' };
    await update(ref(db, 'sis'), upd);
    setKonfSelesai(false);
  }

  function bukaKembaliDariUnit(u) {
    const l = buka.find((x) => x.receiver === u);
    if (!l) { setInfo(''); setDlg({ jenis: 'tidakAda', unit: u }); return; }
    const g = grup.find((x) => x.items.some((i) => i.id === l.id));
    setDlg({ jenis: 'kembali', key: g.key, fokus: l.id });
  }
  const onScan = (t) => {
    const u = unitFromScan(t);
    if (!u) { setInfo('Bukan QR receiver.'); return; }
    setScan(false);
    bukaKembaliDariUnit(u);
  };
  const ingatkan = async (g) => {
    const b2 = g.items.filter((l) => l.status === 'dipinjam');
    const teks = isiPesan(cfg.pesan, { salam: salamWaktu(), nama: g.nama, acara: meta.nama, no: b2.map((l) => l.receiver).join(', ') });
    window.open(contactLink(g.hp, teks, 'Pengembalian receiver ' + meta.nama), '_blank');
    const upd = {};
    b2.forEach((l) => { upd[`${b}/pinjam/${l.id}/reminderTerakhir`] = Date.now(); upd[`${b}/pinjam/${l.id}/reminderJumlah`] = (l.reminderJumlah || 0) + 1; });
    try { await update(ref(db, 'sis'), upd); } catch {}
  };

  if (ditolak) return <div className="wrap"><Brand sub="Usher" /><div className="card center"><div className="big">🔒</div><p>Anda tidak ditugaskan di acara ini.</p><a className="btn" href="#/usher">Kembali</a></div></div>;
  if (meta === undefined || status === undefined || aktif === undefined) return <div className="wrap"><Spinner /></div>;
  if (meta === null) return <div className="wrap"><div className="card center"><p>Acara tidak ditemukan.</p><a className="btn" href="#/usher">Kembali</a></div></div>;

  const selesai = status === 'selesai';
  const grupDlg = dlg && dlg.key ? grup.find((g) => g.key === dlg.key) : null;

  return (
    <div className="wrap wide">
      <div className="head">
        <img src="./logo.png" alt="" />
        <div><h1>{meta.nama}</h1><div className="muted">{jadwalText(meta)} · {nama}</div></div>
        <span className={'pill ' + (selesai ? 'off' : 'on')}>{selesai ? 'Selesai' : 'Aktif'}</span>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <a className="link" href="#/usher">← Daftar acara</a>
        {sesi.isSuper ? <a className="link" href="#/admin">Super Admin</a> : null}
      </div>

      <div className="tabs">
        {[['pinjam', 'Peminjaman'], ['stok', 'Stok'], ['nilai', 'Penilaian'], ['atur', 'Pengaturan']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>

      {tab === 'pinjam' ? (
        <>
          <div className="stats">
            <div><b>{buka.length}</b><span>Dipinjam</span></div>
            <div><b>{loans.filter((l) => l.status === 'kembali').length}</b><span>Kembali</span></div>
            <div><b>{adaTerima ? tersedia : '-'}</b><span>Tersedia</span></div>
          </div>
          {!selesai ? (
            <div className="card">
              <div className="rowbtn">
                <button className="btn primary" onClick={() => { setInfo(''); setScan(true); }}>📷 Scan receiver</button>
                <button className="btn" onClick={() => setDlg({ jenis: 'manual' })}>+ Catat manual</button>
              </div>
              <div className="chedit">
                <input value={ketik} placeholder="Ketik nomor, mis. A001" maxLength={6} style={{ textTransform: 'uppercase' }} onChange={(e) => setKetik(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') { const u = unitNorm(ketik); if (u) { bukaKembaliDariUnit(u); setKetik(''); } else setInfo('Nomor tidak valid.'); } }} />
                <button className="btn" onClick={() => { const u = unitNorm(ketik); if (u) { bukaKembaliDariUnit(u); setKetik(''); } else setInfo('Nomor tidak valid.'); }}>Kembalikan</button>
              </div>
              {info ? <div className="err">{info}</div> : null}
            </div>
          ) : null}
          <input className="search" value={cari} placeholder="Cari nama, institusi, kontak, atau nomor" onChange={(e) => setCari(e.target.value)} />
          {grupBuka.map((g) => {
            const bk = g.items.filter((l) => l.status === 'dipinjam');
            return (
              <div key={g.key} className="grp">
                <div className="row"><span className="who2">{g.nama}</span>{g.jaminan && jaminanInfo(g.jaminan) ? <span className="pill">{jaminanInfo(g.jaminan).ic} {jaminanInfo(g.jaminan).id}</span> : null}</div>
                <div className="sub">{g.institusi} · {g.hp}</div>
                <div className="chips">{bk.map((l) => <button key={l.id} className="chip warn" onClick={() => setDlg({ jenis: 'kembali', key: g.key, fokus: l.id })}>{l.receiver}</button>)}</div>
                <div className="sub">Dipinjam {fmtJam(bk[0].waktu)}{bk.some((l) => l.reminderJumlah) ? ` · diingatkan ${Math.max(...bk.map((l) => l.reminderJumlah || 0))}×` : ''}</div>
                {!selesai ? (
                  <div className="rowbtn">
                    <button className="btn primary" onClick={() => setDlg({ jenis: 'kembali', key: g.key, fokus: null })}>{bk.length > 1 ? `Kembalikan semua (${bk.length})` : 'Sudah kembali'}</button>
                    <button className="btn wa" onClick={() => ingatkan(g)}>Ingatkan</button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {grupTutup.length ? <div className="muted" style={{ margin: '14px 0 6px' }}>Sudah selesai ({grupTutup.length})</div> : null}
          {grupTutup.map((g) => (
            <div key={g.key} className="grp" style={{ opacity: 0.75 }}>
              <div className="who2">{g.nama}</div>
              <div className="sub">{g.institusi} · {g.hp}</div>
              <div className="chips">{g.items.map((l) => <span key={l.id} className={'chip ' + (l.status === 'kembali' ? 'ok' : 'bad')}>{l.receiver}</span>)}</div>
            </div>
          ))}
          {!tampil.length ? <div className="card center"><p className="muted">Belum ada peminjaman.</p></div> : null}
        </>
      ) : null}

      {tab === 'stok' ? (
        <>
          <div className="stat4">
            <div><b>{meta.dipesan || '-'}</b><span>Dipesan</span></div>
            <div><b>{adaTerima ? diterima : '-'}</b><span>Diterima</span></div>
            <div><b>{buka.length}</b><span>Dipinjam</span></div>
            <div><b style={{ color: adaTerima && tersedia <= 3 ? '#FCA5A5' : undefined }}>{adaTerima ? tersedia : '-'}</b><span>Tersedia</span></div>
          </div>
          {selesai ? (
            <div className="card center"><div className="big">🏁</div><p>Acara sudah selesai.</p></div>
          ) : !adaTerima ? (
            <button className="btn primary big-cta" onClick={() => setDlg({ jenis: 'terima' })}>＋ Terima dari teknisi</button>
          ) : !adaRetur ? (
            <>
              <button className="btn primary big-cta" onClick={() => setDlg({ jenis: 'retur' })}>↩ Kembalikan ke teknisi</button>
              <button className="link" onClick={() => setDlg({ jenis: 'susulan' })}>Tambah penerimaan susulan</button>
            </>
          ) : (
            <>
              <div className="jamdone">Sudah dikembalikan ke teknisi ✓</div>
              <button className="btn primary big-cta" style={{ marginTop: 10 }} onClick={() => setKonfSelesai(true)}>🏁 Acara Selesai</button>
            </>
          )}
          <div className="card" style={{ marginTop: 14 }}>
            <h3>Riwayat stok</h3>
            {logs.length ? logs.slice().reverse().map((l) => (
              <div key={l.id} className="devrow row stoklog" style={{ display: 'block' }}>
                <b style={{ color: '#E8EEF8' }}>{({ terima: 'Diterima', susulan: 'Susulan', retur: 'Dikembalikan ke teknisi', selesai: 'Acara selesai' })[l.jenis]}{l.jenis !== 'selesai' ? ` ${l.jumlah}` : ''}{l.kurang ? ` · kurang ${l.kurang}` : ''}</b>
                <div>{fmtTgl(l.waktu)} · {l.oleh}{l.teknisi ? ' · teknisi ' + l.teknisi : ''}</div>
                {l.catatan ? <div className="note" style={{ marginTop: 4 }}>{l.catatan}</div> : null}
              </div>
            )) : <p className="muted">Belum ada catatan.</p>}
          </div>
        </>
      ) : null}

      {tab === 'nilai' ? (
        rata ? (
          <>
            <div className="nilai">
              <div><b>{rata.n}</b><span>Responden</span></div>
              <div><b>{rata.pel}</b><span>Pelayanan</span></div>
              <div><b>{rata.alat}</b><span>Receiver</span></div>
            </div>
            {rata.list.map((v, i) => (
              <div key={i} className="grp"><div className="star-sm">{'★'.repeat(v.pelayanan)}{'☆'.repeat(5 - v.pelayanan)} pelayanan · {'★'.repeat(v.alat)}{'☆'.repeat(5 - v.alat)} receiver</div>{v.komentar ? <div>{v.komentar}</div> : null}</div>
            ))}
          </>
        ) : <div className="card center"><p className="muted">Belum ada penilaian.</p></div>
      ) : null}

      {tab === 'atur' ? <Pengaturan key={JSON.stringify(cfg)} eid={eid} meta={meta} cfg={cfg} loans={loans} logs={logs} diterima={diterima} nilaiRata={rata ? `${rata.pel}/${rata.alat}` : ''} /> : null}

      {/* ===== dialog ===== */}
      {aktif === null && !selesai ? <DialogNama saran={saran} onSimpan={(n) => set(ref(db, `${b}/petugasAktif/${hp}`), { nama: n, waktu: serverTimestamp() })} /> : null}

      {scan ? (
        <Modal onClose={() => setScan(false)}>
          <h2>Scan receiver</h2>
          <Scanner onCode={onScan} hint="Arahkan ke QR di receiver yang dikembalikan" />
          <button className="btn" onClick={() => setScan(false)}>Tutup</button>
        </Modal>
      ) : null}

      {dlg && dlg.jenis === 'kembali' && grupDlg ? <DialogKembali grup={grupDlg} fokus={dlg.fokus} onClose={() => setDlg(null)} onKembali={kembalikan} onTukar={tukar} /> : null}
      {dlg && dlg.jenis === 'manual' ? <DialogManual key={dlg.awal || 'x'} eid={eid} uid={uid} cfg={cfg} awal={dlg.awal} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg.jenis === 'tidakAda' ? (
        <Modal onClose={() => setDlg(null)}>
          <h2>{dlg.unit} tidak tercatat dipinjam</h2>
          <p className="muted">Receiver ini tidak ada di daftar pinjaman acara ini. Bisa jadi tamu belum mengisi data. Catat peminjamannya secara manual?</p>
          <button className="btn primary" onClick={() => setDlg({ jenis: 'manual', awal: dlg.unit })}>Catat manual</button>
          <button className="btn" onClick={() => setDlg(null)}>Tutup</button>
        </Modal>
      ) : null}
      {dlg && (dlg.jenis === 'terima' || dlg.jenis === 'susulan') ? (
        <DialogTerima susulan={dlg.jenis === 'susulan'} meta={meta} cfg={cfg} onClose={() => setDlg(null)}
          onSimpan={async (v) => { await catatLog({ jenis: dlg.jenis, ...v }); setDlg(null); }} />
      ) : null}
      {dlg && dlg.jenis === 'retur' ? (
        <DialogRetur diterima={diterima} buka={buka} cfg={cfg} onClose={() => setDlg(null)}
          onSimpan={async (v) => { await catatLog({ jenis: 'retur', ...v }); setDlg(null); }} />
      ) : null}
      {konfSelesai ? (
        <Modal onClose={() => setKonfSelesai(false)}>
          <h2>Tutup acara?</h2>
          <p>Peminjaman ditutup dan acara terkunci.{buka.length ? ` ${buka.length} receiver yang belum kembali dicatat sebagai "tidak kembali".` : ''}</p>
          <button className="btn primary" onClick={acaraSelesai}>Ya, acara selesai</button>
          <button className="btn" onClick={() => setKonfSelesai(false)}>Batal</button>
        </Modal>
      ) : null}
    </div>
  );
}
