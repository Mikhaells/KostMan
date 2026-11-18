# PRD — Sistem Manajemen Kos & Kontrakan

**Versi:** 1.0  
**Tanggal:** 18 November 2026  
**Status:** Draft  
**Pemilik Produk:** [Nama Anda]

---

## 1. Ringkasan Eksekutif

Sistem Manajemen Kos & Kontrakan adalah aplikasi web yang membantu pemilik properti sewa (kos, kontrakan, rumah sewa) mengelola operasional bisnis mereka secara digital. Aplikasi ini mencakup manajemen properti, kamar, penyewa, kontrak sewa, tagihan, pembayaran, keluhan/maintenance, serta laporan keuangan.

**Tujuan utama:** Menggantikan pencatatan manual (buku, spreadsheet, WhatsApp) dengan satu platform terpusat yang efisien, akurat, dan mudah digunakan.

### 1.1. Masalah yang Diselesaikan

| Masalah | Dampak | Solusi |
| :--- | :--- | :--- |
| Pencatatan sewa manual di buku/spreadsheet | Data tercecer, sulit dicari, rawan human error | Database terpusat dengan pencarian & filter |
| Tagihan & pembayaran tidak terlacak | Pendapatan tidak akurat, risiko tunggakan | Sistem tagihan otomatis + status pembayaran |
| Komunikasi keluhan via WhatsApp pribadi | Riwayat hilang, tidak ada tracking | Tiket maintenance terstruktur |
| Sulit melihat performa properti | Tidak bisa ambil keputusan berbasis data | Dashboard & laporan real-time |
| Kontrak sewa tercecer dalam bentuk fisik | Risiko kehilangan, sulit audit | Manajemen kontrak digital |

---

## 2. Tujuan Produk & Metrik Keberhasilan

### 2.1. Tujuan (Goals)

- **G1:** Menyediakan platform terpusat untuk seluruh operasional manajemen kos.
- **G2:** Mengotomatiskan proses penagihan dan pelacakan pembayaran.
- **G3:** Memberikan visibilitas real-time terhadap pendapatan dan okupansi.
- **G4:** Menyediakan self-service portal bagi penyewa untuk melihat tagihan & mengajukan keluhan.

### 2.2. Metrik Keberhasilan (Success Metrics)

| Metrik | Target (6 bulan) |
| :--- | :--- |
| Waktu rata-rata membuat tagihan bulanan (per kamar) | < 30 detik |
| Tingkat akurasi pencatatan pembayaran | 100% |
| Waktu respon keluhan pertama | < 24 jam |
| Pengurangan waktu pembuatan laporan bulanan | 80% lebih cepat dari manual |
| User adoption (owner aktif menggunakan dashboard) | > 80% |

---

## 3. Target Pengguna (Personas)

### 3.1. Pemilik Kos (Owner)
- **Profil:** Pemilik 1–50 properti sewaan, usia 28–55 tahun.
- **Kebutuhan:** Melihat ringkasan bisnis, memantau pendapatan, mengambil keputusan strategis (naikkan harga, renovasi).
- **Pain Point:** Tidak punya waktu memantau setiap properti secara manual.

### 3.2. Pengelola / Staf Admin (Manager)
- **Profil:** Orang yang ditugaskan mengelola operasional harian (bisa pemilik sendiri atau karyawan).
- **Kebutuhan:** Input data penyewa, buat tagihan, konfirmasi pembayaran, tangani keluhan.
- **Pain Point:** Proses manual makan waktu dan mudah salah.

### 3.3. Penyewa (Tenant)
- **Profil:** Penghuni kos/kontrakan aktif.
- **Kebutuhan:** Melihat tagihan, riwayat pembayaran, mengajukan keluhan, memperpanjang sewa.
- **Pain Point:** Tidak tahu kapan jatuh tempo, sulit lapor kerusakan.

### 3.4. Super Admin (Sistem)
- **Profil:** Pemilik platform (jika multi-tenant SaaS di masa depan) atau developer.
- **Kebutuhan:** Manajemen user, monitoring sistem.

---

## 4. Ruang Lingkup (Scope)

