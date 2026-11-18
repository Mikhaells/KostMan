package handler

import (
	"net/http"

	"github.com/kosman/app/internal/middleware"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/pagination"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/service"
)

func (h *Handler) ListTenants(w http.ResponseWriter, r *http.Request) {
	q := pagination.Parse(r)
	list, total, err := h.svc.Tenant.List(r.Context(), q, r.URL.Query().Get("search"), r.URL.Query().Get("status"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.List(w, list, pagination.NewMeta(q, total))
}

func (h *Handler) GetTenant(w http.ResponseWriter, r *http.Request) {
	t, err := h.svc.Tenant.Get(r.Context(), param(r, "id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, t)
}

func (h *Handler) MeTenant(w http.ResponseWriter, r *http.Request) {
	t, err := h.svc.Tenant.GetByUser(r.Context(), middleware.UserID(r))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, t)
}

func (h *Handler) CreateTenant(w http.ResponseWriter, r *http.Request) {
	var in service.TenantInput
	if !decode(w, r, &in) {
		return
	}
	t, err := h.svc.Tenant.Create(r.Context(), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, t)
}

func (h *Handler) UpdateTenant(w http.ResponseWriter, r *http.Request) {
	var in service.TenantInput
	if !decode(w, r, &in) {
		return
	}
	t, err := h.svc.Tenant.Update(r.Context(), param(r, "id"), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, t)
}

func (h *Handler) SetTenantStatus(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status string `json:"status"`
	}
	if !decode(w, r, &in) {
		return
	}
	t, err := h.svc.Tenant.SetStatus(r.Context(), param(r, "id"), in.Status)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, t)
}

func (h *Handler) TenantHistory(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.Tenant.History(r.Context(), param(r, "id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, list)
}

func (h *Handler) CreatePortalUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Password string `json:"password"`
	}
	_ = decode(w, r, &in)
	userID, err := h.svc.Tenant.EnsurePortalUser(r.Context(), param(r, "id"), in.Password)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]string{"user_id": userID, "message": "Akun portal penyewa siap digunakan"})
}

func (h *Handler) checkTenantAccess(w http.ResponseWriter, r *http.Request, tenantID string) bool {
	if middleware.Role(r) == "tenant" {
		t, err := h.svc.Tenant.GetByUser(r.Context(), middleware.UserID(r))
		if err != nil || t.ID != tenantID {
			response.Fail(w, apperror.Forbidden("Data bukan milik Anda"))
			return false
		}
	}
	return true
}
