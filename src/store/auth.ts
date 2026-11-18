import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LoginResponse, User } from '../types'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  setTokens: (access: string, refresh: string) => void
  setSession: (data: LoginResponse) => void
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setTokens: (access, refresh) => set({ token: access, refreshToken: refresh }),
      setSession: (data) =>
        set({ token: data.access_token, refreshToken: data.refresh_token, user: data.user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, refreshToken: null, user: null }),
    }),
    { name: 'kosman-auth' },
  ),
)
