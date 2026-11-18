import { forwardRef, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Info, Loader2, X } from 'lucide-react'
import { getToastSnapshot, subscribeToasts } from '../../lib/toast'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'icon'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  const variants: Record<string, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-200',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus:ring-slate-200',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-200',
    ghost: 'text-slate-600 hover:bg-slate-100 focus:ring-slate-200',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-200',
  }
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    icon: 'h-9 w-9 p-0',
  }
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
})

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn('input-base', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn('input-base min-h-[96px] resize-y', className)} {...props} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn('input-base cursor-pointer', className)} {...props}>
      {children}
    </select>
  )
})

export function Field({ label, children, hint, required }: { label: string; children: ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="field-label">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card-base', className)}>{children}</div>
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

type Tone = 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'violet' | 'brand'
const toneClasses: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
}

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', toneClasses[tone], className)}>
      {children}
    </span>
  )
}

const statusTones: Record<string, Tone> = {
  aktif: 'green', dibayar: 'green', verified: 'green', resolved: 'green', closed: 'green', terisi: 'green',
  nonaktif: 'slate', selesai: 'slate', batal: 'slate', dibatalkan: 'slate', draft: 'slate', closed_ticket: 'slate',
  terkirim: 'blue', in_progress: 'blue', diperpjang: 'blue', dipercepat: 'blue', diperdpanjang: 'blue', diperpanjang: 'blue',
  kosong: 'blue', pending: 'amber', sebagian: 'amber', maintenance: 'amber', reserved: 'amber', sedang: 'amber',
  terlambat: 'red', rejected: 'red', urgent: 'red', tinggi: 'red', open: 'red',
  rendah: 'slate', sedang_: 'violet', lainnya: 'violet', furniture: 'violet',
}

export function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    in_progress: 'Dalam Proses', dibayar: 'Lunas', sebagian: 'Sebagian', terlambat: 'Terlambat',
    terkirim: 'Terkirim', draft: 'Draft', batal: 'Dibatalkan', maintenance: 'Maintenance',
    kosong: 'Kosong', terisi: 'Terisi', reserved: 'Reserved', open: 'Open', resolved: 'Resolved',
    closed: 'Closed', pending: 'Menunggu', verified: 'Terverifikasi', rejected: 'Ditolak',
    diperaspanjang: 'Diperpanjang', selesai: 'Selesai',
  }
  const tone = statusTones[status] ?? 'slate'
  return <Badge tone={tone}>{label[status] ?? status}</Badge>
}

export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  if (!open) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn('flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl', widths[size])}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)}>{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn('whitespace-nowrap border-b border-slate-200 bg-slate-50/70 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500', className)}>{children}</th>
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('border-b border-slate-100 px-4 py-3 align-middle text-slate-700', className)}>{children}</td>
}

export function Loading({ label = 'Memuat data…' }: { label?: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function EmptyState({ title = 'Belum ada data', description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-400"><Inbox className="h-6 w-6" /></div>
      <p className="font-semibold text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="rounded-full bg-rose-50 p-3 text-rose-500"><AlertCircle className="h-6 w-6" /></div>
      <p className="font-semibold text-slate-700">Gagal memuat data</p>
      <p className="max-w-sm text-sm text-slate-500">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Coba lagi</Button>}
    </div>
  )
}

export function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (page: number) => void }) {
  if (total === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
      <span>{total} data · halaman {page} dari {Math.max(pages, 1)}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Sebelumnya">
          <ChevronLeft className="h-4 w-4" /> Sebelumnya
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Berikutnya">
          Berikutnya <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Hapus', loading, onCancel, onConfirm,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>Batal</Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">{message}</p>
    </Modal>
  )
}

export function StatCard({
  label, value, hint, icon, tone = 'brand',
}: {
  label: string
  value: string
  hint?: string
  icon: ReactNode
  tone?: Tone
}) {
  const iconTone: Record<Tone, string> = {
    green: 'bg-emerald-50 text-emerald-600', red: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600', blue: 'bg-sky-50 text-sky-600',
    slate: 'bg-slate-100 text-slate-600', violet: 'bg-violet-50 text-violet-600',
    brand: 'bg-brand-50 text-brand-600',
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        <div className={cn('rounded-xl p-2.5', iconTone[tone])}>{icon}</div>
      </div>
    </Card>
  )
}

export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, getToastSnapshot)
  if (items.length === 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex w-full max-w-sm flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            'flex items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg',
            item.tone === 'error' ? 'border-rose-200 text-rose-700' : 'border-slate-200 text-slate-700',
          )}
        >
          {item.tone === 'error' ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          ) : item.tone === 'info' ? (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          )}
          <span className="leading-relaxed">{item.message}</span>
        </div>
      ))}
    </div>
  )
}
