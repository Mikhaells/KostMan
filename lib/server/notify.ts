import { config } from './config'
import { exec, query } from './db'

export async function createNotification(
  userId: string,
  judul: string,
  isi: string,
  tipe: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (!userId) return
  await exec(
    `INSERT INTO notifications (user_id, judul, isi, tipe, data) VALUES ($1,$2,$3,$4,$5)`,
    [userId, judul, isi, tipe, JSON.stringify(data ?? {})],
  )
}

export async function notifyAdmins(
  judul: string,
  isi: string,
  tipe: string,
  data: Record<string, unknown> = {},
  ownerID = '',
): Promise<void> {
  // ownerID kosong = broadcast global (khusus super_admin). Jika diisi, hanya
  // owner dan manager milik owner tersebut yang mendapat notifikasi.
  const sql = ownerID
    ? `SELECT id FROM users WHERE owner_id=$1 AND role IN ('owner','manager') AND deleted_at IS NULL AND status='aktif'`
    : `SELECT id FROM users WHERE role IN ('owner','manager','super_admin') AND deleted_at IS NULL AND status='aktif'`
  const ids = await query<{ id: string }>(sql, ownerID ? [ownerID] : [])
  await Promise.all(ids.map((row) => createNotification(row.id, judul, isi, tipe, data)))
}

export async function notifyTenantUser(
  tenantId: string,
  judul: string,
  isi: string,
  tipe: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const row = await queryOneUserId(tenantId)
  if (row) await createNotification(row, judul, isi, tipe, data)
}

async function queryOneUserId(tenantId: string): Promise<string | null> {
  const rows = await query<{ user_id: string | null }>(
    `SELECT coalesce(user_id::text,'') AS user_id FROM tenants WHERE id=$1`,
    [tenantId],
  )
  return rows[0]?.user_id || null
}

/** Resend HTTPS API works on Vercel; silently no-ops when not configured. */
export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  if (!config.resendApiKey || !to) return
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: config.smtpFrom, to: [to], subject, html }),
    })
    if (!response.ok) console.warn('[mail] Resend:', response.status, await response.text())
  } catch (error) {
    console.warn('[mail] gagal mengirim:', error)
  }
}

export const mail = {
  invoiceCreated: (to: string, no: string, total: number, due: string) =>
    sendMail(to, `Tagihan baru ${no}`, `<p>Tagihan <b>${no}</b> sebesar Rp${total.toLocaleString('id-ID')} jatuh tempo ${due}.</p>`),
  invoiceReminder: (to: string, no: string, total: number, due: string) =>
    sendMail(to, `Pengingat tagihan ${no}`, `<p>Tagihan <b>${no}</b> sebesar Rp${total.toLocaleString('id-ID')} jatuh tempo ${due}.</p>`),
  invoiceOverdue: (to: string, no: string, total: number) =>
    sendMail(to, `Tagihan terlambat ${no}`, `<p>Tagihan <b>${no}</b> sebesar Rp${total.toLocaleString('id-ID')} sudah terlambat.</p>`),
  paymentVerified: (to: string, no: string, amount: number) =>
    sendMail(to, `Pembayaran terverifikasi ${no}`, `<p>Pembayaran Rp${amount.toLocaleString('id-ID')} untuk ${no} telah diverifikasi.</p>`),
  ticketResolved: (to: string, no: string, note: string) =>
    sendMail(to, `Tiket ${no} selesai`, `<p>Tiket <b>${no}</b> telah diselesaikan. ${note ?? ''}</p>`),
}
