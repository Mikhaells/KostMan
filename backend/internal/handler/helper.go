package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/kosman/app/internal/config"
	"github.com/kosman/app/internal/middleware"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/service"
	"github.com/kosman/app/internal/storage"
)

type Handler struct {
	svc     *service.Services
	cfg     *config.Config
	storage *storage.Storage
}

func New(svc *service.Services, cfg *config.Config, st *storage.Storage) *Handler {
	return &Handler{svc: svc, cfg: cfg, storage: st}
}

func decode(w http.ResponseWriter, r *http.Request, out interface{}) bool {
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(out); err != nil {
		response.Fail(w, apperror.BadRequest("Body JSON tidak valid"))
		return false
	}
	return true
}

func writeFail(w http.ResponseWriter, err error) { response.Fail(w, err) }

func param(r *http.Request, name string) string { return chi.URLParam(r, name) }

func (h *Handler) tenantID(w http.ResponseWriter, r *http.Request) (string, bool) {
	if middleware.Role(r) == "tenant" {
		t, err := h.svc.Tenant.GetByUser(r.Context(), middleware.UserID(r))
		if err != nil {
			writeFail(w, err)
			return "", false
		}
		return t.ID, true
	}
	return "", true
}
