package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv           string
	AppPort          string
	AppURL           string
	DatabaseURL      string
	JWTSecret        string
	RefreshSecret    string
	AccessTTL        time.Duration
	RefreshTTL       time.Duration
	EncryptionKey    string
	SMTPHost         string
	SMTPPort         int
	SMTPUser         string
	SMTPPass         string
	SMTPFrom         string
	ResendAPIKey     string
	CloudinaryName   string
	CloudinaryPreset string
	StorageDir       string
	MaxUploadBytes   int64
	CRONEnabled      bool
	FrontendDistPath string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		AppEnv: get("APP_ENV", "development"),
		// Render injects PORT; keep APP_PORT for local development.
		AppPort:          get("PORT", get("APP_PORT", "8081")),
		AppURL:           get("APP_URL", "http://localhost:8081"),
		DatabaseURL:      get("DATABASE_URL", "postgres://postgres:password@127.0.0.1:5432/kosman?sslmode=disable"),
		JWTSecret:        get("JWT_SECRET", "dev-only-access-secret-change-me-please"),
		RefreshSecret:    get("JWT_REFRESH_SECRET", "dev-only-refresh-secret-change-me-please"),
		AccessTTL:        time.Duration(getInt("JWT_ACCESS_TTL_MINUTES", 1440)) * time.Minute,
		RefreshTTL:       time.Duration(getInt("JWT_REFRESH_TTL_DAYS", 7)) * 24 * time.Hour,
		EncryptionKey:    get("ENCRYPTION_KEY", ""),
		SMTPHost:         get("SMTP_HOST", "localhost"),
		SMTPPort:         getInt("SMTP_PORT", 1025),
		SMTPUser:         get("SMTP_USER", ""),
		SMTPPass:         get("SMTP_PASS", ""),
		SMTPFrom:         get("SMTP_FROM", "KosMan <noreply@kosman.local>"),
		ResendAPIKey:     get("RESEND_API_KEY", ""),
		CloudinaryName:   get("CLOUDINARY_CLOUD_NAME", ""),
		CloudinaryPreset: get("CLOUDINARY_UPLOAD_PRESET", ""),
		StorageDir:       get("STORAGE_DIR", "./uploads"),
		MaxUploadBytes:   int64(getInt("MAX_UPLOAD_MB", 5)) * 1024 * 1024,
		CRONEnabled:      getBool("CRON_ENABLED", true),
		FrontendDistPath: get("FRONTEND_DIST", "../frontend/dist"),
	}
	if cfg.EncryptionKey == "" {
		cfg.EncryptionKey = cfg.JWTSecret
	}
	if len(cfg.JWTSecret) < 16 || len(cfg.RefreshSecret) < 16 {
		return nil, fmt.Errorf("JWT_SECRET and JWT_REFRESH_SECRET must be at least 16 characters")
	}
	return cfg, nil
}

func get(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func getBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}
