# KosMan — Sistem Manajemen Kos & Kontrakan

Implementasi lengkap MVP v1.0 sesuai [PRD.md](./PRD.md). Seluruh aplikasi (UI + API + database) ada di root repo ini dan bisa di-deploy gratis ke **Vercel Hobby + Neon** tanpa kartu kredit.

## Arsitektur

```
.
├── app/
│   ├── [[...slug]]/          SPA shell (semua rute UI)
│   ├── api/v1/[...path]/     dispatcher ~72 endpoint API
│   ├── api/cron/[job]/       scheduled job (Vercel Cron)
│   ├── app-entry.tsx         dynamic import SPA (ssr: false)
│   └── spa.tsx               QueryClient + BrowserRouter + App
├── db/schema.sql             skema Postgres idempoten (sumber)
├── lib/server/               config, db, JWT, crypto, HTTP, PDF, notifikasi, skema embed
├── lib/services/             logika bisnis (hasil port dari Go)
├── src/                      UI React (dipakai ulang dari versi Vite)
├── public/                   aset statis
├── .env.example              contoh environment
├── vercel.json               jadwal cron harian & bulanan
└── PRD.md                    dokumen produk
```

UI dan API berada di **satu origin**: `/api/v1/...`. Response envelope tetap kompatibel:

```json
{ "success": true, "message": "OK", "data": {...}, "meta": {...} }
{ "success": false, "message": "Pesan error", "error": "Pesan error", "code": "BAD_REQUEST" }
```

## Prasyarat

- Node.js 20+ dan npm
- PostgreSQL 15+ (lokal) **atau** akun Neon gratis untuk produksi

Tidak perlu Go, Docker, atau kartu kredit untuk menjalankan aplikasi ini.

## Menjalankan lokal

```bash
cp .env.example .env.local      # sesuaikan DATABASE_URL bila perlu
npm install
npm run dev                     # http://localhost:3000
```

`DATABASE_URL` lokal default: `postgres://postgres:password@127.0.0.1:5432/kosman?sslmode=disable`.

Skema dan data contoh dibuat **otomatis pada request pertama** (migrasi dengan advisory lock, seed idempoten). Seed dilewati bila tabel `users` sudah berisi data, jadi tidak menimpa database yang sudah dipakai. Skema juga di-embed di `lib/server/schema.ts` supaya tetap bekerja di filesystem serverless Vercel yang read-only.

Login seed (password semua `Admin123`):

| Role | Email |
| :--- | :--- |
| Owner | `owner@kosman.id` |
| Manager | `manager@kosman.id` |
| Penyewa | `penyewa1@kosman.id`, `penyewa2@kosman.id`, `penyewa3@kosman.id` |

> **Segera ganti password seed** sebelum dipakai untuk data nyata.

Perintah lain:

```bash
npm run typecheck               # tsc --noEmit
npm run build                   # next build
npm start                       # jalankan build produksi di :3000
```

> Script di `package.json` memanggil binary lewat `node ./node_modules/...` secara eksplisit. Ini menghindari masalah shim `.cmd` npm di Windows ketika path folder mengandung karakter `&` (seperti `Sistem Manajemen Kos & Kontrakan`).

## Deploy gratis: Vercel Hobby + Neon

> Panduan lengkap langkah demi langkah ada di [DEPLOY.md](./DEPLOY.md).

### 1. Neon (database, gratis tanpa kartu)

1. Daftar di <https://neon.com>, buat project dan database.
2. Salin connection string pooler dengan `sslmode=require`, misalnya:
   `postgres://<user>:<pass>@<host-pooler>/<db>?sslmode=require`
3. Tidak perlu menjalankan migrasi manual — aplikasi membuat skema + seed otomatis saat request pertama.

### 2. Vercel

1. Push repo ke GitHub (`Mikhaells/KostMan`).
2. <https://vercel.com/new> → **Import Project** → pilih repo.
3. **Root Directory = `.` (kosongkan)** karena aplikasi sudah ada di root. Framework terdeteksi sebagai Next.js; build command `npm run build`, output `.next`.
4. Isi **Environment Variables** (Production + Preview):

| Variable | Nilai |
| :--- | :--- |
| `DATABASE_URL` | connection string Neon di atas |
| `APP_URL` | `https://<nama-project>.vercel.app` (atau domain kustom) |
| `JWT_SECRET` | string acak ≥ 32 karakter |
| `JWT_REFRESH_SECRET` | string acak berbeda ≥ 32 karakter |
| `ENCRYPTION_KEY` | string acak ketiga ≥ 32 karakter |
| `CRON_SECRET` | string acak untuk mengamankan endpoint cron |
| `SMTP_FROM` | `KosMan <noreply@domain-anda.com>` (opsional) |
| `RESEND_API_KEY` | API key Resend (opsional) |
| `CLOUDINARY_CLOUD_NAME` | nama cloud Cloudinary (opsional) |
| `CLOUDINARY_UPLOAD_PRESET` | unsigned upload preset (opsional) |

   Buat secret acak di PowerShell:

   ```powershell
   -join ((1..64) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
   ```

