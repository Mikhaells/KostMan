package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/kosman/app/internal/model"
	"github.com/kosman/app/internal/pdf"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/crypto"
	"github.com/kosman/app/internal/pkg/pagination"
)

type ContractService struct{ base }

type ContractInput struct {
	PenyewaID      string `json:"penyewa_id"`
	KamarID        string `json:"kamar_id"`
	TanggalMulai   string `json:"tanggal_mulai"`
	TanggalSelesai string `json:"tanggal_selesai"`
	HargaSewa      int64  `json:"harga_sewa"`
	Deposit        int64  `json:"deposit"`
	DepositDibayar bool   `json:"deposit_dibayar"`
	Catatan        string `json:"catatan"`
	DokumenKontrak string `json:"dokumen_kontrak"`
}

func (s *ContractService) List(ctx context.Context, tenantID, roomID, propertyID, status string, q pagination.Query) ([]model.Contract, int, error) {
	conditions := []string{"1=1"}
	args := []interface{}{}
	add := func(col, val string) {
		if val != "" {
			args = append(args, val)
			conditions = append(conditions, col+" = $"+itoa(len(args)))
		}
	}
	add("c.penyewa_id", tenantID)
	add("c.kamar_id", roomID)
	add("r.properti_id", propertyID)
	add("c.status", status)
	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT count(*) FROM contracts c JOIN rooms r ON r.id=c.kamar_id WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	args = append(args, q.Limit, q.Offset())
	var list []model.Contract
	err := s.db.SelectContext(ctx, &list, `SELECT c.*, t.nama_lengkap AS nama_penyewa, r.nomor AS nomor_kamar, p.nama AS nama_properti
		FROM contracts c JOIN tenants t ON t.id=c.penyewa_id JOIN rooms r ON r.id=c.kamar_id JOIN properties p ON p.id=r.properti_id
		WHERE `+where+` ORDER BY c.tanggal_mulai DESC LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	return list, total, err
}

func (s *ContractService) Get(ctx context.Context, id string) (*model.Contract, error) {
	var c model.Contract
	err := s.db.QueryRowxContext(ctx, `SELECT c.*, t.nama_lengkap AS nama_penyewa, r.nomor AS nomor_kamar, p.nama AS nama_properti
		FROM contracts c JOIN tenants t ON t.id=c.penyewa_id JOIN rooms r ON r.id=c.kamar_id JOIN properties p ON p.id=r.properti_id
		WHERE c.id=$1`, id).StructScan(&c)
	if err != nil {
		return nil, apperror.NotFound("Kontrak tidak ditemukan")
	}
	return &c, nil
}

func (s *ContractService) Create(ctx context.Context, createdBy string, in ContractInput) (*model.Contract, error) {
	start, err := parseDate(in.TanggalMulai)
	if err != nil {
		return nil, err
	}
	end, err := parseDate(in.TanggalSelesai)
	if err != nil {
		return nil, err
	}
	if !end.After(start) {
		return nil, apperror.BadRequest("Tanggal selesai harus setelah tanggal mulai")
	}
	if end.Before(start.AddDate(0, 1, 0)) {
		return nil, apperror.BadRequest("Kontrak minimal 1 bulan")
	}
	var fotoKTP string
	if err = s.db.GetContext(ctx, &fotoKTP, `SELECT coalesce(foto_ktp,'') FROM tenants WHERE id=$1`, in.PenyewaID); err != nil {
		return nil, apperror.BadRequest("Penyewa tidak ditemukan")
	}
	if fotoKTP == "" {
		return nil, apperror.BadRequest("Foto KTP penyewa wajib diunggah sebelum membuat kontrak")
	}
	var room model.Room
	if err = s.db.QueryRowxContext(ctx, `SELECT * FROM rooms WHERE id=$1`, in.KamarID).StructScan(&room); err != nil {
		return nil, apperror.BadRequest("Kamar tidak ditemukan")
	}
	if room.Status == "maintenance" {
		return nil, apperror.Conflict("Kamar sedang dalam maintenance")
	}
	var active int
	_ = s.db.GetContext(ctx, &active, `SELECT count(*) FROM contracts WHERE kamar_id=$1 AND status='aktif'`, in.KamarID)
	if active > 0 {
		return nil, apperror.Conflict("Kamar sudah memiliki kontrak aktif")
	}
	price := in.HargaSewa
	if price <= 0 {
		price = room.HargaBulanan
	}
	deposit := in.Deposit
	if deposit <= 0 {
		deposit = room.Deposit
	}
	number, err := nextNumber(ctx, s.db, "contracts", "nomor_kontrak", "KTR-"+start.Format("200601")+"-")
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	var c model.Contract
	err = s.db.QueryRowxContext(ctx, `
		INSERT INTO contracts (nomor_kontrak, penyewa_id, kamar_id, tanggal_mulai, tanggal_selesai,
			harga_sewa, deposit, deposit_dibayar, status, catatan, dokumen_kontrak, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'aktif',$9,$10,$11) RETURNING *`,
		number, in.PenyewaID, in.KamarID, start, end, price, deposit, in.DepositDibayar, strPtr(in.Catatan), strPtr(in.DokumenKontrak), createdBy).StructScan(&c)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, apperror.Conflict("Nomor kontrak duplikat, coba lagi")
		}
		return nil, apperror.Internal(err.Error())
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE rooms SET status='terisi' WHERE id=$1`, in.KamarID)
	_, _ = s.db.ExecContext(ctx, `UPDATE tenants SET status='aktif' WHERE id=$1`, in.PenyewaID)
	return s.Get(ctx, c.ID)
}