### 4.1. In-Scope (MVP v1.0)
- Autentikasi & otorisasi berbasis peran (RBAC).
- Manajemen properti & kamar.
- Manajemen penyewa & kontrak sewa.
- Penagihan manual & otomatis.
- Pencatatan pembayaran (manual transfer + verifikasi bukti).
- Portal penyewa (lihat tagihan, riwayat, ajukan keluhan).
- Manajemen keluhan/maintenance.
- Dashboard & laporan dasar (pendapatan, okupansi).
- Notifikasi dasar via email.

### 4.2. Out-of-Scope (v1.0)
- Integrasi payment gateway otomatis (Midtrans/Xendit) — *untuk v1.1*.
- Aplikasi mobile native (iOS/Android) — *web responsif dulu*.
- Multi-properti multi-owner SaaS (SaaS mode) — *v2.0*.
- Smart lock / IoT integration.
- Notifikasi WhatsApp otomatis (via WABLAS/Fonnte) — *v1.2*.
- Akuntansi lengkap double-entry — *v2.0*.
- Manajemen aset/inventaris per kamar — *v1.3*.

---

## 5. Fitur Fungsional (Functional Requirements)

Setiap modul ditulis dengan user story, kriteria penerimaan (acceptance criteria), dan detail teknis.

---

### 5.1. Modul Autentikasi & Otorisasi

#### Deskripsi
Sistem login/logout dengan role-based access control (RBAC).

#### User Stories
- **US-AUTH-01:** Sebagai user, saya bisa register akun baru (khusus owner/admin).
- **US-AUTH-02:** Sebagai user, saya bisa login dengan email & password.
- **US-AUTH-03:** Sebagai user, saya bisa reset password via email.
- **US-AUTH-04:** Sebagai admin, saya bisa mengelola akun user lain (CRUD).

#### Role & Permission Matrix

| Fitur | Super Admin | Owner | Manager/Staff | Penyewa |
| :--- | :---: | :---: | :---: | :---: |
| Kelola user admin | ✅ | ✅ | ❌ | ❌ |
| Kelola properti | ✅ | ✅ | ❌ | ❌ |
| Kelola kamar | ✅ | ✅ | ✅ | ❌ |
| Kelola penyewa | ✅ | ✅ | ✅ | ❌ |
| Kelola kontrak | ✅ | ✅ | ✅ | ❌ |
| Buat tagihan | ✅ | ✅ | ✅ | ❌ |
| Verifikasi pembayaran | ✅ | ✅ | ✅ | ❌ |
| Ajukan keluhan | ❌ | ❌ | ❌ | ✅ |
| Lihat laporan keuangan | ✅ | ✅ | ❌ (read-only opsional) | ❌ |
| Lihat tagihan sendiri | ❌ | ❌ | ❌ | ✅ |

#### Acceptance Criteria
- [ ] Login gagal 5x berturut-turut → akun terkunci 15 menit.
- [ ] Password minimal 8 karakter, kombinasi huruf + angka.
- [ ] JWT token kadaluarsa dalam 24 jam (refresh token 7 hari).
- [ ] Halaman yang dilindungi → redirect ke login jika tidak terautentikasi.
- [ ] Penyewa tidak bisa mengakses endpoint admin (403 Forbidden).

---

### 5.2. Modul Manajemen Properti

#### Deskripsi
CRUD properti (kos, kontrakan, rumah sewa).

#### User Stories
- **US-PROP-01:** Sebagai owner, saya bisa menambah properti baru.
- **US-PROP-02:** Sebagai owner, saya bisa mengedit, menghapus (soft delete), dan melihat daftar properti.
- **US-PROP-03:** Sebagai owner, saya bisa mengunggah foto properti (maks 10 foto).
- **US-PROP-04:** Sebagai owner, saya bisa menambahkan fasilitas umum properti.

#### Data Fields (Properti)

| Field | Tipe | Wajib | Keterangan |
| :--- | :--- | :---: | :--- |
| id | UUID | ✅ | Primary key |
| owner_id | UUID | ✅ | FK ke user |
| nama | string(100) | ✅ | Nama properti |
| tipe | enum | ✅ | `kos_putri`, `kos_putra`, `kos_campur`, `kontrakan`, `rumah` |
| alamat | text | ✅ | Alamat lengkap |
| kota | string(50) | ✅ | |
| provinsi | string(50) | ✅ | |
| kode_pos | string(10) | ❌ | |
| latitude | decimal(10,8) | ❌ | Untuk peta |
| longitude | decimal(11,8) | ❌ | Untuk peta |
| deskripsi | text | ❌ | |
| fasilitas | jsonb | ❌ | `["wifi","parkir","dapur","cuci"]` |
| foto | jsonb | ❌ | Array URL foto |
| status | enum | ✅ | `aktif`, `nonaktif`, `maintenance` |
| created_at | timestamp | ✅ | |
| updated_at | timestamp | ✅ | |
| deleted_at | timestamp | ❌ | Soft delete |

