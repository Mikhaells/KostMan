package pdf

import (
	"bytes"
	"fmt"

	"github.com/jung-kurt/gofpdf"
	"github.com/kosman/app/internal/model"
)

func rupiah(n int64) string {
	return fmt.Sprintf("Rp%v", n)
}

func newDoc(title string) *gofpdf.Fpdf {
	p := gofpdf.New("P", "mm", "A4", "")
	p.AddPage()
	p.SetMargins(16, 16, 16)
	p.SetFont("Arial", "B", 18)
	p.CellFormat(0, 10, title, "", 1, "L", false, 0, "")
	p.SetDrawColor(30, 105, 80)
	p.Line(16, p.GetY(), 194, p.GetY())
	p.Ln(4)
	return p
}

func footer(p *gofpdf.Fpdf) {
	p.SetY(-18)
	p.SetFont("Arial", "I", 8)
	p.CellFormat(0, 6, "Dokumen ini dihasilkan otomatis oleh Sistem Manajemen Kos & Kontrakan.", "", 0, "C", false, 0, "")
}

// Table renders a generic report table as landscape A4 PDF.
func Table(title string, headers []string, rows [][]string) ([]byte, error) {
	p := gofpdf.New("L", "mm", "A4", "")
	p.AddPage()
	p.SetMargins(12, 14, 12)
	p.SetFont("Arial", "B", 15)
	p.CellFormat(0, 9, title, "", 1, "L", false, 0, "")
	p.SetDrawColor(30, 105, 80)
	p.Line(12, p.GetY(), 285, p.GetY())
	p.Ln(3)

	width := 0.0
	for range headers {
		width += 15
	}
	if len(headers) > 0 {
		width = (285 - 12) / float64(len(headers))
	}
	p.SetFillColor(235, 242, 238)
	p.SetFont("Arial", "B", 9)
	for _, h := range headers {
		p.CellFormat(width, 8, truncate(h, 45), "1", 0, "L", true, 0, "")
	}
	p.Ln(8)
	p.SetFont("Arial", "", 8)
	for _, row := range rows {
		for i := range headers {
			value := ""
			if i < len(row) {
				value = row[i]
			}
			p.CellFormat(width, 7, truncate(value, 45), "1", 0, "L", false, 0, "")
		}
		p.Ln(7)
		if p.GetY() > 185 {
			p.AddPage()
			p.SetFont("Arial", "B", 9)
			for _, h := range headers {
				p.CellFormat(width, 8, truncate(h, 45), "1", 0, "L", true, 0, "")
			}
			p.Ln(8)
			p.SetFont("Arial", "", 8)
		}
	}
	footer(p)
	var buf bytes.Buffer
	err := p.Output(&buf)
	return buf.Bytes(), err
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}

