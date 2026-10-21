# TST Interpreter Control (repo terpisah)

React + Vite + Firebase (Anonymous Auth untuk tamu dan Usher; Usher dikenali dari daftar nama + nomor HP, Email/Password hanya opsional untuk admin).
Tidak ada data atau kode Event Control di repo ini.

## Pasang
1. **Firebase project BARU** (misal `tst-interpreter`) agar data benar-benar terpisah dari Event Control.
   - Authentication -> Sign-in method: aktifkan **Anonymous** dan **Email/Password**.
   - Realtime Database -> Create (region Singapore) -> tab Rules -> tempel `database.rules.json` -> Publish.
   - Project settings -> Add web app -> salin config ke `src/firebaseConfig.js` (termasuk `databaseURL`).
   - **Usher pertama (sekali saja)**: Realtime Database -> Data, tambah `interpreter/usherDaftar/628123456789` = `Nama Usher` (nomor format 62..., tanpa 0/+/spasi; nama persis seperti yang akan diketik).
   - Setelah itu Usher masuk di `#/usher` cukup dengan **nama + nomor HP**. Usher lain ditambah dari tab Pengaturan -> Daftar Usher.
   - (Opsional) Admin lewat email: Authentication -> Users -> Add user, lalu `interpreter/usher/<UID>` = `true`.
2. Buat repo GitHub baru (**Private** juga bisa, Pages gratis butuh Public kecuali akun berbayar), push semua isi folder ini ke `main`.
3. Settings -> Pages -> Source: **GitHub Actions**.
4. Firebase -> Authentication -> Settings -> Authorized domains: tambahkan `USERNAME.github.io`.

## Alamat
- Tamu: `https://USERNAME.github.io/REPO/#/`
- Usher: `https://USERNAME.github.io/REPO/#/usher` (tab Pengaturan: nomor Usher, acara, batas jam, QR)

Lokal: `npm install` lalu `npm run dev`. Kamera/QR tamu perlu HTTPS (Pages sudah HTTPS).
