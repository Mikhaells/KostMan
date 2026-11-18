package service

import (
	"context"
	"strings"

	"github.com/kosman/app/internal/model"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/pagination"
)

type RoomService struct{ base }

type RoomInput struct {
	Nomor        string   `json:"nomor"`
	Tipe         string   `json:"tipe"`
	LuasM2       *float64 `json:"luas_m2"`
	HargaBulanan int64    `json:"harga_bulanan"`
	HargaTahunan *int64   `json:"harga_tahunan"`
	Deposit      int64    `json:"deposit"`
	Fasilitas    []string `json:"fasilitas"`
	Foto         []string `json:"foto"`
	Status       string   `json:"status"`
	Keterangan   string   `json:"keterangan"`
}

var allowedRoomStatus = map[string]bool{
	"kosong": true, "terisi": true, "maintenance": true, "reserved": true,
}

func validateRoom(in RoomInput) error {
	if strings.TrimSpace(in.Nomor) == "" || strings.TrimSpace(in.Tipe) == "" {
		return apperror.BadRequest("Nomor dan tipe kamar wajib diisi")
	}
	if in.HargaBulanan <= 0 {
		return apperror.BadRequest("Harga bulanan harus lebih dari 0")
	}
	if len(in.Foto) > 10 {
		return apperror.BadRequest("Maksimal 10 foto kamar")
	}
	return nil
}

func (s *RoomService) List(ctx context.Context, propertyID, status string, q pagination.Query) ([]model.Room, int, error) {
	conditions := []string{"1=1"}
	args := []interface{}{}
	if propertyID != "" {
		args = append(args, propertyID)
		conditions = append(conditions, "r.properti_id = $"+itoa(len(args)))
	}
	if status != "" {
		args = append(args, status)
		conditions = append(conditions, "r.status = $"+itoa(len(args)))
	}
	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT count(*) FROM rooms r WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	args = append(args, q.Limit, q.Offset())
	var list []model.Room
	err := s.db.SelectContext(ctx, &list, `SELECT r.*, p.nama AS nama_properti FROM rooms r JOIN properties p ON p.id=r.properti_id
		WHERE `+where+` ORDER BY r.nomor LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	return list, total, err
}

func (s *RoomService) Get(ctx context.Context, id string) (*model.Room, error) {
	var r model.Room
	err := s.db.QueryRowxContext(ctx, `SELECT r.*, p.nama AS nama_properti FROM rooms r JOIN properties p ON p.id=r.properti_id WHERE r.id=$1`, id).StructScan(&r)
	if err != nil {
		return nil, apperror.NotFound("Kamar tidak ditemukan")
	}
	return &r, nil
}

func (s *RoomService) Create(ctx context.Context, propertyID string, in RoomInput) (*model.Room, error) {
	if err := validateRoom(in); err != nil {
		return nil, err
	}
	in.Status = statusOrDefault(in.Status, allowedRoomStatus, "kosong")
	var exists int
	_ = s.db.GetContext(ctx, &exists, `SELECT count(*) FROM properties WHERE id=$1 AND deleted_at IS NULL`, propertyID)
	if exists == 0 {
		return nil, apperror.NotFound("Properti tidak ditemukan")
	}
	var r model.Room
	err := s.db.QueryRowxContext(ctx, `
		INSERT INTO rooms (properti_id, nomor, tipe, luas_m2, harga_bulanan, harga_tahunan, deposit, fasilitas, foto, status, keterangan)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
		propertyID, strings.TrimSpace(in.Nomor), strings.TrimSpace(in.Tipe), in.LuasM2, in.HargaBulanan,
		in.HargaTahunan, in.Deposit, model.StringSlice(in.Fasilitas), model.StringSlice(in.Foto), in.Status, strPtr(in.Keterangan)).StructScan(&r)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, apperror.Conflict("Nomor kamar sudah digunakan di properti ini")
		}
		return nil, apperror.Internal(err.Error())
	}
	return &r, nil
}

func (s *RoomService) Update(ctx context.Context, id string, in RoomInput) (*model.Room, error) {
	room, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if err = validateRoom(in); err != nil {
		return nil, err
	}
	status := room.Status
	if in.Status != "" && allowedRoomStatus[in.Status] {
		status = in.Status
	}
	var r model.Room
	err = s.db.QueryRowxContext(ctx, `
		UPDATE rooms SET nomor=$1, tipe=$2, luas_m2=$3, harga_bulanan=$4, harga_tahunan=$5,
		deposit=$6, fasilitas=$7, foto=$8, status=$9, keterangan=$10 WHERE id=$11 RETURNING *`,
		strings.TrimSpace(in.Nomor), strings.TrimSpace(in.Tipe), in.LuasM2, in.HargaBulanan, in.HargaTahunan,
		in.Deposit, model.StringSlice(in.Fasilitas), model.StringSlice(in.Foto), status, strPtr(in.Keterangan), id).StructScan(&r)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, apperror.Conflict("Nomor kamar sudah digunakan di properti ini")
		}
		return nil, apperror.Internal(err.Error())
	}
	return &r, nil
}

func (s *RoomService) SetStatus(ctx context.Context, id, status string) (*model.Room, error) {
	if !allowedRoomStatus[status] {
		return nil, apperror.BadRequest("Status kamar tidak valid")
	}
	if _, err := s.Get(ctx, id); err != nil {
		return nil, err
	}
	var r model.Room
	err := s.db.QueryRowxContext(ctx, `UPDATE rooms SET status=$1 WHERE id=$2 RETURNING *`, status, id).StructScan(&r)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	return &r, nil
}

func (s *RoomService) Delete(ctx context.Context, id string) error {
	var active int
	if err := s.db.GetContext(ctx, &active, `SELECT count(*) FROM contracts WHERE kamar_id=$1 AND status='aktif'`, id); err != nil {
		return err
	}
	if active > 0 {
		return apperror.Conflict("Kamar memiliki kontrak aktif dan tidak bisa dihapus")
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM rooms WHERE id=$1`, id)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return apperror.NotFound("Kamar tidak ditemukan")
	}
	return nil
}

func (s *RoomService) Stats(ctx context.Context) (map[string]int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT status, count(*) FROM rooms GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{"kosong": 0, "terisi": 0, "maintenance": 0, "reserved": 0, "total": 0}
	for rows.Next() {
		var status string
		var count int
		if err = rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		out[status] = count
		out["total"] += count
	}
	return out, rows.Err()
}
