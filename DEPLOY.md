# Deploy KosMan ke Neon + Vercel (gratis, tanpa kartu kredit)

Panduan ini untuk repo yang **sudah ada di root** (`app/`, `lib/`, `src/`, `vercel.json`, dll.). Tidak perlu Go, Docker, atau PostgreSQL lokal untuk deploy. Estimasi: 10–15 menit.

- **Neon** = PostgreSQL gratis (tempat data).
- **Vercel Hobby** = hosting UI + API Next.js (tempat aplikasi jalan).

> Nama menu di dashboard bisa sedikit berubah. Yang penting: cari label **Free**, **Connection Details**, **Environment Variables**, **Root Directory**, dan **Schedules/Cron Jobs**.

---

## 0. Persiapan

1. Pastikan GitHub repo `Mikhaells/KostMan`, branch `main`, sudah berisi commit terakhir.
2. Siapkan akun:
   - GitHub (untuk login ke Neon & Vercel)
   - Neon <https://neon.tech>
   - Vercel <https://vercel.com>
3. Siapkan password manager/catatan privat untuk menyimpan 5 nilai sensitif:
   `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`.
4. Jangan commit `.env.local` atau connection string ke GitHub.

---

## 1. Buat database di Neon

1. Buka <https://neon.tech> → **Sign up / Log in with GitHub** → authorize.
2. Saat ditanya plan, pilih **Free**. Jangan isi form kartu kredit. Jika muncul form kartu, kembali dan pilih plan Free.
3. Klik **Create project** / **New Project**:
   - **Project name**: `kosman` (bebas)
   - **Region**: pilih yang dekat dengan Anda, misalnya `Singapore (ap-southeast-1)`. Vercel default di `iad1` (Washington); untuk latensi rendah, nanti bisa ubah region Function Vercel ke `sin1` di Project Settings → Functions.
   - **Postgres version**: biarkan default.
4. Setelah project jadi, buka **Connection Details** atau tombol **Connect**.
5. Pilih:
   - **Role**: `neondb_owner`
   - **Database**: `neondb`
   - **Pooled connection**: **aktif** (host mengandung `-pooler`)
6. Salin connection string. Contoh:

```text
postgresql://neondb_owner:xxxxxx@ep-nama-project-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

7. Pastikan:
   - Ada `?sslmode=require` di akhir. **Jangan** pakai `sslmode=disable`.
   - Gunakan tombol **Copy** dari Neon. Jika password mengandung `@`, `#`, `/`, `:`, `?`, atau `&`, Neon sudah meng-encode-nya. Jangan edit manual.
8. Simpan nilai ini sebagai **`DATABASE_URL`**.

> Tidak perlu menjalankan SQL manual. Aplikasi membuat tabel + data contoh otomatis pada request pertama setelah deploy.

---

## 2. Buat 4 secret acak

Jalankan di PowerShell (di komputer Anda):

```powershell
1..4 | ForEach-Object { -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) }) }
```

Akan keluar 4 baris. Beri label:

| Baris | Dipakai untuk |
| :--- | :--- |
| 1 | `JWT_SECRET` |
| 2 | `JWT_REFRESH_SECRET` |
| 3 | `ENCRYPTION_KEY` |
| 4 | `CRON_SECRET` |

**Penting:** keempatnya harus berbeda. `ENCRYPTION_KEY` dipakai untuk enkripsi NIK. Untuk database produksi yang benar-benar baru, bebas pakai nilai acak. Jika nanti Anda mau memindahkan data lama dari lokal, gunakan `ENCRYPTION_KEY` yang sama seperti di `.env.local`; jika tidak, NIK lama tidak bisa dibaca.

---

## 3. Import repo ke Vercel

1. Buka <https://vercel.com/new>.
2. Pilih **Continue with GitHub** → authorize Vercel.
3. Klik **Add New… → Project**, cari repo `KostMan`, klik **Import**.
4. Di halaman **Configure Project**, isi:

| Field | Nilai |
| :--- | :--- |
| Project Name | `kosman` (bebas) |
| **Root Directory** | **Klik Edit, lalu kosongkan / pilih `.`** |
| Framework Preset | Next.js (terdeteksi otomatis) |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Install Command | `npm install` |
| Node.js Version | 20.x (atau default Vercel juga bisa) |

> **Paling sering salah:** Root Directory masih terisi `web`. Karena aplikasi sudah di root, field ini **harus kosong**. Kalau tidak, build gagal dengan error module tidak ditemukan.

