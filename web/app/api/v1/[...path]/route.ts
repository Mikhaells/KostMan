import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/server/config'
import { body, created, fail, forbidden, list, meta, noContent, ok, pagination, unauthorized, type Pagination } from '@/lib/server/http'
import { verifyToken, type Claims } from '@/lib/server/jwt'
import * as auth from '@/lib/services/auth'
import * as properties from '@/lib/services/property'
import * as rooms from '@/lib/services/room'
import * as tenants from '@/lib/services/tenant'
import * as contracts from '@/lib/services/contract'
import * as billing from '@/lib/services/billing'
import * as payments from '@/lib/services/payment'
import * as tickets from '@/lib/services/ticket'
import * as notifications from '@/lib/services/notification'
import * as settings from '@/lib/services/setting'
import * as reports from '@/lib/services/report'
import { ensureDatabase } from '@/lib/server/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Access = 'public' | 'auth' | 'ops' | 'owner'

interface Ctx {
  req: NextRequest
  url: URL
  params: string[]
  principal: Claims
  data: any
  q: Pagination
}

interface Route {
  method: string
  pattern: string
  access: Access
  handle: (ctx: Ctx) => Promise<Response>
}

const routes: Route[] = []
const route = (method: string, pattern: string, access: Access, handle: Route['handle']) =>
  routes.push({ method, pattern, access, handle })

const q = (ctx: Ctx) => ctx.q
const p = (ctx: Ctx, index = 0) => ctx.params[index] ?? ''
const query = (ctx: Ctx, key: string) => ctx.url.searchParams.get(key) ?? ''
const v = (value: unknown) => String(value ?? '')

// ---------------------------------------------------------------- auth (public)
route('POST', '/auth/register', 'public', async ({ data }) => created(await auth.register(data)))
route('POST', '/auth/login', 'public', async ({ data }) => ok(await auth.login(data)))
route('POST', '/auth/refresh', 'public', async ({ data }) => ok(await auth.refresh(v(data?.refresh_token))))
route('POST', '/auth/forgot-password', 'public', async ({ data }) => {
  await auth.forgotPassword(v(data?.email))
  return ok({ message: 'Jika email terdaftar, tautan reset telah dikirim' })
})
route('POST', '/auth/reset-password', 'public', async ({ data }) => {
  await auth.resetPassword(v(data?.token), v(data?.password))
  return ok({ message: 'Password berhasil diubah' })
})

// ------------------------------------------------------------- auth (berakses)
route('GET', '/auth/me', 'auth', async ({ principal }) => ok(await auth.getProfile(principal.uid)))
route('PUT', '/auth/me', 'auth', async ({ principal, data }) => ok(await auth.updateProfile(principal.uid, data)))
route('POST', '/auth/change-password', 'auth', async ({ principal, data }) => {
  await auth.changePassword(principal.uid, v(data?.old_password), v(data?.new_password))
  return ok({ message: 'Password berhasil diubah' })
})
route('POST', '/auth/logout', 'auth', async ({ data }) => {
  await auth.logout(v(data?.refresh_token))
  return ok({ message: 'Berhasil logout' })
})

// -------------------------------------------------------------- notifications
route('GET', '/notifications', 'auth', async (ctx) => {
  const result = await notifications.listNotifications(ctx.principal.uid, query(ctx, 'unread') === 'true', q(ctx))
  return list(result.items, meta(ctx.q, result.total))
})
route('GET', '/notifications/unread-count', 'auth', async ({ principal }) =>
  ok({ count: await notifications.unreadCount(principal.uid) }),
)
route('PATCH', '/notifications/read-all', 'auth', async ({ principal }) => {
  await notifications.markAllRead(principal.uid)
  return ok({ message: 'Semua notifikasi ditandai dibaca' })
})
route('PATCH', '/notifications/:id/read', 'auth', async (ctx) => {
  await notifications.markNotificationRead(p(ctx), ctx.principal.uid)
  return ok({ message: 'Notifikasi ditandai dibaca' })
})

// ------------------------------------------------------ identitas penyewa (self)
async function ownTenantId(ctx: Ctx): Promise<string> {
  if (ctx.principal.role !== 'tenant') return ''
  const tenant = await tenants.getTenantByUser(ctx.principal.uid)
  return tenant?.id ?? ''
}

async function assertTenantOwner(ctx: Ctx, tenantId: string) {
  if (ctx.principal.role !== 'tenant') return
  const own = await ownTenantId(ctx)
  if (!own || own !== tenantId) throw forbidden('Data bukan milik Anda')
}

route('GET', '/tenants/me', 'auth', async (ctx) => ok(await tenants.getTenantByUser(ctx.principal.uid)))

