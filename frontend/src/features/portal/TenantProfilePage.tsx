import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '../../lib/api'
import { formatDate, initials } from '../../lib/format'
import { toast } from '../../lib/toast'
import { useAuthStore } from '../../store/auth'
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, Loading, PageHeader } from '../../components/ui'
import type { Tenant, User } from '../../types'

export default function TenantProfilePage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const tenant = useQuery({ queryKey: ['tenants', 'me'], queryFn: () => api.get<Tenant>('/tenants/me') })

  const [profile, setProfile] = useState({ nama: '', no_hp: '' })
  const [password, setPassword] = useState({ old_password: '', new_password: '', confirm: '' })

  useEffect(() => {
    if (user) setProfile({ nama: user.nama, no_hp: user.no_hp ?? '' })
  }, [user])

  const saveProfile = useMutation({
    mutationFn: () => api.put<User>('/auth/me', profile),
    onSuccess: (data) => {
      setUser(data)
      toast('Profil diperbarui')
      queryClient.invalidateQueries({ queryKey: ['tenants', 'me'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const savePassword = useMutation({
    mutationFn: () => api.post('/auth/change-password', { old_password: password.old_password, new_password: password.new_password }),
    onSuccess: () => {
      toast('Password berhasil diubah')
      setPassword({ old_password: '', new_password: '', confirm: '' })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  return (
    <>
      <PageHeader title="Profil Saya" subtitle="Kelola informasi pribadi dan keamanan akun." />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6 text-center lg:col-span-1">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-100 text-2xl font-extrabold text-brand-600">
            {initials(user?.nama ?? 'User')}
          </span>
          <h3 className="mt-4 text-lg font-bold text-slate-800">{user?.nama}</h3>
          <p className="text-sm text-slate-500">{user?.email}</p>
          <div className="mt-3"><Badge tone="green">Akun Penyewa</Badge></div>
          <div className="mt-5 border-t border-slate-100 pt-4 text-left text-sm">
            <p className="text-xs text-slate-400">Bergabung sejak</p>
            <p className="font-semibold text-slate-700">{formatDate(user?.created_at)}</p>
          </div>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Data Akun" subtitle="Nama dan nomor HP yang terhubung dengan akun login." action={<Button size="sm" loading={saveProfile.isPending} onClick={() => saveProfile.mutate()}>Simpan</Button>} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Nama lengkap"><Input value={profile.nama} onChange={(event) => setProfile((prev) => ({ ...prev, nama: event.target.value }))} /></Field>
              <Field label="No. HP"><Input value={profile.no_hp} onChange={(event) => setProfile((prev) => ({ ...prev, no_hp: event.target.value }))} /></Field>
              <Field label="Email"><Input value={user?.email ?? ''} disabled /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Ubah Password" subtitle="Gunakan password minimal 8 karakter." action={<Button size="sm" loading={savePassword.isPending} disabled={password.new_password !== password.confirm || !password.old_password || !password.new_password} onClick={() => savePassword.mutate()}>Ubah Password</Button>} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Password lama"><Input type="password" value={password.old_password} onChange={(event) => setPassword((prev) => ({ ...prev, old_password: event.target.value }))} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Password baru"><Input type="password" value={password.new_password} onChange={(event) => setPassword((prev) => ({ ...prev, new_password: event.target.value }))} /></Field>
                <Field label="Konfirmasi"><Input type="password" value={password.confirm} onChange={(event) => setPassword((prev) => ({ ...prev, confirm: event.target.value }))} /></Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Data Penyewa" subtitle="Data pendukung dari pengelola kos." />
            {tenant.isLoading ? <Loading /> : tenant.isError ? <ErrorState message={errorMessage(tenant.error)} onRetry={() => tenant.refetch()} /> : tenant.data && (
              <div className="grid gap-4 p-5 text-sm sm:grid-cols-2">
                <div><p className="text-xs text-slate-400">Nama lengkap</p><p className="font-semibold text-slate-700">{tenant.data.nama_lengkap}</p></div>
                <div><p className="text-xs text-slate-400">NIK</p><p className="font-mono font-semibold text-slate-700">{tenant.data.nik}</p></div>
                <div><p className="text-xs text-slate-400">Pekerjaan</p><p className="font-semibold text-slate-700">{tenant.data.pekerjaan ?? '-'}</p></div>
                <div><p className="text-xs text-slate-400">Alamat asal</p><p className="font-semibold text-slate-700">{tenant.data.alamat_asal ?? '-'}</p></div>
                <div><p className="text-xs text-slate-400">Kontak darurat</p><p className="font-semibold text-slate-700">{tenant.data.kontak_darurat_nama} · {tenant.data.kontak_darurat_hp}</p></div>
                <div><p className="text-xs text-slate-400">Status</p><Badge tone={tenant.data.status === 'aktif' ? 'green' : 'slate'}>{tenant.data.status}</Badge></div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
