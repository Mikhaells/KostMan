package service

import (
	"context"
	"strings"

	"github.com/kosman/app/internal/model"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/pagination"
)

type PropertyService struct{ base }

type PropertyInput struct {
	Nama      string   `json:"nama"`
	Tipe      string   `json:"tipe"`
	Alamat    string   `json:"alamat"`
	Kota      string   `json:"kota"`
	Provinsi  string   `json:"provinsi"`
	KodePos   string   `json:"kode_pos"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
	Deskripsi string   `json:"deskripsi"`
	Fasilitas []string `json:"fasilitas"`
	Foto      []string `json:"foto"`
	Status    string   `json:"status"`
}

var allowedPropertyTypes = map[string]bool{
	"kos_putri": true, "kos_putra": true, "kos_campur": true, "kontrakan": true, "rumah": true,
}

func validateProperty(in PropertyInput) error {
	if len(strings.TrimSpace(in.Nama)) < 3 {
		return apperror.BadRequest("Nama properti minimal 3 karakter")
	}
	if !allowedPropertyTypes[in.Tipe] {
		return apperror.BadRequest("Tipe properti tidak valid")
	}
	if strings.TrimSpace(in.Alamat) == "" || strings.TrimSpace(in.Kota) == "" || strings.TrimSpace(in.Provinsi) == "" {
		return apperror.BadRequest("Alamat, kota, dan provinsi wajib diisi")
	}
	if len(in.Foto) > 10 {
		return apperror.BadRequest("Maksimal 10 foto properti")
	}
	return nil
}

func statusOrDefault(s string, allowed map[string]bool, fallback string) string {
	if s == "" {
		return fallback
	}
	if !allowed[s] {
		return fallback
	}
	return s
}

func (s *PropertyService) List(ctx context.Context, userID, role string, q pagination.Query, search, status string) ([]model.Property, int, error) {
	conditions := []string{"p.deleted_at IS NULL"}
	args := []interface{}{}
	if role == "owner" {
		args = append(args, userID)
		conditions = append(conditions, "p.owner_id = $"+itoa(len(args)))
	}
	if search != "" {
		args = append(args, "%"+search+"%")
		conditions = append(conditions, "(p.nama ILIKE $"+itoa(len(args))+" OR p.kota ILIKE $"+itoa(len(args))+")")
	}
	if status != "" {
		args = append(args, status)
		conditions = append(conditions, "p.status = $"+itoa(len(args)))
	}
	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT count(*) FROM properties p WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	query := `SELECT p.*, (SELECT count(*) FROM rooms r WHERE r.properti_id = p.id) AS jumlah_kamar
		FROM properties p WHERE ` + where + ` ORDER BY p.created_at DESC LIMIT $` + itoa(len(args)+1) + ` OFFSET $` + itoa(len(args)+2)
	args = append(args, q.Limit, q.Offset())
	var list []model.Property
	err := s.db.SelectContext(ctx, &list, query, args...)
	return list, total, err
}

func (s *PropertyService) Get(ctx context.Context, id, userID, role string) (*model.Property, error) {
	var p model.Property
	err := s.db.QueryRowxContext(ctx, `SELECT p.*, (SELECT count(*) FROM rooms r WHERE r.properti_id = p.id) AS jumlah_kamar
		FROM properties p WHERE p.id=$1 AND p.deleted_at IS NULL`, id).StructScan(&p)
	if err != nil {
		return nil, apperror.NotFound("Properti tidak ditemukan")
	}
	if role == "owner" && p.OwnerID != userID {
		return nil, apperror.Forbidden("Properti bukan milik Anda")
	}
	return &p, nil
}

func (s *PropertyService) Create(ctx context.Context, ownerID string, in PropertyInput) (*model.Property, error) {
	if err := validateProperty(in); err != nil {
		return nil, err
	}
	in.Status = statusOrDefault(in.Status, map[string]bool{"aktif": true, "nonaktif": true, "maintenance": true}, "aktif")
	var p model.Property
	err := s.db.QueryRowxContext(ctx, `
		INSERT INTO properties (owner_id, nama, tipe, alamat, kota, provinsi, kode_pos, latitude, longitude, deskripsi, fasilitas, foto, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
		ownerID, strings.TrimSpace(in.Nama), in.Tipe, in.Alamat, in.Kota, in.Provinsi, strPtr(in.KodePos),
		in.Latitude, in.Longitude, strPtr(in.Deskripsi), model.StringSlice(in.Fasilitas), model.StringSlice(in.Foto), in.Status).StructScan(&p)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	return &p, nil
}

func (s *PropertyService) Update(ctx context.Context, id, userID, role string, in PropertyInput) (*model.Property, error) {
	if _, err := s.Get(ctx, id, userID, role); err != nil {
		return nil, err
	}
	if err := validateProperty(in); err != nil {
		return nil, err
	}
	in.Status = statusOrDefault(in.Status, map[string]bool{"aktif": true, "nonaktif": true, "maintenance": true}, "aktif")
	var p model.Property
	err := s.db.QueryRowxContext(ctx, `
		UPDATE properties SET nama=$1, tipe=$2, alamat=$3, kota=$4, provinsi=$5, kode_pos=$6,
		latitude=$7, longitude=$8, deskripsi=$9, fasilitas=$10, foto=$11, status=$12
		WHERE id=$13 AND deleted_at IS NULL RETURNING *`,
		strings.TrimSpace(in.Nama), in.Tipe, in.Alamat, in.Kota, in.Provinsi, strPtr(in.KodePos),
		in.Latitude, in.Longitude, strPtr(in.Deskripsi), model.StringSlice(in.Fasilitas), model.StringSlice(in.Foto), in.Status, id).StructScan(&p)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	return &p, nil
}

func (s *PropertyService) Delete(ctx context.Context, id string) error {
	var active int
	if err := s.db.GetContext(ctx, &active, `
		SELECT count(*) FROM contracts c JOIN rooms r ON r.id = c.kamar_id
		WHERE r.properti_id = $1 AND c.status = 'aktif'`, id); err != nil {
		return err
	}
	if active > 0 {
		return apperror.Conflict("Properti masih memiliki kamar dengan kontrak aktif")
	}
	result, err := s.db.ExecContext(ctx, `UPDATE properties SET deleted_at = now() WHERE id=$1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return apperror.NotFound("Properti tidak ditemukan")
	}
	return nil
}

func (s *PropertyService) Restore(ctx context.Context, id string) (*model.Property, error) {
	var p model.Property
	err := s.db.QueryRowxContext(ctx, `UPDATE properties SET deleted_at = NULL WHERE id=$1 RETURNING *`, id).StructScan(&p)
	if err != nil {
		return nil, apperror.NotFound("Properti tidak ditemukan")
	}
	return &p, nil
}

func (s *PropertyService) ListDeleted(ctx context.Context, q pagination.Query) ([]model.Property, int, error) {
	var total int
	_ = s.db.GetContext(ctx, &total, `SELECT count(*) FROM properties WHERE deleted_at IS NOT NULL`)
	var list []model.Property
	err := s.db.SelectContext(ctx, &list, `SELECT * FROM properties WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT $1 OFFSET $2`, q.Limit, q.Offset())
	return list, total, err
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := ""
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return digits
}