// ------------------------------------------------------------------- invoices
route('GET', '/invoices', 'auth', async (ctx) => {
  const result = await billing.listInvoices(await ownTenantId(ctx), query(ctx, 'properti_id'), query(ctx, 'status'), ctx.q)
  return list(result.items, meta(ctx.q, result.total))
})
route('GET', '/invoices/:id/pdf', 'ops', async (ctx) => binary(await billing.invoicePdf(p(ctx))))
route('POST', '/invoices/generate', 'ops', async () => ok({ dibuat: await billing.generateMonthlyInvoices() }))
route('POST', '/invoices', 'ops', async ({ data }) => created(await billing.createInvoice(data)))
route('PUT', '/invoices/:id', 'ops', async (ctx) => ok(await billing.updateInvoice(p(ctx), ctx.data)))
route('POST', '/invoices/:id/void', 'ops', async (ctx) => {
  await billing.voidInvoice(p(ctx))
  return ok({ message: 'Tagihan dibatalkan' })
})
route('GET', '/invoices/:id', 'auth', async (ctx) => {
  const invoice = await billing.getInvoice(p(ctx))
  await assertTenantOwner(ctx, invoice.penyewa_id)
  return ok(invoice)
})
route('POST', '/invoices/:id/payments', 'auth', async (ctx) =>
  created(await payments.createPayment(ctx.principal.uid, ctx.principal.role, { ...ctx.data, tagihan_id: p(ctx) }, false)),
)
route('POST', '/invoices/:id/payments/cash', 'ops', async (ctx) =>
  created(await payments.createPayment(ctx.principal.uid, ctx.principal.role, { ...ctx.data, tagihan_id: p(ctx) }, true)),
)

// ------------------------------------------------------------------ contracts
route('GET', '/contracts', 'auth', async (ctx) => {
  const result = await contracts.listContracts(
    await ownTenantId(ctx),
    query(ctx, 'kamar_id'),
    query(ctx, 'properti_id'),
    query(ctx, 'status'),
    ctx.q,
  )
  return list(result.items, meta(ctx.q, result.total))
})
route('POST', '/contracts', 'ops', async (ctx) => created(await contracts.createContract(ctx.principal.uid, ctx.data)))
route('POST', '/contracts/:id/renew', 'ops', async (ctx) =>
  ok(await contracts.renewContract(p(ctx), v(ctx.data?.tanggal_selesai), ctx.principal.uid)),
)
route('POST', '/contracts/:id/terminate', 'ops', async (ctx) =>
  ok(await contracts.terminateContract(p(ctx), v(ctx.data?.status), v(ctx.data?.catatan))),
)
route('GET', '/contracts/:id/pdf', 'ops', async (ctx) => binary(await contracts.contractPdf(p(ctx))))
route('GET', '/contracts/:id', 'auth', async (ctx) => {
  const contract = await contracts.getContract(p(ctx))
  await assertTenantOwner(ctx, contract.penyewa_id)
  return ok(contract)
})

// ------------------------------------------------------------------- payments
route('GET', '/payments', 'ops', async (ctx) => {
  const result = await payments.listPayments(query(ctx, 'tagihan_id'), query(ctx, 'status'), ctx.q)
  return list(result.items, meta(ctx.q, result.total))
})
route('POST', '/payments/:id/verify', 'ops', async (ctx) =>
  ok(await payments.verifyPayment(p(ctx), ctx.principal.uid)),
)
route('POST', '/payments/:id/reject', 'ops', async (ctx) =>
  ok(await payments.rejectPayment(p(ctx), ctx.principal.uid, v(ctx.data?.catatan))),
)

// -------------------------------------------------------------------- tickets
route('GET', '/tickets/stats', 'ops', async () => ok(await tickets.ticketStats()))
route('GET', '/tickets', 'auth', async (ctx) => {
  const result = await tickets.listTickets(
    ctx.principal.uid,
    ctx.principal.role,
    query(ctx, 'status'),
    query(ctx, 'kategori'),
    query(ctx, 'prioritas'),
    ctx.q,
  )
  return list(result.items, meta(ctx.q, result.total))
})
route('POST', '/tickets', 'auth', async (ctx) => created(await tickets.createTicket(ctx.principal.uid, ctx.data)))
route('PATCH', '/tickets/:id', 'ops', async (ctx) => ok(await tickets.updateTicket(p(ctx), ctx.data)))
route('GET', '/tickets/:id', 'auth', async (ctx) => {
  const ticket = await tickets.getTicket(p(ctx))
  if (ctx.principal.role === 'tenant') {
    const own = await ownTenantId(ctx)
    if (!own || own !== ticket.penyewa_id) throw forbidden('Tiket bukan milik Anda')
  }
  return ok(ticket)
})