#### Acceptance Criteria
- [ ] Validasi: nama properti tidak boleh kosong, minimal 3 karakter.
- [ ] Upload foto: maks 5 MB per file, format jpg/png/webp.
- [ ] Soft delete: properti terhapus tidak muncul di list, tapi bisa dipulihkan oleh super admin.
- [ ] Properti dengan kamar aktif tidak bisa dihapus (harus kosongkan dulu).

---

### 5.3. Modul Manajemen Kamar / Unit

#### Deskripsi
CRUD kamar/unit dalam setiap properti.

#### User Stories
- **US-ROOM-01:** Sebagai admin, saya bisa menambah kamar dengan tipe & harga.
- **US-ROOM-02:** Sebagai admin, saya bisa melihat status kamar (kosong/terisi/maintenance).
- **US-ROOM-03:** Sebagai admin, saya bisa mengubah harga sewa kamar.
- **US-ROOM-04:** Sebagai admin, saya bisa menandai kamar sebagai "maintenance".

#### Data Fields (Kamar)

| Field | Tipe | Wajib | Keterangan |
| :--- | :--- | :---: | :--- |
| id | UUID | ✅ | |
| properti_id | UUID | ✅ | FK ke properti |
| nomor | string(20) | ✅ | Nomor kamar unik per properti |
| tipe | string(50) | ✅ | `single`, `double`, `premium`, dll |
| luas_m2 | decimal | ❌ | |
| harga_bulanan | bigint | ✅ | Dalam rupiah |
| harga_tahunan | bigint | ❌ | Opsional diskon tahunan |
| deposit | bigint | ❌ | |
| fasilitas | jsonb | ❌ | AC, kasur, lemari, dll |
| foto | jsonb | ❌ | |
| status | enum | ✅ | `kosong`, `terisi`, `maintenance`, `reserved` |
| keterangan | text | ❌ | |

#### Acceptance Criteria
- [ ] Nomor kamar unik per properti (constraint DB).
- [ ] Perubahan harga tidak retroaktif ke kontrak aktif (harga di kontrak tetap).
- [ ] Status kamar otomatis berubah ke `terisi` saat kontrak diaktifkan, dan `kosong` saat kontrak berakhir.
- [ ] Kamar dengan kontrak aktif tidak bisa dihapus.

#### Business Rules
- 1 kamar = maksimal 1 kontrak aktif pada satu waktu.
- Harga dapat diubah kapan saja, tetapi kontrak yang sudah berjalan tidak terpengaruh.

---

### 5.4. Modul Manajemen Penyewa (Tenant)

#### Deskripsi
CRUD data penyewa beserta dokumen identitas.

#### User Stories
- **US-TEN-01:** Sebagai admin, saya bisa mendaftarkan penyewa baru dengan data lengkap.
- **US-TEN-02:** Sebagai admin, saya bisa mengunggah foto KTP dan dokumen pendukung.
- **US-TEN-03:** Sebagai admin, saya bisa melihat riwayat sewa penyewa.
- **US-TEN-04:** Sebagai penyewa, saya bisa login ke portal dan melihat profil saya sendiri.

#### Data Fields (Penyewa)

| Field | Tipe | Wajib | Keterangan |
| :--- | :--- | :---: | :--- |
| id | UUID | ✅ | |
| nama_lengkap | string(100) | ✅ | Sesuai KTP |
| nik | string(16) | ✅ | Nomor KTP (unik) |
| email | string(100) | ✅ | Untuk login & notifikasi |
| no_hp | string(20) | ✅ | |
| alamat_asal | text | ❌ | Alamat KTP |
| pekerjaan | string(100) | ❌ | |
| kontak_darurat_nama | string(100) | ✅ | |
| kontak_darurat_hp | string(20) | ✅ | |
| foto_ktp | string(url) | ✅ | |
| dokumen_lain | jsonb | ❌ | KK, surat kerja, dll |
| status | enum | ✅ | `aktif`, `nonaktif` |
| created_at | timestamp | ✅ | |

