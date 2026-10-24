import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, get, set } from 'firebase/database';
import cfg from './firebaseConfig.js';

const app = initializeApp(cfg);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Setiap sesi anonim diberi penanda 'tamu' di sis/sesi/<uid> bila belum punya nomor petugas.
// Rules memeriksa sis/sesi/<uid> untuk hak petugas; tanpa nilai itu pemeriksaannya error dan tamu ditolak saat meminjam.
// Nilai 'tamu' tidak pernah cocok dengan daftar petugas/Super Admin, jadi tidak memberi hak apa pun.
async function tandai(u) {
  try {
    const r = ref(db, 'sis/sesi/' + u.uid);
    if (!(await get(r)).exists()) await set(r, 'tamu');
  } catch { /* Rules lama atau offline: lanjut tanpa penanda */ }
}

// Semua orang (tamu, Usher, Super Admin) masuk sebagai anonim.
// Callback pertama muncul setelah sesi lama dipulihkan; baru kalau kosong dibuat sesi baru.
export const ready = new Promise((resolve, reject) => {
  let mulai = false;
  onAuthStateChanged(auth, (u) => {
    if (u) tandai(u).then(() => resolve(u));
    else if (!mulai) {
      mulai = true;
      signInAnonymously(auth).catch(reject);
    }
  });
});