func (s *ContractService) Renew(ctx context.Context, id, newEnd string, createdBy string) (*model.Contract, error) {
	old, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if old.Status != "aktif" {
		return nil, apperror.Conflict("Hanya kontrak aktif yang dapat diperpanjang")
	}
	end, err := parseDate(newEnd)
	if err != nil {
		return nil, err
	}
	start := old.TanggalSelesai.AddDate(0, 0, 1)
	if !end.After(start) {
		return nil, apperror.BadRequest("Tanggal selesai baru harus setelah kontrak lama")
	}
	var room model.Room
	if err = s.db.QueryRowxContext(ctx, `SELECT * FROM rooms WHERE id=$1`, old.KamarID).StructScan(&room); err != nil {
		return nil, apperror.Internal(err.Error())
	}
	number, err := nextNumber(ctx, s.db, "contracts", "nomor_kontrak", "KTR-"+start.Format("200601")+"-")
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE contracts SET status='diperpanjang' WHERE id=$1`, old.ID); err != nil {
		return nil, apperror.Internal(err.Error())
	}
	var c model.Contract
	err = tx.QueryRowxContext(ctx, `
		INSERT INTO contracts (nomor_kontrak, penyewa_id, kamar_id, tanggal_mulai, tanggal_selesai,
			harga_sewa, deposit, deposit_dibayar, status, catatan, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'aktif',$9,$10) RETURNING *`,
		number, old.PenyewaID, old.KamarID, start, end, room.HargaBulanan, old.Deposit, old.DepositDibayar,
		strPtr("Perpanjangan dari "+old.NomorKontrak), createdBy).StructScan(&c)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	if _, err = tx.ExecContext(ctx, `UPDATE rooms SET status='terisi' WHERE id=$1`, old.KamarID); err != nil {
		return nil, apperror.Internal(err.Error())
	}
	if err = tx.Commit(); err != nil {
		return nil, apperror.Internal(err.Error())
	}
	return s.Get(ctx, c.ID)
}

func (s *ContractService) Terminate(ctx context.Context, id, status, note string) (*model.Contract, error) {
	c, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if status == "" {
		status = "selesai"
	}
	if status != "selesai" && status != "batal" {
		return nil, apperror.BadRequest("Status akhir kontrak tidak valid")
	}
	if c.Status != "aktif" {
		return nil, apperror.Conflict("Kontrak tidak dalam status aktif")
	}
	catatan := note
	if c.Catatan != nil && *c.Catatan != "" {
		catatan = *c.Catatan + " | " + note
	}
	var updated model.Contract
	err = s.db.QueryRowxContext(ctx, `UPDATE contracts SET status=$1, catatan=$2 WHERE id=$3 RETURNING *`, status, strPtr(catatan), id).StructScan(&updated)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE rooms SET status='kosong' WHERE id=$1`, c.KamarID)
	var otherActive int
	_ = s.db.GetContext(ctx, &otherActive, `SELECT count(*) FROM contracts WHERE penyewa_id=$1 AND status='aktif'`, c.PenyewaID)
	if otherActive == 0 {
		_, _ = s.db.ExecContext(ctx, `UPDATE tenants SET status='nonaktif' WHERE id=$1`, c.PenyewaID)
	}
	return s.Get(ctx, id)
}

