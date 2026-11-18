import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Mail, Send } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { Button, Field, Input } from '../../components/ui'
import AuthLayout from './AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const mutation = useMutation({
    mutationFn: () => api.post('/auth/forgot-password', { email }),
  })
  return (
    <AuthLayout
      title="Lupa password"
      subtitle="Masukkan email akun Anda, kami akan mengirim tautan reset."
      footer={<Link to="/login" className="font-semibold text-brand-600 hover:underline">Kembali ke login</Link>}
    >
      {mutation.isSuccess ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          <CheckCircle2 className="mb-2 h-6 w-6" />
          Jika email terdaftar, tautan reset password sudah dikirim. Silakan cek inbox Anda.
        </div>
      ) : (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
          {mutation.isError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{errorMessage(mutation.error)}</span>
            </div>
          )}
          <Field label="Email" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" required /></Field>
          <Button type="submit" className="w-full" loading={mutation.isPending}><Send className="h-4 w-4" /> Kirim tautan reset</Button>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState('')
  const token = params.get('token') ?? ''

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/reset-password', { token, password }),
    onSuccess: () => navigate('/login', { replace: true }),
  })

  return (
    <AuthLayout
      title="Atur ulang password"
      subtitle="Buat password baru yang kuat untuk akun Anda."
      footer={<Link to="/login" className="font-semibold text-brand-600 hover:underline">Kembali ke login</Link>}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (password !== confirm) {
            setLocalError('Konfirmasi password tidak sama')
            return
          }
          setLocalError('')
          mutation.mutate()
        }}
      >
        {(localError || mutation.isError) && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{localError || errorMessage(mutation.error)}</span>
          </div>
        )}
        {!token && <p className="text-sm text-amber-700">Tautan reset tidak ditemukan. Gunakan tautan dari email reset Anda.</p>}
        <Field label="Password baru" required hint="Minimal 8 karakter, huruf + angka">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </Field>
        <Field label="Konfirmasi password" required>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
        </Field>
        <Button type="submit" className="w-full" loading={mutation.isPending}><Mail className="h-4 w-4" /> Simpan password</Button>
      </form>
    </AuthLayout>
  )
}
