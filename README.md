# KosMan — Sistem Manajemen Kos & Kontrakan

Implementasi lengkap MVP v1.0 sesuai [PRD.md](./PRD.md). Aplikasi aktif adalah **Next.js penuh** (UI + API + database) yang bisa di-deploy gratis ke **Vercel Hobby + Neon** tanpa kartu kredit.

## Arsitektur

```
.
├── web/                       APLIKASI AKTIF — Next.js 14 App Router
│   ├── app/
│   │   ├── [[...slug]]/        SPA shell (semua rute UI)
│   │   ├── api/v1/[...path]/   dispatcher ~72 endpoint API
│   │   ├── api/cron/[job]/     scheduled job (Vercel Cron)
│   │   ├── app-entry.tsx       dynamic import SPA (ssr: false)
│   │   └── spa.tsx             QueryClient + BrowserRouter + App
│   ├── db/schema.sql          skema Postgres idempoten
│   ├── lib/server/            config, db, JWT, crypto, HTTP, PDF, notifikasi
│   ├── lib/services/          logika bisnis (hasil port dari Go)
│   ├── src/                   UI React (dipakai ulang dari frontend/)
│   ├── public/                aset statis
│   ├── .env.example           contoh environment
│   └── vercel.json            jadwal cron harian & bulanan
├── backend/                   LEGACY — referensi Go (Chi, sqlx, cron, SMTP)
├── frontend/                  LEGACY — referensi Vite (sumber web/src/)
├── Dockerfile, render.yaml    LEGACY — opsi deploy lama
└── docker-compose.yml         LEGACY — Postgres + Mailpit untuk development
```

UI dan API berada di **satu origin**: `/api/v1/...`. Response envelope tetap kompatibel:

```json
{ "success": true, "message": "OK", "data": {...}, "meta": {...} }
{ "success": false, "message": "Pesan error", "error": "Pesan error", "code": "BAD_REQUEST" }
```

## Prasyarat

- Node.js 20+ dan npm
- PostgreSQL 15+ (lokal) **atau** akun Neon gratis untuk produksi

Tidak perlu Go, Docker, atau kartu kredit untuk menjalankan aplikasi aktif.

## Menjalankan lokal

```bash
cd web
cp .env.example .env.local        # sesuaikan DATABASE_URL bila perlu
npm install
npm run dev                       # http://localhost:3000
```

`DATABASE_URL` lokal default: `postgres://postgres:password@127.0.0.1:5432/kosman?sslmode=disable`.

Skema dan data contoh dibuat **otomatis pada request pertama** (migrasi dengan advisory lock, seed idempoten). Seed dilewati bila tabel `users` sudah berisi data, jadi tidak menimpa database yang sudah dipakai.

Login seed (password semua `Admin123`):

| Role | Email |
| :--- | :--- |
| Owner | `owner@kosman.id` |
| Manager | `manager@kosman.id` |
| Penyewa | `penyewa1@kosman.id`, `penyewa2@kosman.id`, `penyewa3@kosman.id` |

> **Segera ganti password seed** sebelum dipakai untuk data nyata.

Perintah lain:

```bash
cd web
npm run typecheck               # tsc --noEmit
npm run build                   # next build
npm start                       # jalankan build produksi di :3000
```

## Deploy gratis: Vercel Hobby + Neon ✅

### 1. Neon (database, gratis tanpa kartu)

1. Daftar di <https://neon.com>, buat project dan database.
2. Salin connection string pooler dengan `sslmode=require`, misalnya:
   `postgres://<user>:<pass>@<host-pooler>/<db>?sslmode=require`
3. Tidak perlu menjalankan migrasi manual — aplikasi membuat skema + seed otomatis saat request pertama.

### 2. Vercel

1. Push repo ke GitHub (`Mikhaells/KostMan`).
2. <https://vercel.com/new> → **Import Project** → pilih repo.
3. Set **Root Directory = `web`**. Framework terdeteksi sebagai Next.js; build command `npm run build`, output `.next`.
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

`web/vercel.json` mendaftarkan dua scheduled job (Vercel Cron tersedia di semua plan, termasuk Hobby):

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

Semua endpoint berada di prefix `/api/v1` (same-origin). Dokumentasi OpenAPI lama ada di [`backend/docs/openapi.yaml`](./backend/docs/openapi.yaml) — sebagian besar endpoint identik setelah port.

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

## Deploy legacy (referensi, tidak disarankan)

Folder `backend/`, `frontend/`, `Dockerfile`, `render.yaml`, dan `docker-compose.yml` dipertahankan sebagai **cadangan/referensi** dari arsitektur Go + Vite. Panduan lama (Go binary, Docker, Render Blueprint, Zeabur) sengaja tidak dipakai lagi karena:

- Butuh build Go + Node sekaligus dan proses yang terus hidup (tidak cocok untuk serverless gratis).
- Render meminta verifikasi kartu untuk web service tertentu.
- Versi Next.js di `web/` menyatukan UI, API, migrasi, dan cron dalam satu deployment.

Bila ingin memakai kembali jalur lama, lihat riwayat commit sebelum port Next.js.

## Catatan

- Port `3000` dipakai Next.js; port `8081` dulu dipakai backend Go/httpd.
- UI tetap bahasa Indonesia dan responsif; seluruh halaman lama dipakai ulang tanpa rewrite.
- Data URL hasil upload tersimpan di kolom teks; untuk produksi dengan banyak gambar, sebaiknya aktifkan Cloudinary.
- Migrasi idempoten: `web/db/schema.sql` aman dijalankan berulang kali.
