package pagination

import (
	"net/http"
	"strconv"
)

type Query struct {
	Page  int
	Limit int
}

type Meta struct {
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Total int `json:"total"`
	Pages int `json:"total_pages"`
}

func Parse(r *http.Request) Query {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	return Query{Page: page, Limit: limit}
}

func (q Query) Offset() int { return (q.Page - 1) * q.Limit }

func NewMeta(q Query, total int) Meta {
	pages := 0
	if q.Limit > 0 {
		pages = (total + q.Limit - 1) / q.Limit
	}
	return Meta{Page: q.Page, Limit: q.Limit, Total: total, Pages: pages}
}
