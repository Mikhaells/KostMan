import { exec, query, queryOne, scalar } from '@/lib/server/db'
import { badRequest, conflict, internal, isUniqueViolation, notFound, type Paginated, type Pagination } from '@/lib/server/http'
import { mail, notifyTenantUser } from '@/lib/server/notify'
import { invoicePdfBuffer } from '@/lib/server/pdf'
import { json, nextNumber, optional, parseDate, scopeOwner, statusOrDefault } from '@/lib/server/util'

const INVOICE_SELECT = `SELECT i.*, t.nama_lengkap AS nama_penyewa, p.nama AS nama_properti, r.nomor AS nomor_kamar
  FROM invoices i JOIN tenants t ON t.id=i.penyewa_id JOIN properties p ON p.id=i.properti_id
  JOIN contracts c ON c.id=i.kontrak_id JOIN rooms r ON r.id=c.kamar_id`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function internalError(error: unknown) {
  return internal(error instanceof Error ? error.message : String(error))
}

function formatDue(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day} ${MONTHS[Number(month) - 1] ?? ''} ${year}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function calcTotal(input: any): number {
  let total = Number(input?.jumlah_pokok ?? 0) - Number(input?.diskon ?? 0) + Number(input?.denda ?? 0)
  for (const item of Array.isArray(input?.item_tambahan) ? input.item_tambahan : []) {
    total += Number(item?.jumlah ?? 0)
  }
  return total < 0 ? 0 : total
}

export async function listInvoices(
  tenantID: string,
  propertyID: string,
  status: string,
  q: Pagination,
  ownerID: string,
): Promise<Paginated<any>> {
  const conditions: string[] = ['1=1']
  const args: unknown[] = []
  scopeOwner(conditions, args, ownerID, 'i.owner_id')
  const add = (column: string, value: string) => {
    if (value) {
      args.push(value)
      conditions.push(`${column} = $${args.length}`)
    }
  }
  add('i.penyewa_id', tenantID)
  add('i.properti_id', propertyID)
  add('i.status', status)
  const where = conditions.join(' AND ')

  const total = Number((await scalar<number>(`SELECT count(*) FROM invoices i WHERE ${where}`, args)) ?? 0)
  const sql = `${INVOICE_SELECT} WHERE ${where} ORDER BY i.tanggal_jatuh_tempo DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`
  const items = await query(sql, [...args, q.limit, q.offset])
  return { items, total }
}

export async function getInvoice(id: string, ownerID = ''): Promise<any> {
  const args: unknown[] = [id]
  let sql = `${INVOICE_SELECT} WHERE i.id=$1`
  if (ownerID) {
    sql += ` AND i.owner_id=$2`
    args.push(ownerID)
  }
  const row = await queryOne(sql, args)
  if (!row) throw notFound('Tagihan tidak ditemukan')
  return row
}

