package service

import (
	"context"
	"encoding/json"

	"github.com/kosman/app/internal/model"
	"github.com/kosman/app/internal/pkg/apperror"
)

type SettingService struct{ base }

type BankInput struct {
	Bank          string `json:"bank"`
	NomorRekening string `json:"nomor_rekening"`
	NamaPemilik   string `json:"nama_pemilik"`
	IsPrimary     bool   `json:"is_primary"`
}

var defaultSettings = map[string]string{
	"denda":          `{"nominal":10000,"tipe":"harian","grace_period":3}`,
	"reminder":       `{"invoice_h":3,"kontrak_h":7}`,
	"invoice_footer": "Terima kasih atas pembayaran Anda.",
	"kontrak_template": "<h1>Kontrak Sewa</h1><p>Nama penyewa: {{nama}}</p>",
	"timezone":       "Asia/Jakarta",
	"date_format":    "DD/MM/YYYY",
	"branding":       `{"nama":"KosMan","logo":""}`,
	"notifikasi":     `{"invoice_created":true,"invoice_reminder":true,"payment_verified":true,"ticket_resolved":true}`,
}

func (s *SettingService) GetAll(ctx context.Context, ownerID string) (map[string]json.RawMessage, error) {
	out := map[string]json.RawMessage{}
	for k, v := range defaultSettings {
		out[k] = json.RawMessage(v)
	}
	rows, err := s.db.QueryContext(ctx, `SELECT key, value::text FROM settings WHERE owner_id=$1`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		if rows.Scan(&k, &v) == nil {
			out[k] = json.RawMessage(v)
		}
	}
	return out, nil
}

func (s *SettingService) Upsert(ctx context.Context, ownerID, key string, value json.RawMessage) error {
	if key == "" || len(value) == 0 {
		return apperror.BadRequest("Key dan value wajib diisi")
	}
	if !json.Valid(value) {
		return apperror.BadRequest("Value harus berupa JSON valid")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO settings (owner_id, key, value) VALUES ($1,$2,$3)
		ON CONFLICT (owner_id, key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, ownerID, key, string(value))
	return err
}

func (s *SettingService) ListBanks(ctx context.Context, ownerID string) ([]model.BankAccount, error) {
	var list []model.BankAccount
	err := s.db.SelectContext(ctx, &list, `SELECT * FROM bank_accounts WHERE owner_id=$1 ORDER BY is_primary DESC, created_at`, ownerID)
	return list, err
}

func (s *SettingService) CreateBank(ctx context.Context, ownerID string, in BankInput) (*model.BankAccount, error) {
	if in.Bank == "" || in.NomorRekening == "" || in.NamaPemilik == "" {
		return nil, apperror.BadRequest("Bank, nomor rekening, dan nama pemilik wajib diisi")
	}
	var b model.BankAccount
	err := s.db.QueryRowxContext(ctx, `INSERT INTO bank_accounts (owner_id, bank, nomor_rekening, nama_pemilik, is_primary)
		VALUES ($1,$2,$3,$4,$5) RETURNING *`, ownerID, in.Bank, in.NomorRekening, in.NamaPemilik, in.IsPrimary).StructScan(&b)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	if in.IsPrimary {
		_, _ = s.db.ExecContext(ctx, `UPDATE bank_accounts SET is_primary=FALSE WHERE owner_id=$1 AND id<>$2`, ownerID, b.ID)
	}
	return &b, nil
}

func (s *SettingService) DeleteBank(ctx context.Context, ownerID, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM bank_accounts WHERE id=$1 AND owner_id=$2`, id, ownerID)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return apperror.NotFound("Rekening tidak ditemukan")
	}
	return nil
}
