package service

import (
	"context"
	"strings"

	"github.com/kosman/app/internal/model"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/pagination"
)

type TicketService struct{ base }

type TicketInput struct {
	Judul     string   `json:"judul"`
	Deskripsi string   `json:"deskripsi"`
	Kategori  string   `json:"kategori"`
	Prioritas string   `json:"prioritas"`
	Foto      []string `json:"foto"`
}

type TicketUpdateInput struct {
	Status     string `json:"status"`
	Prioritas  string `json:"prioritas"`
	AssignedTo string `json:"assigned_to"`
	Resolusi   string `json:"resolusi"`
}

var allowedCategories = map[string]bool{
	"listrik": true, "air": true, "furniture": true, "kebersihan": true, "lainnya": true,
}
var allowedPriorities = map[string]bool{
	"rendah": true, "sedang": true, "tinggi": true, "urgent": true,
}
var allowedTicketStatus = map[string]bool{
	"open": true, "in_progress": true, "resolved": true, "closed": true,
}

func (s *TicketService) Create(ctx context.Context, userID string, in TicketInput) (*model.Ticket, error) {
	if strings.TrimSpace(in.Judul) == "" || strings.TrimSpace(in.Deskripsi) == "" {
		return nil, apperror.BadRequest("Judul dan deskripsi wajib diisi")
	}
	if !allowedCategories[in.Kategori] {
		return nil, apperror.BadRequest("Kategori tidak valid")
	}
	if in.Prioritas == "" {
		in.Prioritas = "sedang"
	}
	if !allowedPriorities[in.Prioritas] {
		return nil, apperror.BadRequest("Prioritas tidak valid")
	}
	if len(in.Foto) > 3 {
		return nil, apperror.BadRequest("Maksimal 3 foto tiket")
	}
	var tenantID, kamarID, propertiID string
	if err := s.db.GetContext(ctx, &tenantID, `SELECT id FROM tenants WHERE user_id=$1`, userID); err != nil {
		return nil, apperror.Forbidden("Hanya penyewa yang bisa mengajukan tiket")
	}
	err := s.db.QueryRowContext(ctx, `SELECT r.id, r.properti_id FROM contracts c JOIN rooms r ON r.id=c.kamar_id
		WHERE c.penyewa_id=$1 AND c.status='aktif' LIMIT 1`, tenantID).Scan(&kamarID, &propertiID)
	if err != nil {
		return nil, apperror.Conflict("Tidak ada kontrak aktif untuk mengajukan tiket")
	}
	number, err := nextNumber(ctx, s.db, "tickets", "nomor_tiket", "TKT-"+timeNowUTC().Format("200601")+"-")
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	var t model.Ticket
	err = s.db.QueryRowxContext(ctx, `
		INSERT INTO tickets (nomor_tiket, penyewa_id, kamar_id, properti_id, judul, deskripsi, kategori, prioritas, foto, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open') RETURNING *`,
		number, tenantID, kamarID, propertiID, strings.TrimSpace(in.Judul), strings.TrimSpace(in.Deskripsi),
		in.Kategori, in.Prioritas, model.StringSlice(in.Foto)).StructScan(&t)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	s.svc.Notification.NotifyAdmins(ctx, "Tiket baru "+t.NomorTiket, in.Judul, "ticket_created", map[string]interface{}{"ticket_id": t.ID, "prioritas": t.Prioritas})
	return s.Get(ctx, t.ID)
}

