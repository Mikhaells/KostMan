import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, FilePlus2, Plus, RefreshCw, Search, XCircle } from 'lucide-react'
import { api, apiList, downloadFile, errorMessage } from '../../lib/api'
import { addMonthsISO, formatDate, rupiah, todayISO } from '../../lib/format'
import { toast } from '../../lib/toast'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader,
  Pagination, Select, StatusBadge, Table, Td, Textarea, Th,
} from '../../components/ui'
import { useContractOptions } from '../../hooks/useLookups'
import type { ExtraItem, Invoice } from '../../types'

type FormState = {
  kontrak_id: string; periode_mulai: string; periode_selesai: string; jumlah_pokok: string
  diskon: string; denda: string; tanggal_jatuh_tempo: string; status: string; catatan: string; items: string
}

const emptyForm = (): FormState => ({
  kontrak_id: '', periode_mulai: todayISO(), periode_selesai: addMonthsISO(todayISO(), 1).slice(0, 10),
  jumlah_pokok: '', diskon: '0', denda: '0', tanggal_jatuh_tempo: addMonthsISO(todayISO(), 1).slice(0, 10),
  status: 'terkirim', catatan: '', items: '',
})

function parseItems(value: string): ExtraItem[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [nama, jumlah] = line.split(':')
    return { nama: (nama ?? '').trim(), jumlah: Number((jumlah ?? '0').trim() || 0) }
  }).filter((item) => item.nama)
}

