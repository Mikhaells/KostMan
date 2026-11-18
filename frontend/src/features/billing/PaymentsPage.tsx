import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Check, Search, X } from 'lucide-react'
import { api, apiList, errorMessage, fileUrl } from '../../lib/api'
import { formatDateTime, rupiah, todayISO } from '../../lib/format'
import { toast } from '../../lib/toast'
import {
  Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader,
  Pagination, Select, StatusBadge, Table, Td, Textarea, Th,
} from '../../components/ui'
import { useInvoiceOptions } from '../../hooks/useLookups'
import type { Payment } from '../../types'

export default function PaymentsPage() {
  const queryClient = useQueryClient()
  const invoices = useInvoiceOptions()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [cashOpen, setCashOpen] = useState(false)
  const [rejecting, setRejecting] = useState<Payment | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [cashForm, setCashForm] = useState({ tagihan_id: '', jumlah: '', tanggal_bayar: todayISO(), catatan_admin: '' })

  const list = useQuery({
    queryKey: ['payments', page, status, keyword],
    queryFn: () => apiList<Payment>('/payments', {
      page, limit: 10, status: status || undefined, tagihan_id: keyword || undefined,
    }),
  })

  const verify = useMutation({
    mutationFn: (id: string) => api.post(`/payments/${id}/verify`),
    onSuccess: () => {
      toast('Pembayaran terverifikasi')
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const reject = useMutation({
    mutationFn: () => api.post(`/payments/${rejecting!.id}/reject`, { catatan: rejectNote }),
    onSuccess: () => { toast('Pembayaran ditolak'); setRejecting(null); setRejectNote(''); queryClient.invalidateQueries({ queryKey: ['payments'] }) },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const cash = useMutation({
    mutationFn: () => api.post(`/invoices/${cashForm.tagihan_id}/payments/cash`, {
      tagihan_id: cashForm.tagihan_id,
      jumlah: Number(cashForm.jumlah),
      metode: 'cash',
      tanggal_bayar: cashForm.tanggal_bayar,
      catatan_admin: cashForm.catatan_admin,
    }),
    onSuccess: () => {
      toast('Pembayaran tunai dicatat')
      setCashOpen(false)
      setCashForm({ tagihan_id: '', jumlah: '', tanggal_bayar: todayISO(), catatan_admin: '' })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  return (
    <>
      <PageHeader
        title="Pembayaran"
        subtitle="Verifikasi bukti transfer dan catat pembayaran tunai."
        actions={<Button size="sm" onClick={() => setCashOpen(true)}><Banknote className="h-4 w-4" /> Catat Tunai</Button>}
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Filter ID tagihanâ€¦" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setKeyword(search); setPage(1) } }} />
          </div>
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="w-full sm:w-44">
            <option value="">Semua status</option><option value="pending">Pending</option>
            <option value="verified">Terverifikasi</option><option value="rejected">Ditolak</option>
          </Select>
          <Button variant="secondary" onClick={() => { setKeyword(search); setPage(1) }}>Filter</Button>
        </div>
      </Card>

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title="Belum ada pembayaran" description="Pembayaran masuk dari portal penyewa atau dicatat tunai di sini." />
          ) : (
            <>
              <Table>
                <thead><tr><Th>Invoice</Th><Th>Penyewa</Th><Th>Jumlah</Th><Th>Metode</Th><Th>Tanggal</Th><Th>Status</Th><Th className="text-right">Aksi</Th></tr></thead>
                <tbody>
                  {list.data!.items.map((payment) => (
                    <tr key={payment.id}>
                      <Td className="font-semibold text-slate-800">{payment.nomor_invoice ?? 'â€”'}</Td>
                      <Td>{payment.nama_penyewa ?? 'â€”'}</Td>
                      <Td className="font-semibold">{rupiah(payment.jumlah)}</Td>
                      <Td className="capitalize">{payment.metode.replace('_', ' ')}</Td>
                      <Td className="whitespace-nowrap text-xs">{formatDateTime(payment.tanggal_bayar)}</Td>
                      <Td><StatusBadge status={payment.status} /></Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          {payment.bukti_bayar && (
                            <a href={fileUrl(payment.bukti_bayar)} target="_blank" rel="noreferrer" className="rounded-lg px-2 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-50">Bukti</a>
                          )}
                          {payment.status === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" loading={verify.isPending && verify.variables === payment.id} onClick={() => verify.mutate(payment.id)}><Check className="h-4 w-4" /> Verifikasi</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setRejecting(payment); setRejectNote('') }}><X className="h-4 w-4" /> Tolak</Button>
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
        open={cashOpen}
        onClose={() => setCashOpen(false)}
        title="Catat Pembayaran Tunai"
        subtitle="Pembayaran tunai langsung terverifikasi."
        footer={<><Button variant="outline" onClick={() => setCashOpen(false)}>Batal</Button><Button loading={cash.isPending} disabled={!cashForm.tagihan_id || !cashForm.jumlah} onClick={() => cash.mutate()}>Simpan</Button></>}
      >
        <div className="space-y-4">
          <Field label="Tagihan" required>
            <Select value={cashForm.tagihan_id} onChange={(event) => {
              const invoice = invoices.data?.items.find((item) => item.id === event.target.value)
              setCashForm((prev) => ({ ...prev, tagihan_id: event.target.value, jumlah: invoice ? String(invoice.total) : prev.jumlah }))
            }}>
              <option value="">Pilih tagihanâ€¦</option>
              {(invoices.data?.items ?? []).filter((invoice) => invoice.status !== 'batal').map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.nomor_invoice} Â· {invoice.nama_penyewa ?? ''} Â· {rupiah(invoice.total)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Jumlah" required><Input type="number" value={cashForm.jumlah} onChange={(event) => setCashForm((prev) => ({ ...prev, jumlah: event.target.value }))} /></Field>
          <Field label="Tanggal bayar" required><Input type="date" value={cashForm.tanggal_bayar} onChange={(event) => setCashForm((prev) => ({ ...prev, tanggal_bayar: event.target.value }))} /></Field>
          <Field label="Catatan"><Textarea value={cashForm.catatan_admin} onChange={(event) => setCashForm((prev) => ({ ...prev, catatan_admin: event.target.value }))} /></Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Tolak Pembayaran"
        subtitle={rejecting?.nomor_invoice ?? undefined}
        footer={<><Button variant="outline" onClick={() => setRejecting(null)}>Batal</Button><Button variant="danger" loading={reject.isPending} onClick={() => reject.mutate()}>Tolak</Button></>}
        size="sm"
      >
        <Field label="Alasan penolakan"><Textarea value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="Contoh: Bukti transfer tidak terbaca" /></Field>
      </Modal>
    </>
  )
}
