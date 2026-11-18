export type Role = 'super_admin' | 'owner' | 'manager' | 'tenant'

export interface User {
  id: string
  nama: string
  email: string
  role: Role
  owner_id?: string | null
  no_hp?: string | null
  status: string
  created_at: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface ApiMeta {
  page: number
  limit: number
  total: number
  total_pages: number
}

export interface Property {
  id: string
  owner_id: string
  nama: string
  tipe: 'kos_putri' | 'kos_putra' | 'kos_campur' | 'kontrakan' | 'rumah'
  alamat: string
  kota: string
  provinsi: string
  kode_pos?: string | null
  deskripsi?: string | null
  fasilitas: string[]
  foto: string[]
  status: 'aktif' | 'nonaktif' | 'maintenance'
  jumlah_kamar?: number
  created_at: string
}

export interface Room {
  id: string
  properti_id: string
  nomor: string
  tipe: string
  luas_m2?: number | null
  harga_bulanan: number
  harga_tahunan?: number | null
  deposit: number
  fasilitas: string[]
  foto: string[]
  status: 'kosong' | 'terisi' | 'maintenance' | 'reserved'
  keterangan?: string | null
  nama_properti?: string
}

export interface Tenant {
  id: string
  nama_lengkap: string
  nik: string
  email: string
  no_hp: string
  alamat_asal?: string | null
  pekerjaan?: string | null
  kontak_darurat_nama: string
  kontak_darurat_hp: string
  foto_ktp: string
  dokumen_lain: string[]
  status: 'aktif' | 'nonaktif'
  user_id?: string | null
  created_at: string
}

export interface Contract {
  id: string
  nomor_kontrak: string
  penyewa_id: string
  kamar_id: string
  tanggal_mulai: string
  tanggal_selesai: string
  harga_sewa: number
  deposit: number
  deposit_dibayar: boolean
  status: 'aktif' | 'selesai' | 'batal' | 'diperpanjang'
  catatan?: string | null
  nama_penyewa?: string
  nomor_kamar?: string
  nama_properti?: string
}

export interface ExtraItem { nama: string; jumlah: number }

export interface Invoice {
  id: string
  nomor_invoice: string
  kontrak_id: string
  penyewa_id: string
  properti_id: string
  periode_mulai: string
  periode_selesai: string
  jumlah_pokok: number
  item_tambahan: ExtraItem[]
  diskon: number
  denda: number
  total: number
  tanggal_jatuh_tempo: string
  status: 'draft' | 'terkirim' | 'dibayar' | 'sebagian' | 'terlambat' | 'batal'
  tanggal_bayar?: string | null
  metode_bayar?: string | null
  nama_penyewa?: string
  nama_properti?: string
  nomor_kamar?: string
  created_at: string
}

export interface Payment {
  id: string
  tagihan_id: string
  jumlah: number
  metode: 'transfer_bank' | 'cash' | 'ewallet'
  bukti_bayar?: string | null
  tanggal_bayar: string
  status: 'pending' | 'verified' | 'rejected'
  catatan_admin?: string | null
  nomor_invoice?: string
  nama_penyewa?: string
  created_at: string
}

export interface Ticket {
  id: string
  nomor_tiket: string
  penyewa_id: string
  kamar_id: string
  properti_id: string
  judul: string
  deskripsi: string
  kategori: 'listrik' | 'air' | 'furniture' | 'kebersihan' | 'lainnya'
  prioritas: 'rendah' | 'sedang' | 'tinggi' | 'urgent'
  foto: string[]
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  resolusi?: string | null
  assigned_to?: string | null
  created_at: string
  resolved_at?: string | null
  nama_penyewa?: string
  nama_properti?: string
}

export interface Notification {
  id: string
  judul: string
  isi: string
  tipe: string
  data: unknown
  is_read: boolean
  created_at: string
}

export interface BankAccount {
  id: string
  bank: string
  nomor_rekening: string
  nama_pemilik: string
  is_primary: boolean
}

export interface DashboardData {
  pendapatan_bulan_ini: number
  tagihan_belum_lunas: number
  okupansi: number
  total_kamar: number
  kamar_terisi: number
  penyewa_aktif: number
  tiket_open: number
  total_properti: number
  total_penyewa: number
  grafik_pendapatan: { bulan: string; total: number }[]
  okupansi_per_properti: { nama: string; total: number; terisi: number; persen: number }[]
}

export interface ReportData { Headers: string[]; Rows: (string | number)[][] }