5. **Jangan klik Deploy dulu.** Isi environment variables dulu di langkah berikutnya.

---

## 4. Isi Environment Variables

Masih di halaman Configure Project, buka **Environment Variables**. Tambahkan satu per satu. Centang **Production** dan **Preview** (centang **Development** juga boleh kalau mau pakai `vercel env pull`).

| Nama | Nilai | Wajib |
| :--- | :--- | :--- |
| `DATABASE_URL` | Connection string pooled Neon dari langkah 1 | ✅ |
| `JWT_SECRET` | Secret baris 1 | ✅ |
| `JWT_REFRESH_SECRET` | Secret baris 2 | ✅ |
| `ENCRYPTION_KEY` | Secret baris 3 | ✅ |
| `CRON_SECRET` | Secret baris 4 | ✅ |
| `APP_URL` | `https://<nama-project>.vercel.app` — lihat catatan di bawah tabel | ✅ (disarankan) |
| `SMTP_FROM` | `KosMan <noreply@domain-anda.com>` | opsional |
| `RESEND_API_KEY` | API key Resend | opsional |
| `CLOUDINARY_CLOUD_NAME` | Nama cloud Cloudinary | opsional |
| `CLOUDINARY_UPLOAD_PRESET` | Unsigned upload preset | opsional |
| `MAX_UPLOAD_MB` | `5` (default) | opsional |

**Catatan `APP_URL`:**
- Sebelum deploy pertama, URL belum tahu. Boleh dikosongkan sementara — kode otomatis memakai `VERCEL_URL`.
- Setelah deploy sukses, isi dengan URL asli, lalu **Redeploy** agar tautan reset password di email mengarah ke domain produksi.

**Catatan `CRON_SECRET`:**
- Kalau dikosongkan, endpoint cron hanya mengandalkan user-agent `vercel-cron/`. Sebaiknya tetap diisi.

---

## 5. Deploy & verifikasi pertama

1. Klik **Deploy**. Tunggu sekitar 1–3 menit.
2. Buka `https://<nama-project>.vercel.app/login`.
3. Login dengan:
   - Email: `owner@kosman.id`
   - Password: `Admin123`

> Request pertama memicu migrasi + seed, jadi bisa memakan 5–15 detik. Kalau muncul 500/timeout, **refresh sekali**, lalu cek **Deployments → latest → Runtime Logs** bila masih gagal.

### Cek isi database di Neon SQL Editor

```sql
SELECT count(*) AS users FROM users;        -- harus 5
SELECT count(*) AS properties FROM properties; -- harus 2
SELECT count(*) AS invoices FROM invoices;  -- harus 3
```

### Cek API via PowerShell

```powershell
$base = 'https://<nama-project>.vercel.app'
$login = Invoke-RestMethod -Uri "$base/api/v1/auth/login" -Method Post -ContentType 'application/json' -Body '{"email":"owner@kosman.id","password":"Admin123"}'
$login.success                       # True
$token = $login.data.access_token
Invoke-RestMethod -Uri "$base/api/v1/dashboard" -Headers @{ Authorization = "Bearer $token" }
```

---

## 6. Ganti password seed (wajib)

Halaman ubah password di UI saat ini hanya ada di portal penyewa, jadi untuk **owner/manager** pakai API:

```powershell
$base = 'https://<nama-project>.vercel.app'

$login = Invoke-RestMethod -Uri "$base/api/v1/auth/login" -Method Post -ContentType 'application/json' -Body '{"email":"owner@kosman.id","password":"Admin123"}'
$token = $login.data.access_token

Invoke-RestMethod -Uri "$base/api/v1/auth/change-password" -Method Post `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType 'application/json' `
  -Body '{"old_password":"Admin123","new_password":"GantiDenganPasswordKuat123!"}'
```

Ulangi untuk `manager@kosman.id` dan akun penyewa jika dipakai. Atau buat user baru lewat menu **Users** (`/users`) lalu nonaktifkan user seed.

---

## 7. Cron / auto-billing

`vercel.json` di repo sudah memakai **Vercel Schedules** (nama baru untuk Cron Jobs):

| Nama schedule | Jadwal (UTC) | Endpoint | Tugas |
| :--- | :--- | :--- | :--- |
| `kosman-daily` | `0 0 * * *` | `/api/cron/daily` | tandai tagihan terlambat + denda, selesaikan kontrak expired, reminder H-3, notifikasi kontrak H-7 |
| `kosman-monthly` | `0 0 1 * *` | `/api/cron/monthly` | generate tagihan bulanan untuk kontrak aktif |

