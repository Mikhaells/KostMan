import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, LifeBuoy, Wrench } from 'lucide-react'
import { api, apiList, errorMessage, fileUrl } from '../../lib/api'
import { formatDateTime, timeAgo } from '../../lib/format'
import { toast } from '../../lib/toast'
import {
  Button, Card, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pagination,
  Select, StatCard, StatusBadge, Table, Td, Textarea, Th,
} from '../../components/ui'
import type { Ticket } from '../../types'

type UpdateForm = { status: string; prioritas: string; assigned_to: string; resolusi: string }

export default function TicketsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [form, setForm] = useState<UpdateForm>({ status: 'open', prioritas: 'sedang', assigned_to: '', resolusi: '' })

  const list = useQuery({
    queryKey: ['tickets', page, status, priority],
    queryFn: () => apiList<Ticket>('/tickets', {
      page, limit: 10, status: status || undefined, prioritas: priority || undefined,
    }),
  })
  const stats = useQuery({ queryKey: ['tickets', 'stats'], queryFn: () => api.get<Record<string, number>>('/tickets/stats') })

  useEffect(() => {
    if (!detailOpen || !selected) return
    setForm({ status: selected.status, prioritas: selected.prioritas, assigned_to: selected.assigned_to ?? '', resolusi: selected.resolusi ?? '' })
  }, [detailOpen, selected])

  const update = useMutation({
    mutationFn: () => api.patch<Ticket>(`/tickets/${selected!.id}`, form),
    onSuccess: () => {
      toast('Tiket diperbarui')
      setDetailOpen(false)
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const openDetail = (ticket: Ticket) => { setSelected(ticket); setDetailOpen(true) }

  return (
    <>
      <PageHeader title="Keluhan & Maintenance" subtitle="Tanggapi laporan penyewa dan pantau penyelesaiannya." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tiket Open" value={String(stats.data?.open ?? 0)} hint="Belum ditangani" icon={<LifeBuoy className="h-5 w-5" />} tone="red" />
        <StatCard label="Dalam Proses" value={String(stats.data?.in_progress ?? 0)} hint="Sedang dikerjakan" icon={<Wrench className="h-5 w-5" />} tone="blue" />
        <StatCard label="Selesai" value={String(stats.data?.resolved ?? 0)} hint="Sudah diselesaikan" icon={<LifeBuoy className="h-5 w-5" />} tone="green" />
        <StatCard label="Prioritas Urgent" value={String(stats.data?.urgent ?? 0)} hint="Perlu tindakan segera" icon={<LifeBuoy className="h-5 w-5" />} tone="amber" />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-3">
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="w-full sm:w-44">
            <option value="">Semua status</option><option value="open">Open</option>
            <option value="in_progress">Dalam Proses</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </Select>
          <Select value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1) }} className="w-full sm:w-44">
            <option value="">Semua prioritas</option><option value="rendah">Rendah</option>
            <option value="sedang">Sedang</option><option value="tinggi">Tinggi</option><option value="urgent">Urgent</option>
          </Select>
        </div>
      </Card>

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title="Tidak ada tiket" description="Keluhan dari penyewa akan tampil di sini." />
          ) : (
            <>
              <Table>
                <thead><tr><Th>No. Tiket</Th><Th>Judul</Th><Th>Penyewa / Properti</Th><Th>Kategori</Th><Th>Prioritas</Th><Th>Status</Th><Th>Dibuat</Th><Th className="text-right">Aksi</Th></tr></thead>
                <tbody>
                  {list.data!.items.map((ticket) => (
                    <tr key={ticket.id}>
                      <Td className="font-semibold text-slate-800">{ticket.nomor_tiket}</Td>
                      <Td><p className="max-w-[220px] truncate font-medium">{ticket.judul}</p><p className="text-xs text-slate-400">{ticket.deskripsi}</p></Td>
                      <Td><p>{ticket.nama_penyewa ?? 'â€”'}</p><p className="text-xs text-slate-400">{ticket.nama_properti ?? ''}</p></Td>
                      <Td className="capitalize">{ticket.kategori}</Td>
                      <Td><StatusBadge status={ticket.prioritas} /></Td>
                      <Td><StatusBadge status={ticket.status} /></Td>
                      <Td className="whitespace-nowrap text-xs"><span title={formatDateTime(ticket.created_at)}>{timeAgo(ticket.created_at)}</span></Td>
                      <Td className="text-right"><Button variant="ghost" size="icon" onClick={() => openDetail(ticket)} aria-label="Detail"><Eye className="h-4 w-4" /></Button></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={page} pages={list.data!.meta.total_pages} total={list.data!.meta.total} onChange={setPage} />
            </>
          )
        )}
      </Card>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selected?.judul ?? 'Detail Tiket'}
        subtitle={selected ? `${selected.nomor_tiket} Â· ${selected.nama_penyewa ?? ''}` : undefined}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setDetailOpen(false)}>Batal</Button><Button loading={update.isPending} onClick={() => update.mutate()}>Simpan Perubahan</Button></>}
      >
        {selected && (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{selected.deskripsi}</div>
            {selected.foto.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected.foto.map((url) => <a key={url} href={fileUrl(url)} target="_blank" rel="noreferrer"><img src={fileUrl(url)} alt="Bukti keluhan" className="h-24 w-24 rounded-lg object-cover" /></a>)}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status">
                <Select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="open">Open</option><option value="in_progress">Dalam Proses</option>
                  <option value="resolved">Resolved</option><option value="closed">Closed</option>
                </Select>
              </Field>
              <Field label="Prioritas">
                <Select value={form.prioritas} onChange={(event) => setForm((prev) => ({ ...prev, prioritas: event.target.value }))}>
                  <option value="rendah">Rendah</option><option value="sedang">Sedang</option>
                  <option value="tinggi">Tinggi</option><option value="urgent">Urgent</option>
                </Select>
              </Field>
              <Field label="Ditugaskan kepada"><input className="input-base" value={form.assigned_to} onChange={(event) => setForm((prev) => ({ ...prev, assigned_to: event.target.value }))} placeholder="Nama teknisi / ID pengguna" /></Field>
              <div className="sm:col-span-2"><Field label="Resolusi"><Textarea value={form.resolusi} onChange={(event) => setForm((prev) => ({ ...prev, resolusi: event.target.value }))} placeholder="Jelaskan tindakan yang dilakukanâ€¦" /></Field></div>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
