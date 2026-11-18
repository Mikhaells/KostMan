package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// StringSlice maps a PostgreSQL jsonb array of strings.
type StringSlice []string

func (s *StringSlice) Scan(src interface{}) error {
	if src == nil {
		*s = StringSlice{}
		return nil
	}
	var raw []byte
	switch v := src.(type) {
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		return fmt.Errorf("StringSlice: unsupported source %T", src)
	}
	if len(raw) == 0 || string(raw) == "null" {
		*s = StringSlice{}
		return nil
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return err
	}
	*s = out
	return nil
}

func (s StringSlice) Value() (driver.Value, error) {
	if s == nil {
		s = StringSlice{}
	}
	b, err := json.Marshal(s)
	return string(b), err
}

type ExtraItem struct {
	Nama   string `json:"nama"`
	Jumlah int64  `json:"jumlah"`
}

type ExtraItems []ExtraItem

func (s *ExtraItems) Scan(src interface{}) error {
	if src == nil {
		*s = ExtraItems{}
		return nil
	}
	var raw []byte
	switch v := src.(type) {
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		return fmt.Errorf("ExtraItems: unsupported source %T", src)
	}
	if len(raw) == 0 || string(raw) == "null" {
		*s = ExtraItems{}
		return nil
	}
	var out []ExtraItem
	if err := json.Unmarshal(raw, &out); err != nil {
		return err
	}
	*s = out
	return nil
}

func (s ExtraItems) Value() (driver.Value, error) {
	if s == nil {
		s = ExtraItems{}
	}
	b, err := json.Marshal(s)
	return string(b), err
}

type User struct {
	ID              string     `db:"id" json:"id"`
	Nama            string     `db:"nama" json:"nama"`
	Email           string     `db:"email" json:"email"`
	PasswordHash    string     `db:"password_hash" json:"-"`
	Role            string     `db:"role" json:"role"`
	NoHP            *string    `db:"no_hp" json:"no_hp,omitempty"`
	Avatar          *string    `db:"avatar" json:"avatar,omitempty"`
	Status          string     `db:"status" json:"status"`
	FailedLogin     int        `db:"failed_login" json:"-"`
	LockedUntil     *time.Time `db:"locked_until" json:"-"`
	EmailVerifiedAt *time.Time `db:"email_verified_at" json:"email_verified_at,omitempty"`
	CreatedAt       time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time  `db:"updated_at" json:"updated_at"`
	DeletedAt       *time.Time `db:"deleted_at" json:"deleted_at,omitempty"`
}

