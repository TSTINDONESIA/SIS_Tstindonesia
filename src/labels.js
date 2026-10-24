import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

// QR sebagai deretan kotak hitam (dipakai untuk pratinjau SVG dan PDF vektor)
export function qrRuns(text, level = 'M') {
  const q = QRCode.create(text, { errorCorrectionLevel: level });
  const n = q.modules.size;
  const runs = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (q.modules.get(r, c)) {
        let k = c;
        while (k < n && q.modules.get(r, k)) k++;
        runs.push([c, r, k - c]);
        c = k;
      } else c++;
    }
  }
  return { n, runs };
}
export const qrSvgPath = (text, level = 'M') => {
  const { n, runs } = qrRuns(text, level);
  return { n, d: runs.map(([c, r, l]) => `M${c} ${r}h${l}v1h-${l}z`).join('') };
};

export const TATA_LETAK = { w: 30, h: 35, kol: 6, baris: 8, mkiri: 15, matas: 8.5, gx: 0, gy: 0 };

// Satu label: QR di atas (maks 25 mm), nomor besar di bawah.
// Isi QR hanya nomor unit (mis. A001), tanpa alamat situs dan tanpa acara.
function gambarLabel(doc, x, y, L, kode, garis) {
  if (garis) { doc.setDrawColor(185); doc.setLineWidth(0.1); doc.rect(x, y, L.w, L.h); }
  const atas = 2.5, bawah = 7.5;
  const qs = Math.min(L.w - 5, L.h - atas - bawah);
  const qx = x + (L.w - qs) / 2, qy = y + atas;
  const { n, runs } = qrRuns(kode, 'Q');
  const m = qs / n;
  doc.setFillColor(0, 0, 0);
  runs.forEach(([c, r, l]) => doc.rect(qx + c * m, qy + r * m, l * m + 0.02, m + 0.02, 'F'));
  doc.setFont('courier', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(0, 0, 0);
  doc.text(kode, x + L.w / 2, y + L.h - 2.4, { align: 'center' });
}

export function pdfLabel({ kode, letak = {}, garis = false }) {
  const L = { ...TATA_LETAK, ...letak };
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const per = L.kol * L.baris;
  kode.forEach((k, i) => {
    const p = i % per;
    if (i > 0 && p === 0) doc.addPage();
    const r = Math.floor(p / L.kol), c = p % L.kol;
    gambarLabel(doc, L.mkiri + c * (L.w + L.gx), L.matas + r * (L.h + L.gy), L, k, garis);
  });
  return doc;
}

// Lembar QR meja Usher (A4) untuk satu acara
export function pdfQrMeja({ nama, jadwal, url }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210;
  doc.setTextColor(18, 41, 77);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text('TST Indonesia', W / 2, 28, { align: 'center' });
  doc.setFontSize(18);
  doc.text(doc.splitTextToSize(nama, 170), W / 2, 42, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(95, 107, 122);
  if (jadwal) doc.text(jadwal, W / 2, 56, { align: 'center' });
  const { n, runs } = qrRuns(url);
  const qs = 120, qx = (W - qs) / 2, qy = 66, m = qs / n;
  doc.setFillColor(0, 0, 0);
  runs.forEach(([c, r, l]) => doc.rect(qx + c * m, qy + r * m, l * m + 0.02, m + 0.02, 'F'));
  doc.setTextColor(18, 41, 77);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Scan untuk meminjam receiver', W / 2, qy + qs + 16, { align: 'center' });
  doc.setFontSize(15);
  doc.setTextColor(95, 107, 122);
  doc.text('Scan to borrow an interpreter receiver', W / 2, qy + qs + 25, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(url, 180), W / 2, qy + qs + 38, { align: 'center' });
  return doc;
}

export function bukaCetak(doc) {
  doc.autoPrint();
  const url = doc.output('bloburl');
  const w = window.open(url, '_blank');
  if (!w) location.href = url;
}
