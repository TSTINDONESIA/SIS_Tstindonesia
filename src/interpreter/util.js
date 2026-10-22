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
export const DEFAULT_PESAN =
  'Halo {nama}, terima kasih telah hadir di {acara}. 🙏\nMohon mengembalikan receiver interpreter No. {no} ke meja Usher ya. Terima kasih!';

// Kontak tamu bisa nomor WhatsApp ATAU email
export const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim());
export const isPhone = (s) => /^[0-9+ -]{6,20}$/.test(String(s || '').trim());
export const validContact = (s) => isEmail(s) || isPhone(s);
// WhatsApp bila nomor, mailto bila email
export const contactLink = (c, text = '', subject = '') =>
  isEmail(c)
    ? `mailto:${String(c).trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    : waLink(c, text);