#### Acceptance Criteria
- [ ] NIK harus 16 digit numerik.
- [ ] Email unik di seluruh sistem.
- [ ] NIK unik — mencegah penyewa terdaftar ganda.
- [ ] Foto KTP wajib sebelum kontrak dapat dibuat.

---

### 5.5. Modul Manajemen Kontrak Sewa

#### Deskripsi
Membuat, mengelola, dan mengakhiri kontrak sewa.

#### User Stories
- **US-CON-01:** Sebagai admin, saya bisa membuat kontrak untuk penyewa di kamar tertentu.
- **US-CON-02:** Sebagai admin, saya bisa memperpanjang kontrak.
- **US-CON-03:** Sebagai admin, saya bisa mengakhiri kontrak lebih awal (dengan catatan).
- **US-CON-04:** Sebagai sistem, saya mengirim reminder 7 hari sebelum kontrak berakhir.
- **US-CON-05:** Sebagai penyewa, saya bisa melihat kontrak aktif saya di portal.

#### Data Fields (Kontrak)

| Field | Tipe | Wajib | Keterangan |
| :--- | :--- | :---: | :--- |
| id | UUID | ✅ | |
| nomor_kontrak | string(30) | ✅ | Auto-generated: `KTR-YYYYMM-XXXX` |
| penyewa_id | UUID | ✅ | FK |
| kamar_id | UUID | ✅ | FK |
| tanggal_mulai | date | ✅ | |
| tanggal_selesai | date | ✅ | |
| harga_sewa | bigint | ✅ | Snapshot harga saat kontrak dibuat |
| deposit | bigint | ❌ | |
| deposit_dibayar | boolean | ✅ | |
| status | enum | ✅ | `aktif`, `selesai`, `batal`, `diperpanjang` |
| catatan | text | ❌ | |
| dokumen_kontrak | string(url) | ❌ | PDF kontrak yang di-upload |
| created_by | UUID | ✅ | FK ke user |

#### Acceptance Criteria
- [ ] Validasi: tanggal_selesai > tanggal_mulai.
- [ ] Tidak bisa membuat kontrak baru jika kamar sudah punya kontrak aktif.
- [ ] Perpanjangan membuat kontrak baru dengan status `aktif` dan kontrak lama berubah ke `diperpanjang`.
- [ ] Perubahan status kamar otomatis: `terisi` saat kontrak aktif, `kosong` saat selesai.
- [ ] Generate PDF kontrak otomatis (menggunakan template).

#### Business Rules
- Kontrak minimal 1 bulan.
- Deposit dapat dikembalikan (partial/full) saat kontrak selesai (dengan catatan kerusakan).
- Jika kontrak berakhir dan tidak diperpanjang, status penyewa otomatis `nonaktif`.

---

### 5.6. Modul Penagihan (Billing)

#### Deskripsi
Membuat tagihan bulanan/tahunan, mengirim ke penyewa, dan melacak status pembayaran.

#### User Stories
- **US-BILL-01:** Sebagai admin, saya bisa membuat tagihan manual untuk satu atau banyak penyewa sekaligus.
- **US-BILL-02:** Sebagai sistem, saya bisa membuat tagihan otomatis setiap awal bulan untuk semua kontrak aktif.
- **US-BILL-03:** Sebagai admin, saya bisa menambahkan item biaya (listrik, air, dll).
- **US-BILL-04:** Sebagai admin, saya bisa menandai tagihan sebagai lunas setelah verifikasi pembayaran.
- **US-BILL-05:** Sebagai penyewa, saya bisa melihat daftar tagihan saya di portal.
- **US-BILL-06:** Sebagai sistem, saya mengirim notifikasi email saat tagihan dibuat & saat jatuh tempo.

#### Data Fields (Tagihan)