func Invoice(inv *model.Invoice, tenant *model.Tenant, propertyName string) ([]byte, error) {
	p := newDoc("INVOICE / TAGIHAN")
	p.SetFont("Arial", "B", 12)
	p.CellFormat(0, 7, inv.NomorInvoice, "", 1, "R", false, 0, "")
	p.SetFont("Arial", "", 10)
	p.CellFormat(90, 6, "Penyewa: "+tenant.NamaLengkap, "", 0, "L", false, 0, "")
	p.CellFormat(0, 6, "Properti: "+propertyName, "", 1, "L", false, 0, "")
	p.CellFormat(90, 6, "Periode: "+inv.PeriodeMulai.Format("02 Jan 2006")+" s/d "+inv.PeriodeSelesai.Format("02 Jan 2006"), "", 0, "L", false, 0, "")
	p.CellFormat(0, 6, "Jatuh tempo: "+inv.TanggalJatuhTempo.Format("02 Jan 2006"), "", 1, "L", false, 0, "")
	p.Ln(4)

	p.SetFillColor(235, 242, 238)
	p.SetFont("Arial", "B", 10)
	p.CellFormat(100, 8, "Keterangan", "1", 0, "L", true, 0, "")
	p.CellFormat(40, 8, "Qty", "1", 0, "C", true, 0, "")
	p.CellFormat(38, 8, "Jumlah", "1", 1, "R", true, 0, "")
	p.SetFont("Arial", "", 10)
	p.CellFormat(100, 8, "Sewa kamar", "1", 0, "L", false, 0, "")
	p.CellFormat(40, 8, "1", "1", 0, "C", false, 0, "")
	p.CellFormat(38, 8, rupiah(inv.JumlahPokok), "1", 1, "R", false, 0, "")
	for _, item := range inv.ItemTambahan {
		p.CellFormat(100, 8, item.Nama, "1", 0, "L", false, 0, "")
		p.CellFormat(40, 8, "1", "1", 0, "C", false, 0, "")
		p.CellFormat(38, 8, rupiah(item.Jumlah), "1", 1, "R", false, 0, "")
	}
	p.CellFormat(100, 8, "Diskon", "1", 0, "L", false, 0, "")
	p.CellFormat(40, 8, "-", "1", 0, "C", false, 0, "")
	p.CellFormat(38, 8, rupiah(inv.Diskon), "1", 1, "R", false, 0, "")
	p.CellFormat(100, 8, "Denda", "1", 0, "L", false, 0, "")
	p.CellFormat(40, 8, "1", "1", 0, "C", false, 0, "")
	p.CellFormat(38, 8, rupiah(inv.Denda), "1", 1, "R", false, 0, "")
	p.SetFont("Arial", "B", 11)
	p.CellFormat(140, 10, "TOTAL", "1", 0, "R", true, 0, "")
	p.CellFormat(38, 10, rupiah(inv.Total), "1", 1, "R", true, 0, "")
	p.Ln(8)
	p.SetFont("Arial", "", 10)
	p.CellFormat(0, 7, "Status: "+inv.Status, "", 1, "L", false, 0, "")
	footer(p)

	var buf bytes.Buffer
	err := p.Output(&buf)
	return buf.Bytes(), err
}

func Contract(c *model.Contract, tenant *model.Tenant, roomNo, propertyName, ownerName string) ([]byte, error) {
	p := newDoc("KONTRAK SEWA")
	p.SetFont("Arial", "B", 12)
	p.CellFormat(0, 7, c.NomorKontrak, "", 1, "R", false, 0, "")
	p.SetFont("Arial", "", 10)
	lines := []string{
		"Pemilik: " + ownerName,
		"Penyewa: " + tenant.NamaLengkap + " (NIK " + tenant.NIK + ")",
		"Properti: " + propertyName + ", Kamar " + roomNo,
		"Masa sewa: " + c.TanggalMulai.Format("02 Jan 2006") + " s/d " + c.TanggalSelesai.Format("02 Jan 2006"),
		"Harga sewa per bulan: " + rupiah(c.HargaSewa),
		"Deposit: " + rupiah(c.Deposit),
	}
	for _, line := range lines {
		p.CellFormat(0, 7, line, "", 1, "L", false, 0, "")
	}
	p.Ln(4)
	p.CellFormat(0, 6, "Ketentuan:", "", 1, "L", false, 0, "")
	for _, line := range []string{
		"1. Pembayaran sewa dilakukan sebelum tanggal jatuh tempo yang ditentukan.",
		"2. Penyewa bertanggung jawab atas kerusakan yang timbul selama masa sewa.",
		"3. Deposit dikembalikan setelah kontrak berakhir dengan memperhatikan kondisi kamar.",
		"4. Kontrak dapat diperpanjang dengan persetujuan kedua belah pihak.",
	} {
		p.CellFormat(0, 6, line, "", 1, "L", false, 0, "")
	}
	p.Ln(10)
	p.CellFormat(85, 7, "Pemilik,", "", 0, "C", false, 0, "")
	p.CellFormat(0, 7, "Penyewa,", "", 1, "C", false, 0, "")
	p.Ln(12)
	p.CellFormat(85, 7, "( "+ownerName+" )", "", 0, "C", false, 0, "")
	p.CellFormat(0, 7, "( "+tenant.NamaLengkap+" )", "", 1, "C", false, 0, "")
	footer(p)

	var buf bytes.Buffer
	err := p.Output(&buf)
	return buf.Bytes(), err
}
