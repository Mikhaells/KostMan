package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/kosman/app/internal/config"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/pkg/token"
)

type ctxKey string

const (
	userIDKey ctxKey = "userID"
	roleKey   ctxKey = "role"
)

func Auth(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				response.Fail(w, apperror.Unauthorized("Token akses diperlukan"))
				return
			}
			claims, err := token.Parse(cfg.JWTSecret, strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")))
			if err != nil || claims.TokenType != "access" {
				response.Fail(w, apperror.Unauthorized("Token tidak valid atau sudah kedaluwarsa"))
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, claims.UserID)
			ctx = context.WithValue(ctx, roleKey, claims.Role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireRoles(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			current := Role(r)
			for _, role := range roles {
				if current == role {
					next.ServeHTTP(w, r)
					return
				}
			}
			response.Fail(w, apperror.Forbidden("Anda tidak memiliki izin untuk aksi ini"))
		})
	}
}

func UserID(r *http.Request) string {
	v, _ := r.Context().Value(userIDKey).(string)
	return v
}

func Role(r *http.Request) string {
	v, _ := r.Context().Value(roleKey).(string)
	return v
}

func IsAdmin(r *http.Request) bool {
	role := Role(r)
	return role == "owner" || role == "manager" || role == "super_admin"
}