| Field | Tipe | Wajib | Keterangan |
| :--- | :--- | :---: | :--- |
| id | UUID | ✅ | |
| nomor_invoice | string(30) | ✅ | Auto: `INV-YYYYMM-XXXX` |
| kontrak_id | UUID | ✅ | FK |
| penyewa_id | UUID | ✅ | Denormalized |
| properti_id | UUID | ✅ | Denormalized |
| periode_mulai | date | ✅ | |
| periode_selesai | date | ✅ | |
| jumlah_pokok | bigint | ✅ | Harga sewa |
| item_tambahan | jsonb | ❌ | `[{"nama":"Listrik","jumlah":50000}]` |
| diskon | bigint | ❌ | |
| denda | bigint | ❌ | Denda keterlambatan |
| total | bigint | ✅ | jumlah_pokok + item - diskon + denda |
| tanggal_jatuh_tempo | date | ✅ | |
| status | enum | ✅ | `draft`, `terkirim`, `dibayar`, `sebagian`, `terlambat`, `batal` |
| tanggal_bayar | timestamp | ❌ | |
| metode_bayar | enum | ❌ | `transfer_bank`, `cash`, `ewallet` |

#### Acceptance Criteria
- [ ] Invoice number unik.
- [ ] Total otomatis dihitung ulang setiap kali item diubah.
- [ ] Status `terlambat` otomatis berubah jika melewati tanggal jatuh tempo dan belum lunas (cron job harian).
- [ ] Denda dapat di-set per hari/minggu/bulan (configurable di settings).
- [ ] Notifikasi email otomatis: (1) saat tagihan dibuat, (2) H-3 sebelum jatuh tempo, (3) saat terlambat.

#### Business Rules
- Tagihan baru bisa dibuat jika kontrak berstatus `aktif`.
- 1 kontrak bisa memiliki banyak tagihan (bulanan).
- Tagihan yang sudah `dibayar` tidak bisa dihapus (harus void).

---

### 5.7. Modul Pembayaran

#### Deskripsi
Mencatat dan memverifikasi pembayaran dari penyewa.

#### User Stories
- **US-PAY-01:** Sebagai penyewa, saya bisa upload bukti transfer untuk tagihan saya.
- **US-PAY-02:** Sebagai admin, saya bisa memverifikasi atau menolak bukti pembayaran.
- **US-PAY-03:** Sebagai penyewa, saya bisa melihat status verifikasi pembayaran saya.
- **US-PAY-04:** Sebagai admin, saya bisa mencatat pembayaran cash secara manual.

#### Data Fields (Pembayaran)

| Field | Tipe | Wajib | Keterangan |
| :--- | :--- | :---: | :--- |
| id | UUID | ✅ | |
| tagihan_id | UUID | ✅ | FK |
| jumlah | bigint | ✅ | Bisa partial payment |
| metode | enum | ✅ | `transfer_bank`, `cash`, `ewallet` |
| bukti_bayar | string(url) | ❌ | Wajib untuk transfer |
| tanggal_bayar | date | ✅ | |
| status | enum | ✅ | `pending`, `verified`, `rejected` |
| diverifikasi_oleh | UUID | ❌ | FK ke user |
| catatan_admin | text | ❌ | Alasan reject |

#### Acceptance Criteria
- [ ] Jika jumlah bayar < total tagihan → status tagihan `sebagian`.
- [ ] Jika jumlah bayar >= total tagihan → status tagihan `dibayar` (auto setelah verifikasi).
- [ ] Penyewa hanya bisa upload bukti untuk tagihan miliknya sendiri.
- [ ] Admin menerima notifikasi in-app saat ada bukti pembayaran baru.

#### Business Rules
- Satu tagihan bisa memiliki >1 pembayaran (partial).
- Bukti bayar wajib untuk metode `transfer_bank`.

---

### 5.8. Modul Keluhan & Maintenance

#### Deskripsi
Sistem tiket untuk penyewa melaporkan kerusakan atau keluhan, dan admin mengelolanya.

#### User Stories
- **US-TICK-01:** Sebagai penyewa, saya bisa membuat tiket keluhan dengan foto.
- **US-TICK-02:** Sebagai penyewa, saya bisa melihat status tiket saya.
- **US-TICK-03:** Sebagai admin, saya bisa mengubah status tiket dan memberikan respons.
- **US-TICK-04:** Sebagai admin, saya bisa melihat daftar tiket berdasarkan prioritas dan status.

#### Data Fields (Tiket)

