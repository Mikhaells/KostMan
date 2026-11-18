package service

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kosman/app/internal/model"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/crypto"
	"github.com/kosman/app/internal/pkg/pagination"
	"github.com/kosman/app/internal/pkg/token"
)

type AuthService struct{ base }

type RegisterInput struct {
	Nama     string `json:"nama"`
	Email    string `json:"email"`
	Password string `json:"password"`
	NoHP     string `json:"no_hp"`
	Role     string `json:"role"`
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type ProfileInput struct {
	Nama string `json:"nama"`
	NoHP string `json:"no_hp"`
}

type UpdateUserInput struct {
	Nama   string `json:"nama"`
	NoHP   string `json:"no_hp"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	User         *model.User `json:"user"`
}

func (s *AuthService) Register(ctx context.Context, in RegisterInput) (*model.User, error) {
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if strings.TrimSpace(in.Nama) == "" || !validEmail(in.Email) {
		return nil, apperror.BadRequest("Nama dan email valid wajib diisi")
	}
	if err := validatePassword(in.Password); err != nil {
		return nil, err
	}
	role := in.Role
	if role == "" {
		role = "owner"
	}
	if role != "owner" && role != "manager" {
		return nil, apperror.BadRequest("Registrasi hanya untuk owner atau manager")
	}
	hash, err := crypto.HashPassword(in.Password)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	var u model.User
	err = s.db.QueryRowxContext(ctx, `
		INSERT INTO users (nama, email, password_hash, role, no_hp)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, nama, email, role, no_hp, status, created_at, updated_at`,
		strings.TrimSpace(in.Nama), in.Email, hash, role, strPtr(strings.TrimSpace(in.NoHP))).StructScan(&u)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, apperror.Conflict("Email sudah terdaftar")
		}
		return nil, apperror.Internal(err.Error())
	}
	return &u, nil
}

func (s *AuthService) Login(ctx context.Context, in LoginInput) (*TokenPair, error) {
	email := strings.ToLower(strings.TrimSpace(in.Email))
	var u model.User
	err := s.db.GetContext(ctx, &u, `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`, email)
	if err == sql.ErrNoRows {
		return nil, apperror.Unauthorized("Email atau password salah")
	}
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	if u.LockedUntil != nil && time.Now().Before(*u.LockedUntil) {
		return nil, apperror.Unauthorized("Akun terkunci sementara, coba lagi dalam 15 menit")
	}
	if !crypto.CheckPassword(u.PasswordHash, in.Password) {
		failed := u.FailedLogin + 1
		if failed >= 5 {
			lock := time.Now().Add(15 * time.Minute)
			_, _ = s.db.ExecContext(ctx, `UPDATE users SET failed_login = $1, locked_until = $2 WHERE id = $3`, failed, lock, u.ID)
			return nil, apperror.Unauthorized("Akun terkunci selama 15 menit setelah 5 kali gagal login")
		}
		_, _ = s.db.ExecContext(ctx, `UPDATE users SET failed_login = $1 WHERE id = $2`, failed, u.ID)
		return nil, apperror.Unauthorized("Email atau password salah")
	}
	if u.Status != "aktif" {
		return nil, apperror.Forbidden("Akun tidak aktif")
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE users SET failed_login = 0, locked_until = NULL WHERE id = $1`, u.ID)

	access, err := token.Generate(s.cfg.JWTSecret, s.cfg.AccessTTL, u.ID, u.Role, "access")
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	refresh, err := token.Generate(s.cfg.RefreshSecret, s.cfg.RefreshTTL, u.ID, u.Role, "refresh")
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
		u.ID, crypto.SHA256Hex(refresh), time.Now().Add(s.cfg.RefreshTTL))
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	u.FailedLogin = 0
	u.LockedUntil = nil
	return &TokenPair{
		AccessToken: access, RefreshToken: refresh, TokenType: "Bearer",
		ExpiresIn: int(s.cfg.AccessTTL.Seconds()), User: &u,
	}, nil
}

