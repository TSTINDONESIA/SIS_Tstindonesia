import { ref, push, update, get, serverTimestamp } from 'firebase/database';
import { db } from './firebase.js';
import { grupKey } from './util.js';

// Satu peminjaman = dua tulisan atomik: data pinjam + kunci global nomor unit.
// Kunci unitAktif/<unit> membuat satu receiver hanya bisa dipinjam satu orang, lintas event.
// Lempar Error('TAKEN') bila unit sedang dipinjam, Error('FAIL') untuk kegagalan lain.
export async function pinjamUnit({ eid, uid, nama, hp, institusi, jaminan, unit }) {
  let kunci;
  try { kunci = await get(ref(db, 'sis/unitAktif/' + unit)); } catch { throw new Error('FAIL'); }
  if (kunci.exists()) throw new Error('TAKEN');
  const id = push(ref(db, `sis/acara/${eid}/pinjam`)).key;
  const data = { nama, hp, institusi, receiver: unit, waktu: serverTimestamp(), status: 'dipinjam', uid, grup: grupKey(hp) };
  if (jaminan) data.jaminan = jaminan;
  try {
    await update(ref(db, 'sis'), {
      [`acara/${eid}/pinjam/${id}`]: data,
      [`unitAktif/${unit}`]: { acara: eid, loan: id },
    });
  } catch {
    // kemungkinan besar ada yang mendahului; cek ulang kuncinya
    try {
      const k2 = await get(ref(db, 'sis/unitAktif/' + unit));
      if (k2.exists()) throw new Error('TAKEN');
    } catch (e) { if (e.message === 'TAKEN') throw e; }
    throw new Error('FAIL');
  }
  return id;
}
