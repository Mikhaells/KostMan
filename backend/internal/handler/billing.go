package handler

import (
	"net/http"
	"strconv"

	"github.com/kosman/app/internal/pkg/pagination"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/service"
)

func servePDF(w http.ResponseWriter, name string, data []byte) {
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+name+"\"")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

func (h *Handler) ListInvoices(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.tenantID(w, r)
	if !ok {
		return
	}
	q := pagination.Parse(r)
	list, total, err := h.svc.Billing.List(r.Context(), tenantID, r.URL.Query().Get("properti_id"), r.URL.Query().Get("status"), q)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.List(w, list, pagination.NewMeta(q, total))
}

func (h *Handler) GetInvoice(w http.ResponseWriter, r *http.Request) {
	inv, err := h.svc.Billing.Get(r.Context(), param(r, "id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	if !h.checkTenantAccess(w, r, inv.PenyewaID) {
		return
	}
	response.OK(w, inv)
}

func (h *Handler) CreateInvoice(w http.ResponseWriter, r *http.Request) {
	var in service.InvoiceInput
	if !decode(w, r, &in) {
		return
	}
	inv, err := h.svc.Billing.Create(r.Context(), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, inv)
}

func (h *Handler) UpdateInvoice(w http.ResponseWriter, r *http.Request) {
	var in service.InvoiceInput
	if !decode(w, r, &in) {
		return
	}
	inv, err := h.svc.Billing.Update(r.Context(), param(r, "id"), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, inv)
}

func (h *Handler) VoidInvoice(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Billing.Void(r.Context(), param(r, "id")); err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]string{"message": "Tagihan dibatalkan"})
}

func (h *Handler) InvoicePDF(w http.ResponseWriter, r *http.Request) {
	data, name, err := h.svc.Billing.PDF(r.Context(), param(r, "id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	servePDF(w, name, data)
}

func (h *Handler) GenerateInvoices(w http.ResponseWriter, r *http.Request) {
	count, err := h.svc.Billing.GenerateMonthly(r.Context())
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, map[string]interface{}{"dibuat": count})
}
