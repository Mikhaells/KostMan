import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { api, apiList, errorMessage } from '../../lib/api'
import { formatDate, initials } from '../../lib/format'
import { toast } from '../../lib/toast'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal,
  PageHeader, Pagination, PasswordInput, Select, Table, Td, Th,
} from '../../components/ui'
import type { User } from '../../types'

type CreateForm = { nama: string; email: string; password: string; no_hp: string; role: string }
type EditForm = { nama: string; no_hp: string; role: string; status: string }

const emptyCreate: CreateForm = { nama: '', email: '', password: '', no_hp: '', role: 'manager' }
const emptyEdit: EditForm = { nama: '', no_hp: '', role: 'manager', status: 'aktif' }
const roleLabels: Record<string, string> = { super_admin: 'Super Admin', owner: 'Owner', manager: 'Manager', tenant: 'Penyewa' }

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate)
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit)

  const list = useQuery({
    queryKey: ['users', page, keyword],
    queryFn: () => apiList<User>('/users', { page, limit: 10, search: keyword || undefined }),
  })

  useEffect(() => {
    if (!modalOpen) return
    setCreateForm(emptyCreate)
    setEditForm(editing ? { nama: editing.nama, no_hp: editing.no_hp ?? '', role: editing.role, status: editing.status } : emptyEdit)
  }, [modalOpen, editing])

  const save = useMutation({
    mutationFn: () => editing ? api.put<User>(`/users/${editing.id}`, editForm) : api.post<User>('/users', createForm),
    onSuccess: () => {
      toast(editing ? 'Pengguna diperbarui' : 'Pengguna dibuat')
      setModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => { toast('Pengguna dihapus'); setDeleting(null); queryClient.invalidateQueries({ queryKey: ['users'] }) },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  return (
    <>
      <PageHeader
        title="Manajemen Pengguna"
        subtitle="Kelola akses owner, manager, dan akun sistem."
        actions={<Button size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus className="h-4 w-4" /> Tambah Pengguna</Button>}
      />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setKeyword(search); setPage(1) }}>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Cari nama atau email…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Button type="submit" variant="secondary">Cari</Button>
        </form>
      </Card>

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title="Belum ada pengguna" description="Tambahkan owner atau manager untuk membantu operasional." action={<Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Tambah Pengguna</Button>} />
          ) : (
            <>
              <Table>
                <thead><tr><Th>Pengguna</Th><Th>Role</Th><Th>No. HP</Th><Th>Bergabung</Th><Th>Status</Th><Th className="text-right">Aksi</Th></tr></thead>
                <tbody>
                  {list.data!.items.map((user) => (
                    <tr key={user.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">{initials(user.nama)}</span>
                          <div><p className="font-semibold text-slate-800">{user.nama}</p><p className="text-xs text-slate-400">{user.email}</p></div>
                        </div>
                      </Td>
                      <Td><Badge tone={user.role === 'owner' || user.role === 'super_admin' ? 'violet' : 'blue'}>{roleLabels[user.role] ?? user.role}</Badge></Td>
                      <Td>{user.no_hp ?? '—'}</Td>
                      <Td className="whitespace-nowrap text-xs">{formatDate(user.created_at)}</Td>
                      <Td><Badge tone={user.status === 'aktif' ? 'green' : 'slate'}>{user.status}</Badge></Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditing(user); setModalOpen(true) }} aria-label="Ubah"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(user)} aria-label="Hapus"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
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
        title={editing ? 'Ubah Pengguna' : 'Tambah Pengguna'}
        subtitle={editing ? `Pengguna: ${editing.email}` : 'Akses baru akan langsung aktif.'}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Simpan</Button></>}
      >
        {editing ? (
          <div className="space-y-4">
            <Field label="Nama"><Input value={editForm.nama} onChange={(event) => setEditForm((prev) => ({ ...prev, nama: event.target.value }))} /></Field>
            <Field label="No. HP"><Input value={editForm.no_hp} onChange={(event) => setEditForm((prev) => ({ ...prev, no_hp: event.target.value }))} /></Field>
            <Field label="Role">
              <Select value={editForm.role} onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))}>
                <option value="manager">Manager</option><option value="tenant">Penyewa</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={editForm.status} onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
              </Select>
            </Field>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Nama" required><Input value={createForm.nama} onChange={(event) => setCreateForm((prev) => ({ ...prev, nama: event.target.value }))} /></Field>
            <Field label="Email" required><Input type="email" value={createForm.email} onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))} /></Field>
            <Field label="Password" required><PasswordInput value={createForm.password} onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))} /></Field>
            <Field label="No. HP"><Input value={createForm.no_hp} onChange={(event) => setCreateForm((prev) => ({ ...prev, no_hp: event.target.value }))} /></Field>
            <Field label="Role">
              <Select value={createForm.role} onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value }))}>
                <option value="manager">Manager</option><option value="tenant">Penyewa</option>
              </Select>
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Hapus pengguna?" message={`Akun ${deleting?.nama ?? ''} akan dinonaktifkan dan tidak dapat login kembali.`} loading={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  )
}
