// Config web Firebase: proyek sis-tstindo (config web memang publik; Rules yang melindungi data)
export default {
  apiKey: 'AIzaSyCs5GERWyccFEHn50WWsqIkKw1G0yCXDVU',
  authDomain: 'sis-tstindo.firebaseapp.com',
  projectId: 'sis-tstindo',
  storageBucket: 'sis-tstindo.firebasestorage.app',
  messagingSenderId: '178956358759',
  appId: '1:178956358759:web:5d3dc78ddeb2a2923a70c2',
  // WAJIB jika Realtime Database dibuat di Singapore/Belgium. Salin dari
  // Console -> Realtime Database (URL di atas data), lalu hapus tanda // di bawah:
  // databaseURL: 'https://sis-tstindo-default-rtdb.asia-southeast1.firebasedatabase.app',
  // Jika region US (Iowa), biarkan kosong.
};
