import { exec, query, queryOne, scalar } from '@/lib/server/db'
import { badRequest, conflict, forbidden, internal, notFound, type Paginated, type Pagination } from '@/lib/server/http'
import { mail, notifyAdmins, notifyTenantUser } from '@/lib/server/notify'
import { optional, parseDate } from '@/lib/server/util'

const allowedPaymentMethods = ['transfer_bank', 'cash', 'ewallet']

function internalError(error: unknown) {
  return internal(error instanceof Error ? error.message : String(error))
}

function nowUTCDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function listPayments(
  invoiceID: string,
  status: string,
  q: Pagination,
): Promise<Paginated<any>> {
  const conditions: string[] = ['1=1']
  const args: unknown[] = []
  if (invoiceID) {
    args.push(invoiceID)
    conditions.push('p.tagihan_id = $1')
  }
  if (status) {
    args.push(status)
    conditions.push(`p.status = $${args.length}`)
  }
  const where = conditions.join(' AND ')

  const total = Number((await scalar<number>(`SELECT count(*) FROM payments p WHERE ${where}`, args)) ?? 0)
  const sql = `SELECT p.*, i.nomor_invoice, t.nama_lengkap AS nama_penyewa
    FROM payments p JOIN invoices i ON i.id=p.tagihan_id JOIN tenants t ON t.id=i.penyewa_id
    WHERE ${where} ORDER BY p.created_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`
  const items = await query(sql, [...args, q.limit, q.offset])
  return { items, total }
}

export async function getPayment(id: string): Promise<any> {
  const row = await queryOne(
    `SELECT p.*, i.nomor_invoice FROM payments p JOIN invoices i ON i.id=p.tagihan_id WHERE p.id=$1`,
    [id],
  )
  if (!row) throw notFound('Pembayaran tidak ditemukan')
  return row
}

async function canAccess(userID: string, role: string, invoiceID: string): Promise<void> {
  if (role === 'tenant') {
    const owner = await scalar<string>(
      `SELECT coalesce(user_id::text,'') FROM tenants WHERE id=(SELECT penyewa_id FROM invoices WHERE id=$1)`,
      [invoiceID],
    )
    if (!owner || String(owner) !== String(userID)) throw forbidden('Tagihan bukan milik Anda')
  }
}

async function recomputeInvoice(invoiceID: string, inv: any): Promise<void> {
  let paid: number
  try {
    paid = Number((await scalar<number>(
      `SELECT coalesce(sum(jumlah),0) FROM payments WHERE tagihan_id=$1 AND status='verified'`,
      [invoiceID],
    )) ?? 0)
  } catch (error) {
    throw internalError(error)
  }
  const method = await scalar<string>(
    `SELECT metode FROM payments WHERE tagihan_id=$1 AND status='verified' ORDER BY created_at DESC LIMIT 1`,
    [invoiceID],
  )

  let status = 'sebagian'
  if (paid >= Number(inv.total ?? 0)) status = 'dibayar'
  const due = inv.tanggal_jatuh_tempo instanceof Date
    ? inv.tanggal_jatuh_tempo
    : new Date(`${String(inv.tanggal_jatuh_tempo ?? '').slice(0, 10)}T00:00:00Z`)
  if (paid > 0 && due.getTime() < Date.now() && status === 'sebagian') status = 'terlambat'

  try {
    if (status === 'dibayar') {
      await exec(`UPDATE invoices SET status=$1, tanggal_bayar=now(), metode_bayar=$2 WHERE id=$3`, [
        status,
        method,
        invoiceID,
      ])
    } else {
      await exec(`UPDATE invoices SET status=$1, metode_bayar=$2 WHERE id=$3`, [status, method, invoiceID])
    }
  } catch (error) {
    throw internalError(error)
  }
}

