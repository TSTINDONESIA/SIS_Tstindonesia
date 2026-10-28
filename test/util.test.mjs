import assert from 'node:assert/strict';
import { normHp, parseKontak, unitNorm, unitFromScan, daftarUnit, grupKey, isiPesan, validContact } from '../src/util.js';

// normHp
assert.equal(normHp('0812-3456-7890'), '6281234567890');
assert.equal(normHp('+62 812 3456 7890'), '6281234567890');
assert.equal(normHp('812 3456 7890'), '6281234567890');
assert.equal(normHp('+62 0812 3456 7890'), '6281234567890');
assert.equal(normHp('123'), null);
assert.equal(normHp('2026-10-23'), null);
assert.equal(normHp(''), null);

// unit
assert.equal(unitNorm('a1'), 'A001');
assert.equal(unitNorm('A0001'), 'A001');
assert.equal(unitNorm('j100'), 'J100');
assert.equal(unitNorm('J101'), null);
assert.equal(unitNorm('K001'), null);
assert.equal(unitNorm('A000'), null);
assert.equal(unitFromScan('https://x.github.io/repo/#/u/b042'), 'B042');
assert.equal(unitFromScan('C007'), 'C007');
assert.equal(unitFromScan('hello'), null);
const d = daftarUnit('A', 1, 100);
assert.equal(d.length, 100); assert.equal(d[0], 'A001'); assert.equal(d[99], 'A100');

// kontak: berbagai format salinan
let r = parseKontak('Budi Santoso 0812-3456-7890\nSiti Aminah\n+62 813 1111 2222\nJoko: 081299990000, 6285700001111');
assert.deepEqual(r.map(x => x.hp), ['6281234567890', '6281311112222', '6281299990000', '6285700001111']);
assert.equal(r[0].nama, 'Budi Santoso');
assert.equal(r[1].nama, 'Siti Aminah');
assert.equal(r[2].nama, 'Joko');
r = parseKontak('BEGIN:VCARD\nVERSION:3.0\nFN:Andi Wijaya\nTEL;TYPE=CELL:0812 0000 1111\nEND:VCARD\nBEGIN:VCARD\nN:Lestari;Dewi;;;\nTEL:+6281355556666\nEND:VCARD');
assert.equal(r.length, 2); assert.equal(r[0].nama, 'Andi Wijaya'); assert.equal(r[1].nama, 'Dewi Lestari');
r = parseKontak('Mobile 0812 3333 4444');
assert.equal(r.length, 1); assert.equal(r[0].nama, '');
r = parseKontak('Rina\t081234500000\nRina\t081234500000');
assert.equal(r.length, 1);
r = parseKontak('tidak ada nomor di sini\n2026-10-23');
assert.equal(r.length, 0);

// lain-lain
assert.equal(grupKey('0812-3456-7890'), '6281234567890');
assert.equal(grupKey('A@B.com'), 'a@b.com');
assert.ok(validContact('0812345678') && validContact('a@b.co') && !validContact('abc'));
assert.equal(isiPesan('Hai {nama} {x}', { nama: 'Budi' }), 'Hai Budi {x}');
console.log('util.test OK');

// ---- acara beberapa hari ----
import { jadwalText, daftarHari, ringkasHarian, tglKey } from '../src/util.js';
const mm = { nama: 'x', tanggal: '2026-10-27', tanggalSelesai: '2026-10-29', mulai: '09:00', selesai: '17:00' };
assert.deepEqual(daftarHari(mm), ['2026-10-27', '2026-10-28', '2026-10-29']);
assert.deepEqual(daftarHari({ tanggal: '2026-10-27', mulai: '09:00', selesai: '17:00' }), ['2026-10-27']);
assert.ok(jadwalText(mm).includes('(tiap hari)'));
assert.ok(!jadwalText({ tanggal: '2026-10-27', mulai: '09:00', selesai: '17:00' }).includes('tiap hari'));
const t = (k, h) => { const [y, mo, d] = k.split('-').map(Number); return new Date(y, mo - 1, d, h).getTime(); };
const L = [
  { receiver: 'A001', waktu: t('2026-10-27', 10), kembaliWaktu: t('2026-10-27', 16) },
  { receiver: 'A002', waktu: t('2026-10-27', 11), kembaliWaktu: t('2026-10-28', 9) },
  { receiver: 'A003', waktu: t('2026-10-28', 10) },
];
const rr = ringkasHarian(L, ['2026-10-27', '2026-10-28']);
assert.equal(rr[0].dipinjam.length, 2); assert.equal(rr[0].kembali.length, 1); assert.equal(rr[0].belum.length, 1);
assert.equal(rr[1].dipinjam.length, 1); assert.equal(rr[1].kembali.length, 1); assert.equal(rr[1].belum.length, 1);
assert.equal(tglKey(t('2026-10-28', 23)), '2026-10-28');
console.log('multi-hari OK');