func (s *AuthService) Refresh(ctx context.Context, raw string) (*TokenPair, error) {
	claims, err := token.Parse(s.cfg.RefreshSecret, raw)
	if err != nil || claims.TokenType != "refresh" {
		return nil, apperror.Unauthorized("Refresh token tidak valid")
	}
	hash := crypto.SHA256Hex(raw)
	var exists int
	err = s.db.GetContext(ctx, &exists, `SELECT count(*) FROM refresh_tokens WHERE token_hash = $1 AND revoked = FALSE AND expires_at > now()`, hash)
	if err != nil || exists == 0 {
		return nil, apperror.Unauthorized("Refresh token tidak valid atau sudah kedaluwarsa")
	}
	var u model.User
	if err = s.db.GetContext(ctx, &u, `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, claims.UserID); err != nil {
		return nil, apperror.Unauthorized("User tidak ditemukan")
	}
	access, err := token.Generate(s.cfg.JWTSecret, s.cfg.AccessTTL, u.ID, u.Role, "access")
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	refresh, err := token.Generate(s.cfg.RefreshSecret, s.cfg.RefreshTTL, u.ID, u.Role, "refresh")
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1`, hash); err != nil {
		return nil, apperror.Internal(err.Error())
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
		u.ID, crypto.SHA256Hex(refresh), time.Now().Add(s.cfg.RefreshTTL)); err != nil {
		return nil, apperror.Internal(err.Error())
	}
	if err = tx.Commit(); err != nil {
		return nil, apperror.Internal(err.Error())
	}
	return &TokenPair{AccessToken: access, RefreshToken: refresh, TokenType: "Bearer", ExpiresIn: int(s.cfg.AccessTTL.Seconds()), User: &u}, nil
}

func (s *AuthService) Logout(ctx context.Context, raw string) error {
	if raw == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1`, crypto.SHA256Hex(raw))
	return err
}

func (s *AuthService) ForgotPassword(ctx context.Context, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	var userID string
	err := s.db.GetContext(ctx, &userID, `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, email)
	if err != nil {
		return nil // do not reveal account existence
	}
	raw, err := crypto.RandomToken(32)
	if err != nil {
		return apperror.Internal(err.Error())
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
		userID, crypto.SHA256Hex(raw), time.Now().Add(time.Hour))
	if err != nil {
		return apperror.Internal(err.Error())
	}
	link := strings.TrimRight(s.cfg.AppURL, "/") + "/reset-password?token=" + raw
	return s.mailer.Send(email, "Reset password KosMan", "<p>Klik <a href='"+link+"'>tautan ini</a> untuk mengatur ulang password Anda.</p>")
}

func (s *AuthService) ResetPassword(ctx context.Context, raw, password string) error {
	if err := validatePassword(password); err != nil {
		return err
	}
	hash, err := crypto.HashPassword(password)
	if err != nil {
		return apperror.Internal(err.Error())
	}
	var userID string
	err = s.db.GetContext(ctx, &userID, `
		SELECT user_id FROM password_resets
		WHERE token_hash = $1 AND used = FALSE AND expires_at > now()`, crypto.SHA256Hex(raw))
	if err != nil {
		return apperror.BadRequest("Tautan reset tidak valid atau sudah kedaluwarsa")
	}
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return apperror.Internal(err.Error())
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE users SET password_hash=$1, failed_login=0, locked_until=NULL WHERE id=$2`, hash, userID); err != nil {
		return apperror.Internal(err.Error())
	}
	if _, err = tx.ExecContext(ctx, `UPDATE password_resets SET used = TRUE WHERE token_hash = $1`, crypto.SHA256Hex(raw)); err != nil {
		return apperror.Internal(err.Error())
	}
	if _, err = tx.ExecContext(ctx, `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1`, userID); err != nil {
		return apperror.Internal(err.Error())
	}
	return tx.Commit()
}

func (s *AuthService) GetProfile(ctx context.Context, userID string) (*model.User, error) {
	var u model.User
	err := s.db.GetContext(ctx, &u, `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, userID)
	if err != nil {
		return nil, apperror.NotFound("User tidak ditemukan")
	}
	return &u, nil
}

