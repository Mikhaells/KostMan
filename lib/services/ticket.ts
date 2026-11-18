import { exec, query, queryOne, scalar } from '@/lib/server/db'
import {
  badRequest,
  conflict,
  forbidden,
  internal,
  notFound,
  type Paginated,
  type Pagination,
} from '@/lib/server/http'
import { createNotification, mail, notifyAdmins } from '@/lib/server/notify'
import { json, nextNumber, optional, scopeOwner } from '@/lib/server/util'

const allowedCategories = new Set(['listrik', 'air', 'furniture', 'kebersihan', 'lainnya'])
const allowedPriorities = new Set(['rendah', 'sedang', 'tinggi', 'urgent'])
const allowedTicketStatus = new Set(['open', 'in_progress', 'resolved', 'closed'])

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function createTicket(userID: string, input: any, ownerID: string): Promise<any> {
  const judulRaw = String(input?.judul ?? '')
  const deskripsiRaw = String(input?.deskripsi ?? '')
  const judul = optional(judulRaw)
  const deskripsi = optional(deskripsiRaw)
  if (!judul || !deskripsi) throw badRequest('Judul dan deskripsi wajib diisi')

  const kategori = String(input?.kategori ?? '')
  if (!allowedCategories.has(kategori)) throw badRequest('Kategori tidak valid')

  let prioritas = String(input?.prioritas ?? '')
  if (prioritas === '') prioritas = 'sedang'
  if (!allowedPriorities.has(prioritas)) throw badRequest('Prioritas tidak valid')

  const foto: unknown[] = Array.isArray(input?.foto) ? input.foto : []
  if (foto.length > 3) throw badRequest('Maksimal 3 foto tiket')

  const tenantArgs: unknown[] = [userID]
  let tenantSql = `SELECT id FROM tenants WHERE user_id=$1`
  if (ownerID) {
    tenantSql += ` AND owner_id=$2`
    tenantArgs.push(ownerID)
  }
  const tenant = await queryOne<{ id: string }>(tenantSql, tenantArgs).catch(() => null)
  if (!tenant) throw forbidden('Hanya penyewa yang bisa mengajukan tiket')

  const contractArgs: unknown[] = [tenant.id]
  let contractSql = `SELECT r.id, r.properti_id FROM contracts c JOIN rooms r ON r.id=c.kamar_id
     WHERE c.penyewa_id=$1 AND c.status='aktif'`
  if (ownerID) {
    contractSql += ` AND c.owner_id=$2`
    contractArgs.push(ownerID)
  }
  const contract = await queryOne<{ id: string; properti_id: string }>(
    `${contractSql} LIMIT 1`, contractArgs,
  ).catch(() => null)
  if (!contract) throw conflict('Tidak ada kontrak aktif untuk mengajukan tiket')

  const now = new Date()
  const prefix = `TKT-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}-`
  let number: string
  try {
    number = await nextNumber('tickets', 'nomor_tiket', prefix, ownerID)
  } catch (error) {
    throw internal(errorMessage(error))
  }

  let created: any
  try {
    created = await queryOne(
      `INSERT INTO tickets (owner_id, nomor_tiket, penyewa_id, kamar_id, properti_id, judul, deskripsi, kategori, prioritas, foto, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open') RETURNING *`,
      [ownerID || null, number, tenant.id, contract.id, contract.properti_id, judul, deskripsi, kategori, prioritas, json(foto)],
    )
  } catch (error) {
    throw internal(errorMessage(error))
  }

  try {
    await notifyAdmins(`Tiket baru ${created.nomor_tiket}`, judulRaw, 'ticket_created', {
      ticket_id: created.id,
      prioritas: created.prioritas,
    }, ownerID)
  } catch {
    // notifikasi tidak menggagalkan pembuatan tiket
  }

  return getTicket(created.id, ownerID)
}

