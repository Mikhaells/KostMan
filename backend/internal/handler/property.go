package handler

import (
	"net/http"

	"github.com/kosman/app/internal/middleware"
	"github.com/kosman/app/internal/pkg/pagination"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/service"
)

func (h *Handler) ListProperties(w http.ResponseWriter, r *http.Request) {
	q := pagination.Parse(r)
	list, total, err := h.svc.Property.List(r.Context(), middleware.UserID(r), middleware.Role(r), q,
		r.URL.Query().Get("search"), r.URL.Query().Get("status"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.List(w, list, pagination.NewMeta(q, total))
}

func (h *Handler) GetProperty(w http.ResponseWriter, r *http.Request) {
	p, err := h.svc.Property.Get(r.Context(), param(r, "id"), middleware.UserID(r), middleware.Role(r))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, p)
}

func (h *Handler) CreateProperty(w http.ResponseWriter, r *http.Request) {
	var in service.PropertyInput
	if !decode(w, r, &in) {
		return
	}
	p, err := h.svc.Property.Create(r.Context(), middleware.UserID(r), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, p)
}

func (h *Handler) UpdateProperty(w http.ResponseWriter, r *http.Request) {
	var in service.PropertyInput
	if !decode(w, r, &in) {
		return
	}
	p, err := h.svc.Property.Update(r.Context(), param(r, "id"), middleware.UserID(r), middleware.Role(r), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, p)
}

func (h *Handler) DeleteProperty(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Property.Delete(r.Context(), param(r, "id")); err != nil {
		response.Fail(w, err)
		return
	}
	response.NoContent(w)
}

func (h *Handler) RestoreProperty(w http.ResponseWriter, r *http.Request) {
	p, err := h.svc.Property.Restore(r.Context(), param(r, "id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, p)
}

func (h *Handler) ListDeletedProperties(w http.ResponseWriter, r *http.Request) {
	q := pagination.Parse(r)
	list, total, err := h.svc.Property.ListDeleted(r.Context(), q)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.List(w, list, pagination.NewMeta(q, total))
}