type Property struct {
	ID          string      `db:"id" json:"id"`
	OwnerID     string      `db:"owner_id" json:"owner_id"`
	Nama        string      `db:"nama" json:"nama"`
	Tipe        string      `db:"tipe" json:"tipe"`
	Alamat      string      `db:"alamat" json:"alamat"`
	Kota        string      `db:"kota" json:"kota"`
	Provinsi    string      `db:"provinsi" json:"provinsi"`
	KodePos     *string     `db:"kode_pos" json:"kode_pos,omitempty"`
	Latitude    *float64    `db:"latitude" json:"latitude,omitempty"`
	Longitude   *float64    `db:"longitude" json:"longitude,omitempty"`
	Deskripsi   *string     `db:"deskripsi" json:"deskripsi,omitempty"`
	Fasilitas   StringSlice `db:"fasilitas" json:"fasilitas"`
	Foto        StringSlice `db:"foto" json:"foto"`
	Status      string      `db:"status" json:"status"`
	CreatedAt   time.Time   `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time   `db:"updated_at" json:"updated_at"`
	DeletedAt   *time.Time  `db:"deleted_at" json:"deleted_at,omitempty"`
	JumlahKamar int         `db:"jumlah_kamar" json:"jumlah_kamar,omitempty"`
}

type Room struct {
	ID           string      `db:"id" json:"id"`
	PropertiID   string      `db:"properti_id" json:"properti_id"`
	Nomor        string      `db:"nomor" json:"nomor"`
	Tipe         string      `db:"tipe" json:"tipe"`
	LuasM2       *float64    `db:"luas_m2" json:"luas_m2,omitempty"`
	HargaBulanan int64       `db:"harga_bulanan" json:"harga_bulanan"`
	HargaTahunan *int64      `db:"harga_tahunan" json:"harga_tahunan,omitempty"`
	Deposit      int64       `db:"deposit" json:"deposit"`
	Fasilitas    StringSlice `db:"fasilitas" json:"fasilitas"`
	Foto         StringSlice `db:"foto" json:"foto"`
	Status       string      `db:"status" json:"status"`
	Keterangan   *string     `db:"keterangan" json:"keterangan,omitempty"`
	CreatedAt    time.Time   `db:"created_at" json:"created_at"`
	UpdatedAt    time.Time   `db:"updated_at" json:"updated_at"`
	NamaProperti string      `db:"nama_properti" json:"nama_properti,omitempty"`
}

type Tenant struct {
	ID                string      `db:"id" json:"id"`
	NamaLengkap       string      `db:"nama_lengkap" json:"nama_lengkap"`
	NIK               string      `db:"nik" json:"nik"`
	NIKHash           string      `db:"nik_hash" json:"-"`
	Email             string      `db:"email" json:"email"`
	NoHP              string      `db:"no_hp" json:"no_hp"`
	AlamatAsal        *string     `db:"alamat_asal" json:"alamat_asal,omitempty"`
	Pekerjaan         *string     `db:"pekerjaan" json:"pekerjaan,omitempty"`
	KontakDaruratNama string      `db:"kontak_darurat_nama" json:"kontak_darurat_nama"`
	KontakDaruratHP   string      `db:"kontak_darurat_hp" json:"kontak_darurat_hp"`
	FotoKTP           string      `db:"foto_ktp" json:"foto_ktp"`
	DokumenLain       StringSlice `db:"dokumen_lain" json:"dokumen_lain"`
	Status            string      `db:"status" json:"status"`
	UserID            *string     `db:"user_id" json:"user_id,omitempty"`
	CreatedAt         time.Time   `db:"created_at" json:"created_at"`
	UpdatedAt         time.Time   `db:"updated_at" json:"updated_at"`
}

type Contract struct {
	ID             string    `db:"id" json:"id"`
	NomorKontrak   string    `db:"nomor_kontrak" json:"nomor_kontrak"`
	PenyewaID      string    `db:"penyewa_id" json:"penyewa_id"`
	KamarID        string    `db:"kamar_id" json:"kamar_id"`
	TanggalMulai   time.Time `db:"tanggal_mulai" json:"tanggal_mulai"`
	TanggalSelesai time.Time `db:"tanggal_selesai" json:"tanggal_selesai"`
	HargaSewa      int64     `db:"harga_sewa" json:"harga_sewa"`
	Deposit        int64     `db:"deposit" json:"deposit"`
	DepositDibayar bool      `db:"deposit_dibayar" json:"deposit_dibayar"`
	Status         string    `db:"status" json:"status"`
	Catatan        *string   `db:"catatan" json:"catatan,omitempty"`
	DokumenKontrak *string   `db:"dokumen_kontrak" json:"dokumen_kontrak,omitempty"`
	CreatedBy      string    `db:"created_by" json:"created_by"`
	CreatedAt      time.Time `db:"created_at" json:"created_at"`
	UpdatedAt      time.Time `db:"updated_at" json:"updated_at"`
	NamaPenyewa    string    `db:"nama_penyewa" json:"nama_penyewa,omitempty"`
	NomorKamar     string    `db:"nomor_kamar" json:"nomor_kamar,omitempty"`
	NamaProperti   string    `db:"nama_properti" json:"nama_properti,omitempty"`
}

type Invoice struct {
	ID                string     `db:"id" json:"id"`
	NomorInvoice      string     `db:"nomor_invoice" json:"nomor_invoice"`
	KontrakID         string     `db:"kontrak_id" json:"kontrak_id"`
	PenyewaID         string     `db:"penyewa_id" json:"penyewa_id"`
	PropertiID        string     `db:"properti_id" json:"properti_id"`
	PeriodeMulai      time.Time  `db:"periode_mulai" json:"periode_mulai"`
	PeriodeSelesai    time.Time  `db:"periode_selesai" json:"periode_selesai"`
	JumlahPokok       int64      `db:"jumlah_pokok" json:"jumlah_pokok"`
	ItemTambahan      ExtraItems `db:"item_tambahan" json:"item_tambahan"`
	Diskon            int64      `db:"diskon" json:"diskon"`
	Denda             int64      `db:"denda" json:"denda"`
	Total             int64      `db:"total" json:"total"`
	TanggalJatuhTempo time.Time  `db:"tanggal_jatuh_tempo" json:"tanggal_jatuh_tempo"`
	Status            string     `db:"status" json:"status"`
	TanggalBayar      *time.Time `db:"tanggal_bayar" json:"tanggal_bayar,omitempty"`
	MetodeBayar       *string    `db:"metode_bayar" json:"metode_bayar,omitempty"`
	Catatan           *string    `db:"catatan" json:"catatan,omitempty"`
	CreatedAt         time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt         time.Time  `db:"updated_at" json:"updated_at"`
	NamaPenyewa       string     `db:"nama_penyewa" json:"nama_penyewa,omitempty"`
	NamaProperti      string     `db:"nama_properti" json:"nama_properti,omitempty"`
	NomorKamar        string     `db:"nomor_kamar" json:"nomor_kamar,omitempty"`
}

type Payment struct {
	ID               string    `db:"id" json:"id"`
	TagihanID        string    `db:"tagihan_id" json:"tagihan_id"`
	Jumlah           int64     `db:"jumlah" json:"jumlah"`
	Metode           string    `db:"metode" json:"metode"`
	BuktiBayar       *string   `db:"bukti_bayar" json:"bukti_bayar,omitempty"`
	TanggalBayar     time.Time `db:"tanggal_bayar" json:"tanggal_bayar"`
	Status           string    `db:"status" json:"status"`
	DiverifikasiOleh *string   `db:"diverifikasi_oleh" json:"diverifikasi_oleh,omitempty"`
	CatatanAdmin     *string   `db:"catatan_admin" json:"catatan_admin,omitempty"`
	CreatedAt        time.Time `db:"created_at" json:"created_at"`
	UpdatedAt        time.Time `db:"updated_at" json:"updated_at"`
	NomorInvoice     string    `db:"nomor_invoice" json:"nomor_invoice,omitempty"`
	NamaPenyewa      string    `db:"nama_penyewa" json:"nama_penyewa,omitempty"`
}

type Ticket struct {
	ID           string      `db:"id" json:"id"`
	NomorTiket   string      `db:"nomor_tiket" json:"nomor_tiket"`
	PenyewaID    string      `db:"penyewa_id" json:"penyewa_id"`
	KamarID      string      `db:"kamar_id" json:"kamar_id"`
	PropertiID   string      `db:"properti_id" json:"properti_id"`
	Judul        string      `db:"judul" json:"judul"`
	Deskripsi    string      `db:"deskripsi" json:"deskripsi"`
	Kategori     string      `db:"kategori" json:"kategori"`
	Prioritas    string      `db:"prioritas" json:"prioritas"`
	Foto         StringSlice `db:"foto" json:"foto"`
	Status       string      `db:"status" json:"status"`
	AssignedTo   *string     `db:"assigned_to" json:"assigned_to,omitempty"`
	Resolusi     *string     `db:"resolusi" json:"resolusi,omitempty"`
	CreatedAt    time.Time   `db:"created_at" json:"created_at"`
	UpdatedAt    time.Time   `db:"updated_at" json:"updated_at"`
	ResolvedAt   *time.Time  `db:"resolved_at" json:"resolved_at,omitempty"`
	NamaPenyewa  string      `db:"nama_penyewa" json:"nama_penyewa,omitempty"`
	NamaProperti string      `db:"nama_properti" json:"nama_properti,omitempty"`
}

type Notification struct {
	ID        string          `db:"id" json:"id"`
	UserID    string          `db:"user_id" json:"user_id"`
	Judul     string          `db:"judul" json:"judul"`
	Isi       string          `db:"isi" json:"isi"`
	Tipe      string          `db:"tipe" json:"tipe"`
	Data      json.RawMessage `db:"data" json:"data"`
	IsRead    bool            `db:"is_read" json:"is_read"`
	CreatedAt time.Time       `db:"created_at" json:"created_at"`
}

type BankAccount struct {
	ID            string    `db:"id" json:"id"`
	OwnerID       string    `db:"owner_id" json:"owner_id"`
	Bank          string    `db:"bank" json:"bank"`
	NomorRekening string    `db:"nomor_rekening" json:"nomor_rekening"`
	NamaPemilik   string    `db:"nama_pemilik" json:"nama_pemilik"`
	IsPrimary     bool      `db:"is_primary" json:"is_primary"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
}

type Setting struct {
	OwnerID   string          `db:"owner_id" json:"owner_id"`
	Key       string          `db:"key" json:"key"`
	Value     json.RawMessage `db:"value" json:"value"`
	UpdatedAt time.Time       `db:"updated_at" json:"updated_at"`
}
