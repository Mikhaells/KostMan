package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/kosman/app/internal/model"
	"github.com/kosman/app/internal/pdf"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/pagination"
)

type BillingService struct{ base }

type InvoiceInput struct {
	KontrakID         string             `json:"kontrak_id"`
	PeriodeMulai      string             `json:"periode_mulai"`
	PeriodeSelesai    string             `json:"periode_selesai"`
	JumlahPokok       int64              `json:"jumlah_pokok"`
	ItemTambahan      []model.ExtraItem  `json:"item_tambahan"`
	Diskon            int64              `json:"diskon"`
	Denda             int64              `json:"denda"`
	TanggalJatuhTempo string             `json:"tanggal_jatuh_tempo"`
	Status            string             `json:"status"`
	Catatan           string             `json:"catatan"`
}

type dendaConfig struct {
	Nominal     int64  `json:"nominal"`
	Tipe        string `json:"tipe"`
	GracePeriod int    `json:"grace_period"`
}

func (s *BillingService) dendaFor(ctx context.Context, propertyID string) dendaConfig {
	cfg := dendaConfig{Nominal: 10000, Tipe: "harian", GracePeriod: 3}
	var ownerID, raw string
	err := s.db.QueryRowContext(ctx, `SELECT owner_id FROM properties WHERE id=$1`, propertyID).Scan(&ownerID)
	if err != nil {
		return cfg
	}
	err = s.db.QueryRowContext(ctx, `SELECT value::text FROM settings WHERE owner_id=$1 AND key='denda'`, ownerID).Scan(&raw)
	if err != nil || raw == "" {
		return cfg
	}
	var stored dendaConfig
	if json.Unmarshal([]byte(raw), &stored) == nil {
		if stored.Nominal > 0 {
			cfg.Nominal = stored.Nominal
		}
		if stored.Tipe != "" {
			cfg.Tipe = stored.Tipe
		}
		cfg.GracePeriod = stored.GracePeriod
	}
	return cfg
}

func calcTotal(in InvoiceInput) int64 {
	total := in.JumlahPokok - in.Diskon + in.Denda
	for _, item := range in.ItemTambahan {
		total += item.Jumlah
	}
	if total < 0 {
		return 0
	}
	return total
}

func (s *BillingService) notifyTenant(ctx context.Context, tenantID, judul, isi, tipe string) {
	var userID string
	_ = s.db.GetContext(ctx, &userID, `SELECT coalesce(user_id::text,'') FROM tenants WHERE id=$1`, tenantID)
	if userID != "" {
		_ = s.svc.Notification.Create(ctx, userID, judul, isi, tipe, map[string]interface{}{})
	}
	var email, nama string
	_ = s.db.GetContext(ctx, &email, `SELECT email FROM tenants WHERE id=$1`, tenantID)
	_ = s.db.GetContext(ctx, &nama, `SELECT nama_lengkap FROM tenants WHERE id=$1`, tenantID)
	_ = email
	_ = nama
}

