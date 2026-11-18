import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, Wallet } from 'lucide-react'
import { api, apiList, downloadFile, errorMessage, uploadFile } from '../../lib/api'
import { formatDate, rupiah, todayISO } from '../../lib/format'
import { toast } from '../../lib/toast'
import { Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table, Td, Th } from '../../components/ui'
import type { Invoice } from '../../types'

export default function TenantInvoicesPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [form, setForm] = useState({ jumlah: '', metode: 'transfer_bank', tanggal_bayar: todayISO(), bukti_bayar: '' })
  const [uploading, setUploading] = useState(false)

  const list = useQuery({
    queryKey: ['invoices', 'me', status],
    queryFn: () => apiList<Invoice>('/invoices', { limit: 20, status: status || undefined }),
  })

  const pay = useMutation({
    mutationFn: () => api.post(`/invoices/${paying!.id}/payments`, {
      jumlah: Number(form.jumlah),
      metode: form.metode,
      bukti_bayar: form.bukti_bayar,
      tanggal_bayar: form.tanggal_bayar,
    }),
    onSuccess: () => {
      toast('Bukti pembayaran dikirim. Menunggu verifikasi.')
      setPaying(null)
      setForm({ jumlah: '', metode: 'transfer_bank', tanggal_bayar: todayISO(), bukti_bayar: '' })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const handleUpload = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadFile(file)
      setForm((prev) => ({ ...prev, bukti_bayar: url }))
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <PageHeader title="Tagihan Saya" subtitle="Lihat rincian tagihan dan kirim bukti pembayaran." actions={
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full sm:w-48">
          <option value="">Semua status</option><option value="terkirim">Terkirim</option>
          <option value="sebagian">Sebagian</option><option value="terlambat">Terlambat</option><option value="dibayar">Lunas</option>
        </Select>
      } />

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title="Belum ada tagihan" description="Tagihan sewa Anda akan muncul di sini." />
          ) : (
            <Table>
              <thead><tr><Th>No. Invoice</Th><Th>Periode</Th><Th>Jatuh Tempo</Th><Th>Total</Th><Th>Status</Th><Th className="text-right">Aksi</Th></tr></thead>
              <tbody>
                {list.data!.items.map((invoice) => (
                  <tr key={invoice.id}>
                    <Td className="font-semibold text-slate-800">{invoice.nomor_invoice}</Td>
                    <Td className="whitespace-nowrap text-xs">{formatDate(invoice.periode_mulai)} – {formatDate(invoice.periode_selesai)}</Td>
                    <Td className="whitespace-nowrap">{formatDate(invoice.tanggal_jatuh_tempo)}</Td>
                    <Td className="font-semibold">{rupiah(invoice.total)}</Td>
                    <Td><StatusBadge status={invoice.status} /></Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Rincian" onClick={() => setDetail(invoice)}><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Unduh PDF" onClick={() => downloadFile(`/invoices/${invoice.id}/pdf`, `invoice-${invoice.nomor_invoice}.pdf`)}><Download className="h-4 w-4" /></Button>
                        {!['dibayar', 'batal'].includes(invoice.status) && (
                          <Button size="sm" onClick={() => {
                            setPaying(invoice)
                            setForm({ jumlah: String(invoice.total), metode: 'transfer_bank', tanggal_bayar: todayISO(), bukti_bayar: '' })
                          }}><Wallet className="h-4 w-4" /> Bayar</Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        )}
      </Card>

      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title="Kirim Bukti Pembayaran"
        subtitle={paying ? `${paying.nomor_invoice} · Total ${rupiah(paying.total)}` : undefined}
        footer={<><Button variant="outline" onClick={() => setPaying(null)}>Batal</Button><Button loading={pay.isPending} disabled={!form.jumlah || !form.bukti_bayar} onClick={() => pay.mutate()}>Kirim Bukti</Button></>}
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            Transfer ke rekening yang telah diinformasikan pengelola, lalu unggah bukti transaksi di bawah ini.
          </div>
          <Field label="Jumlah dibayar" required><Input type="number" value={form.jumlah} onChange={(event) => setForm((prev) => ({ ...prev, jumlah: event.target.value }))} /></Field>
          <Field label="Metode pembayaran">
            <Select value={form.metode} onChange={(event) => setForm((prev) => ({ ...prev, metode: event.target.value }))}>
              <option value="transfer_bank">Transfer Bank</option><option value="ewallet">E-Wallet</option><option value="cash">Tunai</option>
            </Select>
          </Field>
          <Field label="Tanggal bayar" required><Input type="date" value={form.tanggal_bayar} onChange={(event) => setForm((prev) => ({ ...prev, tanggal_bayar: event.target.value }))} /></Field>
          <Field label="Bukti bayar" required hint="JPG/PNG/PDF, maksimal 2MB">
            <Input type="file" accept="image/*,.pdf" onChange={(event) => handleUpload(event.target.files?.[0])} />
          </Field>
          {uploading && <p className="text-xs text-brand-600">Mengunggah bukti…</p>}
          {form.bukti_bayar && <p className="text-xs font-semibold text-emerald-600">âœ“ Bukti berhasil diunggah</p>}
        </div>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.nomor_invoice ?? 'Rincian Tagihan'} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><p className="text-xs text-slate-500">Periode</p><p className="font-semibold">{formatDate(detail.periode_mulai)} – {formatDate(detail.periode_selesai)}</p></div>
              <div><p className="text-xs text-slate-500">Jatuh tempo</p><p className="font-semibold">{formatDate(detail.tanggal_jatuh_tempo)}</p></div>
              <div><p className="text-xs text-slate-500">Status</p><StatusBadge status={detail.status} /></div>
              <div><p className="text-xs text-slate-500">Properti</p><p className="font-semibold">{detail.nama_properti ?? '-'}</p></div>
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
            <Button variant="outline" size="sm" onClick={() => downloadFile(`/invoices/${detail.id}/pdf`, `invoice-${detail.nomor_invoice}.pdf`)}><Download className="h-4 w-4" /> Unduh PDF</Button>
          </div>
        )}
      </Modal>
    </>
  )
}
