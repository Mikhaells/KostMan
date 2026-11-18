import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DoorOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { api, apiList, errorMessage, fileUrl } from '../../lib/api'
import { rupiah } from '../../lib/format'
import { toast } from '../../lib/toast'
import {
  Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader,
  Pagination, Select, StatusBadge, Table, Td, Th,
} from '../../components/ui'
import ImagePicker from '../../components/ui/ImagePicker'
import { usePropertyOptions } from '../../hooks/useLookups'
import type { Room } from '../../types'

type FormState = {
  nomor: string; tipe: string; luas_m2: string; harga_bulanan: string; harga_tahunan: string
  deposit: string; fasilitas: string; foto: string[]; status: string; keterangan: string
}

const emptyForm: FormState = {
  nomor: '', tipe: 'Standar', luas_m2: '', harga_bulanan: '', harga_tahunan: '',
  deposit: '0', fasilitas: '', foto: [], status: 'kosong', keterangan: '',
}

export default function RoomsPage() {
  const queryClient = useQueryClient()
  const properties = usePropertyOptions()
  const [page, setPage] = useState(1)
  const [propertyId, setPropertyId] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Room | null>(null)
  const [deleting, setDeleting] = useState<Room | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [selectedProperty, setSelectedProperty] = useState('')

  const list = useQuery({
    queryKey: ['rooms', page, propertyId, status, keyword],
    queryFn: () => apiList<Room>('/rooms', {
      page, limit: 10, properti_id: propertyId || undefined, status: status || undefined, search: keyword || undefined,
    }),
  })

  useEffect(() => {
    if (!modalOpen) return
    setForm(editing ? {
      nomor: editing.nomor, tipe: editing.tipe, luas_m2: editing.luas_m2 ? String(editing.luas_m2) : '',
      harga_bulanan: String(editing.harga_bulanan), harga_tahunan: editing.harga_tahunan ? String(editing.harga_tahunan) : '',
      deposit: String(editing.deposit ?? 0), fasilitas: (editing.fasilitas ?? []).join(', '), foto: editing.foto ?? [],
      status: editing.status, keterangan: editing.keterangan ?? '',
    } : emptyForm)
    setSelectedProperty(editing?.properti_id ?? propertyId ?? properties.data?.items[0]?.id ?? '')
  }, [modalOpen, editing, propertyId, properties.data])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        luas_m2: form.luas_m2 ? Number(form.luas_m2) : null,
        harga_bulanan: Number(form.harga_bulanan),
        harga_tahunan: form.harga_tahunan ? Number(form.harga_tahunan) : null,
        deposit: Number(form.deposit || 0),
        fasilitas: form.fasilitas.split(',').map((item) => item.trim()).filter(Boolean),
      }
      return editing
        ? api.put<Room>(`/rooms/${editing.id}`, payload)
        : api.post<Room>(`/properties/${selectedProperty}/rooms`, payload)
    },
    onSuccess: () => {
      toast(editing ? 'Kamar diperbarui' : 'Kamar ditambahkan')
      setModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const setRoomStatus = useMutation({
    mutationFn: ({ id, statusRoom }: { id: string; statusRoom: string }) => api.patch(`/rooms/${id}/status`, { status: statusRoom }),
    onSuccess: () => {
      toast('Status kamar diperbarui')
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/rooms/${id}`),
    onSuccess: () => { toast('Kamar dihapus'); setDeleting(null); queryClient.invalidateQueries({ queryKey: ['rooms'] }) },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <>
      <PageHeader
        title="Manajemen Kamar"
        subtitle="Pantau ketersediaan dan harga sewa setiap kamar."
        actions={<Button size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus className="h-4 w-4" /> Tambah Kamar</Button>}
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setKeyword(search); setPage(1) }}>
          <Select value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setPage(1) }} className="w-full sm:w-52">
            <option value="">Semua properti</option>
            {(properties.data?.items ?? []).map((property) => <option key={property.id} value={property.id}>{property.nama}</option>)}
          </Select>
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="w-full sm:w-40">
            <option value="">Semua status</option>
            <option value="kosong">Kosong</option><option value="terisi">Terisi</option>
            <option value="reserved">Reserved</option><option value="maintenance">Maintenance</option>
          </Select>
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Cari nomor kamar…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Button type="submit" variant="secondary">Cari</Button>
        </form>
      </Card>

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title="Belum ada kamar" description="Tambahkan kamar pada properti yang sudah terdaftar." action={<Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Tambah Kamar</Button>} />
          ) : (
            <>
              <Table>
                <thead><tr><Th>Kamar</Th><Th>Properti</Th><Th>Tipe / Luas</Th><Th>Harga</Th><Th>Status</Th><Th className="text-right">Aksi</Th></tr></thead>
                <tbody>
                  {list.data!.items.map((room) => (
                    <tr key={room.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          {room.foto?.[0]
                            ? <img src={fileUrl(room.foto[0])} alt="" className="h-10 w-10 rounded-lg object-cover" />
                            : <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-500"><DoorOpen className="h-5 w-5" /></span>}
                          <div><p className="font-semibold text-slate-800">Kamar {room.nomor}</p><p className="text-xs text-slate-400">Deposit {rupiah(room.deposit)}</p></div>
                        </div>
                      </Td>
                      <Td className="max-w-[180px] truncate">{room.nama_properti ?? '—'}</Td>
                      <Td>{room.tipe}<p className="text-xs text-slate-400">{room.luas_m2 ? `${room.luas_m2} m²` : '-'}</p></Td>
                      <Td className="font-semibold">{rupiah(room.harga_bulanan)}<p className="text-xs font-normal text-slate-400">/ bulan</p></Td>
                      <Td>
                        <Select
                          value={room.status}
                          className="h-8 w-32 py-0 text-xs"
                          onChange={(event) => setRoomStatus.mutate({ id: room.id, statusRoom: event.target.value })}
                        >
                          <option value="kosong">Kosong</option><option value="terisi">Terisi</option>
                          <option value="reserved">Reserved</option><option value="maintenance">Maintenance</option>
                        </Select>
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditing(room); setModalOpen(true) }} aria-label="Ubah"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(room)} aria-label="Hapus"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
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
        title={editing ? 'Ubah Kamar' : 'Tambah Kamar'}
        size="lg"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Simpan</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {!editing && (
            <Field label="Properti" required>
              <Select value={selectedProperty} onChange={(event) => setSelectedProperty(event.target.value)}>
                <option value="">Pilih properti…</option>
                {(properties.data?.items ?? []).map((property) => <option key={property.id} value={property.id}>{property.nama}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Nomor kamar" required><Input value={form.nomor} onChange={(event) => set('nomor', event.target.value)} placeholder="A01" /></Field>
          <Field label="Tipe kamar" required><Input value={form.tipe} onChange={(event) => set('tipe', event.target.value)} placeholder="Standar / VIP" /></Field>
          <Field label="Luas (m²)"><Input type="number" value={form.luas_m2} onChange={(event) => set('luas_m2', event.target.value)} /></Field>
          <Field label="Harga bulanan" required><Input type="number" value={form.harga_bulanan} onChange={(event) => set('harga_bulanan', event.target.value)} /></Field>
          <Field label="Harga tahunan"><Input type="number" value={form.harga_tahunan} onChange={(event) => set('harga_tahunan', event.target.value)} /></Field>
          <Field label="Deposit"><Input type="number" value={form.deposit} onChange={(event) => set('deposit', event.target.value)} /></Field>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => set('status', event.target.value)}>
              <option value="kosong">Kosong</option><option value="terisi">Terisi</option>
              <option value="reserved">Reserved</option><option value="maintenance">Maintenance</option>
            </Select>
          </Field>
          <Field label="Fasilitas" hint="Pisahkan dengan koma"><Input value={form.fasilitas} onChange={(event) => set('fasilitas', event.target.value)} placeholder="AC, Kasur, Lemari" /></Field>
          <div className="sm:col-span-2"><Input placeholder="Keterangan tambahan" value={form.keterangan} onChange={(event) => set('keterangan', event.target.value)} /></div>
          <div className="sm:col-span-2"><ImagePicker value={form.foto} onChange={(urls) => set('foto', urls)} /></div>
        </div>
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Hapus kamar?" message={`Kamar ${deleting?.nomor ?? ''} akan dihapus. Pastikan tidak ada kontrak aktif pada kamar ini.`} loading={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  )
}
