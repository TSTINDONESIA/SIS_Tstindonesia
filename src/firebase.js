import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import cfg from './firebaseConfig.js';
const app = initializeApp(cfg);
export const auth = getAuth(app);
export const db = getDatabase(app);
