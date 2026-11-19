export function rupiah(value?: number | null): string {
  if (value === undefined || value === null) return 'Rp0'
  return 'Rp' + Math.round(value).toLocaleString('id-ID')
}

export function shortRupiah(value?: number | null): string {
  const n = value ?? 0
  if (n >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(1).replace('.0', '')} M`
  if (n >= 1_000_000) return `Rp${(n / 1_000_000).toFixed(1).replace('.0', '')} jt`
  if (n >= 1_000) return `Rp${(n / 1_000).toFixed(0)} rb`
  return rupiah(n)
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function monthStartISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function addMonthsISO(dateISO: string, months: number): string {
  const d = new Date(dateISO)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function timeAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} hari lalu`
  return formatDate(value)
}
