package mailer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/kosman/app/internal/config"
	"github.com/kosman/app/internal/pkg/logger"
	"gopkg.in/gomail.v2"
)

type Mailer struct {
	cfg     *config.Config
	enabled bool
}

func New(cfg *config.Config) *Mailer {
	smtpReady := strings.TrimSpace(cfg.SMTPHost) != "" && cfg.SMTPHost != "localhost"
	return &Mailer{cfg: cfg, enabled: smtpReady || strings.TrimSpace(cfg.ResendAPIKey) != ""}
}

func (m *Mailer) Send(to, subject, body string) error {
	if !m.enabled {
		logger.Info("email not configured, skipping email to " + to + " [" + subject + "]")
		return nil
	}
	// Resend uses HTTPS (port 443), which works on platforms that block SMTP ports.
	if strings.TrimSpace(m.cfg.ResendAPIKey) != "" {
		return m.sendResend(to, subject, body)
	}
	msg := gomail.NewMessage()
	msg.SetHeader("From", m.cfg.SMTPFrom)
	msg.SetHeader("To", to)
	msg.SetHeader("Subject", subject)
	msg.SetBody("text/html", body)

	dialer := gomail.NewDialer(m.cfg.SMTPHost, m.cfg.SMTPPort, m.cfg.SMTPUser, m.cfg.SMTPPass)
	if m.cfg.SMTPUser == "" {
		dialer.Auth = nil
	}
	if err := dialer.DialAndSend(msg); err != nil {
		logger.Error(err, "send email failed")
		return err
	}
	return nil
}

// sendResend delivers email through the Resend HTTPS API.
func (m *Mailer) sendResend(to, subject, body string) error {
	payload, err := json.Marshal(map[string]interface{}{
		"from":    m.cfg.SMTPFrom,
		"to":      []string{to},
		"subject": subject,
		"html":    body,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+m.cfg.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		logger.Error(err, "send email failed (resend)")
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("resend returned status %d", resp.StatusCode)
	}
	return nil
}

func (m *Mailer) InvoiceCreated(to, invoiceNo string, total int64, due string) error {
	body := "<h2>Tagihan Baru</h2><p>Tagihan <b>" + invoiceNo + "</b> sebesar <b>Rp" + format(total) + "</b> telah dibuat.</p><p>Jatuh tempo: " + due + "</p>"
	return m.Send(to, "Tagihan baru "+invoiceNo, body)
}

func (m *Mailer) InvoiceReminder(to, invoiceNo string, total int64, due string) error {
	body := "<h2>Pengingat Tagihan</h2><p>Tagihan <b>" + invoiceNo + "</b> sebesar <b>Rp" + format(total) + "</b> akan jatuh tempo pada " + due + ".</p>"
	return m.Send(to, "Pengingat jatuh tempo "+invoiceNo, body)
}

func (m *Mailer) InvoiceOverdue(to, invoiceNo string, total int64) error {
	body := "<h2>Tagihan Terlambat</h2><p>Tagihan <b>" + invoiceNo + "</b> sebesar <b>Rp" + format(total) + "</b> sudah melewati jatuh tempo.</p>"
	return m.Send(to, "Tagihan terlambat "+invoiceNo, body)
}

func (m *Mailer) PaymentVerified(to, invoiceNo string, amount int64) error {
	body := "<h2>Pembayaran Diverifikasi</h2><p>Pembayaran untuk tagihan <b>" + invoiceNo + "</b> sebesar <b>Rp" + format(amount) + "</b> telah diverifikasi. Terima kasih.</p>"
	return m.Send(to, "Pembayaran terverifikasi "+invoiceNo, body)
}

func (m *Mailer) ContractEnding(to, contractNo, endDate string) error {
	body := "<h2>Kontrak Akan Berakhir</h2><p>Kontrak <b>" + contractNo + "</b> akan berakhir pada " + endDate + ". Silakan tindaklanjuti perpanjangan.</p>"
	return m.Send(to, "Kontrak akan berakhir "+contractNo, body)
}

func (m *Mailer) TicketResolved(to, ticketNo, resolution string) error {
	body := "<h2>Tiket Selesai</h2><p>Tikel <b>" + ticketNo + "</b> telah selesai.</p><p>Catatan: " + resolution + "</p>"
	return m.Send(to, "Tiket selesai "+ticketNo, body)
}

func (m *Mailer) PasswordReset(to, link string) error {
	body := "<h2>Reset Password</h2><p>Klik tautan berikut untuk mengatur ulang password Anda (berlaku 1 jam):</p><p><a href='" + link + "'>" + link + "</a></p>"
	return m.Send(to, "Reset password KosMan", body)
}

func format(n int64) string {
	s := ""
	for i, c := range strings.Split(reverseInt(n), "") {
		if i > 0 && (len(strings.Split(reverseInt(n), ""))-i)%3 == 0 {
			s += "."
		}
		s += c
	}
	return reverseString(s)
}

func reverseInt(n int64) string {
	if n == 0 {
		return "0"
	}
	out := ""
	for n > 0 {
		out += string(rune('0' + n%10))
		n /= 10
	}
	return out
}

func reverseString(s string) string {
	r := []rune(s)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	return string(r)
}
