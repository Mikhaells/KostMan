package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/kosman/app/internal/pkg/apperror"
)

var (
	digitRe   = regexp.MustCompile(`[0-9]`)
	letterRe  = regexp.MustCompile(`[a-zA-Z]`)
	nikRe     = regexp.MustCompile(`^[0-9]{16}$`)
	phoneRe   = regexp.MustCompile(`^[0-9+\-\s]{8,20}$`)
	dateRe    = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

func validatePassword(p string) error {
	if len(p) < 8 || !digitRe.MatchString(p) || !letterRe.MatchString(p) {
		return apperror.BadRequest("Password minimal 8 karakter dan mengandung huruf serta angka")
	}
	return nil
}

func validateNIK(n string) error {
	if !nikRe.MatchString(n) {
		return apperror.BadRequest("NIK harus 16 digit angka")
	}
	return nil
}

func validatePhone(p string) error {
	if !phoneRe.MatchString(p) {
		return apperror.BadRequest("Nomor telepon tidak valid")
	}
	return nil
}

func parseDate(s string) (time.Time, error) {
	if !dateRe.MatchString(s) {
		return time.Time{}, apperror.BadRequest("Format tanggal harus YYYY-MM-DD")
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, apperror.BadRequest("Tanggal tidak valid")
	}
	return t, nil
}

func optionalDate(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := parseDate(s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "unique constraint") || strings.Contains(msg, "23505")
}

func isNotFound(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}

func nextNumber(ctx context.Context, db *sqlx.DB, table, column, prefix string) (string, error) {
	var count int
	like := prefix + "%"
	if err := db.GetContext(ctx, &count, fmt.Sprintf(`SELECT count(*) FROM %s WHERE %s LIKE $1`, table, column), like); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s%04d", prefix, count+1), nil
}

func timeNowUTC() time.Time { return time.Now().UTC() }

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func ptrString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
