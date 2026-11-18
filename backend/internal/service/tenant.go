package service

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/kosman/app/internal/model"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/crypto"
	"github.com/kosman/app/internal/pkg/pagination"
	"golang.org/x/crypto/bcrypt"
)

type TenantService struct{ base }

type TenantInput struct {
	NamaLengkap       string   `json:"nama_lengkap"`
	NIK               string   `json:"nik"`
	Email             string   `json:"email"`
	NoHP              string   `json:"no_hp"`
	AlamatAsal        string   `json:"alamat_asal"`
	Pekerjaan         string   `json:"pekerjaan"`
	KontakDaruratNama string   `json:"kontak_darurat_nama"`
	KontakDaruratHP   string   `json:"kontak_darurat_hp"`
	FotoKTP           string   `json:"foto_ktp"`
	DokumenLain       []string `json:"dokumen_lain"`
	Status            string   `json:"status"`
	Password          string   `json:"password"`
	BuatAkunPortal    bool     `json:"buat_akun_portal"`
}

func validateTenant(in TenantInput) error {
	if strings.TrimSpace(in.NamaLengkap) == "" {
		return apperror.BadRequest("Nama lengkap wajib diisi")
	}
	if err := validateNIK(strings.TrimSpace(in.NIK)); err != nil {
		return err
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if !validEmail(in.Email) {
		return apperror.BadRequest("Email tidak valid")
	}
	if err := validatePhone(in.NoHP); err != nil {
		return err
	}
	if strings.TrimSpace(in.KontakDaruratNama) == "" || strings.TrimSpace(in.KontakDaruratHP) == "" {
		return apperror.BadRequest("Kontak darurat wajib diisi")
	}
	return nil
}

func (s *TenantService) decrypt(t *model.Tenant) {
	if plain, err := crypto.Decrypt(t.NIK, s.cfg.EncryptionKey); err == nil {
		t.NIK = plain
	}
}

func (s *TenantService) List(ctx context.Context, q pagination.Query, search, status string) ([]model.Tenant, int, error) {
	conditions := []string{"1=1"}
	args := []interface{}{}
	if search != "" {
		args = append(args, "%"+search+"%")
		conditions = append(conditions, "(nama_lengkap ILIKE $1 OR email ILIKE $1)")
	}
	if status != "" {
		args = append(args, status)
		conditions = append(conditions, "status = $"+itoa(len(args)))
	}
	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT count(*) FROM tenants WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	args = append(args, q.Limit, q.Offset())
	var list []model.Tenant
	err := s.db.SelectContext(ctx, &list, `SELECT * FROM tenants WHERE `+where+` ORDER BY created_at DESC LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	for i := range list {
		s.decrypt(&list[i])
	}
	return list, total, err
}

func (s *TenantService) Get(ctx context.Context, id string) (*model.Tenant, error) {
	var t model.Tenant
	if err := s.db.GetContext(ctx, &t, `SELECT * FROM tenants WHERE id=$1`, id); err != nil {
		return nil, apperror.NotFound("Penyewa tidak ditemukan")
	}
	s.decrypt(&t)
	return &t, nil
}

func (s *TenantService) GetByUser(ctx context.Context, userID string) (*model.Tenant, error) {
	var t model.Tenant
	if err := s.db.GetContext(ctx, &t, `SELECT * FROM tenants WHERE user_id=$1`, userID); err != nil {
		return nil, apperror.NotFound("Profil penyewa tidak ditemukan")
	}
	s.decrypt(&t)
	return &t, nil
}

func (s *TenantService) Create(ctx context.Context, in TenantInput) (*model.Tenant, error) {
	if err := validateTenant(in); err != nil {
		return nil, err
	}
	if strings.TrimSpace(in.FotoKTP) == "" {
		return nil, apperror.BadRequest("Foto KTP wajib diunggah sebelum kontrak dibuat")
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	nik := strings.TrimSpace(in.NIK)
	encrypted, err := crypto.Encrypt(nik, s.cfg.EncryptionKey)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	status := statusOrDefault(in.Status, map[string]bool{"aktif": true, "nonaktif": true}, "aktif")

	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	defer tx.Rollback()

	var userID *string
	if in.BuatAkunPortal {
		password := in.Password
		if password == "" {
			password = "Kos12345"
		}
		if err = validatePassword(password); err != nil {
			return nil, err
		}
		hash, err := crypto.HashPassword(password)
		if err != nil {
			return nil, apperror.Internal(err.Error())
		}
		var uid string
		err = tx.QueryRowContext(ctx, `INSERT INTO users (nama, email, password_hash, role, no_hp) VALUES ($1,$2,$3,'tenant',$4) RETURNING id`,
			in.NamaLengkap, in.Email, hash, in.NoHP).Scan(&uid)
		if err != nil {
			if isUniqueViolation(err) {
				return nil, apperror.Conflict("Email sudah terdaftar sebagai user")
			}
			return nil, apperror.Internal(err.Error())
		}
		userID = &uid
	}

	var t model.Tenant
	err = tx.QueryRowxContext(ctx, `
		INSERT INTO tenants (nama_lengkap, nik, nik_hash, email, no_hp, alamat_asal, pekerjaan,
			kontak_darurat_nama, kontak_darurat_hp, foto_ktp, dokumen_lain, status, user_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
		strings.TrimSpace(in.NamaLengkap), encrypted, crypto.SHA256Hex(nik), in.Email, in.NoHP, strPtr(in.AlamatAsal),
		strPtr(in.Pekerjaan), in.KontakDaruratNama, in.KontakDaruratHP, in.FotoKTP, model.StringSlice(in.DokumenLain), status, userID).StructScan(&t)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, apperror.Conflict("Email atau NIK sudah terdaftar")
		}
		return nil, apperror.Internal(err.Error())
	}
	if err = tx.Commit(); err != nil {
		return nil, apperror.Internal(err.Error())
	}
	s.decrypt(&t)
	return &t, nil
}

