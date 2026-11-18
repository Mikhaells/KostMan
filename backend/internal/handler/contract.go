package handler

import (
	"net/http"

	"github.com/kosman/app/internal/middleware"
	"github.com/kosman/app/internal/pkg/pagination"
	"github.com/kosman/app/internal/pkg/response"
	"github.com/kosman/app/internal/service"
)

func (h *Handler) ListContracts(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.tenantID(w, r)
	if !ok {
		return
	}
	q := pagination.Parse(r)
	list, total, err := h.svc.Contract.List(r.Context(), tenantID, r.URL.Query().Get("kamar_id"),
		r.URL.Query().Get("properti_id"), r.URL.Query().Get("status"), q)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.List(w, list, pagination.NewMeta(q, total))
}

func (h *Handler) GetContract(w http.ResponseWriter, r *http.Request) {
	c, err := h.svc.Contract.Get(r.Context(), param(r, "id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	if !h.checkTenantAccess(w, r, c.PenyewaID) {
		return
	}
	response.OK(w, c)
}

func (h *Handler) CreateContract(w http.ResponseWriter, r *http.Request) {
	var in service.ContractInput
	if !decode(w, r, &in) {
		return
	}
	c, err := h.svc.Contract.Create(r.Context(), middleware.UserID(r), in)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.Created(w, c)
}

func (h *Handler) RenewContract(w http.ResponseWriter, r *http.Request) {
	var in struct {
		TanggalSelesai string `json:"tanggal_selesai"`
	}
	if !decode(w, r, &in) {
		return
	}
	c, err := h.svc.Contract.Renew(r.Context(), param(r, "id"), in.TanggalSelesai, middleware.UserID(r))
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, c)
}

func (h *Handler) TerminateContract(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status  string `json:"status"`
		Catatan string `json:"catatan"`
	}
	_ = decode(w, r, &in)
	c, err := h.svc.Contract.Terminate(r.Context(), param(r, "id"), in.Status, in.Catatan)
	if err != nil {
		response.Fail(w, err)
		return
	}
	response.OK(w, c)
}

func (h *Handler) ContractPDF(w http.ResponseWriter, r *http.Request) {
	data, name, err := h.svc.Contract.PDF(r.Context(), param(r, "id"))
	if err != nil {
		response.Fail(w, err)
		return
	}
	servePDF(w, name, data)
}
