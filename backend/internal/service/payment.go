package service

import (
	"context"
	"strings"

	"github.com/kosman/app/internal/model"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/pagination"
)

type PaymentService struct{ base }

type PaymentInput struct {
	TagihanID    string `json:"tagihan_id"`
	Jumlah       int64  `json:"jumlah"`
	Metode       string `json:"metode"`
	BuktiBayar   string `json:"bukti_bayar"`
	TanggalBayar string `json:"tanggal_bayar"`
	CatatanAdmin string `json:"catatan_admin"`
}

var allowedPaymentMethods = map[string]bool{"transfer_bank": true, "cash": true, "ewallet": true}

func (s *PaymentService) List(ctx context.Context, invoiceID, status string, q pagination.Query) ([]model.Payment, int, error) {
	conditions := []string{"1=1"}
	args := []interface{}{}
	if invoiceID != "" {
		args = append(args, invoiceID)
		conditions = append(conditions, "p.tagihan_id = $1")
	}
	if status != "" {
		args = append(args, status)
		conditions = append(conditions, "p.status = $"+itoa(len(args)))
	}
	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT count(*) FROM payments p WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	args = append(args, q.Limit, q.Offset())
	var list []model.Payment
	err := s.db.SelectContext(ctx, &list, `SELECT p.*, i.nomor_invoice, t.nama_lengkap AS nama_penyewa
		FROM payments p JOIN invoices i ON i.id=p.tagihan_id JOIN tenants t ON t.id=i.penyewa_id
		WHERE `+where+` ORDER BY p.created_at DESC LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	return list, total, err
}

func (s *PaymentService) Get(ctx context.Context, id string) (*model.Payment, error) {
	var p model.Payment
	err := s.db.QueryRowxContext(ctx, `SELECT p.*, i.nomor_invoice FROM payments p JOIN invoices i ON i.id=p.tagihan_id WHERE p.id=$1`, id).StructScan(&p)
	if err != nil {
		return nil, apperror.NotFound("Pembayaran tidak ditemukan")
	}
	return &p, nil
}

func (s *PaymentService) canAccess(ctx context.Context, userID, role, invoiceID string) error {
	if role == "tenant" {
		var owner string
		err := s.db.GetContext(ctx, &owner, `SELECT coalesce(user_id::text,'') FROM tenants WHERE id=(SELECT penyewa_id FROM invoices WHERE id=$1)`, invoiceID)
		if err != nil || owner != userID {
			return apperror.Forbidden("Tagihan bukan milik Anda")
		}
	}
	return nil
}

func (s *PaymentService) Create(ctx context.Context, userID, role string, in PaymentInput, admin bool) (*model.Payment, error) {
	if err := s.canAccess(ctx, userID, role, in.TagihanID); err != nil {
		return nil, err
	}
	if in.Jumlah <= 0 {
		return nil, apperror.BadRequest("Jumlah pembayaran harus lebih dari 0")
	}
	if !allowedPaymentMethods[in.Metode] {
		return nil, apperror.BadRequest("Metode pembayaran tidak valid")
	}
	if in.Metode == "transfer_bank" && strings.TrimSpace(in.BuktiBayar) == "" {
		return nil, apperror.BadRequest("Bukti transfer wajib diunggah")
	}
	date, err := parseDate(in.TanggalBayar)
	if err != nil {
		date = timeNowUTC()
	}
	var inv model.Invoice
	if err = s.db.QueryRowxContext(ctx, `SELECT * FROM invoices WHERE id=$1`, in.TagihanID).StructScan(&inv); err != nil {
		return nil, apperror.NotFound("Tagihan tidak ditemukan")
	}
	if inv.Status == "batal" || inv.Status == "dibayar" {
		return nil, apperror.Conflict("Tagihan tidak menerima pembayaran baru")
	}
	status := "pending"
	if admin {
		status = "verified"
	}
	var verifier *string
	if admin {
		verifier = &userID
	}
	var p model.Payment
	err = s.db.QueryRowxContext(ctx, `
		INSERT INTO payments (tagihan_id, jumlah, metode, bukti_bayar, tanggal_bayar, status, diverifikasi_oleh, catatan_admin)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
		in.TagihanID, in.Jumlah, in.Metode, strPtr(in.BuktiBayar), date, status, verifier, strPtr(in.CatatanAdmin)).StructScan(&p)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	if admin {
		if err = s.recomputeInvoice(ctx, in.TagihanID, inv); err != nil {
			return nil, err
		}
	} else {
		s.svc.Notification.NotifyAdmins(ctx, "Bukti pembayaran baru", "Pembayaran untuk invoice "+inv.NomorInvoice+" menunggu verifikasi.", "payment_pending", map[string]interface{}{"tagihan_id": in.TagihanID})
	}
	return s.Get(ctx, p.ID)
}

