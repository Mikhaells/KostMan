import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, DoorOpen, Receipt, Ticket, TrendingUp, UserRoundCheck, Wallet,
} from 'lucide-react'
import { api, apiList, errorMessage } from '../../lib/api'
import { formatDate, shortRupiah, rupiah } from '../../lib/format'
import {
  Card, CardHeader, EmptyState, ErrorState, Loading, PageHeader, StatCard, StatusBadge, Table, Td, Th,
} from '../../components/ui'
import type { DashboardData, Invoice } from '../../types'

export default function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  })
  const recent = useQuery({
    queryKey: ['invoices', 'recent'],
    queryFn: () => apiList<Invoice>('/invoices', { limit: 5, sort: 'desc' }),
  })

  if (query.isLoading) return <Loading label="Memuat ringkasan dashboard…" />
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />

  const data = query.data!
  const chart = data.grafik_pendapatan ?? []
  const maxChart = Math.max(...chart.map((point) => point.total), 1)
  const occupancy = data.okupansi ?? 0

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Ringkasan operasional dan keuangan kos Anda hari ini."
        actions={
          <span className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-500 shadow-sm">
            Diperbarui {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pendapatan bulan ini" value={shortRupiah(data.pendapatan_bulan_ini)} hint="Dari pembayaran terverifikasi" icon={<Wallet className="h-5 w-5" />} tone="green" />
        <StatCard label="Tagihan belum lunas" value={shortRupiah(data.tagihan_belum_lunas)} hint="Perlu ditindaklanjuti" icon={<Receipt className="h-5 w-5" />} tone="red" />
        <StatCard label="Tingkat okupansi" value={`${occupancy.toFixed(1)}%`} hint={`${data.kamar_terisi} dari ${data.total_kamar} kamar terisi`} icon={<DoorOpen className="h-5 w-5" />} tone="blue" />
        <StatCard label="Tiket terbuka" value={String(data.tiket_open ?? 0)} hint="Belum selesai ditangani" icon={<Ticket className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800">Tren Pendapatan</h3>
              <p className="text-xs text-slate-500">Pembayaran terverifikasi 6 bulan terakhir</p>
            </div>
            <TrendingUp className="h-5 w-5 text-brand-500" />
          </div>
          {chart.length === 0 ? (
            <EmptyState title="Belum ada pendapatan" description="Data pendapatan akan muncul setelah pembayaran diverifikasi." />
          ) : (
            <div className="flex h-56 items-end gap-3">
              {chart.map((point) => (
                <div key={point.bulan} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-[10px] font-semibold text-slate-500 opacity-0 transition group-hover:opacity-100">{shortRupiah(point.total)}</span>
                  <div
                    className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-brand-500 to-brand-300 transition hover:from-brand-600 hover:to-brand-400"
                    style={{ height: `${Math.max((point.total / maxChart) * 100, 4)}%` }}
                    title={`${point.bulan}: ${rupiah(point.total)}`}
                  />
                  <span className="whitespace-nowrap text-[10px] text-slate-500">{point.bulan}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-slate-800">Okupansi Properti</h3>
          <p className="mb-5 text-xs text-slate-500">Persentase kamar terisi per properti</p>
          <div className="space-y-4">
            {(data.okupansi_per_properti ?? []).length === 0 ? (
              <EmptyState title="Belum ada properti" />
            ) : (
              data.okupansi_per_properti.map((item) => (
                <div key={item.nama}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold text-slate-700">{item.nama}</span>
                    <span className="text-slate-500">{item.terisi}/{item.total} · {item.persen}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(item.persen, 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Link to="/properties" className="card-base flex items-center gap-3 p-4 transition hover:border-brand-200 hover:shadow-md">
          <span className="rounded-lg bg-brand-50 p-2.5 text-brand-600"><Building2 className="h-5 w-5" /></span>
          <div><p className="text-xl font-bold text-slate-800">{data.total_properti}</p><p className="text-xs text-slate-500">Total properti</p></div>
        </Link>
        <Link to="/tenants" className="card-base flex items-center gap-3 p-4 transition hover:border-brand-200 hover:shadow-md">
          <span className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600"><UserRoundCheck className="h-5 w-5" /></span>
          <div><p className="text-xl font-bold text-slate-800">{data.penyewa_aktif}</p><p className="text-xs text-slate-500">Kontrak aktif</p></div>
        </Link>
        <Link to="/tickets" className="card-base flex items-center gap-3 p-4 transition hover:border-brand-200 hover:shadow-md">
          <span className="rounded-lg bg-amber-50 p-2.5 text-amber-600"><Ticket className="h-5 w-5" /></span>
          <div><p className="text-xl font-bold text-slate-800">{data.tiket_open}</p><p className="text-xs text-slate-500">Tiket perlu ditangani</p></div>
        </Link>
      </div>

      <Card className="mt-5">
        <CardHeader title="Tagihan Terbaru" subtitle="Beberapa tagihan dengan aktivitas terakhir" action={<Link to="/invoices" className="text-xs font-semibold text-brand-600 hover:underline">Lihat semua</Link>} />
        {recent.isLoading ? <Loading /> : recent.isError ? <ErrorState message={errorMessage(recent.error)} /> : (
          recent.data!.items.length === 0 ? <EmptyState title="Belum ada tagihan" /> : (
            <Table>
              <thead><tr><Th>No. Invoice</Th><Th>Penyewa</Th><Th>Jatuh Tempo</Th><Th>Total</Th><Th>Status</Th></tr></thead>
              <tbody>
                {recent.data!.items.map((invoice) => (
                  <tr key={invoice.id}>
                    <Td className="font-semibold text-slate-800">{invoice.nomor_invoice}</Td>
                    <Td>{invoice.nama_penyewa ?? '—'}</Td>
                    <Td>{formatDate(invoice.tanggal_jatuh_tempo)}</Td>
                    <Td className="font-semibold">{rupiah(invoice.total)}</Td>
                    <Td><StatusBadge status={invoice.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        )}
      </Card>
    </>
  )
}
