# SIS / TST Interpreter Control (v2)

Aplikasi peminjaman receiver interpreter berbasis barcode. React + Vite + Firebase Realtime Database,
di-host di GitHub Pages. Dibuat dari nol; tidak memakai data v1 (semua data baru ada di node `sis/`).

## Alur singkat

| Siapa | Apa yang dilakukan |
|---|---|
| **Super Admin** (`#/admin`) | Membuat acara, menempel daftar Usher dari kontak HP, mencetak QR meja dan label barcode alat. |
| **Usher** (`#/usher`) | Masuk dengan nomor HP, isi nama sekali per acara, terima alat dari teknisi, catat pengembalian, kembalikan ke teknisi, tutup acara. |
| **Tamu** (`#/e/<acara>`) | Scan QR meja Usher, isi biodata sekali, lalu scan barcode receiver di dalam halaman atau ketik nomornya. Boleh meminjam banyak alat. |

### Penentuan acara (beberapa acara bersamaan)

* Setiap acara punya **QR meja** sendiri (`.../#/e/<kode-acara>`). Tamu hanya memindai QR meja Usher.
* Di halaman tamu, nomor receiver diisi dengan **tombol Scan receiver** (kamera di dalam halaman) atau **ketik manual**.
* **QR di alat hanya berisi nomor unit** (mis. `A001`), tanpa alamat situs dan tanpa acara. Karena itu label tidak bentrok
  antar acara dan tidak perlu dicetak ulang kalau alamat situs berubah.
* Acara ditentukan dari QR meja yang dipindai tamu (diingat HP 48 jam).
* Satu receiver hanya bisa dipinjam satu orang pada satu waktu, **lintas acara**, lewat kunci `sis/unitAktif/<unit>`.

### Stok dan penutupan acara (halaman Usher, tab Stok)

1. **Terima dari teknisi**: isi jumlah dan nama teknisi. Tombol hilang setelah diklik (ada tautan kecil "penerimaan susulan").
2. **Kembalikan ke teknisi**: isi jumlah yang diserahkan. Kalau kurang, catatan terisi otomatis dengan peminjam yang belum
   mengembalikan; sisa kekurangan tanpa peminjam diberi alasan (hilang, rusak, tertinggal di ruangan, lainnya).
3. **Acara Selesai** baru muncul setelah langkah 2. Receiver yang belum kembali ditandai "tidak kembali" dan kuncinya dilepas.

## Penomoran alat

Nomor unit `A001` sampai `J100` (1 huruf per 100 alat, total 1000). Aturan ini ada di `src/util.js` (`UNIT_RE`) dan
di `database.rules.json`. Mengubahnya berarti mengubah keduanya.

## Pemasangan (menimpa repo lama)

1. **Firebase Console** (proyek `sis-tstindo`):
   * Authentication, Sign-in method: aktifkan **Anonymous**.
   * Realtime Database, Rules: tempel isi `database.rules.json`, lalu **Publish**.
   * Realtime Database, Data: buat node `sis/superDaftar/62812XXXXXXXX` dengan nilai `true`
     (nomor Super Admin format `62…` tanpa spasi atau tanda hubung). Tambahkan satu per nomor.
2. **GitHub**: hapus isi repo lama, salin seluruh isi folder ini, commit ke `main`. Workflow `deploy.yaml`
   membangun dan mempublikasikan ke GitHub Pages (Settings, Pages, Source: GitHub Actions).
3. Buka alamat situs, `#/admin`, masuk dengan nomor Super Admin.
4. Data v1 di node `interpreter/` tidak dipakai lagi dan sudah tidak terbaca oleh Rules baru. Boleh dihapus lewat Console.

## Label

Bawaan 30 × 35 mm, QR 25 mm (hanya berisi nomor unit) di atas dan nomor di bawah, 6 kolom × 8 baris per A4. Semua ukuran bisa diubah di halaman
cetak (Super Admin, Cetak barcode alat) untuk menyesuaikan lembar stiker yang dibeli. Cetak 100 label per kali.
Pakai stiker polyester/vinyl matte dengan printer laser atau thermal transfer.

## Pengembangan

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # uji logika (nomor HP, tempel kontak, nomor unit)
npm run build
```

Kamera (pemindai QR) hanya jalan di HTTPS atau `localhost`.

## Uji sebelum dipakai di event

* [ ] Super Admin masuk, membuat acara, menempel 3 kontak, QR meja tercetak.
* [ ] Usher masuk dengan nomor dari daftar, **diminta nama sekali**, tidak diminta lagi saat buka ulang.
* [ ] Nomor yang tidak ada di daftar ditolak saat masuk.
* [ ] Tamu scan QR meja, pinjam 3 receiver sekaligus (scan di dalam halaman dan ketik manual).
* [ ] Receiver yang sama tidak bisa dipinjam dua orang, juga dari acara kedua.
* [ ] Usher scan satu alat, "Kembalikan semua" bekerja, jaminan ditampilkan.
* [ ] Terima dari teknisi, Kembalikan ke teknisi dengan kurang 1, catatan terisi, lalu Acara Selesai.
* [ ] Setelah acara selesai, tamu tidak bisa meminjam dan nomor alat bebas dipakai acara lain.
* [ ] Label hasil cetak terbaca oleh pemindai di halaman, di Android dan iPhone, dari jarak 10 sampai 20 cm.

## Catatan keamanan

* Login petugas memakai **nomor HP yang terdaftar** (tanpa kata sandi). Siapa pun yang tahu nomor Usher bisa masuk
  sebagai Usher acara itu. Jaga kerahasiaan daftar petugas, dan hapus petugas dari acara bila tidak lagi bertugas.
* Konfigurasi web Firebase memang publik. Yang melindungi data adalah `database.rules.json`.
* Rules belum diuji dengan Firebase Emulator di lingkungan pembuatan. Jalankan daftar uji di atas pada proyek sungguhan sebelum event.