func (s *ContractService) PDF(ctx context.Context, id string) ([]byte, string, error) {
	c, err := s.Get(ctx, id)
	if err != nil {
		return nil, "", err
	}
	var t model.Tenant
	if err = s.db.GetContext(ctx, &t, `SELECT * FROM tenants WHERE id=$1`, c.PenyewaID); err != nil {
		return nil, "", err
	}
	if plain, err2 := crypto.Decrypt(t.NIK, s.cfg.EncryptionKey); err2 == nil {
		t.NIK = plain
	}
	var roomNo, propName, ownerName string
	if err = s.db.GetContext(ctx, &roomNo, `SELECT nomor FROM rooms WHERE id=$1`, c.KamarID); err != nil {
		return nil, "", err
	}
	if err = s.db.GetContext(ctx, &propName, `SELECT p.nama FROM properties p JOIN rooms r ON r.properti_id=p.id WHERE r.id=$1`, c.KamarID); err != nil {
		return nil, "", err
	}
	if err = s.db.GetContext(ctx, &ownerName, `SELECT u.nama FROM users u JOIN properties p ON p.owner_id=u.id JOIN rooms r ON r.properti_id=p.id WHERE r.id=$1`, c.KamarID); err != nil {
		ownerName = "Pemilik Kos"
	}
	out, err := pdf.Contract(c, &t, roomNo, propName, ownerName)
	if err != nil {
		return nil, "", apperror.Internal(err.Error())
	}
	return out, fmt.Sprintf("kontrak-%s.pdf", c.NomorKontrak), nil
}

func (s *ContractService) Expiring(ctx context.Context, days int) ([]model.Contract, error) {
	var list []model.Contract
	err := s.db.SelectContext(ctx, &list, `SELECT c.*, t.nama_lengkap AS nama_penyewa FROM contracts c
		JOIN tenants t ON t.id=c.penyewa_id
		WHERE c.status='aktif' AND c.tanggal_selesai BETWEEN now()::date AND (now() + ($1 || ' days')::interval)::date`, days)
	return list, err
}

func (s *ContractService) FinalizeExpired(ctx context.Context) (int, error) {
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT id, penyewa_id, kamar_id FROM contracts WHERE status='aktif' AND tanggal_selesai < now()::date`)
	if err != nil {
		return 0, err
	}
	type item struct{ id, tenant, room string }
	var items []item
	for rows.Next() {
		var it item
		if err = rows.Scan(&it.id, &it.tenant, &it.room); err != nil {
			rows.Close()
			return 0, err
		}
		items = append(items, it)
	}
	rows.Close()
	for _, it := range items {
		if _, err = tx.ExecContext(ctx, `UPDATE contracts SET status='selesai' WHERE id=$1`, it.id); err != nil {
			return 0, err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE rooms SET status='kosong' WHERE id=$1`, it.room); err != nil {
			return 0, err
		}
		var active int
		_ = tx.GetContext(ctx, &active, `SELECT count(*) FROM contracts WHERE penyewa_id=$1 AND status='aktif'`, it.tenant)
		if active == 0 {
			if _, err = tx.ExecContext(ctx, `UPDATE tenants SET status='nonaktif' WHERE id=$1`, it.tenant); err != nil {
				return 0, err
			}
		}
	}
	if err = tx.Commit(); err != nil {
		return 0, err
	}
	return len(items), nil
}

