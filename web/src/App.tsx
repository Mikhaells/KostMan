import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { api } from './lib/api'
import { useAuthStore } from './store/auth'
import type { Role, User } from './types'
import { ForgotPasswordPage, ResetPasswordPage } from './features/auth/PasswordPages'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import DashboardPage from './features/dashboard/DashboardPage'
import PropertiesPage from './features/properties/PropertiesPage'
import RoomsPage from './features/rooms/RoomsPage'
import TenantsPage from './features/tenants/TenantsPage'
import ContractsPage from './features/contracts/ContractsPage'
import InvoicesPage from './features/billing/InvoicesPage'
import PaymentsPage from './features/billing/PaymentsPage'
import TicketsPage from './features/tickets/TicketsPage'
import ReportsPage from './features/reports/ReportsPage'
import NotificationsPage from './features/notifications/NotificationsPage'
import SettingsPage from './features/settings/SettingsPage'
import UsersPage from './features/users/UsersPage'
import TenantPortalPage from './features/portal/TenantPortalPage'
import TenantInvoicesPage from './features/portal/TenantInvoicesPage'
import TenantTicketsPage from './features/portal/TenantTicketsPage'
import TenantProfilePage from './features/portal/TenantProfilePage'

function homeFor(role?: Role) {
  return role === 'tenant' ? '/portal' : '/dashboard'
}

function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()

  if (!token) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (allow && user && !allow.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  if (token) return <Navigate to={homeFor(user?.role)} replace />
  return <>{children}</>
}

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-3 text-xl font-bold text-slate-800">Halaman tidak ditemukan</h1>
      <p className="mt-1 text-sm text-slate-500">Alamat yang Anda buka tidak tersedia.</p>
      <a href="/dashboard" className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        Kembali ke dashboard
      </a>
    </div>
  )
}

export default function App() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    if (!token || user) return
    let active = true
    api.get<User>('/auth/me')
      .then((me) => { if (active) setUser(me) })
      .catch(() => { if (active) logout() })
    return () => { active = false }
  }, [token, user, setUser, logout])

  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
      <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
      <Route path="/reset-password" element={<PublicOnlyRoute><ResetPasswordPage /></PublicOnlyRoute>} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route element={<ProtectedRoute allow={['owner', 'super_admin']} />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/properties" element={<PropertiesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route element={<ProtectedRoute allow={['owner', 'manager', 'super_admin']} />}>
            <Route path="/rooms" element={<RoomsPage />} />
            <Route path="/tenants" element={<TenantsPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
          </Route>

          <Route element={<ProtectedRoute allow={['tenant']} />}>
            <Route path="/portal" element={<TenantPortalPage />} />
            <Route path="/portal/invoices" element={<TenantInvoicesPage />} />
            <Route path="/portal/tickets" element={<TenantTicketsPage />} />
            <Route path="/portal/profile" element={<TenantProfilePage />} />
          </Route>

          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
