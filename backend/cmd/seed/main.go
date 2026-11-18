package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kosman/app/internal/config"
	"github.com/kosman/app/internal/database"
	"github.com/kosman/app/internal/pkg/crypto"
	"github.com/kosman/app/internal/pkg/logger"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	logger.Init(cfg.AppEnv)
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		logger.Error(err, "database connection failed")
		os.Exit(1)
	}
	defer db.Close()

	ctx := context.Background()

	// Jangan timpa data yang sudah ada (misalnya bila initialDeployHook jalan ulang
	// atau seed dijalankan manual ke database produksi). Set FORCE_SEED=true untuk reset.
	var userCount int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&userCount); err != nil {
		logger.Error(err, "cek data seed gagal")
		os.Exit(1)
	}
	if userCount > 0 && !strings.EqualFold(os.Getenv("FORCE_SEED"), "true") {
		logger.Info("data sudah ada (" + strconv.Itoa(userCount) + " user), seed dilewati. Set FORCE_SEED=true untuk reset.")
		return
	}

	hash, _ := crypto.HashPassword("Admin123")

	// reset data (keep schema)
	for _, table := range []string{"notifications", "payments", "invoices", "tickets", "contracts", "tenants", "rooms", "properties", "settings", "bank_accounts", "refresh_tokens", "password_resets"} {
		if _, err = db.ExecContext(ctx, "DELETE FROM "+table); err != nil {
			logger.Error(err, "seed cleanup failed: "+table)
		}
	}
	if _, err = db.ExecContext(ctx, `DELETE FROM users WHERE email LIKE '%@kosman.id'`); err != nil {
		logger.Error(err, "seed cleanup users failed")
	}

	ownerID, managerID := uuid.NewString(), uuid.NewString()
	tenantUsers := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	insertUser := func(id, nama, email, role string) {
		_, err = db.ExecContext(ctx, `INSERT INTO users (id,nama,email,password_hash,role,no_hp,status) VALUES ($1,$2,$3,$4,$5,'081234567890','aktif')`,
			id, nama, email, hash, role)
		if err != nil {
			logger.Error(err, "insert user "+email)
		}
	}
	insertUser(ownerID, "Budi Santoso", "owner@kosman.id", "owner")
	insertUser(managerID, "Siti Aminah", "manager@kosman.id", "manager")
	for i, id := range tenantUsers {
		insertUser(id, fmt.Sprintf("Penyewa %d", i+1), fmt.Sprintf("penyewa%d@kosman.id", i+1), "tenant")
	}

	prop1, prop2 := uuid.NewString(), uuid.NewString()
	insertProperty := func(id, owner, nama, tipe, kota string) {
		_, err = db.ExecContext(ctx, `INSERT INTO properties (id,owner_id,nama,tipe,alamat,kota,provinsi,status,fasilitas,foto)
			VALUES ($1,$2,$3,$4,$5,$6,'Jawa Barat','aktif','["wifi","parkir","dapur"]','[]')`, id, owner, nama, tipe, "Jl. Melati No. "+kota, kota)
		if err != nil {
			logger.Error(err, "insert property "+nama)
		}
	}
	insertProperty(prop1, ownerID, "Kos Melati Putri", "kos_putri", "Bandung")
	insertProperty(prop2, ownerID, "Kontrakan Anggrek", "kontrakan", "Bandung")

	roomIDs := make([]string, 6)
	for i := range roomIDs {
		roomIDs[i] = uuid.NewString()
	}
	rooms := []struct {
		id, prop, nomor string
		price           int64
		status          string
	}{
		{roomIDs[0], prop1, "A01", 1500000, "terisi"},
		{roomIDs[1], prop1, "A02", 1600000, "terisi"},
		{roomIDs[2], prop1, "A03", 1500000, "kosong"},
		{roomIDs[3], prop1, "A04", 1400000, "maintenance"},
		{roomIDs[4], prop2, "B01", 2500000, "terisi"},
		{roomIDs[5], prop2, "B02", 2500000, "kosong"},
	}
	for _, r := range rooms {
		_, err = db.ExecContext(ctx, `INSERT INTO rooms (id,properti_id,nomor,tipe,harga_bulanan,deposit,status,fasilitas,foto)
			VALUES ($1,$2,$3,'single',$4,500000,$5,'["AC","kasur","lemari"]','[]')`, r.id, r.prop, r.nomor, r.price, r.status)
		if err != nil {
			logger.Error(err, "insert room "+r.nomor)
		}
	}

	tenantIDs := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	nama := []string{"Andi Pratama", "Dewi Lestari", "Rizky Ramadhan"}
	for i, id := range tenantIDs {
		nik := fmt.Sprintf("320400123456%04d", i+1)
		enc, _ := crypto.Encrypt(nik, cfg.EncryptionKey)
		_, err = db.ExecContext(ctx, `INSERT INTO tenants (id,nama_lengkap,nik,nik_hash,email,no_hp,pekerjaan,kontak_darurat_nama,kontak_darurat_hp,foto_ktp,status,user_id)
			VALUES ($1,$2,$3,$4,$5,$6,'Karyawan','Keluarga','081211112222','/uploads/ktp-contoh.jpg','aktif',$7)`,
			id, nama[i], enc, crypto.SHA256Hex(nik), fmt.Sprintf("penyewa%d@kosman.id", i+1), fmt.Sprintf("0812999900%d", i+1), tenantUsers[i])
		if err != nil {
			logger.Error(err, "insert tenant "+nama[i])
		}
	}

	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	monthEnd := monthStart.AddDate(0, 1, 0).AddDate(0, 0, -1)
	contractIDs := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	for i := range contractIDs {
		_, err = db.ExecContext(ctx, `INSERT INTO contracts (id,nomor_kontrak,penyewa_id,kamar_id,tanggal_mulai,tanggal_selesai,harga_sewa,deposit,deposit_dibayar,status,created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,500000,TRUE,'aktif',$8)`,
			contractIDs[i], fmt.Sprintf("KTR-%s-%04d", monthStart.Format("200601"), i+1), tenantIDs[i], roomIDs[i],
			monthStart, monthEnd, []int64{1500000, 1600000, 2500000}[i], ownerID)
		if err != nil {
			logger.Error(err, "insert contract")
		}
	}

	invoiceIDs := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	statuses := []string{"dibayar", "terkirim", "terlambat"}
	roomsForProp := []string{prop1, prop1, prop2}
	for i := range invoiceIDs {
		due := monthStart.AddDate(0, 0, 10)
		_, err = db.ExecContext(ctx, `INSERT INTO invoices (id,nomor_invoice,kontrak_id,penyewa_id,properti_id,periode_mulai,periode_selesai,
			jumlah_pokok,item_tambahan,diskon,denda,total,tanggal_jatuh_tempo,status,created_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[{"nama":"Listrik","jumlah":150000}]',0,0,$9,$10,$11,$12)`,
			invoiceIDs[i], fmt.Sprintf("INV-%s-%04d", monthStart.Format("200601"), i+1), contractIDs[i], tenantIDs[i], roomsForProp[i],
			monthStart, monthEnd, []int64{1500000, 1600000, 2500000}[i], []int64{1650000, 1750000, 2650000}[i], due, statuses[i], now.AddDate(0, 0, -i))
		if err != nil {
			logger.Error(err, "insert invoice")
		}
	}
	_, _ = db.ExecContext(ctx, `UPDATE invoices SET tanggal_bayar=now(), metode_bayar='transfer_bank' WHERE id=$1`, invoiceIDs[0])
	_, _ = db.ExecContext(ctx, `INSERT INTO payments (tagihan_id,jumlah,metode,bukti_bayar,tanggal_bayar,status,diverifikasi_oleh)
		VALUES ($1,1650000,'transfer_bank','/uploads/bukti-contoh.jpg',$2,'verified',$3)`, invoiceIDs[0], now.AddDate(0, 0, -5), ownerID)
	_, _ = db.ExecContext(ctx, `INSERT INTO payments (tagihan_id,jumlah,metode,bukti_bayar,tanggal_bayar,status)
		VALUES ($1,800000,'transfer_bank','/uploads/bukti-contoh-2.jpg',$2,'pending')`, invoiceIDs[2], now.AddDate(0, 0, -1))

	tickets := []struct {
		judul, kategori, prioritas, status string
	}{
		{"AC kamar tidak dingin", "listrik", "urgent", "open"},
		{"Kran air bocor", "air", "tinggi", "in_progress"},
		{"Lemari rusak", "furniture", "sedang", "resolved"},
	}
	for i, t := range tickets {
		_, err = db.ExecContext(ctx, `INSERT INTO tickets (nomor_tiket,penyewa_id,kamar_id,properti_id,judul,deskripsi,kategori,prioritas,foto,status,assigned_to,resolusi,resolved_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[]',$9,$10,$11,$12)`,
			fmt.Sprintf("TKT-%s-%04d", monthStart.Format("200601"), i+1), tenantIDs[i], roomIDs[i], roomsForProp[i],
			t.judul, "Mohon dibantu segera, terima kasih.", t.kategori, t.prioritas, t.status, managerID,
			map[string]string{"resolved": "Sudah diperbaiki"}[t.status], map[bool]interface{}{true: now, false: nil}[t.status == "resolved"])
		if err != nil {
			logger.Error(err, "insert ticket")
		}
	}

	_, _ = db.ExecContext(ctx, `INSERT INTO settings (owner_id,key,value) VALUES ($1,'denda','{"nominal":10000,"tipe":"harian","grace_period":3}')
		ON CONFLICT (owner_id,key) DO NOTHING`, ownerID)
	_, _ = db.ExecContext(ctx, `INSERT INTO bank_accounts (owner_id,bank,nomor_rekening,nama_pemilik,is_primary)
		VALUES ($1,'BCA','1234567890','Budi Santoso',TRUE)`, ownerID)

	logger.Info("seed selesai. Login: owner@kosman.id / manager@kosman.id / penyewa1@kosman.id (password: Admin123)")
}