func (s *TenantService) Update(ctx context.Context, id string, in TenantInput) (*model.Tenant, error) {
	old, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if err = validateTenant(in); err != nil {
		return nil, err
	}
	nik := strings.TrimSpace(in.NIK)
	encrypted, err := crypto.Encrypt(nik, s.cfg.EncryptionKey)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	status := statusOrDefault(in.Status, map[string]bool{"aktif": true, "nonaktif": true}, old.Status)
	if in.FotoKTP == "" {
		in.FotoKTP = old.FotoKTP
	}
	var t model.Tenant
	err = s.db.QueryRowxContext(ctx, `
		UPDATE tenants SET nama_lengkap=$1, nik=$2, nik_hash=$3, email=$4, no_hp=$5, alamat_asal=$6,
		pekerjaan=$7, kontak_darurat_nama=$8, kontak_darurat_hp=$9, foto_ktp=$10, dokumen_lain=$11, status=$12
		WHERE id=$13 RETURNING *`,
		strings.TrimSpace(in.NamaLengkap), encrypted, crypto.SHA256Hex(nik), strings.ToLower(in.Email), in.NoHP,
		strPtr(in.AlamatAsal), strPtr(in.Pekerjaan), in.KontakDaruratNama, in.KontakDaruratHP, in.FotoKTP,
		model.StringSlice(in.DokumenLain), status, id).StructScan(&t)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, apperror.Conflict("Email atau NIK sudah terdaftar")
		}
		return nil, apperror.Internal(err.Error())
	}
	s.decrypt(&t)
	return &t, nil
}

func (s *TenantService) SetStatus(ctx context.Context, id, status string) (*model.Tenant, error) {
	if status != "aktif" && status != "nonaktif" {
		return nil, apperror.BadRequest("Status tidak valid")
	}
	var t model.Tenant
	err := s.db.QueryRowxContext(ctx, `UPDATE tenants SET status=$1 WHERE id=$2 RETURNING *`, status, id).StructScan(&t)
	if err != nil {
		return nil, apperror.NotFound("Penyewa tidak ditemukan")
	}
	s.decrypt(&t)
	return &t, nil
}

func (s *TenantService) History(ctx context.Context, tenantID string) ([]model.Contract, error) {
	var list []model.Contract
	err := s.db.SelectContext(ctx, &list, `SELECT c.*, r.nomor AS nomor_kamar, p.nama AS nama_properti
		FROM contracts c JOIN rooms r ON r.id=c.kamar_id JOIN properties p ON p.id=r.properti_id
		WHERE c.penyewa_id=$1 ORDER BY c.tanggal_mulai DESC`, tenantID)
	return list, err
}

func (s *TenantService) EnsurePortalUser(ctx context.Context, tenantID, password string) (string, error) {
	t, err := s.Get(ctx, tenantID)
	if err != nil {
		return "", err
	}
	if t.UserID != nil && *t.UserID != "" {
		return *t.UserID, nil
	}
	if password == "" {
		password = "Kos12345"
	}
	if err = validatePassword(password); err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return "", err
	}
	uid := uuid.NewString()
	_, err = s.db.ExecContext(ctx, `INSERT INTO users (id, nama, email, password_hash, role, no_hp) VALUES ($1,$2,$3,$4,'tenant',$5)`,
		uid, t.NamaLengkap, t.Email, string(hash), t.NoHP)
	if err != nil {
		if isUniqueViolation(err) {
			return "", apperror.Conflict("Email sudah terdaftar sebagai user")
		}
		return "", err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE tenants SET user_id=$1 WHERE id=$2`, uid, tenantID)
	return uid, err
}
