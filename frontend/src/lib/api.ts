import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../store/auth'
import type { ApiMeta, LoginResponse } from '../types'

// Relative URL works with the Vite dev proxy and with the Go server in production (same origin).
const baseURL = import.meta.env.VITE_API_URL || '/api/v1'

export const client = axios.create({ baseURL, timeout: 20000 })

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      const refresh = useAuthStore.getState().refreshToken
      if (refresh) {
        try {
          const res = await axios.post<{ data: LoginResponse }>(`${baseURL}/auth/refresh`, {
            refresh_token: refresh,
          })
          const pair = res.data.data
          useAuthStore.getState().setTokens(pair.access_token, pair.refresh_token)
          original.headers.Authorization = `Bearer ${pair.access_token}`
          return client.request(original)
        } catch {
          useAuthStore.getState().logout()
        }
      }
    }
    return Promise.reject(error)
  },
)

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await client.request<{ data: T }>(config)
  return res.data.data
}

export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) => request<T>({ method: 'GET', url, params }),
  post: <T>(url: string, data?: unknown) => request<T>({ method: 'POST', url, data }),
  put: <T>(url: string, data?: unknown) => request<T>({ method: 'PUT', url, data }),
  patch: <T>(url: string, data?: unknown) => request<T>({ method: 'PATCH', url, data }),
  delete: <T>(url: string) => request<T>({ method: 'DELETE', url }),
}

export async function apiList<T>(
  url: string,
  params: Record<string, unknown> = {},
): Promise<{ items: T[]; meta: ApiMeta }> {
  const res = await client.get<{ data: T[]; meta: ApiMeta }>(url, { params })
  return {
    items: res.data.data ?? [],
    meta: res.data.meta ?? { page: 1, limit: 20, total: 0, total_pages: 0 },
  }
}

export function fileUrl(path?: string | null): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return baseURL.replace(/\/api\/v1\/?$/, '') + (path.startsWith('/') ? path : `/${path}`)
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined
    return data?.message || data?.error || error.message || 'Terjadi kesalahan jaringan'
  }
  if (error instanceof Error) return error.message
  return 'Terjadi kesalahan tak terduga'
}

export async function uploadFile(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await client.post<{ data: { url: string } }>('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.data.url
}

export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const response = await client.get<Blob>(url, { responseType: 'blob' })
  const disposition = response.headers['content-disposition'] as string | undefined
  const match = disposition?.match(/filename="?([^";]+)"?/)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(response.data)
  link.download = match?.[1] ?? fallbackName
  link.click()
  URL.revokeObjectURL(link.href)
}