export default function InvoicesPage() {
  const queryClient = useQueryClient()
  const contracts = useContractOptions()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [voiding, setVoiding] = useState<Invoice | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())

  const list = useQuery({
    queryKey: ['invoices', page, keyword, status],
    queryFn: () => apiList<Invoice>('/invoices', { page, limit: 10, search: keyword || undefined, status: status || undefined }),
  })

  useEffect(() => {
    if (!modalOpen) return
    setForm(editing ? {
      kontrak_id: editing.kontrak_id,
      periode_mulai: editing.periode_mulai.slice(0, 10), periode_selesai: editing.periode_selesai.slice(0, 10),
      jumlah_pokok: String(editing.jumlah_pokok), diskon: String(editing.diskon ?? 0), denda: String(editing.denda ?? 0),
      tanggal_jatuh_tempo: editing.tanggal_jatuh_tempo.slice(0, 10), status: editing.status, catatan: '',
      items: (editing.item_tambahan ?? []).map((item) => `${item.nama}: ${item.jumlah}`).join('\n'),
    } : emptyForm())
  }, [modalOpen, editing])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        jumlah_pokok: Number(form.jumlah_pokok), diskon: Number(form.diskon || 0), denda: Number(form.denda || 0),
        item_tambahan: parseItems(form.items),
      }
      return editing
        ? api.put<Invoice>(`/invoices/${editing.id}`, payload)
        : api.post<Invoice>('/invoices', payload)
    },
    onSuccess: () => {
      toast(editing ? 'Tagihan diperbarui' : 'Tagihan dibuat')
      setModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const voidInvoice = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/void`),
    onSuccess: () => { toast('Tagihan dibatalkan'); setVoiding(null); queryClient.invalidateQueries({ queryKey: ['invoices'] }) },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const generate = useMutation({
    mutationFn: () => api.post<{ dibuat: number }>('/invoices/generate'),
    onSuccess: (data) => { toast(`${data.dibuat} tagihan berhasil dibuat`); queryClient.invalidateQueries({ queryKey: ['invoices'] }) },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <>
      <PageHeader
        title="Tagihan"
        subtitle="Buat, kirim, dan pantau pembayaran sewa penyewa."
        actions={
          <>
            <Button variant="outline" size="sm" loading={generate.isPending} onClick={() => generate.mutate()}><RefreshCw className="h-4 w-4" /> Generate Bulanan</Button>
            <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus className="h-4 w-4" /> Buat Tagihan</Button>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setKeyword(search); setPage(1) }}>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Cari nomor invoice atau penyewaâ€¦" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="w-full sm:w-44">
            <option value="">Semua status</option>
            <option value="draft">Draft</option><option value="terkirim">Terkirim</option><option value="dibayar">Lunas</option>
            <option value="sebagian">Sebagian</option><option value="terlambat">Terlambat</option><option value="batal">Batal</option>
          </Select>
          <Button type="submit" variant="secondary">Cari</Button>
        </form>
      </Card>

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title="Belum ada tagihan" description="Buat tagihan manual atau gunakan generate bulanan otomatis." action={<Button size="sm" onClick={() => setModalOpen(true)}><FilePlus2 className="h-4 w-4" /> Buat Tagihan</Button>} />
          ) : (
            <>
              <Table>
                <thead><tr><Th>No. Invoice</Th><Th>Penyewa</Th><Th>Periode</Th><Th>Jatuh Tempo</Th><Th>Total</Th><Th>Status</Th><Th className="text-right">Aksi</Th></tr></thead>
                <tbody>
                  {list.data!.items.map((invoice) => (
                    <tr key={invoice.id}>
                      <Td className="font-semibold text-slate-800">{invoice.nomor_invoice}</Td>
                      <Td><p>{invoice.nama_penyewa ?? 'â€”'}</p><p className="text-xs text-slate-400">{invoice.nomor_kamar ?? ''}</p></Td>
                      <Td className="whitespace-nowrap text-xs">{formatDate(invoice.periode_mulai)} â€“ {formatDate(invoice.periode_selesai)}</Td>
                      <Td className="whitespace-nowrap">{formatDate(invoice.tanggal_jatuh_tempo)}</Td>
                      <Td className="font-semibold">{rupiah(invoice.total)}</Td>
                      <Td><StatusBadge status={invoice.status} /></Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Detail" onClick={() => setDetail(invoice)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Unduh PDF" onClick={() => downloadFile(`/invoices/${invoice.id}/pdf`, `invoice-${invoice.nomor_invoice}.pdf`)}><Download className="h-4 w-4" /></Button>
                          {!['dibayar', 'batal'].includes(invoice.status) && (
                            <>
                              <Button variant="ghost" size="icon" title="Ubah" onClick={() => { setEditing(invoice); setModalOpen(true) }}><FilePlus2 className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" title="Batalkan" onClick={() => setVoiding(invoice)}><XCircle className="h-4 w-4 text-rose-500" /></Button>
                            </>
                          )}
                        </div>
                      </Td>
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Ubah Tagihan' : 'Buat Tagihan'}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Simpan</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kontrak" required>
            <Select value={form.kontrak_id} onChange={(event) => set('kontrak_id', event.target.value)} disabled={Boolean(editing)}>
              <option value="">Pilih kontrakâ€¦</option>
              {(contracts.data?.items ?? []).map((contract) => (
                <option key={contract.id} value={contract.id}>{contract.nomor_kontrak} Â· {contract.nama_penyewa ?? ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => set('status', event.target.value)}>
              <option value="draft">Draft</option><option value="terkirim">Terkirim</option>
              <option value="dibayar">Lunas</option><option value="sebagian">Sebagian</option>
            </Select>
          </Field>
          <Field label="Periode mulai" required><Input type="date" value={form.periode_mulai} onChange={(event) => set('periode_mulai', event.target.value)} /></Field>
          <Field label="Periode selesai" required><Input type="date" value={form.periode_selesai} onChange={(event) => set('periode_selesai', event.target.value)} /></Field>
          <Field label="Jumlah pokok" required><Input type="number" value={form.jumlah_pokok} onChange={(event) => set('jumlah_pokok', event.target.value)} /></Field>
          <Field label="Jatuh tempo" required><Input type="date" value={form.tanggal_jatuh_tempo} onChange={(event) => set('tanggal_jatuh_tempo', event.target.value)} /></Field>
          <Field label="Diskon"><Input type="number" value={form.diskon} onChange={(event) => set('diskon', event.target.value)} /></Field>
          <Field label="Denda"><Input type="number" value={form.denda} onChange={(event) => set('denda', event.target.value)} /></Field>
          <div className="sm:col-span-2">
            <Field label="Item tambahan" hint="Satu item per baris, format: Nama: jumlah">
              <Textarea value={form.items} onChange={(event) => set('items', event.target.value)} placeholder={'Listrik: 75000\nAir: 50000'} />
            </Field>
          </div>
          <div className="sm:col-span-2"><Textarea placeholder="Catatan tagihan" value={form.catatan} onChange={(event) => set('catatan', event.target.value)} /></div>
        </div>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.nomor_invoice ?? 'Detail Tagihan'} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><p className="text-xs text-slate-500">Penyewa</p><p className="font-semibold text-slate-800">{detail.nama_penyewa ?? 'â€”'}</p></div>
              <div><p className="text-xs text-slate-500">Status</p><StatusBadge status={detail.status} /></div>
              <div><p className="text-xs text-slate-500">Periode</p><p className="font-semibold text-slate-800">{formatDate(detail.periode_mulai)} â€“ {formatDate(detail.periode_selesai)}</p></div>
              <div><p className="text-xs text-slate-500">Jatuh tempo</p><p className="font-semibold text-slate-800">{formatDate(detail.tanggal_jatuh_tempo)}</p></div>
            </div>
            <Table>
              <thead><tr><Th>Komponen</Th><Th className="text-right">Jumlah</Th></tr></thead>
              <tbody>
                <tr><Td>Sewa pokok</Td><Td className="text-right">{rupiah(detail.jumlah_pokok)}</Td></tr>
                {(detail.item_tambahan ?? []).map((item, index) => <tr key={index}><Td>{item.nama}</Td><Td className="text-right">{rupiah(item.jumlah)}</Td></tr>)}
                {Boolean(detail.diskon) && <tr><Td>Diskon</Td><Td className="text-right text-rose-600">-{rupiah(detail.diskon)}</Td></tr>}
                {Boolean(detail.denda) && <tr><Td>Denda</Td><Td className="text-right text-amber-600">{rupiah(detail.denda)}</Td></tr>}
                <tr><Td className="font-bold">Total</Td><Td className="text-right font-bold text-brand-600">{rupiah(detail.total)}</Td></tr>
              </tbody>
            </Table>
            {detail.tanggal_bayar && <Badge tone="green">Dibayar {formatDate(detail.tanggal_bayar)} Â· {detail.metode_bayar ?? '-'}</Badge>}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={Boolean(voiding)} title="Batalkan tagihan?" message={`Tagihan ${voiding?.nomor_invoice ?? ''} akan dibatalkan dan tidak dapat ditagihkan kembali.`} confirmLabel="Batalkan Tagihan" loading={voidInvoice.isPending} onCancel={() => setVoiding(null)} onConfirm={() => voiding && voidInvoice.mutate(voiding.id)} />
    </>
  )
}