func (s *PaymentService) Verify(ctx context.Context, id, adminID string) (*model.Payment, error) {
	p, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if p.Status == "verified" {
		return nil, apperror.Conflict("Pembayaran sudah diverifikasi")
	}
	_, err = s.db.ExecContext(ctx, `UPDATE payments SET status='verified', diverifikasi_oleh=$1, catatan_admin=NULL WHERE id=$2`, adminID, id)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	var inv model.Invoice
	if err = s.db.QueryRowxContext(ctx, `SELECT * FROM invoices WHERE id=$1`, p.TagihanID).StructScan(&inv); err != nil {
		return nil, apperror.Internal(err.Error())
	}
	if err = s.recomputeInvoice(ctx, p.TagihanID, inv); err != nil {
		return nil, err
	}
	var email string
	_ = s.db.GetContext(ctx, &email, `SELECT email FROM tenants WHERE id=$1`, inv.PenyewaID)
	_ = s.mailer.PaymentVerified(email, inv.NomorInvoice, p.Jumlah)
	s.notifyPayment(ctx, inv, "Pembayaran diverifikasi", "Pembayaran Anda telah diverifikasi.", "payment_verified")
	return s.Get(ctx, id)
}

func (s *PaymentService) Reject(ctx context.Context, id, adminID, reason string) (*model.Payment, error) {
	p, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	_ = p
	if strings.TrimSpace(reason) == "" {
		return nil, apperror.BadRequest("Alasan penolakan wajib diisi")
	}
	_, err = s.db.ExecContext(ctx, `UPDATE payments SET status='rejected', diverifikasi_oleh=$1, catatan_admin=$2 WHERE id=$3`, adminID, reason, id)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	return s.Get(ctx, id)
}

func (s *PaymentService) notifyPayment(ctx context.Context, inv model.Invoice, judul, isi, tipe string) {
	var userID string
	_ = s.db.GetContext(ctx, &userID, `SELECT coalesce(user_id::text,'') FROM tenants WHERE id=$1`, inv.PenyewaID)
	if userID != "" {
		_ = s.svc.Notification.Create(ctx, userID, judul, isi, tipe, map[string]interface{}{"invoice_id": inv.ID})
	}
}

func (s *PaymentService) recomputeInvoice(ctx context.Context, invoiceID string, inv model.Invoice) error {
	var paid int64
	var method string
	err := s.db.QueryRowContext(ctx, `SELECT coalesce(sum(jumlah),0) FROM payments WHERE tagihan_id=$1 AND status='verified'`, invoiceID).Scan(&paid)
	if err != nil {
		return apperror.Internal(err.Error())
	}
	_ = s.db.QueryRowContext(ctx, `SELECT metode FROM payments WHERE tagihan_id=$1 AND status='verified' ORDER BY created_at DESC LIMIT 1`, invoiceID).Scan(&method)
	status := "sebagian"
	if paid >= inv.Total {
		status = "dibayar"
	}
	if paid > 0 && inv.TanggalJatuhTempo.Before(timeNowUTC()) && status == "sebagian" {
		status = "terlambat"
	}
	if status == "dibayar" {
		_, err = s.db.ExecContext(ctx, `UPDATE invoices SET status=$1, tanggal_bayar=now(), metode_bayar=$2 WHERE id=$3`, status, method, invoiceID)
	} else {
		_, err = s.db.ExecContext(ctx, `UPDATE invoices SET status=$1, metode_bayar=$2 WHERE id=$3`, status, method, invoiceID)
	}
	return err
}
