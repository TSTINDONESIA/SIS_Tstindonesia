// ===== Nomor HP =====
// 0812-3456-7890 / +62 812 3456 7890 / 812... -> 6281234567890 (null kalau tidak valid)
export function normHp(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('620')) d = '62' + d.slice(3);
  else if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^62[0-9]{8,13}$/.test(d) ? d : null;
}
export const waNum = (hp) => {
  let d = String(hp || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
};
export const waLink = (hp, text = '') => `https://wa.me/${waNum(hp)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
export const tampilHp = (hp) => (hp ? '0' + String(hp).slice(2) : '');

// Kontak tamu: nomor WhatsApp ATAU email
export const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim());
export const isPhone = (s) => /^[0-9+ -]{6,20}$/.test(String(s || '').trim());
export const validContact = (s) => isEmail(s) || isPhone(s);
export const contactLink = (c, text = '', subject = '') =>
  isEmail(c)
    ? `mailto:${String(c).trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    : waLink(c, text);
// kunci pengelompok: satu orang = satu kontak
export const grupKey = (c) => (isEmail(c) ? String(c).trim().toLowerCase() : waNum(c)).slice(0, 100);

// ===== Tempel dari kontak HP =====
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
const LABEL = /^(mobile|hp|phone|tel|telp|telepon|wa|whatsapp|home|work|ponsel|rumah|kantor|main|other)$/i;
const cleanNama = (s) => {
  let t = String(s || '')
    .replace(/^(nama|name|tel|telp|hp|phone|mobile|wa|whatsapp)\s*[:=-]\s*/i, '')
    .replace(/[|;,\t"“”<>]+/g, ' ')
    .replace(/^[\s:=-]+|[\s:=-]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  if (LABEL.test(t)) t = '';
  return t;
};
// Menerima teks hasil salin dari aplikasi Kontak / WhatsApp / Excel / vCard.
// Mengembalikan [{hp:'62812...', nama:'Budi'}], tanpa duplikat.
export function parseKontak(text) {
  const src = String(text || '').replace(/\r/g, '');
  const out = new Map();
  const add = (nama, raw) => {
    const hp = normHp(raw);
    if (!hp) return;
    const n = cleanNama(nama);
    if (!out.has(hp)) out.set(hp, { hp, nama: n });
    else if (!out.get(hp).nama && n) out.get(hp).nama = n;
  };
  if (/BEGIN:VCARD/i.test(src)) {
    for (const card of src.split(/BEGIN:VCARD/i).slice(1)) {
      const c = card.replace(/\n[ \t]/g, '');
      let fn = (c.match(/^FN[^:\n]*:(.*)$/im) || [])[1];
      if (!fn) {
        const n = (c.match(/^N[^:\n]*:(.*)$/im) || [])[1];
        if (n) fn = n.split(';').filter(Boolean).reverse().join(' ');
      }
      for (const m of c.matchAll(/^(?:item\d+\.)?TEL[^:\n]*:(.*)$/gim)) add(fn, m[1]);
    }
    return [...out.values()];
  }
  let tunda = '';
  for (const line of src.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const good = (line.match(PHONE_RE) || []).filter((p) => normHp(p));
    if (!good.length) { tunda = line; continue; }
    let nm = line;
    good.forEach((p) => { nm = nm.replace(p, ' '); });
    nm = cleanNama(nm) || cleanNama(tunda);
    good.forEach((p) => add(nm, p));
    tunda = '';
  }
  return [...out.values()];
}

// ===== Nomor unit receiver: A001 .. J100 (1 huruf per 100 alat) =====
export const UNIT_RE = /^[A-J](00[1-9]|0[1-9][0-9]|100)$/;
export const unitNorm = (s) => {
  const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = t.match(/^([A-J])0*(\d{1,3})$/);
  if (!m) return null;
  const n = Number(m[2]);
  if (n < 1 || n > 100) return null;
  return m[1] + String(n).padStart(3, '0');
};
// isi QR di label adalah nomor saja (A001); bentuk alamat lama tetap dikenali
export const unitFromScan = (txt) => {
  const s = String(txt || '').trim();
  const m = s.match(/#\/u\/([A-Za-z0-9]{2,8})\s*$/);
  return unitNorm(m ? m[1] : s);
};
export const daftarUnit = (huruf, dari, sampai) => {
  const out = [];
  for (let i = dari; i <= sampai; i++) out.push(huruf + String(i).padStart(3, '0'));
  return out;
};

// ===== Alamat =====
export const baseUrl = () => location.origin + location.pathname;
export const eventUrl = (eid) => baseUrl() + '#/e/' + eid;
export const newEid = () => {
  const a = new Uint8Array(8);
  (globalThis.crypto || window.crypto).getRandomValues(a);
  return Array.from(a, (x) => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join('');
};

// ===== Waktu =====
export const fmtJam = (t) => (t ? new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-');
export const fmtTgl = (t) => (t ? new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const jadwalText = (m) => {
  if (!m || !m.tanggal) return '';
  const [y, mo, d] = String(m.tanggal).split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + m.mulai + '–' + m.selesai;
};
export const salamWaktu = (d = new Date()) => {
  const h = d.getHours();
  return h >= 4 && h < 11 ? 'pagi' : h >= 11 && h < 15 ? 'siang' : h >= 15 && h < 18 ? 'sore' : 'malam';
};

// ===== Pengingat =====
export const DEFAULT_PESAN =
  'Selamat {salam} Bapak/Ibu {nama},\n\nTerima kasih atas kehadiran Bapak/Ibu di {acara}. 🙏\n\nKami mohon kesediaan Bapak/Ibu untuk mengembalikan receiver interpreter No. {no} ke meja Usher. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.\n\nHormat kami,\nTim Usher';
export const isiPesan = (tpl, v) =>
  String(tpl || DEFAULT_PESAN).replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : '{' + k + '}'));

// ===== Jaminan =====
export const JAMINAN = [
  { k: 'ktp', ic: '🪪', id: 'KTP', en: 'ID card (KTP)' },
  { k: 'sim', ic: '🚗', id: 'SIM', en: "Driver's license (SIM)" },
  { k: 'paspor', ic: '📕', id: 'Paspor', en: 'Passport' },
  { k: 'kartunama', ic: '📇', id: 'Kartu nama', en: 'Business card' },
  { k: 'password', ic: '🔑', id: 'Password / PIN HP', en: 'Phone password / PIN' },
];
export const JAMINAN_DEFAULT = ['ktp', 'sim', 'kartunama'];
export const jaminanInfo = (k) => JAMINAN.find((j) => j.k === k) || null;
export const jaminanAktif = (cfg) => {
  const j = cfg && cfg.jaminan;
  if (!j || !j.aktif) return [];
  return JAMINAN.filter((x) => j.jenis && j.jenis[x.k]);
};

// ===== Alasan kekurangan alat =====
export const ALASAN = ['Hilang', 'Rusak', 'Tertinggal di ruangan', 'Lainnya'];

// ===== Ingatan HP tamu: event terakhir yang di-scan di meja Usher =====
const TTL = 48 * 3600 * 1000;
export const simpanEvent = (eid) => {
  try { localStorage.setItem('sis.event', JSON.stringify({ eid, at: Date.now() })); } catch {}
};
export const ambilEvent = () => {
  try {
    const o = JSON.parse(localStorage.getItem('sis.event') || 'null');
    return o && o.eid && Date.now() - o.at < TTL ? o.eid : null;
  } catch { return null; }
};