export async function createInvoice(input: any, ownerID: string): Promise<any> {
  const start = parseDate(String(input?.periode_mulai ?? ''))
  const end = parseDate(String(input?.periode_selesai ?? ''))
  const due = parseDate(String(input?.tanggal_jatuh_tempo ?? ''))
  if (end < start) throw badRequest('Periode selesai harus setelah periode mulai')

  const contractArgs: unknown[] = [input?.kontrak_id]
  let contractSql = `SELECT * FROM contracts WHERE id=$1`
  if (ownerID) {
    contractSql += ` AND owner_id=$2`
    contractArgs.push(ownerID)
  }
  const contract = await queryOne(contractSql, contractArgs)
  if (!contract) throw badRequest('Kontrak tidak ditemukan')
  if (contract.status !== 'aktif') throw conflict('Tagihan hanya bisa dibuat untuk kontrak aktif')

  const jumlahPokok = Number(input?.jumlah_pokok ?? 0) > 0
    ? Number(input.jumlah_pokok)
    : Number(contract.harga_sewa ?? 0)

  const roomArgs: unknown[] = [contract.kamar_id]
  let roomSql = `SELECT properti_id FROM rooms WHERE id=$1`
  if (ownerID) {
    roomSql += ` AND owner_id=$2`
    roomArgs.push(ownerID)
  }
  const room = await queryOne<{ properti_id: string }>(roomSql, roomArgs)
  if (!room) throw internalError(new Error('Gagal mengambil properti kamar'))

  const status = statusOrDefault(String(input?.status ?? ''), ['draft', 'terkirim'], 'terkirim')
  const number = await nextNumber('invoices', 'nomor_invoice', `INV-${start.slice(0, 7).replace('-', '')}-`, ownerID)
  const total = calcTotal({ ...input, jumlah_pokok: jumlahPokok })

  let inv: any
  try {
    inv = await queryOne(
      `INSERT INTO invoices (owner_id, nomor_invoice, kontrak_id, penyewa_id, properti_id, periode_mulai, periode_selesai,
        jumlah_pokok, item_tambahan, diskon, denda, total, tanggal_jatuh_tempo, status, catatan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        ownerID || contract.owner_id || null,
        number,
        contract.id,
        contract.penyewa_id,
        room.properti_id,
        start,
        end,
        jumlahPokok,
        json(input?.item_tambahan),
        Number(input?.diskon ?? 0),
        Number(input?.denda ?? 0),
        total,
        due,
        status,
        optional(input?.catatan),
      ],
    )
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Nomor invoice duplikat, coba lagi')
    throw internalError(error)
  }
  if (!inv) throw internalError(new Error('Gagal membuat tagihan'))

  if (status === 'terkirim') {
    // Go mengirim email di goroutine terpisah dan mengabaikan galatnya.
    void (async () => {
      try {
        const tenant = await queryOne<{ email: string }>(`SELECT email FROM tenants WHERE id=$1`, [contract.penyewa_id])
        if (tenant?.email) {
          await mail.invoiceCreated(tenant.email, String(inv.nomor_invoice), Number(inv.total), formatDue(due))
        }
      } catch {
        // diabaikan, sama seperti goroutine di Go
      }
    })()
    try {
      await notifyTenantUser(
        contract.penyewa_id,
        `Tagihan baru ${inv.nomor_invoice}`,
        'Tagihan baru telah dibuat dan menunggu pembayaran.',
        'invoice_created',
      )
    } catch {
      // Go mengabaikan galat notifikasi
    }
  }

  return getInvoice(inv.id, ownerID)
}

export async function generateMonthlyInvoices(ownerID = ''): Promise<number> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const start = `${year}-${pad(month + 1)}-01`
  const end = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`
  const due = `${year}-${pad(month + 1)}-10`

  const args: unknown[] = []
  let sql = `SELECT id, penyewa_id, harga_sewa, owner_id FROM contracts WHERE status='aktif'`
  if (ownerID) {
    sql += ` AND owner_id=$1`
    args.push(ownerID)
  }
  const contracts = await query<{ id: string; penyewa_id: string; harga_sewa: number; owner_id: string }>(sql, args)

  let created = 0
  for (const contract of contracts) {
    const invOwner = ownerID || String(contract.owner_id ?? '')
    const existsArgs: unknown[] = [contract.id, start]
    let existsSql = `SELECT count(*) FROM invoices WHERE kontrak_id=$1 AND periode_mulai=$2`
    if (invOwner) {
      existsSql += ` AND owner_id=$3`
      existsArgs.push(invOwner)
    }
    const exists = Number((await scalar<number>(existsSql, existsArgs)) ?? 0)
    if (exists > 0) continue

    try {
      await createInvoice({
        kontrak_id: contract.id,
        periode_mulai: start,
        periode_selesai: end,
        jumlah_pokok: Number(contract.harga_sewa ?? 0),
        tanggal_jatuh_tempo: due,
        status: 'terkirim',
      }, invOwner)
      created++
    } catch {
      // Go juga mengabaikan galat Create per kontrak
    }
  }
  return created
}

export async function updateInvoice(id: string, input: any, ownerID: string): Promise<any> {
  const inv = await getInvoice(id, ownerID)
  if (inv.status === 'dibayar' || inv.status === 'batal') {
    throw conflict('Tagihan yang sudah dibayar/dibatalkan tidak bisa diubah')
  }

  const start = parseDate(String(input?.periode_mulai ?? ''))
  const end = parseDate(String(input?.periode_selesai ?? ''))
  const due = parseDate(String(input?.tanggal_jatuh_tempo ?? ''))
  const total = calcTotal({ ...input, jumlah_pokok: inv.jumlah_pokok })

  try {
    await queryOne(
      `UPDATE invoices SET periode_mulai=$1, periode_selesai=$2, item_tambahan=$3, diskon=$4, denda=$5,
        total=$6, tanggal_jatuh_tempo=$7, catatan=$8 WHERE id=$9 RETURNING *`,
      [
        start,
        end,
        json(input?.item_tambahan),
        Number(input?.diskon ?? 0),
        Number(input?.denda ?? 0),
        total,
        due,
        optional(input?.catatan),
        id,
      ],
    )
  } catch (error) {
    throw internalError(error)
  }
  return getInvoice(id, ownerID)
}

export async function voidInvoice(id: string, ownerID: string): Promise<void> {
  const inv = await getInvoice(id, ownerID)
  if (inv.status === 'dibayar') {
    throw conflict('Tagihan yang sudah dibayar tidak bisa dihapus, gunakan void dengan pembatalan pembayaran')
  }
  const args: unknown[] = [id]
  let sql = `UPDATE invoices SET status='batal' WHERE id=$1`
  if (ownerID) {
    sql += ` AND owner_id=$2`
    args.push(ownerID)
  }
  const affected = await exec(sql, args)
  if (affected === 0) throw notFound('Tagihan tidak ditemukan')
}

/** Aturan denda per properti — sama dengan BillingService.dendaFor di Go. */
async function dendaFor(propertyID: string): Promise<{ nominal: number; tipe: string; grace_period: number }> {
  const config = { nominal: 10000, tipe: 'harian', grace_period: 3 }
  if (!propertyID) return config
  const owner = await queryOne<{ owner_id: string }>(`SELECT owner_id FROM properties WHERE id=$1`, [propertyID])
  if (!owner) return config
  const row = await queryOne<{ value: unknown }>(
    `SELECT value FROM settings WHERE owner_id=$1 AND key='denda'`,
    [owner.owner_id],
  )
  if (!row || row.value == null) return config
  try {
    const stored = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    if (Number(stored?.nominal) > 0) config.nominal = Number(stored.nominal)
    if (stored?.tipe) config.tipe = String(stored.tipe)
    config.grace_period = Number(stored?.grace_period ?? 0)
  } catch {
    // Go mengabaikan JSON yang rusak dan memakai default.
  }
  return config
}

function dueDate(value: unknown): Date {
  if (value instanceof Date) return value
  return new Date(`${String(value ?? '').slice(0, 10)}T00:00:00Z`)
}

/** Job harian: tandai terlambat, tambah denda, kirim email. */
export async function markOverdueInvoices(): Promise<number> {
  const rows = await query<{
    id: string
    properti_id: string
    total: number
    tanggal_jatuh_tempo: unknown
    email: string
  }>(
    `SELECT i.id, i.properti_id, i.total, i.tanggal_jatuh_tempo, t.email
     FROM invoices i JOIN tenants t ON t.id=i.penyewa_id
     WHERE i.status IN ('terkirim','sebagian') AND i.tanggal_jatuh_tempo < now()::date`,
  )

  let count = 0
  for (const row of rows) {
    const days = Math.floor((Date.now() - dueDate(row.tanggal_jatuh_tempo).getTime()) / 86_400_000)
    const rule = await dendaFor(row.properti_id)
    if (days > rule.grace_period) {
      let units = days - rule.grace_period
      if (rule.tipe === 'mingguan') units = Math.floor(units / 7)
      if (rule.tipe === 'bulanan') units = Math.floor(units / 30)
      const fine = units * rule.nominal
      if (fine > 0) {
        await exec(`UPDATE invoices SET denda=denda+$1, total=total+$1 WHERE id=$2`, [fine, row.id])
      }
    }
    const affected = await exec(`UPDATE invoices SET status='terlambat' WHERE id=$1`, [row.id])
    if (affected > 0) count++
    await mail.invoiceOverdue(String(row.email ?? ''), row.id, Number(row.total ?? 0))
  }
  return count
}

/** Job harian: pengingat H-<days> sebelum jatuh tempo. */
export async function sendDueReminders(days: number): Promise<number> {
  const rows = await query<{
    nomor_invoice: string
    total: number
    tanggal_jatuh_tempo: unknown
    email: string
  }>(
    `SELECT i.nomor_invoice, i.total, i.tanggal_jatuh_tempo, t.email
     FROM invoices i JOIN tenants t ON t.id=i.penyewa_id
     WHERE i.status IN ('terkirim','sebagian')
       AND i.tanggal_jatuh_tempo = (now() + ($1 || ' days')::interval)::date`,
    [days],
  )
  for (const row of rows) {
    await mail.invoiceReminder(
      String(row.email ?? ''),
      String(row.nomor_invoice ?? ''),
      Number(row.total ?? 0),
      formatDue(dueDate(row.tanggal_jatuh_tempo).toISOString().slice(0, 10)),
    )
  }
  return rows.length
}

export async function invoicePdf(id: string, ownerID: string): Promise<{ bytes: Buffer; filename: string }> {
  const inv = await getInvoice(id, ownerID)
  const tenant = await queryOne(`SELECT * FROM tenants WHERE id=$1`, [inv.penyewa_id])
  if (!tenant) throw internal('Penyewa tidak ditemukan')
  const bytes = await invoicePdfBuffer(inv, tenant, String(inv.nama_properti ?? ''))
  return { bytes, filename: `invoice-${inv.nomor_invoice}.pdf` }
}
