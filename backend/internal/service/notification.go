package service

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/kosman/app/internal/model"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/pagination"
)

type NotificationService struct{ base }

func (s *NotificationService) Create(ctx context.Context, userID, judul, isi, tipe string, data map[string]interface{}) error {
	if data == nil {
		data = map[string]interface{}{}
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO notifications (user_id, judul, isi, tipe, data) VALUES ($1,$2,$3,$4,$5)`,
		userID, judul, isi, tipe, string(raw))
	return err
}

func (s *NotificationService) NotifyAdmins(ctx context.Context, judul, isi, tipe string, data map[string]interface{}) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM users WHERE role IN ('owner','manager','super_admin') AND deleted_at IS NULL AND status='aktif'`)
	if err != nil {
		return
	}
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, id := range ids {
		_ = s.Create(ctx, id, judul, isi, tipe, data)
	}
}

func (s *NotificationService) List(ctx context.Context, userID string, unreadOnly bool, q pagination.Query) ([]model.Notification, int, error) {
	conditions := []string{"user_id = $1"}
	args := []interface{}{userID}
	if unreadOnly {
		conditions = append(conditions, "is_read = FALSE")
	}
	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT count(*) FROM notifications WHERE `+where, args...); err != nil {
		return nil, 0, err
	}
	args = append(args, q.Limit, q.Offset())
	var list []model.Notification
	err := s.db.SelectContext(ctx, &list, `SELECT * FROM notifications WHERE `+where+` ORDER BY created_at DESC LIMIT $2 OFFSET $3`, args...)
	return list, total, err
}

func (s *NotificationService) UnreadCount(ctx context.Context, userID string) (int, error) {
	var count int
	err := s.db.GetContext(ctx, &count, `SELECT count(*) FROM notifications WHERE user_id=$1 AND is_read=FALSE`, userID)
	return count, err
}

func (s *NotificationService) MarkRead(ctx context.Context, id, userID string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return apperror.NotFound("Notifikasi tidak ditemukan")
	}
	return nil
}

func (s *NotificationService) MarkAllRead(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE notifications SET is_read=TRUE WHERE user_id=$1 AND is_read=FALSE`, userID)
	return err
}