| Field | Tipe | Wajib | Keterangan |
| :--- | :--- | :---: | :--- |
| id | UUID | ✅ | |
| nomor_tiket | string(20) | ✅ | Auto: `TKT-YYYYMM-XXXX` |
| penyewa_id | UUID | ✅ | |
| kamar_id | UUID | ✅ | |
| properti_id | UUID | ✅ | |
| judul | string(100) | ✅ | |
| deskripsi | text | ✅ | |
| kategori | enum | ✅ | `listrik`, `air`, `furniture`, `kebersihan`, `lainnya` |
| prioritas | enum | ✅ | `rendah`, `sedang`, `tinggi`, `urgent` |
| foto | jsonb | ❌ | Maks 3 foto |
| status | enum | ✅ | `open`, `in_progress`, `resolved`, `closed` |
| assigned_to | UUID | ❌ | User admin yang menangani |
| resolusi | text | ❌ | Catatan penyelesaian |
| created_at | timestamp | ✅ | |
| resolved_at | timestamp | ❌ | |

#### Acceptance Criteria
- [ ] Penyewa hanya bisa melihat tiket miliknya sendiri.
- [ ] Admin mendapat notifikasi saat tiket baru dibuat.
- [ ] Perubahan status tiket trigger notifikasi email ke penyewa.
- [ ] Tiket `urgent` ditandai merah di dashboard admin.

---

### 5.9. Modul Dashboard & Laporan

#### Deskripsi
Menampilkan ringkasan performa bisnis dan laporan yang bisa di-export.

#### User Stories
- **US-REP-01:** Sebagai owner, saya bisa melihat dashboard dengan KPI utama.
- **US-REP-02:** Sebagai owner, saya bisa melihat laporan pendapatan per properti & per bulan.
- **US-REP-03:** Sebagai owner, saya bisa melihat tingkat okupansi kamar.
- **US-REP-04:** Sebagai owner, saya bisa export laporan ke PDF atau Excel.

#### Widget Dashboard (Owner)

| Widget | Deskripsi | Data Source |
| :--- | :--- | :--- |
| Total Pendapatan Bulan Ini | Sum pembayaran verified | Pembayaran |
| Total Tagihan Belum Lunas | Sum tagihan `terkirim`/`terlambat` | Tagihan |
| Okupansi (%) | Kamar terisi / total kamar | Kamar |
| Penyewa Aktif | Count kontrak `aktif` | Kontrak |
| Tiket Open | Count tiket `open` | Tiket |
| Grafik Pendapatan 6 Bulan Terakhir | Line chart | Pembayaran |
| Grafik Okupansi per Properti | Bar chart | Kamar |

#### Laporan yang Tersedia (v1.0)
1. **Laporan Pendapatan** — per bulan, per properti, per kamar.
2. **Laporan Okupansi** — historis per kamar, per bulan.
3. **Laporan Tunggakan** — daftar tagihan belum lunas dengan aging (0-30, 31-60, 60+ hari).
4. **Laporan Riwayat Penyewa** — data lengkap penyewa yang pernah/aktif.
5. **Laporan Maintenance** — tiket per kategori dan waktu resolusi.

#### Acceptance Criteria
- [ ] Data dashboard refresh maksimal setiap 5 menit (caching).
- [ ] Filter periode: hari ini, bulan ini, bulan lalu, custom range.
- [ ] Export PDF: layout rapi dengan logo & nama properti.
- [ ] Export Excel: format .xlsx dengan header yang jelas.

---

### 5.10. Modul Notifikasi

#### Deskripsi
Notifikasi email otomatis dan in-app.

#### Kategori Notifikasi

| Event | Penerima | Channel | Template |
| :--- | :--- | :--- | :--- |
| Tagihan dibuat | Penyewa | Email + in-app | `invoice_created` |
| Reminder H-3 jatuh tempo | Penyewa | Email | `invoice_reminder` |
| Tagihan terlambat | Penyewa | Email | `invoice_overdue` |
| Pembayaran diverifikasi | Penyewa | Email + in-app | `payment_verified` |
| Kontrak akan berakhir (H-7) | Admin | Email + in-app | `contract_ending` |
| Tiket baru | Admin | In-app | `ticket_created` |
| Tiket resolved | Penyewa | Email + in-app | `ticket_resolved` |