func (s *AuthService) UpdateProfile(ctx context.Context, userID string, in ProfileInput) (*model.User, error) {
	if strings.TrimSpace(in.Nama) == "" {
		return nil, apperror.BadRequest("Nama wajib diisi")
	}
	var u model.User
	err := s.db.QueryRowxContext(ctx, `UPDATE users SET nama=$1, no_hp=$2 WHERE id=$3 RETURNING *`,
		strings.TrimSpace(in.Nama), strPtr(in.NoHP), userID).StructScan(&u)
	if err != nil {
		return nil, apperror.Internal(err.Error())
	}
	return &u, nil
}

func (s *AuthService) ChangePassword(ctx context.Context, userID, oldPassword, newPassword string) error {
	if err := validatePassword(newPassword); err != nil {
		return err
	}
	var hash string
	if err := s.db.GetContext(ctx, &hash, `SELECT password_hash FROM users WHERE id=$1`, userID); err != nil {
		return apperror.NotFound("User tidak ditemukan")
	}
	if !crypto.CheckPassword(hash, oldPassword) {
		return apperror.BadRequest("Password lama tidak sesuai")
	}
	newHash, err := crypto.HashPassword(newPassword)
	if err != nil {
		return apperror.Internal(err.Error())
	}
	_, err = s.db.ExecContext(ctx, `UPDATE users SET password_hash=$1 WHERE id=$2`, newHash, userID)
	return err
}

func (s *AuthService) ListUsers(ctx context.Context, q pagination.Query, search string) ([]model.User, int, error) {
	var total int
	args := []interface{}{"%" + search + "%"}
	if err := s.db.GetContext(ctx, &total, `SELECT count(*) FROM users WHERE deleted_at IS NULL AND (nama ILIKE $1 OR email ILIKE $1)`, args...); err != nil {
		return nil, 0, err
	}
	args = append(args, q.Limit, q.Offset())
	var users []model.User
	err := s.db.SelectContext(ctx, &users, `SELECT * FROM users WHERE deleted_at IS NULL AND (nama ILIKE $1 OR email ILIKE $1) ORDER BY created_at DESC LIMIT $2 OFFSET $3`, args...)
	return users, total, err
}

func (s *AuthService) CreateUser(ctx context.Context, in RegisterInput) (*model.User, error) {
	if in.Role == "" {
		in.Role = "manager"
	}
	return s.Register(ctx, in)
}

func (s *AuthService) UpdateUser(ctx context.Context, id string, in UpdateUserInput) (*model.User, error) {
	role := in.Role
	if role == "" {
		role = "manager"
	}
	if role != "owner" && role != "manager" && role != "super_admin" && role != "tenant" {
		return nil, apperror.BadRequest("Role tidak valid")
	}
	status := in.Status
	if status == "" {
		status = "aktif"
	}
	var u model.User
	err := s.db.QueryRowxContext(ctx, `UPDATE users SET nama=$1, no_hp=$2, role=$3, status=$4 WHERE id=$5 RETURNING *`,
		in.Nama, strPtr(in.NoHP), role, status, id).StructScan(&u)
	if err != nil {
		return nil, apperror.NotFound("User tidak ditemukan")
	}
	return &u, nil
}

func (s *AuthService) DeleteUser(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE users SET deleted_at = now(), status='nonaktif' WHERE id=$1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return apperror.NotFound("User tidak ditemukan")
	}
	return nil
}

// ResolveTenantUser returns the user ID linked to a tenant, if any.
func (s *AuthService) ResolveTenantUser(ctx context.Context, tenantID string) (string, error) {
	var userID string
	err := s.db.GetContext(ctx, &userID, `SELECT coalesce(user_id::text,'') FROM tenants WHERE id=$1`, tenantID)
	return userID, err
}

func (s *AuthService) UserIDByEmail(ctx context.Context, email string) (string, error) {
	var id string
	err := s.db.GetContext(ctx, &id, `SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL`, strings.ToLower(email))
	if err != nil {
		return "", err
	}
	return id, nil
}

func newID() string { return uuid.NewString() }

var _ = http.StatusOK