func (s *BillingService) Create(ctx context.Context, in InvoiceInput) (*model.Invoice, error) {
	start, err := parseDate(in.PeriodeMulai)
	if err != nil {
		return nil, err
	}
	end, err := parseDate(in.PeriodeSelesai)
	if err != nil {
		return nil, err
	}
	due, err := parseDate(in.TanggalJatuhTempo)
	if err != nil {
		return nil, err
	}
	if end.Before(start) {
		return nil, apperror.BadRequest("Periode selesai harus setelah periode mulai")
	}
	var contract model.Contract
	err = s.db.QueryRowxContext(ctx, `SELECT * FROM contracts WHERE id=$1`, in.KontrakID).StructScan(&contract)
	if err != nil {
		return nil, apperror.BadRequest("Kontrak tidak ditemukan")
	}
	if contract.Status != "aktif" {
		return nil, apperror.Conflict("Tagihan hanya bisa dibuat untuk kontrak aktif")
	}
	if in.JumlahPokok <= 0 {
		in.JumlahPokok = contract.HargaSewa
	}
	var propertiID string
	if err = s.db.GetContext(ctx, &propertiID, `SELECT properti_id FROM rooms WHERE id=$1`, contract.KamarID); err != nil {
		return nil, apperror.Internal(err.Error())
	}
	status := in.Status
	if status == "" {
		status = "terkirim"
	}
	if !map[string]bool{"draft": true, "terkirim": true}[status] {
		status = "terkirim"
	}
	number, err := nextNumber(ctx, s.db, "invoices", "nomor_invoice", "INV-"+start.Format("200601")+"-")
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	total := calcTotal(in)
	var inv model.Invoice
	err = s.db.QueryRowxContext(ctx, `
		INSERT INTO invoices (nomor_invoice, kontrak_id, penyewa_id, properti_id, periode_mulai, periode_selesai,
			jumlah_pokok, item_tambahan, diskon, denda, total, tanggal_jatuh_tempo, status, catatan)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
		number, contract.ID, contract.PenyewaID, propertiID, start, end, in.JumlahPokok,
		model.ExtraItems(in.ItemTambahan), in.Diskon, in.Denda, total, due, status, strPtr(in.Catatan)).StructScan(&inv)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, apperror.Conflict("Nomor invoice duplikat, coba lagi")
		}
		return nil, apperror.Internal(err.Error())
	}
	if status == "terkirim" {
		go func() {
			var email string
			if e := s.db.GetContext(context.Background(), &email, `SELECT email FROM tenants WHERE id=$1`, contract.PenyewaID); e == nil {
				_ = s.mailer.InvoiceCreated(email, inv.NomorInvoice, inv.Total, due.Format("02 Jan 2006"))
			}
		}()
		s.notifyTenant(ctx, contract.PenyewaID, "Tagihan baru "+inv.NomorInvoice, "Tagihan baru telah dibuat dan menunggu pembayaran.", "invoice_created")
	}
	return s.Get(ctx, inv.ID)
}

func (s *BillingService) GenerateMonthly(ctx context.Context) (int, error) {
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	end := start.AddDate(0, 1, 0).AddDate(0, 0, -1)
	due := time.Date(now.Year(), now.Month(), 10, 0, 0, 0, 0, now.Location())
	rows, err := s.db.QueryContext(ctx, `SELECT id, penyewa_id, harga_sewa FROM contracts WHERE status='aktif'`)
	if err != nil {
		return 0, err
	}
	type c struct {
		id, tenant string
		price      int64
	}
	var contracts []c
	for rows.Next() {
		var item c
		if rows.Scan(&item.id, &item.tenant, &item.price) == nil {
			contracts = append(contracts, item)
		}
	}
	rows.Close()

	created := 0
	for _, item := range contracts {
		var exists int
		_ = s.db.GetContext(ctx, &exists, `SELECT count(*) FROM invoices WHERE kontrak_id=$1 AND periode_mulai=$2`, item.id, start)
		if exists > 0 {
			continue
		}
		in := InvoiceInput{
			KontrakID: item.id, PeriodeMulai: start.Format("2006-01-02"), PeriodeSelesai: end.Format("2006-01-02"),
			JumlahPokok: item.price, TanggalJatuhTempo: due.Format("2006-01-02"), Status: "terkirim",
		}
		if _, err = s.Create(ctx, in); err == nil {
			created++
		}
	}
	return created, nil
}

func (s *BillingService) List(ctx context.Context, tenantID, propertyID, status string, q pagination.Query) ([]model.Invoice, int, error) {
	conditions := []string{"1=1"}
	args := []interface{}{}
	add := func(col, val string) {
		if val != "" {
			args = append(args, val)
			conditions = append(conditions, col+" = $"+itoa(len(args)))
		}
	}
	add("i.penyewa_id", tenantID)
	add("i.properti_id", propertyID)
	add("i.status", status)
	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT count(*) FROM invoices i WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	args = append(args, q.Limit, q.Offset())
	var list []model.Invoice
	err := s.db.SelectContext(ctx, &list, `SELECT i.*, t.nama_lengkap AS nama_penyewa, p.nama AS nama_properti, r.nomor AS nomor_kamar
		FROM invoices i JOIN tenants t ON t.id=i.penyewa_id JOIN properties p ON p.id=i.properti_id
		JOIN contracts c ON c.id=i.kontrak_id JOIN rooms r ON r.id=c.kamar_id
		WHERE `+where+` ORDER BY i.tanggal_jatuh_tempo DESC LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	return list, total, err
}

func (s *BillingService) Get(ctx context.Context, id string) (*model.Invoice, error) {
	var inv model.Invoice
	err := s.db.QueryRowxContext(ctx, `SELECT i.*, t.nama_lengkap AS nama_penyewa, p.nama AS nama_properti, r.nomor AS nomor_kamar
		FROM invoices i JOIN tenants t ON t.id=i.penyewa_id JOIN properties p ON p.id=i.properti_id
		JOIN contracts c ON c.id=i.kontrak_id JOIN rooms r ON r.id=c.kamar_id WHERE i.id=$1`, id).StructScan(&inv)
	if err != nil {
		return nil, apperror.NotFound("Tagihan tidak ditemukan")
	}
	return &inv, nil
}

func (s *BillingService) Update(ctx context.Context, id string, in InvoiceInput) (*model.Invoice, error) {
	inv, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if inv.Status == "dibayar" || inv.Status == "batal" {
		return nil, apperror.Conflict("Tagihan yang sudah dibayar/dibatalkan tidak bisa diubah")
	}
	start, err := parseDate(in.PeriodeMulai)
	if err != nil {
		return nil, err
	}
	end, err := parseDate(in.PeriodeSelesai)
	if err != nil {
		return nil, err
	}
	due, err := parseDate(in.TanggalJatuhTempo)
	if err != nil {
		return nil, err
	}
	in.JumlahPokok = inv.JumlahPokok
	total := calcTotal(in)
	var updated model.Invoice
	err = s.db.QueryRowxContext(ctx, `
		UPDATE invoices SET periode_mulai=$1, periode_selesai=$2, item_tambahan=$3, diskon=$4, denda=$5,
		total=$6, tanggal_jatuh_tempo=$7, catatan=$8 WHERE id=$9 RETURNING *`,
		start, end, model.ExtraItems(in.ItemTambahan), in.Diskon, in.Denda, total, due, strPtr(in.Catatan), id).StructScan(&updated)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	return s.Get(ctx, id)
}

func (s *BillingService) Void(ctx context.Context, id string) error {
	inv, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if inv.Status == "dibayar" {
		return apperror.Conflict("Tagihan yang sudah dibayar tidak bisa dihapus, gunakan void dengan pembatalan pembayaran")
	}
	result, err := s.db.ExecContext(ctx, `UPDATE invoices SET status='batal' WHERE id=$1`, id)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return apperror.NotFound("Tagihan tidak ditemukan")
	}
	return nil
}