export async function createPayment(
  userID: string,
  role: string,
  input: any,
  isAdmin: boolean,
): Promise<any> {
  await canAccess(userID, role, String(input?.tagihan_id ?? ''))

  const jumlah = Number(input?.jumlah ?? 0)
  if (jumlah <= 0) throw badRequest('Jumlah pembayaran harus lebih dari 0')
  const metode = String(input?.metode ?? '')
  if (!allowedPaymentMethods.includes(metode)) throw badRequest('Metode pembayaran tidak valid')
  if (metode === 'transfer_bank' && String(input?.bukti_bayar ?? '').trim() === '') {
    throw badRequest('Bukti transfer wajib diunggah')
  }

  let date = nowUTCDate()
  try {
    date = parseDate(String(input?.tanggal_bayar ?? ''))
  } catch {
    // Go: tanggal kosong/invalid -> timeNowUTC()
  }

  const inv = await queryOne(`SELECT * FROM invoices WHERE id=$1`, [input?.tagihan_id])
  if (!inv) throw notFound('Tagihan tidak ditemukan')
  if (inv.status === 'batal' || inv.status === 'dibayar') {
    throw conflict('Tagihan tidak menerima pembayaran baru')
  }

  const status = isAdmin ? 'verified' : 'pending'
  const verifier = isAdmin ? userID : null

  let payment: any
  try {
    payment = await queryOne(
      `INSERT INTO payments (tagihan_id, jumlah, metode, bukti_bayar, tanggal_bayar, status, diverifikasi_oleh, catatan_admin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        input.tagihan_id,
        jumlah,
        metode,
        optional(input?.bukti_bayar),
        date,
        status,
        verifier,
        optional(input?.catatan_admin),
      ],
    )
  } catch (error) {
    throw internalError(error)
  }
  if (!payment) throw internalError(new Error('Gagal menyimpan pembayaran'))

  if (isAdmin) {
    await recomputeInvoice(String(input.tagihan_id), inv)
  } else {
    try {
      await notifyAdmins(
        'Bukti pembayaran baru',
        `Pembayaran untuk invoice ${inv.nomor_invoice} menunggu verifikasi.`,
        'payment_pending',
        { tagihan_id: input.tagihan_id },
      )
    } catch {
      // NotifyAdmins di Go tidak Mengembalikan galat
    }
  }
  return getPayment(payment.id)
}

export async function verifyPayment(id: string, adminID: string): Promise<any> {
  const payment = await getPayment(id)
  if (payment.status === 'verified') throw conflict('Pembayaran sudah diverifikasi')

  try {
    await exec(`UPDATE payments SET status='verified', diverifikasi_oleh=$1, catatan_admin=NULL WHERE id=$2`, [
      adminID,
      id,
    ])
  } catch (error) {
    throw internalError(error)
  }

  const inv = await queryOne(`SELECT * FROM invoices WHERE id=$1`, [payment.tagihan_id])
  if (!inv) throw internalError(new Error('Tagihan tidak ditemukan'))
  await recomputeInvoice(String(payment.tagihan_id), inv)

  try {
    const tenant = await queryOne<{ email: string }>(`SELECT email FROM tenants WHERE id=$1`, [inv.penyewa_id])
    await mail.paymentVerified(String(tenant?.email ?? ''), String(inv.nomor_invoice), Number(payment.jumlah))
  } catch {
    // Go mengabaikan galat email
  }
  try {
    await notifyTenantUser(
      inv.penyewa_id,
      'Pembayaran diverifikasi',
      'Pembayaran Anda telah diverifikasi.',
      'payment_verified',
      { invoice_id: inv.id },
    )
  } catch {
    // Go mengabaikan galat notifikasi
  }
  return getPayment(id)
}

export async function rejectPayment(id: string, adminID: string, reason: string): Promise<any> {
  await getPayment(id)
  if (String(reason ?? '').trim() === '') throw badRequest('Alasan penolakan wajib diisi')
  try {
    await exec(`UPDATE payments SET status='rejected', diverifikasi_oleh=$1, catatan_admin=$2 WHERE id=$3`, [
      adminID,
      reason,
      id,
    ])
  } catch (error) {
    throw internalError(error)
  }
  return getPayment(id)
}
