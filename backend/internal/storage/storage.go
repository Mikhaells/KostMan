package storage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kosman/app/internal/config"
)

type Storage struct {
	dir       string
	max       int64
	cloudName string
	preset    string
	client    *http.Client
}

func New(cfg *config.Config) (*Storage, error) {
	s := &Storage{
		dir:       cfg.StorageDir,
		max:       cfg.MaxUploadBytes,
		cloudName: cfg.CloudinaryName,
		preset:    cfg.CloudinaryPreset,
		client:    &http.Client{Timeout: 60 * time.Second},
	}
	// Cloud mode needs no writable local directory (Render's filesystem is ephemeral).
	if s.cloudName != "" && s.preset != "" {
		return s, nil
	}
	if err := os.MkdirAll(cfg.StorageDir, 0755); err != nil {
		return nil, err
	}
	return s, nil
}

var allowedExt = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".pdf": true,
}

// Save writes an uploaded file and returns its public URL path.
func (s *Storage) Save(file multipart.File, header *multipart.FileHeader) (string, error) {
	if header.Size > s.max {
		return "", fmt.Errorf("file terlalu besar (maks %d MB)", s.max/1024/1024)
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedExt[ext] {
		return "", fmt.Errorf("format file tidak didukung (jpg/png/webp/pdf)")
	}
	head := make([]byte, 512)
	n, err := file.Read(head)
	if err != nil && err != io.EOF {
		return "", err
	}
	detected := http.DetectContentType(head[:n])
	if !strings.HasPrefix(detected, "image/") && detected != "application/pdf" {
		return "", fmt.Errorf("tipe MIME tidak diizinkan: %s", detected)
	}
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	if s.cloudName != "" && s.preset != "" {
		return s.saveCloud(file, header)
	}
	name := uuid.NewString() + ext
	out, err := os.Create(filepath.Join(s.dir, name))
	if err != nil {
		return "", err
	}
	defer out.Close()
	if _, err = io.Copy(out, file); err != nil {
		return "", err
	}
	return "/uploads/" + name, nil
}

// saveCloud uploads to Cloudinary using an unsigned upload preset and returns the HTTPS URL.
func (s *Storage) saveCloud(file multipart.File, header *multipart.FileHeader) (string, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	if err := w.WriteField("upload_preset", s.preset); err != nil {
		return "", err
	}
	part, err := w.CreateFormFile("file", header.Filename)
	if err != nil {
		return "", err
	}
	if _, err = io.Copy(part, file); err != nil {
		return "", err
	}
	if err = w.Close(); err != nil {
		return "", err
	}
	endpoint := fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/upload", url.PathEscape(s.cloudName))
	req, err := http.NewRequest(http.MethodPost, endpoint, &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var result struct {
		SecureURL string `json:"secure_url"`
		Error     *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err = json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.SecureURL == "" {
		msg := "upload gagal"
		if result.Error != nil && result.Error.Message != "" {
			msg = result.Error.Message
		}
		return "", fmt.Errorf("cloudinary: %s (status %d)", msg, resp.StatusCode)
	}
	return result.SecureURL, nil
}

func (s *Storage) Delete(url string) error {
	if url == "" {
		return nil
	}
	// Cloudinary assets are managed from its dashboard; deletion is a no-op here.
	if s.cloudName != "" && s.preset != "" {
		return nil
	}
	name := filepath.Base(url)
	return os.Remove(filepath.Join(s.dir, name))
}

func (s *Storage) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.URL.Path)
	if name == "." || name == "/" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.dir, name))
}
