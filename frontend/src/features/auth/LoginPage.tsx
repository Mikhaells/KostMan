import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import type { LoginResponse } from '../../types'
import { Button, Field, Input } from '../../components/ui'
import AuthLayout from './AuthLayout'

export default function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((state) => state.setSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.post<LoginResponse>('/auth/login', { email, password }),
    onSuccess: (data) => {
      setSession(data)
      navigate(data.user.role === 'tenant' ? '/portal' : '/dashboard', { replace: true })
    },
  })

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail)
    setPassword('Admin123')
  }

  return (
    <AuthLayout
      title="Selamat datang kembali"
      subtitle="Masuk untuk mengelola operasional kos Anda."
      footer={
        <>
          Belum punya akun? <Link to="/register" className="font-semibold text-brand-600 hover:underline">Daftar sekarang</Link>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        {mutation.isError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage(mutation.error)}</span>
          </div>
        )}
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" autoComplete="email" required />
        </Field>
        <Field label="Password" required>
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password"
              autoComplete="current-password"
              className="pr-11"
              required
            />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Tampilkan password">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">Lupa password?</Link>
        </div>
        <Button type="submit" className="w-full" loading={mutation.isPending}>
          <LogIn className="h-4 w-4" /> Masuk
        </Button>
      </form>

      <div className="mt-7 rounded-xl border border-dashed border-slate-300 bg-white p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Akun demo (password: Admin123)</p>
        <div className="flex flex-wrap gap-2">
          {[
            ['owner@kosman.id', 'Owner'],
            ['manager@kosman.id', 'Manager'],
            ['penyewa1@kosman.id', 'Penyewa'],
          ].map(([mail, label]) => (
            <button key={mail} onClick={() => fillDemo(mail)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-700">
              {label}
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  )
}
