import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { api, apiList, errorMessage, fileUrl } from '../../lib/api'
import { toast } from '../../lib/toast'
import {
  Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader,
  Pagination, Select, StatusBadge, Table, Td, Textarea, Th,
} from '../../components/ui'
import ImagePicker from '../../components/ui/ImagePicker'
import type { Property } from '../../types'

type FormState = {
  nama: string; tipe: string; alamat: string; kota: string; provinsi: string; kode_pos: string
  deskripsi: string; fasilitas: string; foto: string[]; status: string
}

const emptyForm: FormState = {
  nama: '', tipe: 'kos_putri', alamat: '', kota: '', provinsi: '', kode_pos: '',
  deskripsi: '', fasilitas: '', foto: [], status: 'aktif',
}

const propertyTypes: Record<string, string> = {
  kos_putri: 'Kos Putri', kos_putra: 'Kos Putra', kos_campur: 'Kos Campur', kontrakan: 'Kontrakan', rumah: 'Rumah',
}

export default function PropertiesPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [editing, setEditing] = useState<Property | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleting, setDeleting] = useState<Property | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const list = useQuery({
    queryKey: ['properties', page, keyword, status, showDeleted],
    queryFn: () => apiList<Property>(showDeleted ? '/properties/deleted' : '/properties', {
      page, limit: 10, search: keyword || undefined, status: status || undefined,
    }),
  })

  useEffect(() => {
    if (modalOpen) {
      setForm(editing ? {
        nama: editing.nama, tipe: editing.tipe, alamat: editing.alamat, kota: editing.kota,
        provinsi: editing.provinsi, kode_pos: editing.kode_pos ?? '', deskripsi: editing.deskripsi ?? '',
        fasilitas: (editing.fasilitas ?? []).join(', '), foto: editing.foto ?? [], status: editing.status,
      } : emptyForm)
    }
  }, [modalOpen, editing])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        fasilitas: form.fasilitas.split(',').map((item) => item.trim()).filter(Boolean),
      }
      return editing
        ? api.put<Property>(`/properties/${editing.id}`, payload)
        : api.post<Property>('/properties', payload)
    },
    onSuccess: () => {
      toast(editing ? 'Properti diperbarui' : 'Properti ditambahkan')
      setModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['properties'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/properties/${id}`),
    onSuccess: () => {
      toast('Properti dipindahkan ke arsip')
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey: ['properties'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const restore = useMutation({
    mutationFn: (id: string) => api.post(`/properties/${id}/restore`),
    onSuccess: () => {
      toast('Properti dipulihkan')
      queryClient.invalidateQueries({ queryKey: ['properties'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <>
      <PageHeader
        title="Manajemen Properti"
        subtitle="Kelola gedung kos dan kontrakan yang Anda miliki."
        actions={
          <>
            <Button variant={showDeleted ? 'primary' : 'outline'} size="sm" onClick={() => { setShowDeleted(!showDeleted); setPage(1) }}>
              <RotateCcw className="h-4 w-4" /> {showDeleted ? 'Lihat Aktif' : 'Arsip'}
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus className="h-4 w-4" /> Tambah Properti</Button>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setKeyword(search); setPage(1) }}>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Cari nama atau alamat properti…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="w-full sm:w-44">
            <option value="">Semua status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
            <option value="maintenance">Maintenance</option>
          </Select>
          <Button type="submit" variant="secondary">Cari</Button>
        </form>
      </Card>

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title={showDeleted ? 'Tidak ada arsip' : 'Belum ada properti'} description={showDeleted ? 'Belum ada properti yang diarsipkan.' : 'Tambahkan properti pertama Anda untuk mulai mengelola kos.'} action={!showDeleted && <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Tambah Properti</Button>} />
          ) : (
            <>
              <Table>
                <thead><tr><Th>Properti</Th><Th>Tipe</Th><Th>Lokasi</Th><Th>Kamar</Th><Th>Status</Th><Th className="text-right">Aksi</Th></tr></thead>
                <tbody>
                  {list.data!.items.map((property) => (
                    <tr key={property.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          {property.foto?.[0]
                            ? <img src={fileUrl(property.foto[0])} alt="" className="h-10 w-10 rounded-lg object-cover" />
                            : <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600"><Building2 className="h-5 w-5" /></span>}
                          <div><p className="font-semibold text-slate-800">{property.nama}</p><p className="text-xs text-slate-400">{property.kode_pos ?? '-'}</p></div>
                        </div>
                      </Td>
                      <Td>{propertyTypes[property.tipe] ?? property.tipe}</Td>
                      <Td><p className="max-w-[220px] truncate">{property.alamat}</p><p className="text-xs text-slate-400">{property.kota}, {property.provinsi}</p></Td>
                      <Td>{property.jumlah_kamar ?? 0}</Td>
                      <Td><StatusBadge status={property.status} /></Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          {showDeleted ? (
                            <Button variant="outline" size="sm" loading={restore.isPending} onClick={() => restore.mutate(property.id)}><RotateCcw className="h-4 w-4" /> Pulihkan</Button>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => { setEditing(property); setModalOpen(true) }} aria-label="Ubah"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleting(property)} aria-label="Hapus"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
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
        title={editing ? 'Ubah Properti' : 'Tambah Properti'}
        subtitle="Lengkapi informasi properti dengan benar."
        size="lg"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Simpan</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama properti" required><Input value={form.nama} onChange={(event) => set('nama', event.target.value)} placeholder="Kos Melati" /></Field>
          <Field label="Tipe" required>
            <Select value={form.tipe} onChange={(event) => set('tipe', event.target.value)}>
              {Object.entries(propertyTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Alamat" required><Input value={form.alamat} onChange={(event) => set('alamat', event.target.value)} placeholder="Jl. Merdeka No. 12" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kota" required><Input value={form.kota} onChange={(event) => set('kota', event.target.value)} /></Field>
            <Field label="Provinsi" required><Input value={form.provinsi} onChange={(event) => set('provinsi', event.target.value)} /></Field>
          </div>
          <Field label="Kode pos"><Input value={form.kode_pos} onChange={(event) => set('kode_pos', event.target.value)} /></Field>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => set('status', event.target.value)}>
              <option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option><option value="maintenance">Maintenance</option>
            </Select>
          </Field>
          <Field label="Fasilitas" hint="Pisahkan dengan koma"><Input value={form.fasilitas} onChange={(event) => set('fasilitas', event.target.value)} placeholder="AC, WiFi, Parkir" /></Field>
          <div className="sm:col-span-2"><Textarea placeholder="Deskripsi singkat properti" value={form.deskripsi} onChange={(event) => set('deskripsi', event.target.value)} /></div>
          <div className="sm:col-span-2"><ImagePicker value={form.foto} onChange={(urls) => set('foto', urls)} /></div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Arsipkan properti?"
        message={`Properti "${deleting?.nama ?? ''}" akan dipindahkan ke arsip. Data kamar dan kontrak tetap tersimpan.`}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  )
}
