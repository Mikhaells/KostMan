import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, LogIn } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import type { LoginResponse } from '../../types'
import { Button, Field, Input, PasswordInput } from '../../components/ui'
import AuthLayout from './AuthLayout'

export default function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((state) => state.setSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post<LoginResponse>('/auth/login', { email, password }),
    onSuccess: (data) => {
      setSession(data)
      navigate(data.user.role === 'tenant' ? '/portal' : '/dashboard', { replace: true })
    },
  })

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
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan password"
            autoComplete="current-password"
            required
          />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">Lupa password?</Link>
        </div>
        <Button type="submit" className="w-full" loading={mutation.isPending}>
          <LogIn className="h-4 w-4" /> Masuk
        </Button>
      </form>
    </AuthLayout>
  )
}