#### Acceptance Criteria
- [ ] Notifikasi email dikirim via SMTP (bisa menggunakan Mailtrap/Mailgun free tier atau SMTP sendiri).
- [ ] In-app notification memiliki badge count di navbar.
- [ ] User bisa opt-out dari notifikasi tertentu (settings per user).

---

### 5.11. Modul Pengaturan (Settings)

#### User Stories
- **US-SET-01:** Sebagai owner, saya bisa mengubah profil & data bank untuk pembayaran.
- **US-SET-02:** Sebagai owner, saya bisa mengatur template kontrak & invoice.
- **US-SET-03:** Sebagai owner, saya bisa mengatur aturan denda.
- **US-SET-04:** Sebagai owner, saya bisa mengatur template notifikasi email.

#### Pengaturan yang Tersedia
- Profil pemilik & perusahaan.
- Nomor rekening tujuan pembayaran (multi-rekening).
- Aturan denda (nominal, tipe, grace period).
- Template invoice & kontrak (HTML/CSS).
- Reminder timing (H-berapa).
- Timezone & format tanggal.
- Logo & branding.

---

## 6. Non-Functional Requirements

### 6.1. Performance
- Page load time (dashboard) < 2 detik pada koneksi 4G.
- API response time (P95) < 500 ms.
- Dapat menangani 100 concurrent user (skala awal).
- Query database dioptimalkan dengan index (owner_id, status, tanggal).

### 6.2. Security
- Password hashing: bcrypt (cost >= 12).
- JWT dengan expiry + refresh token.
- Rate limiting: 100 req/menit per IP untuk API publik.
- SQL injection prevention: parameterized query (sqlx).
- XSS prevention: sanitasi input.
- HTTPS wajib di production.
- Sensitive data (NIK, KTP) dienkripsi at-rest (AES-256).
- File upload: validasi MIME, size limit, tidak diakses langsung (via signed URL).

### 6.3. Reliability
- Uptime target: 99% (best-effort untuk free tier).
- Backup database harian (otomatis oleh platform atau cron export).
- Graceful shutdown handler.

### 6.4. Usability
- UI responsif (mobile-first, breakpoint: 375, 768, 1024, 1440).
- Bahasa: Indonesia (default), siap untuk i18n (English).
- Accessibility: kontras warna WCAG AA, keyboard navigable.
- Loading state + empty state + error state di semua halaman.

### 6.5. Maintainability
- Kode terstruktur (clean architecture untuk Go, feature-based untuk React).
- Test coverage minimal 60% (unit + integration).
- Logging terstruktur (JSON).
- Versioning API (v1).
- Dokumentasi API via OpenAPI/Swagger.

---

## 7. Arsitektur Teknis

### 7.1. Tech Stack

| Layer | Teknologi | Alasan |
| :--- | :--- | :--- |
| Frontend | React 18 + Vite + TypeScript | SPA, DX cepat, ekosistem besar |
| UI Library | shadcn/ui + Tailwind CSS | Komponen modern, kustomisasi bebas |
| State Mgmt | Zustand + TanStack Query | Ringan, cocok untuk server state |
| Routing | React Router v6 | Standar SPA |
| Backend | Go 1.22+ | Performa tinggi, mudah di-deploy |
| Web Framework | Chi atau Echo | Ringan, idiomatik |
| Database | PostgreSQL 15 | Relasional, JSONB support |
| ORM/Query | sqlx (raw query) atau sqlc | Type-safe, kontrol penuh |
| Migration | golang-migrate | Standar Go |
| Auth | JWT (golang-jwt) | Stateless, cocok untuk SPA |
| Embed Frontend | `go:embed` | Satu binary deploy |
| Task Queue | Simple cron (robfig/cron) | Untuk reminder & auto-billing |
| File Storage | Local (v1.0) → S3/Cloudflare R2 (v1.1) | Hemat biaya |
| Email | SMTP (Mailtrap/Mailgun free) | Gratis untuk dev |
| PDF Generator | maroto atau gofpdf | Generate invoice & kontrak |
| Logger | zerolog | JSON structured logging |
| Deploy | Cloady (Go binary + Postgres) | Gratis, 1 GB RAM |

### 7.2. Arsitektur Deployment (Unified Binary)