// ---------------------------------------------------------------------- rooms
route('GET', '/rooms', 'ops', async (ctx) => {
  const result = await rooms.listRooms(query(ctx, 'properti_id'), query(ctx, 'status'), ctx.q)
  return list(result.items, meta(ctx.q, result.total))
})
route('GET', '/rooms/:id', 'ops', async (ctx) => ok(await rooms.getRoom(p(ctx))))
route('PUT', '/rooms/:id', 'ops', async (ctx) => ok(await rooms.updateRoom(p(ctx), ctx.data)))
route('PATCH', '/rooms/:id/status', 'ops', async (ctx) => ok(await rooms.setRoomStatus(p(ctx), v(ctx.data?.status))))
route('DELETE', '/rooms/:id', 'ops', async (ctx) => {
  await rooms.deleteRoom(p(ctx))
  return noContent()
})
route('GET', '/properties/:id/rooms', 'ops', async (ctx) => {
  const result = await rooms.listRooms(p(ctx), query(ctx, 'status'), ctx.q)
  return list(result.items, meta(ctx.q, result.total))
})
route('POST', '/properties/:id/rooms', 'ops', async (ctx) => created(await rooms.createRoom(p(ctx), ctx.data)))

// -------------------------------------------------------------------- tenants
route('GET', '/tenants', 'ops', async (ctx) => {
  const result = await tenants.listTenants(ctx.q, query(ctx, 'search'), query(ctx, 'status'))
  return list(result.items, meta(ctx.q, result.total))
})
route('POST', '/tenants', 'ops', async ({ data }) => created(await tenants.createTenant(data)))
route('GET', '/tenants/:id/history', 'ops', async (ctx) => ok(await tenants.tenantHistory(p(ctx))))
route('POST', '/tenants/:id/portal-user', 'ops', async (ctx) =>
  ok({ user_id: await tenants.ensurePortalUser(p(ctx), v(ctx.data?.password)), message: 'Akun portal penyewa siap digunakan' }),
)
route('GET', '/tenants/:id', 'ops', async (ctx) => ok(await tenants.getTenant(p(ctx))))
route('PUT', '/tenants/:id', 'ops', async (ctx) => ok(await tenants.updateTenant(p(ctx), ctx.data)))
route('PATCH', '/tenants/:id/status', 'ops', async (ctx) =>
  ok(await tenants.setTenantStatus(p(ctx), v(ctx.data?.status))),
)

// ------------------------------------------------------------------ properties
route('GET', '/properties', 'owner', async (ctx) => {
  const result = await properties.listProperties(
    ctx.principal.uid,
    ctx.principal.role,
    ctx.q,
    query(ctx, 'search'),
    query(ctx, 'status'),
  )
  return list(result.items, meta(ctx.q, result.total))
})
route('GET', '/properties/deleted', 'owner', async (ctx) => {
  const result = await properties.listDeletedProperties(ctx.q)
  return list(result.items, meta(ctx.q, result.total))
})
route('POST', '/properties', 'owner', async (ctx) => created(await properties.createProperty(ctx.principal.uid, ctx.data)))
route('GET', '/properties/:id', 'owner', async (ctx) =>
  ok(await properties.getProperty(p(ctx), ctx.principal.uid, ctx.principal.role)),
)
route('PUT', '/properties/:id', 'owner', async (ctx) =>
  ok(await properties.updateProperty(p(ctx), ctx.principal.uid, ctx.principal.role, ctx.data)),
)
route('DELETE', '/properties/:id', 'owner', async (ctx) => {
  await properties.deleteProperty(p(ctx))
  return noContent()
})
route('POST', '/properties/:id/restore', 'owner', async (ctx) => ok(await properties.restoreProperty(p(ctx))))

// ----------------------------------------------------------------------- users
route('GET', '/users', 'owner', async (ctx) => {
  const result = await auth.listUsers(ctx.q, query(ctx, 'search'))
  return list(result.items, meta(ctx.q, result.total))
})
route('POST', '/users', 'owner', async ({ data }) => created(await auth.createUser(data)))
route('PUT', '/users/:id', 'owner', async (ctx) => ok(await auth.updateUser(p(ctx), ctx.data)))
route('DELETE', '/users/:id', 'owner', async (ctx) => {
  await auth.deleteUser(p(ctx))
  return noContent()
})

// -------------------------------------------------------------------- dashboard
route('GET', '/dashboard', 'owner', async () => ok(await reports.dashboard()))
route('GET', '/reports/:kind/export', 'owner', async (ctx) => {
  const format = query(ctx, 'format') === 'pdf' ? 'pdf' : 'xlsx'
  const result = await reports.exportReport(p(ctx), dateFrom(ctx), dateTo(ctx), query(ctx, 'properti_id'), format)
  return binary(result)
})
route('GET', '/reports/:kind', 'owner', async (ctx) =>
  ok(await reports.reportData(p(ctx), dateFrom(ctx), dateTo(ctx), query(ctx, 'properti_id'))),
)

