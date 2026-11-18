import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Download, FilePlus2, Pencil, Search } from 'lucide-react'
import { api, apiList, downloadFile, errorMessage } from '../../lib/api'
import { addMonthsISO, formatDate, rupiah, todayISO } from '../../lib/format'
import { toast } from '../../lib/toast'
import {
  Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader,
  Pagination, Select, StatusBadge, Table, Td, Textarea, Th,
} from '../../components/ui'
import { useRoomOptions, useTenantOptions } from '../../hooks/useLookups'
import type { Contract } from '../../types'

type FormState = {
  penyewa_id: string; kamar_id: string; tanggal_mulai: string; tanggal_selesai: string
  harga_sewa: string; deposit: string; deposit_dibayar: boolean; catatan: string
}

const makeEmptyForm = (): FormState => ({
  penyewa_id: '', kamar_id: '', tanggal_mulai: todayISO(),
  tanggal_selesai: addMonthsISO(todayISO(), 12), harga_sewa: '', deposit: '0',
  deposit_dibayar: false, catatan: '',
})

export default function ContractsPage() {
  const queryClient = useQueryClient()
  const tenants = useTenantOptions()
  const rooms = useRoomOptions()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [terminating, setTerminating] = useState<Contract | null>(null)
  const [form, setForm] = useState<FormState>(makeEmptyForm())

  const list = useQuery({
    queryKey: ['contracts', page, keyword, status],
    queryFn: () => apiList<Contract>('/contracts', { page, limit: 10, search: keyword || undefined, status: status || undefined }),
  })

  useEffect(() => {
    if (!modalOpen) return
    setForm(editing ? {
      penyewa_id: editing.penyewa_id, kamar_id: editing.kamar_id,
      tanggal_mulai: editing.tanggal_mulai.slice(0, 10), tanggal_selesai: editing.tanggal_selesai.slice(0, 10),
      harga_sewa: String(editing.harga_sewa), deposit: String(editing.deposit ?? 0),
      deposit_dibayar: editing.deposit_dibayar, catatan: editing.catatan ?? '',
    } : makeEmptyForm())
  }, [modalOpen, editing])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        harga_sewa: Number(form.harga_sewa),
        deposit: Number(form.deposit || 0),
      }
      return editing
        ? api.post<Contract>(`/contracts/${editing.id}/renew`, { tanggal_selesai: form.tanggal_selesai })
        : api.post<Contract>('/contracts', payload)
    },
    onSuccess: () => {
      toast(editing ? 'Kontrak diperpanjang' : 'Kontrak dibuat')
      setModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const terminate = useMutation({
    mutationFn: (id: string) => api.post(`/contracts/${id}/terminate`, { status: 'batal', catatan: 'Dibatalkan dari dashboard' }),
    onSuccess: () => { toast('Kontrak dibatalkan'); setTerminating(null); queryClient.invalidateQueries({ queryKey: ['contracts'] }) },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <>
      <PageHeader
        title="Kontrak Sewa"
        subtitle="Kelola masa sewa, perpanjangan, dan pembatalan kontrak."
        actions={<Button size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}><FilePlus2 className="h-4 w-4" /> Buat Kontrak</Button>}
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setKeyword(search); setPage(1) }}>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Cari nomor kontrak atau penyewaâ€¦" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="w-full sm:w-40">
            <option value="">Semua status</option><option value="aktif">Aktif</option>
            <option value="selesai">Selesai</option><option value="batal">Batal</option><option value="diperpanjang">Diperpanjang</option>
          </Select>
          <Button type="submit" variant="secondary">Cari</Button>
        </form>
      </Card>

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title="Belum ada kontrak" description="Buat kontrak pertama setelah penyewa dan kamar tersedia." action={<Button size="sm" onClick={() => setModalOpen(true)}><FilePlus2 className="h-4 w-4" /> Buat Kontrak</Button>} />
          ) : (
            <>
              <Table>
                <thead><tr><Th>No. Kontrak</Th><Th>Penyewa</Th><Th>Kamar / Properti</Th><Th>Periode</Th><Th>Harga</Th><Th>Status</Th><Th className="text-right">Aksi</Th></tr></thead>
                <tbody>
                  {list.data!.items.map((contract) => (
                    <tr key={contract.id}>
                      <Td className="font-semibold text-slate-800">{contract.nomor_kontrak}</Td>
                      <Td>{contract.nama_penyewa ?? 'â€”'}</Td>
                      <Td><p>{contract.nomor_kamar ?? 'â€”'}</p><p className="text-xs text-slate-400">{contract.nama_properti ?? ''}</p></Td>
                      <Td><p className="whitespace-nowrap">{formatDate(contract.tanggal_mulai)}</p><p className="text-xs text-slate-400">s/d {formatDate(contract.tanggal_selesai)}</p></Td>
                      <Td className="font-semibold">{rupiah(contract.harga_sewa)}</Td>
                      <Td><StatusBadge status={contract.status} /></Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Unduh PDF" onClick={() => downloadFile(`/contracts/${contract.id}/pdf`, `kontrak-${contract.nomor_kontrak}.pdf`)}><Download className="h-4 w-4" /></Button>
                          {contract.status === 'aktif' && (
                            <>
                              <Button variant="ghost" size="icon" title="Perpanjang" onClick={() => { setEditing(contract); setModalOpen(true) }}><CalendarRange className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" title="Batalkan" onClick={() => setTerminating(contract)}><Pencil className="h-4 w-4 text-rose-500" /></Button>
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
        title={editing ? 'Perpanjang Kontrak' : 'Buat Kontrak Baru'}
        subtitle={editing ? `Kontrak ${editing.nomor_kontrak} Â· hanya tanggal selesai yang diperbarui` : 'Pastikan data penyewa dan kamar sudah tersedia.'}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Simpan</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Penyewa" required>
            <Select value={form.penyewa_id} onChange={(event) => set('penyewa_id', event.target.value)} disabled={Boolean(editing)}>
              <option value="">Pilih penyewaâ€¦</option>
              {(tenants.data?.items ?? []).map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.nama_lengkap}</option>)}
            </Select>
          </Field>
          <Field label="Kamar" required>
            <Select value={form.kamar_id} onChange={(event) => set('kamar_id', event.target.value)} disabled={Boolean(editing)}>
              <option value="">Pilih kamarâ€¦</option>
              {(rooms.data?.items ?? []).map((room) => <option key={room.id} value={room.id}>{room.nomor} Â· {room.nama_properti ?? ''} Â· {rupiah(room.harga_bulanan)}</option>)}
            </Select>
          </Field>
          <Field label="Tanggal mulai" required><Input type="date" value={form.tanggal_mulai} onChange={(event) => set('tanggal_mulai', event.target.value)} /></Field>
          <Field label="Tanggal selesai" required><Input type="date" value={form.tanggal_selesai} onChange={(event) => set('tanggal_selesai', event.target.value)} /></Field>
          <Field label="Harga sewa" required><Input type="number" value={form.harga_sewa} onChange={(event) => set('harga_sewa', event.target.value)} /></Field>
          <Field label="Deposit"><Input type="number" value={form.deposit} onChange={(event) => set('deposit', event.target.value)} /></Field>
          <div className="flex items-end pb-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.deposit_dibayar} onChange={(event) => set('deposit_dibayar', event.target.checked)} />
              Deposit sudah dibayar
            </label>
          </div>
          <div className="sm:col-span-2"><Textarea placeholder="Catatan kontrak" value={form.catatan} onChange={(event) => set('catatan', event.target.value)} /></div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(terminating)}
        title="Batalkan kontrak?"
        message={`Kontrak ${terminating?.nomor_kontrak ?? ''} akan dibatalkan. Status kamar akan dikembalikan menjadi kosong.`}
        confirmLabel="Batalkan Kontrak"
        loading={terminate.isPending}
        onCancel={() => setTerminating(null)}
        onConfirm={() => terminating && terminate.mutate(terminating.id)}
      />
    </>
  )
}