Di dashboard Vercel, buka **Schedules** (atau **Cron Jobs** tergantung versi UI). Harus muncul dua entri di atas.

### Uji manual dari dashboard
Pilih schedule → **Run Schedule** / **Run Now**.

### Uji manual dari PowerShell

```powershell
$base = 'https://<nama-project>.vercel.app'
$secret = '<CRON_SECRET>'
Invoke-RestMethod -Uri "$base/api/cron/daily" -Headers @{ Authorization = "Bearer $secret" }
Invoke-RestMethod -Uri "$base/api/cron/monthly" -Headers @{ Authorization = "Bearer $secret" }
```

Vercel mengirim `Authorization: Bearer <CRON_SECRET>` dan user-agent `vercel-cron/1.0`. Endpoint menolak request tanpa keduanya.

---

## 8. Opsional (tetap bisa gratis)

### Email transaksional — Resend
1. Daftar di <https://resend.com> (free tier).
2. Verifikasi domain Anda, atau pakai domain testing untuk percobaan.
3. Buat API key, lalu isi `RESEND_API_KEY` dan `SMTP_FROM` di Vercel → Redeploy.
4. Tanpa ini, email tidak dikirim, tetapi seluruh alur aplikasi tetap berjalan.

### Upload gambar — Cloudinary
1. Daftar di <https://cloudinary.com>.
2. Buat **unsigned upload preset**.
3. Isi `CLOUDINARY_CLOUD_NAME` dan `CLOUDINARY_UPLOAD_PRESET` → Redeploy.
4. Tanpa ini, gambar disimpan sebagai **data URL** di database. Masih berfungsi, tapi perhatikan ukuran/kuota.

### Domain kustom
1. Vercel → Project Settings → **Domains** → Add domain.
2. Arahkan DNS sesuai instruksi Vercel.
3. Update `APP_URL` ke `https://domain-anda.com` → Redeploy.

### Region Function
Jika Neon dipilih di Singapore, pertimbangkan Vercel → Project Settings → **Functions → Function Region = Singapore (sin1)** → Redeploy untuk latensi lebih rendah.

---

## 9. Troubleshooting

| Gejala | Penyebab | Solusi |
| :--- | :--- | :--- |
| Build gagal, error `Cannot find module .../next/dist/bin/next` | Root Directory masih `web` | Set Root Directory kosong/`.`, lalu redeploy |
| 500 / timeout di request pertama | Migrasi + seed masih berjalan, atau `DATABASE_URL` salah | Refresh sekali; cek Runtime Logs; pastikan URL pooled dan `sslmode=require` |
| `password authentication failed for user ...` | Salin connection string salah / karakter khusus belum ter-encode | Copy ulang dari Neon → Connection Details |
| `self signed certificate` | `sslmode=disable` | Pakai `sslmode=require`; kode sudah menangani TLS Neon |
| Login 401, seed tidak ada | Database sudah punya user lama, seed dilewati | Cek `SELECT email, role FROM users;` di Neon. Reset passwordvia API atau hapus schema & redeploy |
| Cron 401 | `CRON_SECRET` beda / belum redeploy | Samakan secret di Vercel dengan yang dipakai uji manual, lalu redeploy |
| Environment variable baru tidak berlaku | Env lama belum di-inject | Setelah ubah env, klik **Redeploy** |
| Cron terlihat tidak jalan di Hobby | Schedules pakai jitter (bisa beberapa menit setelah jam 00:00 UTC) | Normal. Cek tab Schedules → execution history |
| Aplikasi lambat setelah_idle | Cold start Vercel + Neon compute suspend | Normal di tier gratis; request kedua biasanya cepat |

---

## 10. Checklist akhir

- [ ] Neon project aktif, `DATABASE_URL` pooled + `sslmode=require`
- [ ] 4 secret berbeda sudah diisi di Vercel
- [ ] Root Directory Vercel **kosong**
- [ ] Deploy sukses, `/login` bisa dibuka
- [ ] Login `owner@kosman.id` berhasil
- [ ] Password seed sudah diganti
- [ ] `APP_URL` diisi URL produksi lalu redeploy
- [ ] Tab Schedules/Cron Jobs menampilkan 2 job
- [ ] (Opsional) Resend & Cloudinary sudah diisi jika dipakai

Jika ada langkah yang berbeda di dashboard Anda, salin pesan errornya dan saya bantu sesuaikan.
