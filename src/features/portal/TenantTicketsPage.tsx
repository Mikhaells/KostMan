import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Ticket as TicketIcon } from 'lucide-react'
import { api, apiList, errorMessage, fileUrl, uploadFile } from '../../lib/api'
import { formatDateTime, timeAgo } from '../../lib/format'
import { toast } from '../../lib/toast'
import { Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, Textarea } from '../../components/ui'
import type { Ticket } from '../../types'

export default function TenantTicketsPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [detail, setDetail] = useState<Ticket | null>(null)
  const [form, setForm] = useState({ judul: '', deskripsi: '', kategori: 'listrik', prioritas: 'sedang', foto: [] as string[] })
  const [uploading, setUploading] = useState(false)

  const list = useQuery({
    queryKey: ['tickets', 'me', status],
    queryFn: () => apiList<Ticket>('/tickets', { limit: 20, status: status || undefined }),
  })

  const create = useMutation({
    mutationFn: () => api.post<Ticket>('/tickets', form),
    onSuccess: () => {
      toast('Keluhan berhasil dikirim')
      setModalOpen(false)
      setForm({ judul: '', deskripsi: '', kategori: 'listrik', prioritas: 'sedang', foto: [] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const urls = await Promise.all(Array.from(files).slice(0, 3 - form.foto.length).map(uploadFile))
      setForm((prev) => ({ ...prev, foto: [...prev.foto, ...urls] }))
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Keluhan Saya"
        subtitle="Laporkan masalah kamar dan pantau proses penanganannya."
        actions={<Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Lapor Keluhan</Button>}
      />

      <Card className="mb-4 p-4">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full sm:w-52">
          <option value="">Semua status</option><option value="open">Open</option>
          <option value="in_progress">Dalam Proses</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
        </Select>
      </Card>

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title="Belum ada keluhan" description="Jika ada masalah dengan kamar Anda, jangan ragu untuk melaporkan." action={<Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Lapor Keluhan</Button>} />
          ) : (
            <div className="divide-y divide-slate-100">
              {list.data!.items.map((ticket) => (
                <button key={ticket.id} onClick={() => setDetail(ticket)} className="flex w-full flex-wrap items-start gap-3 px-5 py-4 text-left transition hover:bg-slate-50">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600"><TicketIcon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-800">{ticket.judul}</p>
                      <StatusBadge status={ticket.status} />
                      <StatusBadge status={ticket.prioritas} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{ticket.deskripsi}</p>
                    <p className="mt-1 text-xs text-slate-400">{ticket.nomor_tiket} · {timeAgo(ticket.created_at)}</p>
                  </div>
                </button>
              ))}
            </div>
          )
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Lapor Keluhan"
        subtitle="Masalah akan diteruskan ke pengelola kos."
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Kirim Laporan</Button></>}
      >
        <div className="space-y-4">
          <Field label="Judul keluhan" required><Input value={form.judul} onChange={(event) => setForm((prev) => ({ ...prev, judul: event.target.value }))} placeholder="Contoh: Kran air bocor" /></Field>
          <Field label="Deskripsi" required><Textarea value={form.deskripsi} onChange={(event) => setForm((prev) => ({ ...prev, deskripsi: event.target.value }))} placeholder="Jelaskan kondisi dan lokasi masalah…" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kategori">
              <Select value={form.kategori} onChange={(event) => setForm((prev) => ({ ...prev, kategori: event.target.value }))}>
                <option value="listrik">Listrik</option><option value="air">Air</option><option value="furniture">Furniture</option>
                <option value="kebersihan">Kebersihan</option><option value="lainnya">Lainnya</option>
              </Select>
            </Field>
            <Field label="Prioritas">
              <Select value={form.prioritas} onChange={(event) => setForm((prev) => ({ ...prev, prioritas: event.target.value }))}>
                <option value="rendah">Rendah</option><option value="sedang">Sedang</option>
                <option value="tinggi">Tinggi</option><option value="urgent">Urgent</option>
              </Select>
            </Field>
          </div>
          <Field label="Foto (maks. 3)" hint="Bantu pengelola memahami masalah">
            <Input type="file" accept="image/*" multiple onChange={(event) => handleUpload(event.target.files)} />
          </Field>
          {uploading && <p className="text-xs text-brand-600">Mengunggah foto…</p>}
          {form.foto.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.foto.map((url) => <img key={url} src={fileUrl(url)} alt="Foto keluhan" className="h-16 w-16 rounded-lg object-cover" />)}
            </div>
          )}
        </div>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.judul ?? 'Detail Keluhan'} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2"><StatusBadge status={detail.status} /><StatusBadge status={detail.prioritas} /></div>
            <p className="text-sm leading-relaxed text-slate-600">{detail.deskripsi}</p>
            <p className="text-xs text-slate-400">{detail.nomor_tiket} · Dibuat {formatDateTime(detail.created_at)}</p>
            {detail.foto.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {detail.foto.map((url) => <a key={url} href={fileUrl(url)} target="_blank" rel="noreferrer"><img src={fileUrl(url)} alt="Foto keluhan" className="h-24 w-24 rounded-lg object-cover" /></a>)}
              </div>
            )}
            {detail.resolusi && (
              <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                <p className="font-bold">Resolusi</p><p className="mt-1">{detail.resolusi}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
