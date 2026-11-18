import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileClock, Pencil, Plus, Search, UserRound, UserRoundPlus } from 'lucide-react'
import { api, apiList, errorMessage, fileUrl } from '../../lib/api'
import { formatDate, rupiah } from '../../lib/format'
import { toast } from '../../lib/toast'
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader,
  Pagination, Select, StatusBadge, Table, Td, Textarea, Th,
} from '../../components/ui'
import ImagePicker from '../../components/ui/ImagePicker'
import type { Contract, Tenant } from '../../types'

type FormState = {
  nama_lengkap: string; nik: string; email: string; no_hp: string; alamat_asal: string
  pekerjaan: string; kontak_darurat_nama: string; kontak_darurat_hp: string; foto_ktp: string
  dokumen_lain: string[]; status: string; password: string; buat_akun_portal: boolean
}

const emptyForm: FormState = {
  nama_lengkap: '', nik: '', email: '', no_hp: '', alamat_asal: '', pekerjaan: '',
  kontak_darurat_nama: '', kontak_darurat_hp: '', foto_ktp: '', dokumen_lain: [],
  status: 'aktif', password: '', buat_akun_portal: false,
}

export default function TenantsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [historyTenant, setHistoryTenant] = useState<Tenant | null>(null)
  const [portalTenant, setPortalTenant] = useState<Tenant | null>(null)
  const [portalPassword, setPortalPassword] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm)

  const list = useQuery({
    queryKey: ['tenants', page, keyword, status],
    queryFn: () => apiList<Tenant>('/tenants', { page, limit: 10, search: keyword || undefined, status: status || undefined }),
  })

  const history = useQuery({
    queryKey: ['tenants', historyTenant?.id, 'history'],
    queryFn: () => api.get<Contract[]>(`/tenants/${historyTenant!.id}/history`),
    enabled: Boolean(historyTenant),
  })

  useEffect(() => {
    if (!modalOpen) return
    setForm(editing ? {
      nama_lengkap: editing.nama_lengkap, nik: editing.nik, email: editing.email, no_hp: editing.no_hp,
      alamat_asal: editing.alamat_asal ?? '', pekerjaan: editing.pekerjaan ?? '',
      kontak_darurat_nama: editing.kontak_darurat_nama, kontak_darurat_hp: editing.kontak_darurat_hp,
      foto_ktp: editing.foto_ktp ?? '', dokumen_lain: editing.dokumen_lain ?? [],
      status: editing.status, password: '', buat_akun_portal: Boolean(editing.user_id),
    } : emptyForm)
  }, [modalOpen, editing])

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form }
      return editing ? api.put<Tenant>(`/tenants/${editing.id}`, payload) : api.post<Tenant>('/tenants', payload)
    },
    onSuccess: () => {
      toast(editing ? 'Data penyewa diperbarui' : 'Penyewa ditambahkan')
      setModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const setTenantStatus = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => api.patch(`/tenants/${id}/status`, { status: value }),
    onSuccess: () => { toast('Status penyewa diperbarui'); queryClient.invalidateQueries({ queryKey: ['tenants'] }) },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const createPortal = useMutation({
    mutationFn: () => api.post<{ user_id: string; message: string }>(`/tenants/${portalTenant!.id}/portal-user`, { password: portalPassword || undefined }),
    onSuccess: (data) => {
      toast(data.message || 'Akun portal dibuat')
      setPortalTenant(null)
      setPortalPassword('')
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <>
      <PageHeader
        title="Data Penyewa"
        subtitle="Kelola identitas, kontak darurat, dan akun portal penyewa."
        actions={<Button size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus className="h-4 w-4" /> Tambah Penyewa</Button>}
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setKeyword(search); setPage(1) }}>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Cari nama, email, atau NIKâ€¦" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={status} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }} className="w-full sm:w-40">
            <option value="">Semua status</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
          </Select>
          <Button type="submit" variant="secondary">Cari</Button>
        </form>
      </Card>

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title="Belum ada penyewa" description="Tambahkan penyewa baru atau import dari data kontrak." action={<Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Tambah Penyewa</Button>} />
          ) : (
            <>
              <Table>
                <thead><tr><Th>Penyewa</Th><Th>Kontak</Th><Th>Pekerjaan</Th><Th>Portal</Th><Th>Status</Th><Th className="text-right">Aksi</Th></tr></thead>
                <tbody>
                  {list.data!.items.map((tenant) => (
                    <tr key={tenant.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          {tenant.foto_ktp
                            ? <img src={fileUrl(tenant.foto_ktp)} alt="" className="h-10 w-10 rounded-lg object-cover" />
                            : <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500"><UserRound className="h-5 w-5" /></span>}
                          <div><p className="font-semibold text-slate-800">{tenant.nama_lengkap}</p><p className="font-mono text-xs text-slate-400">{tenant.nik}</p></div>
                        </div>
                      </Td>
                      <Td><p>{tenant.no_hp}</p><p className="text-xs text-slate-400">{tenant.email}</p></Td>
                      <Td>{tenant.pekerjaan ?? 'â€”'}</Td>
                      <Td>{tenant.user_id ? <Badge tone="green">Terhubung</Badge> : <Badge tone="slate">Belum ada</Badge>}</Td>
                      <Td>
                        <Select
                          value={tenant.status}
                          className="h-8 w-28 py-0 text-xs"
                          onChange={(event) => setTenantStatus.mutate({ id: tenant.id, value: event.target.value })}
                        >
                          <option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
                        </Select>
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Riwayat kontrak" onClick={() => setHistoryTenant(tenant)}><FileClock className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Buat akun portal" onClick={() => { setPortalTenant(tenant); setPortalPassword('') }}><UserRoundPlus className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Ubah" onClick={() => { setEditing(tenant); setModalOpen(true) }}><Pencil className="h-4 w-4" /></Button>
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
        title={editing ? 'Ubah Data Penyewa' : 'Tambah Penyewa'}
        subtitle="NIK akan dienkripsi sebelum disimpan."
        size="lg"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Simpan</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama lengkap" required><Input value={form.nama_lengkap} onChange={(event) => set('nama_lengkap', event.target.value)} /></Field>
          <Field label="NIK" required><Input value={form.nik} onChange={(event) => set('nik', event.target.value)} placeholder="16 digit" /></Field>
          <Field label="Email" required><Input type="email" value={form.email} onChange={(event) => set('email', event.target.value)} /></Field>
          <Field label="No. HP" required><Input value={form.no_hp} onChange={(event) => set('no_hp', event.target.value)} placeholder="0812â€¦" /></Field>
          <Field label="Pekerjaan"><Input value={form.pekerjaan} onChange={(event) => set('pekerjaan', event.target.value)} /></Field>
          <Field label="Alamat asal"><Input value={form.alamat_asal} onChange={(event) => set('alamat_asal', event.target.value)} /></Field>
          <Field label="Kontak darurat (nama)" required><Input value={form.kontak_darurat_nama} onChange={(event) => set('kontak_darurat_nama', event.target.value)} /></Field>
          <Field label="Kontak darurat (HP)" required><Input value={form.kontak_darurat_hp} onChange={(event) => set('kontak_darurat_hp', event.target.value)} /></Field>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => set('status', event.target.value)}>
              <option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
            </Select>
          </Field>
          {!editing && (
            <>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.buat_akun_portal} onChange={(event) => set('buat_akun_portal', event.target.checked)} />
                  Buat akun portal penyewa
                </label>
              </div>
              {form.buat_akun_portal && (
                <Field label="Password portal" hint="Kosongkan untuk password default"><Input type="password" value={form.password} onChange={(event) => set('password', event.target.value)} /></Field>
              )}
            </>
          )}
          <div className="sm:col-span-2"><ImagePicker label="Foto KTP" max={1} value={form.foto_ktp ? [form.foto_ktp] : []} onChange={(urls) => set('foto_ktp', urls[0] ?? '')} /></div>
          <div className="sm:col-span-2"><Textarea placeholder="Dokumen lain (catatan)" value={form.dokumen_lain.join(', ')} onChange={(event) => set('dokumen_lain', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} /></div>
        </div>
      </Modal>

      <Modal open={Boolean(historyTenant)} onClose={() => setHistoryTenant(null)} title={`Riwayat Kontrak Â· ${historyTenant?.nama_lengkap ?? ''}`} size="lg">
        {history.isLoading ? <Loading /> : history.isError ? <ErrorState message={errorMessage(history.error)} /> : (
          (history.data ?? []).length === 0 ? <EmptyState title="Belum ada riwayat kontrak" /> : (
            <Table>
              <thead><tr><Th>No. Kontrak</Th><Th>Kamar</Th><Th>Periode</Th><Th>Harga</Th><Th>Status</Th></tr></thead>
              <tbody>
                {(history.data ?? []).map((contract) => (
                  <tr key={contract.id}>
                    <Td className="font-semibold">{contract.nomor_kontrak}</Td>
                    <Td>{contract.nomor_kamar ?? 'â€”'}</Td>
                    <Td>{formatDate(contract.tanggal_mulai)} â€“ {formatDate(contract.tanggal_selesai)}</Td>
                    <Td>{rupiah(contract.harga_sewa)}</Td>
                    <Td><StatusBadge status={contract.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        )}
      </Modal>

      <Modal
        open={Boolean(portalTenant)}
        onClose={() => setPortalTenant(null)}
        title="Buat Akun Portal"
        subtitle={portalTenant ? `Penyewa: ${portalTenant.nama_lengkap}` : undefined}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setPortalTenant(null)}>Batal</Button><Button loading={createPortal.isPending} onClick={() => createPortal.mutate()}>Buat Akun</Button></>}
      >
        <Field label="Password" hint="Kosongkan untuk menggunakan password default"><Input type="password" value={portalPassword} onChange={(event) => setPortalPassword(event.target.value)} /></Field>
      </Modal>
    </>
  )
}
