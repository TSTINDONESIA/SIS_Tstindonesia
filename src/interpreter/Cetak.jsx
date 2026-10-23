import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

// Halaman cetak label QR receiver. Spesifikasi mengikuti rekap sistem barcode:
// label 30 x 35 mm, QR ±25 mm di atas, nomor unit huruf besar tebal di bawah,
// hitam di atas putih, margin putih ±2,5 mm. Isi QR = alamat situs + nomor unit.

const HURUF = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const pad = (n) => String(n).padStart(3, '0');
const baseDefault = () => location.origin + location.pathname.replace(/[^/]*$/, '');

// Isi QR. Format: <alamat situs>#/?no=A001  (atau #/r/<ruangan>?no=A001)
export const qrIsi = (base, no, rid) => {
  const b = String(base || '').trim().replace(/#.*$/, '');
  const dasar = b.endsWith('/') ? b : b + '/';
  return dasar + (rid ? '#/r/' + rid : '#/') + '?no=' + encodeURIComponent(no);
};

const modul = (text) => {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { n: q.modules.size, d: q.modules.data };
};

// SVG pratinjau satu label (skala: 1 mm = 1 unit)
function LabelSvg({ text, no, w, h, qr, margin }) {
  const m = useMemo(() => modul(text), [text]);
  const sz = Math.min(qr, w - 2 * margin);
  const x0 = (w - sz) / 2;
  const u = sz / m.n;
  const rects = [];
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.d[r * m.n + c]) rects.push(<rect key={r + '-' + c} x={x0 + c * u} y={margin + r * u} width={u + 0.01} height={u + 0.01} />);
  const ty = margin + sz + (h - margin - sz) / 2;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="lblsvg" role="img" aria-label={`Label ${no}`}>
      <rect width={w} height={h} fill="#fff" />
      <g fill="#000">{rects}</g>
      <text x={w / 2} y={ty} textAnchor="middle" dominantBaseline="central" fontFamily="Helvetica,Arial,sans-serif" fontWeight="800" fontSize={Math.min(6, (h - margin - sz) * 0.8)} fill="#000">{no}</text>
    </svg>
  );
}

async function buatPdf(list, o) {
  const { jsPDF } = await import('jspdf');
  const { w, h, qr, margin, cols, rows, mx, my, gx, gy, mode, garis, base, rid } = o;
  const roll = mode === 'roll';
  const doc = new jsPDF({ unit: 'mm', format: roll ? [w, h] : 'a4', orientation: roll ? (w > h ? 'l' : 'p') : 'p', compress: true });
  const perLembar = cols * rows;
  list.forEach((no, i) => {
    let x = 0, y = 0;
    if (roll) {
      if (i > 0) doc.addPage([w, h], w > h ? 'l' : 'p');
    } else {
      const k = i % perLembar;
      if (i > 0 && k === 0) doc.addPage('a4', 'p');
      x = mx + (k % cols) * (w + gx);
      y = my + Math.floor(k / cols) * (h + gy);
    }
    if (!no) return;                       // posisi kosong (pemisah lembar)
    if (garis && !roll) { doc.setDrawColor(190); doc.setLineWidth(0.1); doc.rect(x, y, w, h); }
    const m = modul(qrIsi(base, no, rid));
    const sz = Math.min(qr, w - 2 * margin);
    const qx = x + (w - sz) / 2;
    const qy = y + margin;
    const u = sz / m.n;
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) {
      if (m.d[r * m.n + c]) doc.rect(qx + c * u, qy + r * u, u + 0.02, u + 0.02, 'F');
    }
    const ruang = h - margin - sz;
    const fs = Math.min(18, (ruang * 0.8) / 0.3528);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fs);
    doc.setTextColor(0, 0, 0);
    doc.text(no, x + w / 2, qy + sz + ruang / 2, { align: 'center', baseline: 'middle' });
  });
  return doc;
}

