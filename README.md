# TST Interpreter Control (repo terpisah)

React + Vite + Firebase (Anonymous Auth untuk tamu, Email/Password untuk Usher).
Tidak ada data atau kode Event Control di repo ini.

## Pasang
1. **Firebase project BARU** (misal `tst-interpreter`) agar data benar-benar terpisah dari Event Control.
   - Authentication -> Sign-in method: aktifkan **Anonymous** dan **Email/Password**.
   - Realtime Database -> Create (region Singapore) -> tab Rules -> tempel `database.rules.json` -> Publish.
   - Project settings -> Add web app -> salin config ke `src/firebaseConfig.js` (termasuk `databaseURL`).
   - Authentication -> Users -> Add user (akun Usher).
   - Realtime Database -> Data: tambah `interpreter/usher/<UID usher>` = `true` (boolean).
2. Buat repo GitHub baru (**Private** juga bisa, Pages gratis butuh Public kecuali akun berbayar), push semua isi folder ini ke `main`.
3. Settings -> Pages -> Source: **GitHub Actions**.
4. Firebase -> Authentication -> Settings -> Authorized domains: tambahkan `USERNAME.github.io`.

## Alamat
- Tamu: `https://USERNAME.github.io/REPO/#/`
- Usher: `https://USERNAME.github.io/REPO/#/usher` (tab Pengaturan: nomor Usher, acara, batas jam, QR)

Lokal: `npm install` lalu `npm run dev`. Kamera/QR tamu perlu HTTPS (Pages sudah HTTPS).
