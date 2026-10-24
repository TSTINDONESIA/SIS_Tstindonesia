import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import cfg from './firebaseConfig.js';

const app = initializeApp(cfg);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Semua orang (tamu, Usher, Super Admin) masuk sebagai anonim.
// Callback pertama muncul setelah sesi lama dipulihkan; baru kalau kosong dibuat sesi baru.
export const ready = new Promise((resolve, reject) => {
  let mulai = false;
  onAuthStateChanged(auth, (u) => {
    if (u) resolve(u);
    else if (!mulai) {
      mulai = true;
      signInAnonymously(auth).catch(reject);
    }
  });
});
