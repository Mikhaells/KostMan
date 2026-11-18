import { exec, query, queryOne } from '@/lib/server/db'
import { badRequest, internal, notFound } from '@/lib/server/http'

export const defaultSettings: Record<string, string> = {
  denda: `{"nominal":10000,"tipe":"harian","grace_period":3}`,
  reminder: `{"invoice_h":3,"kontrak_h":7}`,
  invoice_footer: 'Terima kasih atas pembayaran Anda.',
  kontrak_template: '<h1>Kontrak Sewa</h1><p>Nama penyewa: {{nama}}</p>',
  timezone: 'Asia/Jakarta',
  date_format: 'DD/MM/YYYY',
  branding: `{"nama":"KosMan","logo":""}`,
  notifikasi: `{"invoice_created":true,"invoice_reminder":true,"payment_verified":true,"ticket_resolved":true}`,
}

/** Go menyimpan value sebagai json.RawMessage; nilai yang bukan JSON dikembalikan apa adanya. */
function parseValue(value: unknown): any {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export async function getSettings(ownerID: string): Promise<Record<string, any>> {
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(defaultSettings)) out[key] = value

  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value::text FROM settings WHERE owner_id=$1`,
    [ownerID],
  )
  for (const row of rows) {
    if (row.key && row.value != null) out[row.key] = row.value
  }

  for (const key of Object.keys(out)) out[key] = parseValue(out[key])
  return out
}

/** Menerima nilai JSON (objek/array/string/number) maupun teks JSON mentah. */
function toRawJson(value: unknown): string {
  if (typeof value !== 'string') return JSON.stringify(value)
  const trimmed = value.trim()
  if (/^[{\["0-9tfn-]/.test(trimmed)) {
    JSON.parse(trimmed) // melempar bila teks menyerupai JSON tetapi tidak valid
    return trimmed
  }
  return JSON.stringify(value)
}

export async function putSetting(ownerID: string, key: string, value: unknown): Promise<void> {
  if (!key || value === undefined || value === null || value === '') {
    throw badRequest('Key dan value wajib diisi')
  }

  let raw: string
  try {
    raw = toRawJson(value)
    JSON.parse(raw)
  } catch {
    throw badRequest('Value harus berupa JSON valid')
  }

  await exec(
    `INSERT INTO settings (owner_id, key, value) VALUES ($1,$2,$3)
     ON CONFLICT (owner_id, key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [ownerID, key, raw],
  )
}

export async function listBanks(ownerID: string): Promise<any[]> {
  return query(`SELECT * FROM bank_accounts WHERE owner_id=$1 ORDER BY is_primary DESC, created_at`, [ownerID])
}

export async function createBank(ownerID: string, input: any): Promise<any> {
  const bank = String(input?.bank ?? '')
  const nomorRekening = String(input?.nomor_rekening ?? '')
  const namaPemilik = String(input?.nama_pemilik ?? '')
  if (!bank || !nomorRekening || !namaPemilik) {
    throw badRequest('Bank, nomor rekening, dan nama pemilik wajib diisi')
  }
  const isPrimary = Boolean(input?.is_primary)

  let row: any
  try {
    row = await queryOne(
      `INSERT INTO bank_accounts (owner_id, bank, nomor_rekening, nama_pemilik, is_primary)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ownerID, bank, nomorRekening, namaPemilik, isPrimary],
    )
  } catch (error) {
    throw internal(error instanceof Error ? error.message : String(error))
  }

  if (isPrimary) {
    await exec(`UPDATE bank_accounts SET is_primary=FALSE WHERE owner_id=$1 AND id<>$2`, [ownerID, row.id]).catch(
      () => undefined,
    )
  }
  return row
}

export async function deleteBank(ownerID: string, id: string): Promise<void> {
  const affected = await exec(`DELETE FROM bank_accounts WHERE id=$1 AND owner_id=$2`, [id, ownerID])
  if (!affected) throw notFound('Rekening tidak ditemukan')
}
