package handler

import (
	"net/http"

	"github.com/kosman/app/internal/middleware"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/kosman/app/internal/pkg/pagination"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/service"
)

func (h *Handler) ListTickets(w http.ResponseWriter, r *http.Request) {
	q := pagination.Parse(r)
	list, total, err := h.svc.Ticket.List(r.Context(), middleware.UserID(r), middleware.Role(r),
		r.URL.Query().Get("status"), r.URL.Query().Get("kategori"), r.URL.Query().Get("prioritas"), q)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.List(w, list, pagination.NewMeta(q, total))
}

func (h *Handler) GetTicket(w http.ResponseWriter, r *http.Request) {
	t, err := h.svc.Ticket.Get(r.Context(), param(r, "id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	if middleware.Role(r) == "tenant" {
		mine, err := h.svc.Tenant.GetByUser(r.Context(), middleware.UserID(r))
		if err != nil || mine.ID != t.PenyewaID {
			response.Fail(w, apperror.Forbidden("Tiket bukan milik Anda"))
			return
		}
	}
	response.OK(w, t)
}

func (h *Handler) CreateTicket(w http.ResponseWriter, r *http.Request) {
	var in service.TicketInput
	if !decode(w, r, &in) {
		return
	}
	t, err := h.svc.Ticket.Create(r.Context(), middleware.UserID(r), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, t)
}

func (h *Handler) UpdateTicket(w http.ResponseWriter, r *http.Request) {
	var in service.TicketUpdateInput
	if !decode(w, r, &in) {
		return
	}
	t, err := h.svc.Ticket.Update(r.Context(), param(r, "id"), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, t)
}

func (h *Handler) TicketStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.Ticket.Stats(r.Context())
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, stats)
}
