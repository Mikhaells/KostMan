# KosMan — Sistem Manajemen Kos & Kontrakan

Implementasi lengkap MVP v1.0 sesuai [PRD.md](./PRD.md): backend Go + PostgreSQL dan frontend React + TypeScript.

## Arsitektur

```
.
├── backend/                 Go 1.22+, Chi, sqlx/pgx, JWT, cron, zerolog
│   ├── cmd/server           entrypoint API + static file server
│   ├── cmd/migrate          runner migrasi SQL
│   ├── cmd/seed             data contoh
│   ├── internal/config      konfigurasi env
│   ├── internal/database    koneksi & migrasi
│   ├── internal/model       model domain + tipe jsonb
│   ├── internal/service     aturan bisnis per modul
│   ├── internal/handler     HTTP handler + router
│   ├── internal/middleware  JWT auth, RBAC, rate limit
│   ├── internal/job         cron (auto-billing, overdue, reminder)
│   ├── internal/mailer      SMTP (gomail)
│   ├── internal/storage     upload lokal + validasi MIME
│   ├── internal/pdf         invoice, kontrak, laporan
│   ├── migrations           skema PostgreSQL 15
│   └── docs/openapi.yaml    dokumentasi API
├── frontend/                React 18 + Vite + TypeScript + Tailwind
│   └── src
│       ├── components/ui    komponen UI reusable
│       ├── components/layout shell, sidebar, navbar
│       ├── features        halaman per modul (feature-based)
│       ├── lib             API client, formatter, helper
│       ├── store           Zustand auth store
│       └── types           tipe domain
├── docker-compose.yml       PostgreSQL 15 + Mailpit
└── .env.example             contoh environment
```

Backend disajikan sebagai **satu binary**: API, file upload, dan build frontend (`go:embed` digantikan dengan static file server yang melayani `frontend/dist`).

## Prasyarat

- Node.js 20+ & npm
- Go 1.22+
- PostgreSQL 15 (bisa via Docker) **atau** jalankan `docker compose up -d`

## Menjalankan backend

```bash
cp .env.example .env
docker compose up -d                # Postgres :5432, Mailpit :1025 / UI :8025

cd backend
cp .env.example .env                # sesuaikan DATABASE_URL bila perlu
go mod tidy
make migrate-up                     # atau: go run ./cmd/migrate up
make seed                           # data contoh (opsional)
make run                            # http://localhost:8081
```

Login seed (password semua `Admin123`):

| Role | Email |
| :--- | :--- |
| Owner | `owner@kosman.id` |
| Manager | `manager@kosman.id` |
| Penyewa | `penyewa1@kosman.id`, `penyewa2@kosman.id`, `penyewa3@kosman.id` |

## Menjalankan frontend

```bash
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

Buat `frontend/.env` jika API tidak di `localhost:8080`:

```
VITE_API_URL=http://localhost:8081/api/v1
```

Untuk build produksi yang dilayani backend:

```bash
cd frontend && npm run build
cd ../backend && make run
```

Buka `http://localhost:8081` — SPA dilayani langsung oleh Go.

> Port `8081` dipakai karena `8080` sudah dipakai proses `httpd` di mesin lokal. Ubah `APP_PORT`, `APP_URL`, dan `VITE_API_URL` bila ingin port lain.

## Modul yang tersedia

| Modul | Fitur utama |
| :--- | :--- |
| Auth & RBAC | register, login, refresh token, reset password, lock 5x gagal, manajemen user |
| Properti | CRUD, soft delete + restore, foto (maks 10), fasilitas, status |
| Kamar | CRUD, harga (snapshot di kontrak), status otomatis, unique nomor per properti |
| Penyewa | CRUD, NIK terenkripsi AES-256, KTP wajib, akun portal, riwayat sewa |
| Kontrak | nomor otomatis, perpanjangan, pengakhiran, PDF, reminder H-7 |
| Tagihan | invoice otomatis & manual, item tambahan, denda, void, PDF, cron overdue |
| Pembayaran | bukti transfer, verifikasi/tolak, partial payment, cash manual |
| Tiket | keluhan penyewa, prioritas (urgent merah), status, resolusi, notifikasi |
| Dashboard & laporan | KPI, grafik 6 bulan, okupansi, 5 laporan, export XLSX/PDF |
| Notifikasi | in-app + badge, email SMTP, template per event |
| Pengaturan | profil, rekening, aturan denda, template, reminder, branding |

## Cron job

- `0 0 * * *` — tandai tagihan terlambat + denda, selesaikan kontrak expired, reminder H-3, kontrak H-7
- `0 0 1 * *` — generate tagihan bulanan otomatis untuk semua kontrak aktif

Matikan dengan `CRON_ENABLED=false`.

## API