5. Deploy. Buka URL Vercel, login `owner@kosman.id` / `Admin123`, lalu **ganti password**.

### 3. Email & upload (opsional, tetap gratis)

- **Resend** (<https://resend.com>): pakai HTTPS API, cocok untuk serverless. Tanpa `RESEND_API_KEY`, email tidak dikirim tetapi seluruh alur aplikasi tetap berjalan.
- **Cloudinary** (<https://cloudinary.com>): buat *unsigned upload preset*. Tanpa ini, upload disimpan sebagai **data URL** di database sehingga tetap bekerja di filesystem serverless yang read-only (perhatikan batas ukuran data URL).
- Ukuran upload dibatasi `MAX_UPLOAD_MB` (default 5 MB).

### 4. Cron / auto-billing

`vercel.json` mendaftarkan dua scheduled job lewat **Vercel Schedules** (dulu bernama Cron Jobs, tersedia di semua plan termasuk Hobby):

| Jadwal (UTC) | Endpoint | Tugas |
| :--- | :--- | :--- |
| `0 0 * * *` | `/api/cron/daily` | tandai tagihan terlambat + denda, selesaikan kontrak expired, reminder H-3, notifikasi kontrak H-7 |
| `0 0 1 * *` | `/api/cron/monthly` | generate tagihan bulanan untuk kontrak aktif |

Vercel mengirim `Authorization: Bearer <CRON_SECRET>`; endpoint menolak request tanpa otorisasi. Untuk uji manual:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<nama-project>.vercel.app/api/cron/daily
```

Tombol **Generate tagihan** di halaman Tagihan juga memanggil fungsi bulanan yang sama secara manual.

### Keterbatasan tier gratis

- Vercel Hobby dan Neon Free tidak meminta kartu kredit untuk pemakaian personal.
- Function Vercel bisa cold start beberapa detik setelah idle; Neon compute juga suspend setelah idle (bangun < 1 detik).
- Resend free biasanya membatasi jumlah email per hari; Cloudinary free punya kuota storage/bandwidth.
- Neon Free: 1 GB storage dan 100 CU-hours per bulan.

## Modul yang tersedia

| Modul | Fitur utama |
| :--- | :--- |
| Auth & RBAC | register, login, refresh token rotation, reset password, lock 5x gagal, manajemen user |
| Properti | CRUD, soft delete + restore, foto, fasilitas, status |
| Kamar | CRUD, harga (snapshot di kontrak), status, unique nomor per properti |
| Penyewa | CRUD, NIK terenkripsi AES-256-GCM, KTP wajib, akun portal, riwayat sewa |
| Kontrak | nomor otomatis, perpanjangan, pengakhiran, PDF |
| Tagihan | invoice otomatis & manual, item tambahan, denda, void, PDF, cron overdue |
| Pembayaran | bukti transfer, verifikasi/tolak, partial payment, cash manual |
| Tiket | keluhan penyewa, prioritas, status, resolusi, notifikasi |
| Dashboard & laporan | KPI, grafik 6 bulan, okupansi, 5 laporan, export XLSX/PDF |
| Notifikasi | in-app + badge, email via Resend |
| Pengaturan | rekening bank, aturan denda, template, reminder, branding |

## API

Semua endpoint berada di prefix `/api/v1` (same-origin). Daftar endpoint dapat dilihat dari dispatcher di [`app/api/v1/[...path]/route.ts`](./app/api/v1/[...path]/route.ts).

Ringkasan hak akses:

- **Public**: register, login, refresh, forgot/reset password.
- **Authenticated**: profil, notifikasi, data diri penyewa, tagihan & kontrak sendiri, tiket, upload.
- **Owner/Manager/Super Admin**: kamar, penyewa, kontrak, tagihan, pembayaran, tiket.
- **Owner/Super Admin**: properti, user, dashboard, laporan, pengaturan.

Penyewa hanya melihat tagihan/kontrak/tiket miliknya (scoping di service, bukan hanya di UI).

## Keamanan

- Password bcrypt cost 12; JWT access (default 24 jam) + refresh (7 hari) dengan rotation.
- Akun terkunci 15 menit setelah 5 kali login gagal.
- RBAC `super_admin` / `owner` / `manager` / `tenant` dicek di dispatcher **dan** service.
- NIK dienkripsi AES-256-GCM at-rest; hash NIK tidak dikirim ke klien.
- Query parametrized, CORS, batas ukuran upload, endpoint cron dilindungi secret.

## Catatan

- Port `3000` dipakai Next.js; port `8081` dulu dipakai backend Go/httpd (folder legacy sudah dihapus).
- UI tetap bahasa Indonesia dan responsif; seluruh halaman lama dipakai ulang tanpa rewrite.
- Data URL hasil upload tersimpan di kolom teks; untuk produksi dengan banyak gambar, sebaiknya aktifkan Cloudinary.
- Migrasi idempoten: `db/schema.sql` aman dijalankan berulang kali.
