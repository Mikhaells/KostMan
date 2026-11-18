import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarDays, CreditCard, Home, Ticket, Wallet } from 'lucide-react'
import { api, apiList, errorMessage } from '../../lib/api'
import { formatDate, rupiah } from '../../lib/format'
import { useAuthStore } from '../../store/auth'
import { Card, EmptyState, ErrorState, Loading, PageHeader, StatCard, StatusBadge } from '../../components/ui'
import type { Contract, Invoice, Tenant, Ticket as TicketType } from '../../types'

export default function TenantPortalPage() {
  const user = useAuthStore((state) => state.user)
  const tenant = useQuery({ queryKey: ['tenants', 'me'], queryFn: () => api.get<Tenant>('/tenants/me') })
  const contracts = useQuery({ queryKey: ['contracts', 'me'], queryFn: () => apiList<Contract>('/contracts', { status: 'aktif', limit: 5 }) })
  const invoices = useQuery({ queryKey: ['invoices', 'me'], queryFn: () => apiList<Invoice>('/invoices', { limit: 20 }) })
  const tickets = useQuery({ queryKey: ['tickets', 'me'], queryFn: () => apiList<TicketType>('/tickets', { limit: 20 }) })

  if (tenant.isLoading) return <Loading label="Memuat beranda…" />
  if (tenant.isError) return <ErrorState message={errorMessage(tenant.error)} onRetry={() => tenant.refetch()} />

  const unpaid = (invoices.data?.items ?? []).filter((invoice) => ['terkirim', 'terlambat', 'sebagian'].includes(invoice.status))
  const totalUnpaid = unpaid.reduce((sum, invoice) => sum + invoice.total, 0)
  const openTickets = (tickets.data?.items ?? []).filter((ticket) => ['open', 'in_progress'].includes(ticket.status))
  const activeContracts = contracts.data?.items ?? []

  return (
    <>
      <PageHeader title={`Halo, ${user?.nama?.split(' ')[0] ?? 'Penyewa'} 👋`} subtitle="Ringkasan kontrak dan tagihan Anda." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tagihan belum dibayar" value={rupiah(totalUnpaid)} hint={`${unpaid.length} tagihan aktif`} icon={<Wallet className="h-5 w-5" />} tone="red" />
        <StatCard label="Kontrak aktif" value={String(activeContracts.length)} hint="Sedang berjalan" icon={<Home className="h-5 w-5" />} tone="green" />
        <StatCard label="Tiket terbuka" value={String(openTickets.length)} hint="Menunggu penanganan" icon={<Ticket className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Kontrak Sewa Saya</h3>
            <Link to="/portal/invoices" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">Lihat tagihan <ArrowRight className="h-3 w-3" /></Link>
          </div>
          {contracts.isLoading ? <Loading /> : contracts.isError ? <ErrorState message={errorMessage(contracts.error)} /> : (
            activeContracts.length === 0 ? <EmptyState title="Belum ada kontrak aktif" description="Hubungi pengelola kos jika data kontrak Anda belum tersedia." /> : (
              <div className="space-y-3">
                {activeContracts.map((contract) => (
                  <div key={contract.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-800">{contract.nama_properti ?? 'Properti'} · Kamar {contract.nomor_kamar ?? '-'}</p>
                        <p className="text-xs text-slate-500">No. kontrak {contract.nomor_kontrak}</p>
                      </div>
                      <StatusBadge status={contract.status} />
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <div><p className="text-xs text-slate-400">Mulai</p><p className="font-semibold text-slate-700">{formatDate(contract.tanggal_mulai)}</p></div>
                      <div><p className="text-xs text-slate-400">Berakhir</p><p className="font-semibold text-slate-700">{formatDate(contract.tanggal_selesai)}</p></div>
                      <div><p className="text-xs text-slate-400">Sewa / bulan</p><p className="font-semibold text-slate-700">{rupiah(contract.harga_sewa)}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 font-bold text-slate-800">Tagihan Terdekat</h3>
          {invoices.isLoading ? <Loading /> : invoices.isError ? <ErrorState message={errorMessage(invoices.error)} /> : (
            unpaid.length === 0 ? <EmptyState title="Semua lunas 🎉" description="Tidak ada tagihan yang perlu dibayar." /> : (
              <div className="space-y-3">
                {unpaid.slice(0, 4).map((invoice) => (
                  <Link key={invoice.id} to="/portal/invoices" className="flex items-center justify-between rounded-xl border border-slate-100 p-3 transition hover:border-brand-200">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{invoice.nomor_invoice}</p>
                      <p className="text-xs text-slate-400">Tempo {formatDate(invoice.tanggal_jatuh_tempo)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">{rupiah(invoice.total)}</p>
                      <StatusBadge status={invoice.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Link to="/portal/invoices" className="card-base flex items-center gap-3 p-4 transition hover:shadow-md"><span className="rounded-lg bg-brand-50 p-2.5 text-brand-600"><CreditCard className="h-5 w-5" /></span><div><p className="font-semibold text-slate-800">Bayar Tagihan</p><p className="text-xs text-slate-500">Unggah bukti pembayaran</p></div></Link>
        <Link to="/portal/tickets" className="card-base flex items-center gap-3 p-4 transition hover:shadow-md"><span className="rounded-lg bg-amber-50 p-2.5 text-amber-600"><Ticket className="h-5 w-5" /></span><div><p className="font-semibold text-slate-800">Lapor Keluhan</p><p className="text-xs text-slate-500">Listrik, air, furniture</p></div></Link>
        <Link to="/portal/profile" className="card-base flex items-center gap-3 p-4 transition hover:shadow-md"><span className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600"><CalendarDays className="h-5 w-5" /></span><div><p className="font-semibold text-slate-800">Profil Saya</p><p className="text-xs text-slate-500">Perbarui data kontak</p></div></Link>
      </div>

      {tenant.data && (
        <Card className="mt-5 p-5">
          <h3 className="mb-3 font-bold text-slate-800">Data Diri</h3>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs text-slate-400">Nama lengkap</p><p className="font-semibold text-slate-700">{tenant.data.nama_lengkap}</p></div>
            <div><p className="text-xs text-slate-400">No. HP</p><p className="font-semibold text-slate-700">{tenant.data.no_hp}</p></div>
            <div><p className="text-xs text-slate-400">Email</p><p className="font-semibold text-slate-700">{tenant.data.email}</p></div>
            <div><p className="text-xs text-slate-400">Kontak darurat</p><p className="font-semibold text-slate-700">{tenant.data.kontak_darurat_nama} · {tenant.data.kontak_darurat_hp}</p></div>
          </div>
        </Card>
      )}
    </>
  )
}
