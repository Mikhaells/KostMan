import type { ReactNode } from 'react'
import { Building2, ChartNoAxesCombined, ReceiptText, Wrench } from 'lucide-react'

export default function AuthLayout({
  title, subtitle, children, footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500 text-xl font-extrabold">K</span>
          <span className="text-2xl font-extrabold tracking-tight">KosMan</span>
        </div>
        <div className="relative max-w-lg">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Kelola kos lebih rapi, tanpa catatan berserakan.</h2>
          <p className="mt-4 text-slate-300">Satu platform untuk properti, kamar, penyewa, kontrak, tagihan, pembayaran, dan laporan keuangan Anda.</p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { icon: <Building2 className="h-5 w-5" />, label: 'Properti & kamar' },
              { icon: <ReceiptText className="h-5 w-5" />, label: 'Tagihan otomatis' },
              { icon: <ChartNoAxesCombined className="h-5 w-5" />, label: 'Laporan real-time' },
              { icon: <Wrench className="h-5 w-5" />, label: 'Tiket maintenance' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <span className="text-brand-300">{item.icon}</span>{item.label}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} KosMan · Sistem Manajemen Kos & Kontrakan</p>
      </div>

      <div className="flex w-full items-center justify-center bg-slate-50 px-5 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-lg font-extrabold text-white">K</span>
            <span className="text-xl font-extrabold text-slate-900">KosMan</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