func (s *TicketService) List(ctx context.Context, userID, role, status, category, priority string, q pagination.Query) ([]model.Ticket, int, error) {
	conditions := []string{"1=1"}
	args := []interface{}{}
	if role == "tenant" {
		args = append(args, userID)
		conditions = append(conditions, "t.penyewa_id = (SELECT id FROM tenants WHERE user_id=$1)")
	}
	add := func(col, val string) {
		if val != "" {
			args = append(args, val)
			conditions = append(conditions, col+" = $"+itoa(len(args)))
		}
	}
	add("t.status", status)
	add("t.kategori", category)
	add("t.prioritas", priority)
	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT count(*) FROM tickets t WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	args = append(args, q.Limit, q.Offset())
	var list []model.Ticket
	err := s.db.SelectContext(ctx, &list, `SELECT t.*, tn.nama_lengkap AS nama_penyewa, p.nama AS nama_properti
		FROM tickets t JOIN tenants tn ON tn.id=t.penyewa_id JOIN properties p ON p.id=t.properti_id
		WHERE `+where+` ORDER BY CASE t.prioritas WHEN 'urgent' THEN 0 WHEN 'tinggi' THEN 1 WHEN 'sedang' THEN 2 ELSE 3 END, t.created_at DESC
		LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	return list, total, err
}

func (s *TicketService) Get(ctx context.Context, id string) (*model.Ticket, error) {
	var t model.Ticket
	err := s.db.QueryRowxContext(ctx, `SELECT t.*, tn.nama_lengkap AS nama_penyewa, p.nama AS nama_properti
		FROM tickets t JOIN tenants tn ON tn.id=t.penyewa_id JOIN properties p ON p.id=t.properti_id WHERE t.id=$1`, id).StructScan(&t)
	if err != nil {
		return nil, apperror.NotFound("Tiket tidak ditemukan")
	}
	return &t, nil
}

func (s *TicketService) Update(ctx context.Context, id string, in TicketUpdateInput) (*model.Ticket, error) {
	t, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	status := t.Status
	if in.Status != "" {
		if !allowedTicketStatus[in.Status] {
			return nil, apperror.BadRequest("Status tiket tidak valid")
		}
		status = in.Status
	}
	priority := t.Prioritas
	if in.Prioritas != "" {
		if !allowedPriorities[in.Prioritas] {
			return nil, apperror.BadRequest("Prioritas tidak valid")
		}
		priority = in.Prioritas
	}
	var assignedTo *string
	if in.AssignedTo != "" {
		assignedTo = &in.AssignedTo
	}
	resolusi := t.Resolusi
	if in.Resolusi != "" {
		resolusi = &in.Resolusi
	}
	var resolvedAt interface{}
	if (status == "resolved" || status == "closed") && t.ResolvedAt == nil {
		resolvedAt = timeNowUTC()
	} else {
		resolvedAt = t.ResolvedAt
	}
	_, err = s.db.ExecContext(ctx, `UPDATE tickets SET status=$1, prioritas=$2, assigned_to=$3, resolusi=$4, resolved_at=$5 WHERE id=$6`,
		status, priority, assignedTo, resolusi, resolvedAt, id)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	updated, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	var userID string
	_ = s.db.GetContext(ctx, &userID, `SELECT coalesce(user_id::text,'') FROM tenants WHERE id=$1`, t.PenyewaID)
	if userID != "" {
		_ = s.svc.Notification.Create(ctx, userID, "Tiket "+t.NomorTiket+" diperbarui", "Status tiket Anda: "+status, "ticket_updated", map[string]interface{}{"ticket_id": id})
	}
	if status == "resolved" {
		var email string
		_ = s.db.GetContext(ctx, &email, `SELECT email FROM tenants WHERE id=$1`, t.PenyewaID)
		_ = s.mailer.TicketResolved(email, t.NomorTiket, ptrString(resolusi))
	}
	return updated, nil
}

func (s *TicketService) Stats(ctx context.Context) (map[string]int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT status, count(*) FROM tickets GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{"open": 0, "in_progress": 0, "resolved": 0, "closed": 0, "urgent": 0}
	for rows.Next() {
		var k string
		var v int
		if rows.Scan(&k, &v) == nil {
			out[k] = v
		}
	}
	rows.Close()
	var urgent int
	_ = s.db.GetContext(ctx, &urgent, `SELECT count(*) FROM tickets WHERE prioritas='urgent' AND status IN ('open','in_progress')`)
	out["urgent"] = urgent
	return out, rows.Err()
}
