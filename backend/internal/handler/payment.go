package handler

import (
	"net/http"

	"github.com/kosman/app/internal/middleware"
	"github.com/kosman/app/internal/pkg/pagination"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/service"
)

func (h *Handler) ListPayments(w http.ResponseWriter, r *http.Request) {
	q := pagination.Parse(r)
	list, total, err := h.svc.Payment.List(r.Context(), r.URL.Query().Get("tagihan_id"), r.URL.Query().Get("status"), q)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.List(w, list, pagination.NewMeta(q, total))
}

func (h *Handler) CreatePayment(w http.ResponseWriter, r *http.Request) {
	var in service.PaymentInput
	if !decode(w, r, &in) {
		return
	}
	in.TagihanID = param(r, "id")
	p, err := h.svc.Payment.Create(r.Context(), middleware.UserID(r), middleware.Role(r), in, false)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, p)
}

func (h *Handler) CreateCashPayment(w http.ResponseWriter, r *http.Request) {
	var in service.PaymentInput
	if !decode(w, r, &in) {
		return
	}
	in.TagihanID = param(r, "id")
	p, err := h.svc.Payment.Create(r.Context(), middleware.UserID(r), middleware.Role(r), in, true)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, p)
}

func (h *Handler) VerifyPayment(w http.ResponseWriter, r *http.Request) {
	p, err := h.svc.Payment.Verify(r.Context(), param(r, "id"), middleware.UserID(r))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, p)
}

func (h *Handler) RejectPayment(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Catatan string `json:"catatan"`
	}
	if !decode(w, r, &in) {
		return
	}
	p, err := h.svc.Payment.Reject(r.Context(), param(r, "id"), middleware.UserID(r), in.Catatan)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, p)
}
