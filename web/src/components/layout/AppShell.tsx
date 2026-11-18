import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, Building2, ClipboardList, FileText, Home, LayoutDashboard, LogOut, Menu,
  Receipt, Settings, Ticket, Users, Wallet, X, DoorOpen, UserCircle2,
} from 'lucide-react'
import { api } from '../../lib/api'
import { initials } from '../../lib/format'
import { useAuthStore } from '../../store/auth'
import type { Role } from '../../types'
import { cn } from '../ui'

type NavItem = { to: string; label: string; icon: ReactNode; roles: Role[] }

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, roles: ['owner', 'super_admin'] },
  { to: '/properties', label: 'Properti', icon: <Building2 className="h-5 w-5" />, roles: ['owner', 'super_admin'] },
  { to: '/rooms', label: 'Kamar', icon: <DoorOpen className="h-5 w-5" />, roles: ['owner', 'manager', 'super_admin'] },
  { to: '/tenants', label: 'Penyewa', icon: <Users className="h-5 w-5" />, roles: ['owner', 'manager', 'super_admin'] },
  { to: '/contracts', label: 'Kontrak', icon: <FileText className="h-5 w-5" />, roles: ['owner', 'manager', 'super_admin'] },
  { to: '/invoices', label: 'Tagihan', icon: <Receipt className="h-5 w-5" />, roles: ['owner', 'manager', 'super_admin'] },
  { to: '/payments', label: 'Pembayaran', icon: <Wallet className="h-5 w-5" />, roles: ['owner', 'manager', 'super_admin'] },
  { to: '/tickets', label: 'Keluhan', icon: <Ticket className="h-5 w-5" />, roles: ['owner', 'manager', 'super_admin'] },
  { to: '/reports', label: 'Laporan', icon: <ClipboardList className="h-5 w-5" />, roles: ['owner', 'super_admin'] },
  { to: '/users', label: 'Pengguna', icon: <UserCircle2 className="h-5 w-5" />, roles: ['owner', 'super_admin'] },
  { to: '/settings', label: 'Pengaturan', icon: <Settings className="h-5 w-5" />, roles: ['owner', 'super_admin'] },
  { to: '/portal', label: 'Beranda Saya', icon: <Home className="h-5 w-5" />, roles: ['tenant'] },
  { to: '/portal/invoices', label: 'Tagihan Saya', icon: <Receipt className="h-5 w-5" />, roles: ['tenant'] },
  { to: '/portal/tickets', label: 'Keluhan Saya', icon: <Ticket className="h-5 w-5" />, roles: ['tenant'] },
  { to: '/portal/profile', label: 'Profil Saya', icon: <UserCircle2 className="h-5 w-5" />, roles: ['tenant'] },
]

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard', '/properties': 'Manajemen Properti', '/rooms': 'Manajemen Kamar',
  '/tenants': 'Data Penyewa', '/contracts': 'Kontrak Sewa', '/invoices': 'Tagihan',
  '/payments': 'Pembayaran', '/tickets': 'Keluhan & Maintenance', '/reports': 'Laporan',
  '/users': 'Manajemen Pengguna', '/settings': 'Pengaturan', '/notifications': 'Notifikasi',
  '/portal': 'Beranda Saya', '/portal/invoices': 'Tagihan Saya', '/portal/tickets': 'Keluhan Saya',
  '/portal/profile': 'Profil Saya',
}

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const role = user?.role ?? 'tenant'

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  })

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
      isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white',
    )

  const doLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const currentTitle = pageTitles[location.pathname] ?? 'KosMan'

  return (
    <div className="min-h-screen bg-slate-50">
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-transform duration-200 lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex h-16 items-center justify-between px-5">
          <button onClick={() => navigate(role === 'tenant' ? '/portal' : '/dashboard')} className="flex items-center gap-2 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 font-extrabold">K</span>
            <span className="text-lg font-extrabold tracking-tight">KosMan</span>
          </button>
          <button className="text-slate-400 lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.filter((item) => item.roles.includes(role)).map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setOpen(false)} end={item.to === '/portal'}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          <NavLink to="/notifications" className={linkClass} onClick={() => setOpen(false)}>
            <Bell className="h-5 w-5" />
            Notifikasi
            {(unread?.count ?? 0) > 0 && <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">{unread?.count}</span>}
          </NavLink>
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">{initials(user?.nama ?? 'User')}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user?.nama}</p>
              <p className="truncate text-xs capitalize text-slate-400">{user?.role?.replace('_', ' ')}</p>
            </div>
            <button onClick={doLogout} title="Keluar" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu className="h-5 w-5" /></button>
          <h2 className="text-base font-bold text-slate-800 md:text-lg">{currentTitle}</h2>
          <div className="ml-auto flex items-center gap-2">
            <NavLink to="/notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifikasi">
              <Bell className="h-5 w-5" />
              {(unread?.count ?? 0) > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread?.count}</span>}
            </NavLink>
            <span className="hidden text-sm text-slate-600 sm:block">Halo, {user?.nama?.split(' ')[0]}</span>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
