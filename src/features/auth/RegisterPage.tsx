import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, UserPlus } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { User } from '../../types'
import { Button, Field, Input, PasswordInput } from '../../components/ui'
import AuthLayout from './AuthLayout'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ nama: '', email: '', no_hp: '', password: '' })
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const mutation = useMutation({
    mutationFn: () => api.post<User>('/auth/register', form),
    onSuccess: () => navigate('/login', { replace: true }),
  })

  return (
    <AuthLayout
      title="Buat akun baru"
      subtitle="Buat akun pemilik kos. Manager dan penyewa ditambahkan oleh owner."
      footer={<>Sudah punya akun? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Masuk</Link></>}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        {mutation.isError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{errorMessage(mutation.error)}</span>
          </div>
        )}
        <Field label="Nama lengkap" required><Input value={form.nama} onChange={(e) => set('nama', e.target.value)} placeholder="Nama Anda" required /></Field>
        <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="nama@email.com" required /></Field>
        <Field label="No. HP"><Input value={form.no_hp} onChange={(e) => set('no_hp', e.target.value)} placeholder="08xxxxxxxxxx" /></Field>
        <Field label="Password" required hint="Minimal 8 karakter, kombinasi huruf dan angka">
          <PasswordInput value={form.password} onChange={(e) => set('password', e.target.value)} minLength={8} required />
        </Field>
        <Button type="submit" className="w-full" loading={mutation.isPending}><UserPlus className="h-4 w-4" /> Daftar</Button>
      </form>
    </AuthLayout>
  )
}