export async function listTickets(
  userID: string,
  role: string,
  status: string,
  category: string,
  priority: string,
  q: Pagination,
  ownerID: string,
): Promise<Paginated<any>> {
  const conditions: string[] = ['1=1']
  const args: unknown[] = []
  scopeOwner(conditions, args, ownerID, 't.owner_id')
  if (role === 'tenant') {
    args.push(userID)
    conditions.push('t.penyewa_id = (SELECT id FROM tenants WHERE user_id=$1)')
  }
  const add = (col: string, val?: string | null) => {
    const value = val ?? ''
    if (value !== '') {
      args.push(value)
      conditions.push(`${col} = $${args.length}`)
    }
  }
  add('t.status', status)
  add('t.kategori', category)
  add('t.prioritas', priority)
  const where = conditions.join(' AND ')

  const total = Number((await scalar<number>(`SELECT count(*) FROM tickets t WHERE ${where}`, args)) ?? 0)

  const limitIndex = args.length + 1
  const offsetIndex = args.length + 2
  args.push(q.limit, q.offset)
  const items = await query(
    `SELECT t.*, tn.nama_lengkap AS nama_penyewa, p.nama AS nama_properti
     FROM tickets t JOIN tenants tn ON tn.id=t.penyewa_id JOIN properties p ON p.id=t.properti_id
     WHERE ${where}
     ORDER BY CASE t.prioritas WHEN 'urgent' THEN 0 WHEN 'tinggi' THEN 1 WHEN 'sedang' THEN 2 ELSE 3 END, t.created_at DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    args,
  )
  return { items, total }
}

export async function getTicket(id: string, ownerID = ''): Promise<any> {
  const args: unknown[] = [id]
  let sql = `SELECT t.*, tn.nama_lengkap AS nama_penyewa, p.nama AS nama_properti
     FROM tickets t JOIN tenants tn ON tn.id=t.penyewa_id JOIN properties p ON p.id=t.properti_id WHERE t.id=$1`
  if (ownerID) {
    sql += ` AND t.owner_id=$2`
    args.push(ownerID)
  }
  const ticket = await queryOne(sql, args).catch(() => null)
  if (!ticket) throw notFound('Tiket tidak ditemukan')
  return ticket
}

export async function updateTicket(id: string, input: any, ownerID: string): Promise<any> {
  const t = await getTicket(id, ownerID)

  const inStatus = String(input?.status ?? '')
  let status = String(t.status ?? '')
  if (inStatus !== '') {
    if (!allowedTicketStatus.has(inStatus)) throw badRequest('Status tiket tidak valid')
    status = inStatus
  }

  const inPrioritas = String(input?.prioritas ?? '')
  let priority = String(t.prioritas ?? '')
  if (inPrioritas !== '') {
    if (!allowedPriorities.has(inPrioritas)) throw badRequest('Prioritas tidak valid')
    priority = inPrioritas
  }

  const inAssignedTo = String(input?.assigned_to ?? '')
  const assignedTo = inAssignedTo !== '' ? inAssignedTo : null

  const inResolusi = String(input?.resolusi ?? '')
  let resolusi: string | null = t.resolusi ?? null
  if (inResolusi !== '') resolusi = inResolusi

  const resolvedAt =
    (status === 'resolved' || status === 'closed') && t.resolved_at == null
      ? new Date()
      : t.resolved_at ?? null

  try {
    await exec(
      `UPDATE tickets SET status=$1, prioritas=$2, assigned_to=$3, resolusi=$4, resolved_at=$5 WHERE id=$6`,
      [status, priority, assignedTo, resolusi, resolvedAt, id],
    )
  } catch (error) {
    throw internal(errorMessage(error))
  }

  const updated = await getTicket(id, ownerID)

  const tenantUser = await queryOne<{ user_id: string | null }>(
    `SELECT coalesce(user_id::text,'') AS user_id FROM tenants WHERE id=$1`,
    [t.penyewa_id],
  ).catch(() => null)
  const userID = tenantUser?.user_id || ''
  if (userID !== '') {
    try {
      await createNotification(
        userID,
        `Tiket ${t.nomor_tiket} diperbarui`,
        `Status tiket Anda: ${status}`,
        'ticket_updated',
        { ticket_id: id },
      )
    } catch {
      // notifikasi tidak menggagalkan pembaruan
    }
  }

  if (status === 'resolved') {
    const emailRow = await queryOne<{ email: string }>(`SELECT email FROM tenants WHERE id=$1`, [t.penyewa_id]).catch(
      () => null,
    )
    try {
      await mail.ticketResolved(emailRow?.email || '', t.nomor_tiket, resolusi ?? '')
    } catch {
      // kegagalan email tidak menggagalkan pembaruan
    }
  }

  return updated
}

export async function ticketStats(ownerID: string): Promise<Record<string, number>> {
  const args: unknown[] = []
  const scope = ownerID ? ` WHERE owner_id=$1` : ''
  if (ownerID) args.push(ownerID)
  const rows = await query<{ status: string; count: number }>(
    `SELECT status, count(*) FROM tickets${scope} GROUP BY status`, args,
  )
  const out: Record<string, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0, urgent: 0 }
  for (const row of rows) {
    if (row?.status) out[row.status] = Number(row.count ?? 0)
  }
  const urgentArgs = [...args]
  const urgentScope = ownerID ? ` AND owner_id=$1` : ''
  const urgent = Number(
    (await scalar<number>(
      `SELECT count(*) FROM tickets WHERE prioritas='urgent' AND status IN ('open','in_progress')${urgentScope}`,
      urgentArgs,
    )) ?? 0,
  )
  out.urgent = urgent
  return out
}
