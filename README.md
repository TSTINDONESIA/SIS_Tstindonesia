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

## Fitur tambahan (v1.1)
- **Dua bahasa (ID/EN)** di halaman tamu, tombol bahasa di atas; pilihan diingat, default mengikuti bahasa browser. Brand **TST Indonesia** tampil besar di header.
- **Kontak tamu: nomor WhatsApp atau email.** Pengingat Usher otomatis membuka WhatsApp (nomor) atau aplikasi email (email).
- **Tombol bantuan teknisi** di halaman tamu: satu klik langsung ke WhatsApp teknisi. Nomornya diisi Usher/Admin di `#/usher` -> Pengaturan -> *Nomor teknisi* (tersimpan di `interpreter/config/teknisi`).
- **Penilaian singkat** (bintang pelayanan + bintang alat + komentar opsional) muncul di halaman tamu setelah Usher menekan *Sudah kembali*. Hasil + rata-rata ada di tab **Penilaian** dan ikut diunduh di CSV.

**PENTING setelah update:** tempel ulang `database.rules.json` ke Realtime Database -> Rules -> Publish (ada aturan baru untuk `uid` peminjam dan `nilai`). Tanpa ini pendaftaran tamu akan ditolak.

## Banyak ruangan + Super Admin (v1.3)
Satu project Firebase, banyak ruangan/acara. **Acara utama lama tidak berubah**: alamat `#/` (tamu) dan `#/usher` tetap memakai data `interpreter/*`. Ruangan baru memakai `interpreter/rooms/<id>/*` (data, channel, teknisi, penilaian terpisah).

**Alamat**
- Tamu ruangan: `#/r/<id>`  (QR-nya ada di panel Super Admin)
- Dashboard Usher ruangan: `#/usher/<id>` (ada pilihan ruangan di bagian atas dashboard)
- Panel Super Admin: `#/admin` (buat/ubah jadwal/hapus ruangan, salin link, QR)

**Pasang (sekali)**
1. Realtime Database -> Rules -> tempel `database.rules.json` terbaru -> Publish. (Bagian aturan lama identik dengan sebelumnya; yang baru hanya menambah `rooms`, `ruangan`, `superadmin`, `superDaftar`.)
2. Jadikan seseorang Super Admin, langsung di Realtime Database -> Data (tidak bisa dari web):
   - `interpreter/usherDaftar/628123456789` = `Nama` (kalau belum ada), dan
   - `interpreter/superDaftar/628123456789` = `true`
   (atau untuk akun email: `interpreter/superadmin/<UID>` = `true` dan `interpreter/usher/<UID>` = `true`).
3. Login di `#/usher` dengan nama + nomor itu -> muncul tombol **⚙️ Kelola ruangan**.

**Alur tiap acara**: Super Admin buat ruangan (nama, tanggal, jam mulai/selesai) -> buka dashboard ruangan -> Pengaturan -> isi **Channel bahasa** -> cetak QR dari panel Super Admin. Nomor teknisi dan teks pengingat disalin dari acara utama saat ruangan dibuat; daftar Usher dan channel mulai kosong. Menghapus Usher di dalam ruangan hanya melepas dari ruangan itu, tidak mencabut hak login.

**Akses per ruangan (v1.4)**: dashboard ruangan hanya bisa dibuka oleh petugas yang ditugaskan Super Admin (panel `#/admin` -> tombol **👥 Petugas** pada ruangan) dan oleh Super Admin. Dijaga di Rules database, bukan hanya disembunyikan di menu. Acara utama (default) tetap bisa dibuka semua Usher seperti semula. Ruangan yang belum punya petugas hanya bisa dibuka Super Admin. Pasang Rules terbaru bersamaan dengan kode baru.

## Jaminan peminjaman (v1.5)
- **Super Admin**: panel `#/admin` -> tombol **🪪 Jaminan** (di Acara utama atau tiap ruangan): aktifkan, lalu centang jenis yang boleh dipilih (KTP, SIM, Paspor, Kartu nama, Password/PIN HP). Berlaku per ruangan/acara; minimal satu jenis (disarankan Kartu nama).
- **Tamu**: bila aktif, form menampilkan pilihan jaminan (wajib pilih satu). Menambah alat atas nama yang sama memakai jaminan yang sama.
- **Usher**: tiap peminjam menampilkan ikon + nama jaminan, dan dialog "Sudah kembali" mengingatkan jaminan mana yang harus dikembalikan. Kolom Jaminan ikut di CSV/PDF.
- Hanya JENIS jaminan yang dicatat, bukan nomor KTP/password. Password tidak diketik di web.
- **Tempel ulang `database.rules.json`** (field `jaminan`, `kembaliOleh`, `kembaliOlehHp`) lalu Publish.