export default function Cetak() {
  const [pil, setPil] = useState(() => new Set('ABCDEFGHIJ'.split('')));
  const [dari, setDari] = useState(1);
  const [sampai, setSampai] = useState(100);
  const [base, setBase] = useState(baseDefault);
  const [rid, setRid] = useState('');
  const [mode, setMode] = useState('a4');
  const [w, setW] = useState(30);
  const [h, setH] = useState(35);
  const [qr, setQr] = useState(25);
  const [margin, setMargin] = useState(2.5);
  const [cols, setCols] = useState(6);
  const [rows, setRows] = useState(8);
  const [mx, setMx] = useState(15);
  const [my, setMy] = useState(8.5);
  const [gx, setGx] = useState(0);
  const [gy, setGy] = useState(0);
  const [garis, setGaris] = useState(true);
  const [baru, setBaru] = useState(false);   // huruf baru mulai di lembar baru
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const num = (v) => Math.max(0, Number(v) || 0);
  const daftar = useMemo(() => {
    const out = [];
    const a = Math.max(1, Math.floor(num(dari))), z = Math.min(999, Math.floor(num(sampai)));
    const per = Math.max(1, Math.floor(num(cols)) * Math.floor(num(rows)));
    HURUF.filter((x) => pil.has(x)).forEach((hf) => {
      if (baru && mode === 'a4') while (out.length % per) out.push(null);
      for (let n = a; n <= z; n++) out.push(hf + pad(n));
    });
    return out;
  }, [pil, dari, sampai, baru, cols, rows, mode]);
  const labels = daftar.filter(Boolean);
  const per = Math.max(1, Math.floor(num(cols)) * Math.floor(num(rows)));
  const lembar = mode === 'a4' ? Math.ceil(daftar.length / per) : labels.length;
  const contoh = labels[0] || 'A001';

  const muat = (s) => { const n = new Set(pil); s.forEach((x) => (n.has(x) ? n.delete(x) : n.add(x))); setPil(n); };
  const cekFit = () => {
    if (mode !== 'a4') return '';
    const [W, H, C, R, MX, MY, GX, GY] = [w, h, cols, rows, mx, my, gx, gy].map(num);
    if (MX * 2 + C * W + (C - 1) * GX > 210.5) return `Lebar ${cols} kolom melebihi A4 (210 mm). Kurangi kolom atau margin.`;
    if (MY * 2 + R * H + (R - 1) * GY > 297.5) return `Tinggi ${rows} baris melebihi A4 (297 mm). Kurangi baris atau margin.`;
    return '';
  };
  const fit = cekFit();
  const qrBesar = num(qr) > num(w) - 2 * num(margin) || num(qr) + 2 * num(margin) > num(h);

  const opsi = { w: num(w), h: num(h), qr: num(qr), margin: num(margin), cols: Math.floor(num(cols)), rows: Math.floor(num(rows)), mx: num(mx), my: num(my), gx: num(gx), gy: num(gy), mode, garis, base, rid };

  const proses = async (aksi, batas) => {
    setErr('');
    if (!labels.length) return setErr('Pilih minimal satu huruf.');
    if (fit) return setErr(fit);
    setBusy(true);
    try {
      let list = daftar.slice();
      if (batas) list = list.slice(0, batas);
      const doc = await buatPdf(list, opsi);
      if (aksi === 'unduh') doc.save(batas ? 'label-uji-coba.pdf' : 'label-receiver.pdf');
      else window.open(doc.output('bloburl'), '_blank');
    } catch (e) { setErr('Gagal membuat PDF: ' + (e.message || e)); }
    setBusy(false);
  };

  useEffect(() => { document.title = 'Cetak label QR · TST Indonesia'; }, []);

  const F = (label, val, set, extra = {}) => (
    <label>{label}<input type="number" step="any" min="0" inputMode="decimal" value={val} onChange={(e) => set(e.target.value)} {...extra} /></label>
  );

  return (
    <div className="wrap wide">
      <div className="head">
        <img src={import.meta.env.BASE_URL + 'logo.png'} alt="" />
        <div><h1>🏷️ Cetak label QR receiver</h1><span className="muted">Stiker 30 × 35 mm: QR di atas, nomor unit di bawah</span></div>
        <a className="link" href="#/admin">← Kembali</a>
      </div>

      <div className="card">
        <h3>1. Nomor unit</h3>
        <div className="chips">
          {HURUF.map((x) => (
            <button key={x} type="button" className={'chip' + (pil.has(x) ? ' on' : '')} onClick={() => muat([x])} aria-pressed={pil.has(x)}>{x}</button>
          ))}
        </div>
        <div className="actions">
          <button className="link" onClick={() => setPil(new Set('ABCDEFGHIJ'.split('')))}>A–J (1000 alat)</button>
          <button className="link" onClick={() => setPil(new Set())}>Kosongkan</button>
        </div>
        <div className="row2">{F('Dari nomor', dari, setDari, { max: 999 })}{F('Sampai nomor', sampai, setSampai, { max: 999 })}</div>
        <span className="muted fine">Contoh hasil: {labels[0] || '-'} … {labels[labels.length - 1] || '-'} · <b>{labels.length}</b> label{mode === 'a4' ? ` · ${lembar} lembar A4` : ''}</span>
        {mode === 'a4' && <label className="chk"><input type="checkbox" checked={baru} onChange={(e) => setBaru(e.target.checked)} /> Tiap huruf mulai di lembar baru (lebih boros, lebih mudah dipisah per dus)</label>}
      </div>

      <div className="card">
        <h3>2. Isi QR</h3>
        <label>Alamat situs final
          <input value={base} onChange={(e) => setBase(e.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </label>
        <span className="muted fine">Pastikan alamat ini adalah alamat GitHub Pages yang akan dipakai tetap. Kalau alamat berubah, stiker yang sudah ditempel tidak bisa dipakai.</span>
        <label>ID ruangan (opsional)
          <input value={rid} onChange={(e) => setRid(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30))} placeholder="kosong = acara utama" />
        </label>
        <span className="muted fine">Kosongkan agar stiker bisa dipakai lintas acara. Isi hanya bila stiker khusus satu ruangan.</span>
        <code className="urlpreview">{qrIsi(base, contoh, rid)}</code>
      </div>

      <div className="card">
        <h3>3. Kertas dan ukuran</h3>
        <div className="tabs">
          <button className={mode === 'a4' ? 'on' : ''} onClick={() => setMode('a4')}>Lembar stiker A4</button>
          <button className={mode === 'roll' ? 'on' : ''} onClick={() => setMode('roll')}>Printer thermal (1 label/halaman)</button>
        </div>
        <div className="row2">{F('Lebar label (mm)', w, setW)}{F('Tinggi label (mm)', h, setH)}</div>
        <div className="row2">{F('Ukuran QR (mm)', qr, setQr)}{F('Margin putih (mm)', margin, setMargin)}</div>
        {qrBesar && <div className="err">QR terlalu besar untuk label ini; akan dikecilkan otomatis agar muat.</div>}
        {mode === 'a4' && (
          <>
            <div className="row2">{F('Kolom', cols, setCols)}{F('Baris', rows, setRows)}</div>
            <div className="row2">{F('Margin kiri (mm)', mx, setMx)}{F('Margin atas (mm)', my, setMy)}</div>
            <div className="row2">{F('Jarak antar kolom (mm)', gx, setGx)}{F('Jarak antar baris (mm)', gy, setGy)}</div>
            <label className="chk"><input type="checkbox" checked={garis} onChange={(e) => setGaris(e.target.checked)} /> Garis tipis di tepi label (bantu potong; matikan bila dicetak di stiker jadi)</label>
            <span className="muted fine">Bawaan: 6 × 8 = 48 label per lembar. Sesuaikan dengan stiker yang dibeli, dan cek ulang margin pada lembar percobaan.</span>
            {fit && <div className="err">{fit}</div>}
          </>
        )}
      </div>

      <div className="card center">
        <h3>Pratinjau label</h3>
        <div className="lblframe" style={{ aspectRatio: `${w} / ${h}` }}><LabelSvg text={qrIsi(base, contoh, rid)} no={contoh} w={num(w) || 30} h={num(h) || 35} qr={num(qr)} margin={num(margin)} /></div>
        <span className="muted fine">{w} × {h} mm · QR {Math.min(num(qr), num(w) - 2 * num(margin))} mm</span>
      </div>

      {err && <div className="err">{err}</div>}
      <div className="card">
        <h3>4. Cetak</h3>
        <button className="btn" disabled={busy || !labels.length} onClick={() => proses('buka', mode === 'a4' ? per : 1)}>🧪 Uji coba: {mode === 'a4' ? '1 lembar' : '1 label'} (buka untuk cetak)</button>
        <button className="btn primary" disabled={busy || !labels.length} onClick={() => proses('buka')}>🖨️ Buka PDF semua label ({labels.length})</button>
        <button className="btn" disabled={busy || !labels.length} onClick={() => proses('unduh')}>⬇️ Unduh PDF</button>
        <ul className="muted fine cetaknote">
          <li>Saat mencetak dari PDF, pilih ukuran kertas A4 dan skala <b>100% / Actual size</b> (jangan "Fit to page"), supaya label tetap 30 × 35 mm.</li>
          <li>Cetak satu lembar percobaan, tempel di beberapa alat, dan uji scan dengan beberapa HP sebelum cetak massal.</li>
          <li>Printer laser untuk stiker A4 atau thermal transfer. Printer inkjet biasa mudah luntur.</li>
        </ul>
      </div>
    </div>
  );
}