Dokumentasi OpenAPI: [`backend/docs/openapi.yaml`](./backend/docs/openapi.yaml).
Semua endpoint berada di prefix `/api/v1`. Response konsisten:

```json
{ "success": true, "message": "OK", "data": {...}, "meta": {...} }
```

Error:

```json
{ "success": false, "message": "Pesan error", "code": "BAD_REQUEST" }
```

## Keamanan

- Password bcrypt cost 12; JWT access 24 jam + refresh 7 hari (rotation)
- Akun terkunci 15 menit setelah 5 kali login gagal
- RBAC: super_admin / owner / manager / tenant, pengecekan di middleware & service
- NIK dienkripsi AES-256-GCM at-rest; upload divalidasi MIME & ukuran
- Rate limit 100 req/menit untuk endpoint publik, CORS, parameterized query

## Testing

```bash
cd backend && go test ./... -cover
cd frontend && npm run lint && npm run build
```

## Deploy gratis: Render + Neon

Proyek ini sudah disiapkan untuk deploy sebagai **satu web service** di Render: Go melayani API **dan** SPA (`frontend/dist`), jadi tidak perlu hosting frontend terpisah. `render.yaml` di root sudah berisi blueprint-nya.

### 1. Database Neon (gratis permanen)

1. Daftar di <https://neon.com>, buat project, salin connection string (`sslmode=require`).
2. Migrasi dijalankan otomatis saat server start, dan **seed data contoh dijalankan otomatis sekali** lewat `initialDeployHook` di `render.yaml` (Render free tidak menyediakan shell).

Seed **aman dijalankan ulang**: jika database sudah berisi user, seed otomatis dilewati sehingga data produksi tidak terhapus. Untuk mengulang seed dari laptop:

```powershell
cd backend
$env:DATABASE_URL='postgres://<user>:<pass>@<host>/<db>?sslmode=require'
go run ./cmd/seed
```

Gunakan `$env:FORCE_SEED='true'` hanya jika Anda sengaja ingin menghapus semua data contoh dan mengisinya ulang.

### 2. Email & upload (disarankan)

- **Resend** (<https://resend.com>): buat API key → `RESEND_API_KEY`, verifikasi domain → `SMTP_FROM`. Render memblokir SMTP port 25/465/587, jadi backend memakai HTTPS API saat `RESEND_API_KEY` diisi.
- **Cloudinary** (<https://cloudinary.com>): buat *unsigned upload preset* → isi `CLOUDINARY_CLOUD_NAME` dan `CLOUDINARY_UPLOAD_PRESET`. Tanpa ini, upload tetap berfungsi tetapi file hilang saat Render restart (filesystem bersifat ephemeral).

### 3. Deploy

1. Push project ke GitHub.
2. Render Dashboard → **New → Blueprint** → pilih repo → `render.yaml` terdeteksi otomatis.
3. Isi environment variable bertanda `sync: false`: `DATABASE_URL`, `APP_URL` (`https://<nama>.onrender.com`), `SMTP_FROM`, `RESEND_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`.
4. `JWT_SECRET`, `JWT_REFRESH_SECRET`, dan `ENCRYPTION_KEY` dibuat otomatis oleh Render.
5. Klik **Deploy**. Build command akan menjalankan `npm ci`, `npm run build`, lalu `go build`.

Setelah seed berjalan, login dengan `owner@kosman.id` (atau `manager@kosman.id`, `penyewa1@kosman.id`) / password **`Admin123`**. Segera ganti password tersebut untuk penggunaan nyata.

### Keterbatasan tier gratis

- Render menghentikan web service setelah 15 menit tanpa traffic; bangun lagi ±1 menit.
- Neon men-suspend compute setelah 5 menit idle; bangun lagi dalam <1 detik.
- `CRON_ENABLED=false` di `render.yaml` karena proses dapat tidur. Gunakan scheduler eksternal (mis. cron-job.org memanggil endpoint) jika penagihan otomatis diperlukan.
- Neon free: 1 GB storage dan 100 CU-hours per bulan.

## Catatan

- Email saat development tidak benar-benar dikirim bila `SMTP_HOST=localhost` (hanya log). Gunakan Mailpit di `localhost:1025` dan lihat inbox di `http://localhost:8025`.
- File upload disimpan di `backend/uploads` dan di-serve melalui `/uploads/...` untuk lokal. Jika `CLOUDINARY_CLOUD_NAME` dan `CLOUDINARY_UPLOAD_PRESET` diisi, upload otomatis ke Cloudinary dan URL absolut disimpan (cocok untuk Render yang filesystem-nya ephemeral).
- Untuk produksi: set `APP_ENV=production`, ganti semua secret, aktifkan HTTPS, dan arahkan `DATABASE_URL` ke instance Postgres dengan backup harian.
