package service

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/kosman/app/internal/pdf"
	"github.com/kosman/app/internal/pkg/apperror"
	"github.com/xuri/excelize/v2"
)

type ReportService struct{ base }

func (s *ReportService) Dashboard(ctx context.Context) (map[string]interface{}, error) {
	out := map[string]interface{}{}
	var revenue int64
	_ = s.db.GetContext(ctx, &revenue, `SELECT coalesce(sum(jumlah),0) FROM payments WHERE status='verified' AND date_trunc('month', created_at) = date_trunc('month', now())`)
	out["pendapatan_bulan_ini"] = revenue

	var unpaid int64
	_ = s.db.GetContext(ctx, &unpaid, `SELECT coalesce(sum(total),0) FROM invoices WHERE status IN ('terkirim','terlambat','sebagian')`)
	out["tagihan_belum_lunas"] = unpaid

	var occupied, totalRooms int
	_ = s.db.GetContext(ctx, &occupied, `SELECT count(*) FROM rooms WHERE status='terisi'`)
	_ = s.db.GetContext(ctx, &totalRooms, `SELECT count(*) FROM rooms`)
	occupancy := 0.0
	if totalRooms > 0 {
		occupancy = float64(occupied) / float64(totalRooms) * 100
	}
	out["okupansi"] = round2(occupancy)
	out["total_kamar"] = totalRooms
	out["kamar_terisi"] = occupied

	var activeTenants int
	_ = s.db.GetContext(ctx, &activeTenants, `SELECT count(*) FROM contracts WHERE status='aktif'`)
	out["penyewa_aktif"] = activeTenants

	var openTickets int
	_ = s.db.GetContext(ctx, &openTickets, `SELECT count(*) FROM tickets WHERE status IN ('open','in_progress')`)
	out["tiket_open"] = openTickets

	var properties, tenants int
	_ = s.db.GetContext(ctx, &properties, `SELECT count(*) FROM properties WHERE deleted_at IS NULL`)
	_ = s.db.GetContext(ctx, &tenants, `SELECT count(*) FROM tenants WHERE status='aktif'`)
	out["total_properti"] = properties
	out["total_penyewa"] = tenants

	type chartPoint struct {
		Bulan string `json:"bulan"`
		Total int64  `json:"total"`
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS bulan, coalesce(sum(jumlah),0) AS total
		FROM payments WHERE status='verified' AND created_at >= date_trunc('month', now()) - interval '5 months'
		GROUP BY date_trunc('month', created_at) ORDER BY date_trunc('month', created_at)`)
	if err == nil {
		var chart []chartPoint
		for rows.Next() {
			var p chartPoint
			if rows.Scan(&p.Bulan, &p.Total) == nil {
				chart = append(chart, p)
			}
		}
		rows.Close()
		if chart == nil {
			chart = []chartPoint{}
		}
		out["grafik_pendapatan"] = chart
	}

	rows, err = s.db.QueryContext(ctx, `
		SELECT p.nama, count(r.id) AS total,
			count(r.id) FILTER (WHERE r.status='terisi') AS terisi
		FROM properties p LEFT JOIN rooms r ON r.properti_id=p.id
		WHERE p.deleted_at IS NULL GROUP BY p.id, p.nama ORDER BY p.nama`)
	if err == nil {
		type occ struct {
			Nama   string  `json:"nama"`
			Total  int     `json:"total"`
			Terisi int     `json:"terisi"`
			Persen float64 `json:"persen"`
		}
		var list []occ
		for rows.Next() {
			var o occ
			if rows.Scan(&o.Nama, &o.Total, &o.Terisi) == nil {
				if o.Total > 0 {
					o.Persen = round2(float64(o.Terisi) / float64(o.Total) * 100)
				}
				list = append(list, o)
			}
		}
		rows.Close()
		if list == nil {
			list = []occ{}
		}
		out["okupansi_per_properti"] = list
	}
	return out, nil
}

func round2(v float64) float64 {
	return float64(int(v*100)) / 100
}

// uuidArg returns NULL for an empty filter so that `($n::uuid IS NULL OR col=$n)` matches all rows.
func uuidArg(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

type reportTable struct {
	Headers []string
	Rows    [][]interface{}
}

func (s *ReportService) table(ctx context.Context, kind, from, to, propertyID string) (*reportTable, string, error) {
	t := &reportTable{}
	switch kind {
	case "pendapatan":
		t.Headers = []string{"Invoice", "Penyewa", "Properti", "Tanggal Bayar", "Total", "Status"}
		query := `SELECT i.nomor_invoice, tn.nama_lengkap, pr.nama, coalesce(to_char(p.tanggal_bayar,'YYYY-MM-DD'),'-'), p.jumlah, p.status
			FROM payments p JOIN invoices i ON i.id=p.tagihan_id JOIN tenants tn ON tn.id=i.penyewa_id JOIN properties pr ON pr.id=i.properti_id
			WHERE p.status='verified' AND p.tanggal_bayar BETWEEN $1 AND $2 AND ($3::uuid IS NULL OR i.properti_id=$3)
			ORDER BY p.tanggal_bayar DESC`
		rows, err := s.db.QueryContext(ctx, query, from, to, uuidArg(propertyID))
		if err != nil {
			return nil, "", err
		}
		defer rows.Close()
		for rows.Next() {
			var a, b, c, d, e, f string
			if rows.Scan(&a, &b, &c, &d, &e, &f) == nil {
				t.Rows = append(t.Rows, []interface{}{a, b, c, d, e, f})
			}
		}
	case "okupansi":
		t.Headers = []string{"Properti", "Kamar", "Tipe", "Status", "Harga Bulanan"}
		query := `SELECT p.nama, r.nomor, r.tipe, r.status, r.harga_bulanan FROM rooms r JOIN properties p ON p.id=r.properti_id WHERE p.deleted_at IS NULL`
		if propertyID != "" {
			query += ` AND p.id=$1`
		}
		query += ` ORDER BY p.nama, r.nomor`
		var rows *sql.Rows
		var err error
		if propertyID != "" {
			rows, err = s.db.QueryContext(ctx, query, propertyID)
		} else {
			rows, err = s.db.QueryContext(ctx, query)
		}
		if err != nil {
			return nil, "", err
		}
		defer rows.Close()
		for rows.Next() {
			var a, b, c, d string
			var e int64
			if rows.Scan(&a, &b, &c, &d, &e) == nil {
				t.Rows = append(t.Rows, []interface{}{a, b, c, d, e})
			}
		}
	case "tunggakan":
		t.Headers = []string{"Invoice", "Penyewa", "Jatuh Tempo", "Total", "Umur (hari)", "Aging", "Status"}
		rows, err := s.db.QueryContext(ctx, `SELECT i.nomor_invoice, tn.nama_lengkap, i.tanggal_jatuh_tempo, i.total,
			(now()::date - i.tanggal_jatuh_tempo) AS umur,
			CASE WHEN (now()::date - i.tanggal_jatuh_tempo) <= 30 THEN '0-30'
			     WHEN (now()::date - i.tanggal_jatuh_tempo) <= 60 THEN '31-60' ELSE '60+' END AS aging, i.status
			FROM invoices i JOIN tenants tn ON tn.id=i.penyewa_id
			WHERE i.status IN ('terkirim','terlambat','sebagian')
				AND ($1::uuid IS NULL OR i.properti_id=$1) ORDER BY i.tanggal_jatuh_tempo`, uuidArg(propertyID))
		if err != nil {
			return nil, "", err
		}
		defer rows.Close()
		for rows.Next() {
			var a, b, c, f, g string
			var d, e int64
			if rows.Scan(&a, &b, &c, &d, &e, &f, &g) == nil {
				t.Rows = append(t.Rows, []interface{}{a, b, c, d, e, f, g})
			}
		}
	case "penyewa":
		t.Headers = []string{"Nama", "Email", "No HP", "Status", "Kontrak Aktif", "Bergabung"}
		rows, err := s.db.QueryContext(ctx, `SELECT tn.nama_lengkap, tn.email, tn.no_hp, tn.status,
			(SELECT count(*) FROM contracts c JOIN rooms r ON r.id=c.kamar_id
				WHERE c.penyewa_id=tn.id AND c.status='aktif' AND ($1::uuid IS NULL OR r.properti_id=$1)),
			to_char(tn.created_at,'YYYY-MM-DD')
			FROM tenants tn
			WHERE ($1::uuid IS NULL OR EXISTS (
				SELECT 1 FROM contracts c JOIN rooms r ON r.id=c.kamar_id
				WHERE c.penyewa_id=tn.id AND r.properti_id=$1))
			ORDER BY tn.nama_lengkap`, uuidArg(propertyID))
		if err != nil {
			return nil, "", err
		}
		defer rows.Close()
		for rows.Next() {
			var a, b, c, d, f string
			var e int
			if rows.Scan(&a, &b, &c, &d, &e, &f) == nil {
				t.Rows = append(t.Rows, []interface{}{a, b, c, d, e, f})
			}
		}
	case "maintenance":
		t.Headers = []string{"Tiket", "Judul", "Kategori", "Prioritas", "Status", "Dibuat", "Selesai"}
		rows, err := s.db.QueryContext(ctx, `SELECT nomor_tiket, judul, kategori, prioritas, status,
			to_char(created_at,'YYYY-MM-DD'), coalesce(to_char(resolved_at,'YYYY-MM-DD'),'-')
			FROM tickets WHERE ($1::uuid IS NULL OR properti_id=$1) ORDER BY created_at DESC`, uuidArg(propertyID))
		if err != nil {
			return nil, "", err
		}
		defer rows.Close()
		for rows.Next() {
			var a, b, c, d, e, f, g string
			if rows.Scan(&a, &b, &c, &d, &e, &f, &g) == nil {
				t.Rows = append(t.Rows, []interface{}{a, b, c, d, e, f, g})
			}
		}
	default:
		return nil, "", apperror.BadRequest("Jenis laporan tidak dikenal")
	}
	return t, "Laporan " + kind, nil
}

func (s *ReportService) ReportData(ctx context.Context, kind, from, to, propertyID string) (*reportTable, error) {
	t, _, err := s.table(ctx, kind, from, to, propertyID)
	return t, err
}

func (s *ReportService) ExportExcel(ctx context.Context, kind, from, to, propertyID string) ([]byte, string, error) {
	table, _, err := s.table(ctx, kind, from, to, propertyID)
	if err != nil {
		return nil, "", err
	}
	f := excelize.NewFile()
	defer f.Close()
	sheet := "Laporan"
	_ = f.SetSheetName("Sheet1", sheet)
	style, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Color: "#FFFFFF"}, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"#2563EB"}}})
	for col, h := range table.Headers {
		cell, _ := excelize.CoordinatesToCellName(col+1, 1)
		_ = f.SetCellValue(sheet, cell, h)
		_ = f.SetCellStyle(sheet, cell, cell, style)
	}
	for i, row := range table.Rows {
		for col, v := range row {
			cell, _ := excelize.CoordinatesToCellName(col+1, i+2)
			_ = f.SetCellValue(sheet, cell, v)
		}
	}
	for i := range table.Headers {
		col, _ := excelize.ColumnNumberToName(i + 1)
		_ = f.SetColWidth(sheet, col, col, 22)
	}
	var buf bytes.Buffer
	if err = f.Write(&buf); err != nil {
		return nil, "", err
	}
	name := fmt.Sprintf("laporan-%s-%s.xlsx", kind, time.Now().Format("20060102"))
	return buf.Bytes(), name, nil
}

func (s *ReportService) ExportPDF(ctx context.Context, kind, from, to, propertyID string) ([]byte, string, error) {
	table, title, err := s.table(ctx, kind, from, to, propertyID)
	if err != nil {
		return nil, "", err
	}
	data := make([][]string, 0, len(table.Rows))
	for _, row := range table.Rows {
		cells := make([]string, 0, len(row))
		for _, v := range row {
			cells = append(cells, fmt.Sprint(v))
		}
		data = append(data, cells)
	}
	out, err := pdf.Table(title, table.Headers, data)
	if err != nil {
		return nil, "", err
	}
	return out, fmt.Sprintf("laporan-%s-%s.pdf", kind, time.Now().Format("20060102")), nil
}
