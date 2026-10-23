// 08123 -> 628123 ; +62 812 -> 62812 ; 812 -> 62812
export function waNum(hp) {
  let d = String(hp || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}
export const waLink = (hp, text = '') => `https://wa.me/${waNum(hp)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
export const fmtJam = (t) => (t ? new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-');
export const fmtTgl = (t) => (t ? new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const OLD_PESAN =
  'Halo {nama}, terima kasih telah hadir di {acara}. 🙏\nMohon mengembalikan receiver interpreter No. {no} ke meja Usher ya. Terima kasih!';
export const DEFAULT_PESAN =
  'Selamat {salam} Bapak/Ibu {nama},\n\nTerima kasih atas kehadiran Bapak/Ibu di {acara}. 🙏\n\nKami mohon kesediaan Bapak/Ibu untuk mengembalikan receiver interpreter No. {no} ke meja Usher. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.\n\nHormat kami,\nTim Usher';
// Salam sesuai jam kirim: pagi 04-10, siang 11-14, sore 15-17, malam selebihnya
export const salamWaktu = (d = new Date()) => {
  const h = d.getHours();
  return h >= 4 && h < 11 ? 'pagi' : h >= 11 && h < 15 ? 'siang' : h >= 15 && h < 18 ? 'sore' : 'malam';
};
// pesan lama yang tersimpan di pengaturan otomatis diganti ke versi sopan
export const pilihPesan = (tersimpan) => (!tersimpan || tersimpan === OLD_PESAN ? DEFAULT_PESAN : tersimpan);

// Kontak tamu bisa nomor WhatsApp ATAU email
export const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim());
export const isPhone = (s) => /^[0-9+ -]{6,20}$/.test(String(s || '').trim());
export const validContact = (s) => isEmail(s) || isPhone(s);
// WhatsApp bila nomor, mailto bila email
export const contactLink = (c, text = '', subject = '') =>
  isEmail(c)
    ? `mailto:${String(c).trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    : waLink(c, text);

// Nomor receiver: bisa "A001", "B001", atau "01" saja.
// rcvNorm  : huruf besar, buang spasi/simbol aneh (hanya A-Z, 0-9, strip)
// rcvKey   : kunci pembanding; nol di depan angka diabaikan, jadi "01"="1" dan "A001"="A1"
export const rcvNorm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
export const rcvKey = (s) => rcvNorm(s).replace(/^([A-Z]*-?)0+(?=\d)/, '$1');
export const RCV_OK = /^[A-Z0-9-]{1,8}$/;

// Jalur data: acara utama (lama) tetap di 'interpreter'; ruangan baru di 'interpreter/rooms/<id>'
export const basePath = (rid) => (rid ? 'interpreter/rooms/' + rid : 'interpreter');
export const RID_OK = /^[a-z0-9-]{1,30}$/;
export const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
// jadwal ruangan: tanggal 'YYYY-MM-DD', jam 'HH:MM' (waktu setempat)
export const waktu = (tgl, jam) => { const [y, m, d] = String(tgl).split('-').map(Number); const [h, mi] = String(jam).split(':').map(Number); return new Date(y, m - 1, d, h, mi).getTime(); };
export const tglAkhir = (r) => r.tanggalSelesai || r.tanggal;
export const statusRuang = (r, now = Date.now()) => (now < waktu(r.tanggal, r.mulai) ? 'akan' : now > waktu(tglAkhir(r), r.selesai) ? 'selesai' : 'berlangsung');
const fTgl = (t) => { const [y, m, d] = String(t).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
export const jadwalText = (r) =>
  (tglAkhir(r) !== r.tanggal ? fTgl(r.tanggal) + ' – ' + fTgl(tglAkhir(r)) : fTgl(r.tanggal)) + ' · ' + r.mulai + '–' + r.selesai + (tglAkhir(r) !== r.tanggal ? ' (tiap hari)' : '');

// Jaminan peminjaman. Superadmin memilih jenis yang diizinkan; tamu memilih salah satu.
// Yang disimpan hanya KODE jenisnya (bukan isi/nomor/password). Barang fisik dipegang Usher.
export const JAMINAN = [
  { k: 'ktp', ic: '🪪', id: 'KTP', en: 'ID card (KTP)' },
  { k: 'sim', ic: '🚗', id: 'SIM', en: "Driver's license (SIM)" },
  { k: 'paspor', ic: '📕', id: 'Paspor', en: 'Passport' },
  { k: 'kartunama', ic: '📇', id: 'Kartu nama', en: 'Business card' },
  { k: 'password', ic: '🔑', id: 'Password / PIN HP', en: 'Phone password / PIN' },
];
export const JAMINAN_DEFAULT = ['ktp', 'sim', 'kartunama'];
export const jaminanInfo = (k) => JAMINAN.find((j) => j.k === k) || null;
// daftar jenis yang aktif untuk sebuah ruangan ([] bila fitur mati)
export const jaminanAktif = (cfg) => {
  const j = cfg && cfg.jaminan;
  if (!j || !j.aktif) return [];
  return JAMINAN.filter((x) => j.jenis && j.jenis[x.k]);
};
