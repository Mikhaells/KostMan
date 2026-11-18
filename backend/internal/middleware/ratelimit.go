package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/kosman/app/internal/pkg/response"
)

type visitor struct {
	count int
	last  time.Time
}

type limiter struct {
	mu      sync.Mutex
	visits  map[string]*visitor
	perMin  int
	cleanup time.Time
}

// RateLimit limits requests per IP for public endpoints (100 req/min by default).
func RateLimit(perMin int) func(http.Handler) http.Handler {
	l := &limiter{visits: make(map[string]*visitor), perMin: perMin, cleanup: time.Now().Add(time.Hour)}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				ip = r.RemoteAddr
			}
			l.mu.Lock()
			now := time.Now()
			v := l.visits[ip]
			if v == nil || now.Sub(v.last) > time.Minute {
				v = &visitor{last: now}
				l.visits[ip] = v
			}
			v.count++
			blocked := v.count > l.perMin
			if now.After(l.cleanup) {
				l.visits = make(map[string]*visitor)
				l.cleanup = now.Add(time.Hour)
			}
			l.mu.Unlock()
			if blocked {
				response.FailWith(w, http.StatusTooManyRequests, "Terlalu banyak permintaan, coba lagi nanti")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