func (s *BillingService) MarkOverdue(ctx context.Context) (int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT i.id, i.properti_id, i.total, i.tanggal_jatuh_tempo, t.nama_lengkap, t.email
		FROM invoices i JOIN tenants t ON t.id=i.penyewa_id
		WHERE i.status IN ('terkirim','sebagian') AND i.tanggal_jatuh_tempo < now()::date`)
	if err != nil {
		return 0, err
	}
	type row struct {
		id, prop, nama, email string
		total                 int64
		due                   time.Time
	}
	var items []row
	for rows.Next() {
		var r row
		if rows.Scan(&r.id, &r.prop, &r.total, &r.due, &r.nama, &r.email) == nil {
			items = append(items, r)
		}
	}
	rows.Close()

	count := 0
	for _, r := range items {
		days := int(time.Since(r.due).Hours() / 24)
		cfg := s.dendaFor(ctx, r.prop)
		if days > cfg.GracePeriod {
			units := days - cfg.GracePeriod
			switch cfg.Tipe {
			case "mingguan":
				units = units / 7
			case "bulanan":
				units = units / 30
			}
			newDenda := int64(units) * cfg.Nominal
			if newDenda > 0 {
				_, _ = s.db.ExecContext(ctx, `UPDATE invoices SET denda = denda + $1, total = total + $1 WHERE id=$2`, newDenda, r.id)
			}
		}
		if _, err = s.db.ExecContext(ctx, `UPDATE invoices SET status='terlambat' WHERE id=$1`, r.id); err == nil {
			count++
		}
		_ = s.mailer.InvoiceOverdue(r.email, r.id, r.total)
	}
	return count, nil
}

func (s *BillingService) DueReminders(ctx context.Context, days int) (int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT i.nomor_invoice, i.total, i.tanggal_jatuh_tempo, t.email
		FROM invoices i JOIN tenants t ON t.id=i.penyewa_id
		WHERE i.status IN ('terkirim','sebagian') AND i.tanggal_jatuh_tempo = (now() + ($1 || ' days')::interval)::date`, days)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var no, email string
		var total int64
		var due time.Time
		if rows.Scan(&no, &total, &due, &email) != nil {
			continue
		}
		if s.mailer.InvoiceReminder(email, no, total, due.Format("02 Jan 2006")) == nil {
			count++
		}
	}
	return count, rows.Err()
}

func (s *BillingService) PDF(ctx context.Context, id string) ([]byte, string, error) {
	inv, err := s.Get(ctx, id)
	if err != nil {
		return nil, "", err
	}
	var t model.Tenant
	if err = s.db.GetContext(ctx, &t, `SELECT * FROM tenants WHERE id=$1`, inv.PenyewaID); err != nil {
		return nil, "", err
	}
	out, err := pdf.Invoice(inv, &t, inv.NamaProperti)
	if err != nil {
		return nil, "", apperror.Internal(err.Error())
	}
	return out, fmt.Sprintf("invoice-%s.pdf", inv.NomorInvoice), nil
}