// -------------------------------------------------------------------- settings
route('GET', '/settings', 'owner', async (ctx) => ok(await settings.getSettings(ctx.principal.uid)))
route('GET', '/settings/banks', 'owner', async (ctx) => ok(await settings.listBanks(ctx.principal.uid)))
route('POST', '/settings/banks', 'owner', async (ctx) => created(await settings.createBank(ctx.principal.uid, ctx.data)))
route('DELETE', '/settings/banks/:id', 'owner', async (ctx) => {
  await settings.deleteBank(ctx.principal.uid, p(ctx))
  return noContent()
})
route('PUT', '/settings/:key', 'owner', async (ctx) => {
  await settings.putSetting(ctx.principal.uid, p(ctx), ctx.data)
  return ok({ message: 'Pengaturan disimpan' })
})

// ---------------------------------------------------------------------- upload
route('POST', '/upload', 'auth', async ({ req, data }) => {
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw new Error('Berkas tidak ditemukan')
  if (file.size > config.maxUploadBytes) throw new Error('Ukuran berkas terlalu besar')
  const url = await saveUpload(file)
  return created({ url, nama: file.name })
})

async function saveUpload(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer())
  if (config.cloudinaryCloudName && config.cloudinaryUploadPreset) {
    const form = new FormData()
    form.set('file', new Blob([bytes], { type: file.type || 'application/octet-stream' }), file.name)
    form.set('upload_preset', config.cloudinaryUploadPreset)
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/auto/upload`, {
      method: 'POST',
      body: form,
    })
    if (response.ok) {
      const result = await response.json()
      if (result.secure_url) return result.secure_url
    }
    console.warn('[upload] Cloudinary gagal, memakai data URL:', response.status)
  }
  // Fallback yang tetap bekerja di filesystem serverless yang read-only.
  return `data:${file.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`
}

function binary(result: { bytes: Buffer; filename: string; contentType?: string }) {
  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      'Content-Type': result.contentType ?? 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.bytes.length),
    },
  })
}

function dateFrom(ctx: Ctx): string {
  return query(ctx, 'from') || new Date(Date.now() - 15552000000).toISOString().slice(0, 10)
}

function dateTo(ctx: Ctx): string {
  return query(ctx, 'to') || new Date().toISOString().slice(0, 10)
}

function compile(pattern: string): RegExp {
  const escaped = pattern.split('/').map((segment) =>
    segment.startsWith(':') ? '([^/]+)' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  )
  return new RegExp(`^${escaped.join('/')}$`)
}

const compiled = routes.map((route) => ({ ...route, regex: compile(route.pattern) }))

async function principal(req: NextRequest): Promise<Claims | null> {
  const header = req.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('bearer ')) return null
  const claims = await verifyToken(header.slice(7).trim(), config.jwtSecret)
  return claims?.typ === 'access' ? claims : null
}

function authorize(access: Access, user: Claims | null) {
  if (access === 'public') return
  if (!user) throw unauthorized('Autentikasi diperlukan')
  if (access === 'ops' && !['owner', 'manager', 'super_admin'].includes(user.role)) {
    throw forbidden('Akses ditolak')
  }
  if (access === 'owner' && !['owner', 'super_admin'].includes(user.role)) {
    throw forbidden('Akses ditolak')
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Accept,Authorization,Content-Type',
      'Access-Control-Max-Age': '300',
    },
  })
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return dispatch(request, params.path)
}
export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  return dispatch(request, params.path)
}
export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
  return dispatch(request, params.path)
}
export async function PATCH(request: NextRequest, { params }: { params: { path: string[] } }) {
  return dispatch(request, params.path)
}
export async function DELETE(request: NextRequest, { params }: { params: { path: string[] } }) {
  return dispatch(request, params.path)
}

async function dispatch(request: NextRequest, segments: string[]): Promise<Response> {
  try {
    await ensureDatabase()
    const url = new URL(request.url)
    const path = `/${(segments ?? []).join('/')}`
    const match = compiled.find((item) => item.method === request.method && item.regex.test(path))
    if (!match) return fail(new Error('Endpoint tidak ditemukan'))

    const user = await principal(request)
    authorize(match.access, user)
    const values = match.regex.exec(path)?.slice(1).map(decodeURIComponent) ?? []
    const needsBody = ['POST', 'PUT', 'PATCH'].includes(request.method)
    const data = needsBody && match.pattern !== '/upload' ? await body(request) : {}
    const ctx: Ctx = {
      req: request,
      url,
      params: values,
      principal: user!,
      data,
      q: pagination(url),
    }
    const response = await match.handle(ctx)
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Expose-Headers', 'Content-Disposition')
    return response
  } catch (error) {
    const response = fail(error)
    response.headers.set('Access-Control-Allow-Origin', '*')
    return response
  }
}
