import { config } from '@/lib/server/config'
import { decrypt } from '@/lib/server/crypto'
import { exec, query, queryOne, scalar, withTx } from '@/lib/server/db'
import { badRequest, conflict, internal, isUniqueViolation, notFound, type Paginated, type Pagination } from '@/lib/server/http'
import { contractPdfBuffer } from '@/lib/server/pdf'
import { addDays, isoDate, nextNumber, optional, parseDate } from '@/lib/server/util'

const CONTRACT_SELECT = `SELECT c.*, t.nama_lengkap AS nama_penyewa, r.nomor AS nomor_kamar, p.nama AS nama_properti
  FROM contracts c JOIN tenants t ON t.id=c.penyewa_id JOIN rooms r ON r.id=c.kamar_id JOIN properties p ON p.id=r.properti_id`

function internalError(error: unknown) {
  return internal(error instanceof Error ? error.message : String(error))
}

/** DATE dari pg bisa Date (tengah malam lokal) atau string YYYY-MM-DD. */
function dateOnly(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  return String(value ?? '').slice(0, 10)
}

/** time.AddDate(0, n, 0) — normalisasi tanggal lebih (31 Jan + 1 bulan = 2/3 Mar). */
function addMonths(value: string, months: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  return isoDate(date)
}

function yyyymm(value: string): string {
  return value.slice(0, 7).replace('-', '')
}

export async function listContracts(
  tenantID: string,
  roomID: string,
  propertyID: string,
  status: string,
  q: Pagination,
): Promise<Paginated<any>> {
  const conditions: string[] = ['1=1']
  const args: unknown[] = []
  const add = (column: string, value: string) => {
    if (value) {
      args.push(value)
      conditions.push(`${column} = $${args.length}`)
    }
  }
  add('c.penyewa_id', tenantID)
  add('c.kamar_id', roomID)
  add('r.properti_id', propertyID)
  add('c.status', status)
  const where = conditions.join(' AND ')

  const total = Number((await scalar<number>(
    `SELECT count(*) FROM contracts c JOIN rooms r ON r.id=c.kamar_id WHERE ${where}`,
    args,
  )) ?? 0)
  const sql = `${CONTRACT_SELECT} WHERE ${where} ORDER BY c.tanggal_mulai DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`
  const items = await query(sql, [...args, q.limit, q.offset])
  return { items, total }
}

export async function getContract(id: string): Promise<any> {
  const row = await queryOne(`${CONTRACT_SELECT} WHERE c.id=$1`, [id])
  if (!row) throw notFound('Kontrak tidak ditemukan')
  return row
}

export async function createContract(createdBy: string, input: any): Promise<any> {
  const start = parseDate(String(input?.tanggal_mulai ?? ''))
  const end = parseDate(String(input?.tanggal_selesai ?? ''))
  if (!(end > start)) throw badRequest('Tanggal selesai harus setelah tanggal mulai')
  if (end < addMonths(start, 1)) throw badRequest('Kontrak minimal 1 bulan')

  const tenant = await queryOne<{ foto_ktp: string | null }>(
    `SELECT coalesce(foto_ktp,'') AS foto_ktp FROM tenants WHERE id=$1`,
    [input?.penyewa_id],
  )
  if (!tenant) throw badRequest('Penyewa tidak ditemukan')
  if (!tenant.foto_ktp) throw badRequest('Foto KTP penyewa wajib diunggah sebelum membuat kontrak')

  const room = await queryOne(`SELECT * FROM rooms WHERE id=$1`, [input?.kamar_id])
  if (!room) throw badRequest('Kamar tidak ditemukan')
  if (room.status === 'maintenance') throw conflict('Kamar sedang dalam maintenance')

  const active = Number((await scalar<number>(
    `SELECT count(*) FROM contracts WHERE kamar_id=$1 AND status='aktif'`,
    [input?.kamar_id],
  )) ?? 0)
  if (active > 0) throw conflict('Kamar sudah memiliki kontrak aktif')

  const price = Number(input?.harga_sewa ?? 0) > 0 ? Number(input.harga_sewa) : Number(room.harga_bulanan ?? 0)
  const deposit = Number(input?.deposit ?? 0) > 0 ? Number(input.deposit) : Number(room.deposit ?? 0)

  const number = await nextNumber('contracts', 'nomor_kontrak', `KTR-${yyyymm(start)}-`)

  let created: any
  try {
    created = await queryOne(
      `INSERT INTO contracts (nomor_kontrak, penyewa_id, kamar_id, tanggal_mulai, tanggal_selesai,
        harga_sewa, deposit, deposit_dibayar, status, catatan, dokumen_kontrak, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'aktif',$9,$10,$11) RETURNING *`,
      [
        number,
        input.penyewa_id,
        input.kamar_id,
        start,
        end,
        price,
        deposit,
        Boolean(input?.deposit_dibayar),
        optional(input?.catatan),
        optional(input?.dokumen_kontrak),
        createdBy,
      ],
    )
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Nomor kontrak duplikat, coba lagi')
    throw internalError(error)
  }
  if (!created) throw internalError(new Error('Gagal membuat kontrak'))

  await exec(`UPDATE rooms SET status='terisi' WHERE id=$1`, [input.kamar_id]).catch(() => undefined)
  await exec(`UPDATE tenants SET status='aktif' WHERE id=$1`, [input.penyewa_id]).catch(() => undefined)
  return getContract(created.id)
}

export async function renewContract(id: string, newEnd: string, createdBy: string): Promise<any> {
  const old = await getContract(id)
  if (old.status !== 'aktif') throw conflict('Hanya kontrak aktif yang dapat diperpanjang')

  const end = parseDate(String(newEnd ?? ''))
  const start = isoDate(addDays(new Date(`${dateOnly(old.tanggal_selesai)}T00:00:00Z`), 1))
  if (!(end > start)) throw badRequest('Tanggal selesai baru harus setelah kontrak lama')

  const room = await queryOne(`SELECT * FROM rooms WHERE id=$1`, [old.kamar_id])
  if (!room) throw internalError(new Error('Kamar tidak ditemukan'))

  const number = await nextNumber('contracts', 'nomor_kontrak', `KTR-${yyyymm(start)}-`)

  const newId = await withTx(async (tx) => {
    await tx.exec(`UPDATE contracts SET status='diperpanjang' WHERE id=$1`, [old.id])
    const created = await tx.one(
      `INSERT INTO contracts (nomor_kontrak, penyewa_id, kamar_id, tanggal_mulai, tanggal_selesai,
        harga_sewa, deposit, deposit_dibayar, status, catatan, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'aktif',$9,$10) RETURNING *`,
      [
        number,
        old.penyewa_id,
        old.kamar_id,
        start,
        end,
        Number(room.harga_bulanan ?? 0),
        Number(old.deposit ?? 0),
        Boolean(old.deposit_dibayar),
        `Perpanjangan dari ${old.nomor_kontrak}`,
        createdBy,
      ],
    )
    if (!created) throw internalError(new Error('Gagal memperpanjang kontrak'))
    await tx.exec(`UPDATE rooms SET status='terisi' WHERE id=$1`, [old.kamar_id])
    return String(created.id)
  }).catch((error) => {
    throw internalError(error)
  })

  return getContract(newId)
}

export async function terminateContract(id: string, status: string, note: string): Promise<any> {
  const contract = await getContract(id)
  const finalStatus = status || 'selesai'
  if (finalStatus !== 'selesai' && finalStatus !== 'batal') throw badRequest('Status akhir kontrak tidak valid')
  if (contract.status !== 'aktif') throw conflict('Kontrak tidak dalam status aktif')

  const noteText = String(note ?? '')
  const catatan = contract.catatan && String(contract.catatan) !== ''
    ? `${String(contract.catatan)} | ${noteText}`
    : noteText

  try {
    await queryOne(
      `UPDATE contracts SET status=$1, catatan=$2 WHERE id=$3 RETURNING *`,
      [finalStatus, optional(catatan), id],
    )
  } catch (error) {
    throw internalError(error)
  }

  await exec(`UPDATE rooms SET status='kosong' WHERE id=$1`, [contract.kamar_id]).catch(() => undefined)
  const otherActive = Number((await scalar<number>(
    `SELECT count(*) FROM contracts WHERE penyewa_id=$1 AND status='aktif'`,
    [contract.penyewa_id],
  )) ?? 0)
  if (otherActive === 0) {
    await exec(`UPDATE tenants SET status='nonaktif' WHERE id=$1`, [contract.penyewa_id]).catch(() => undefined)
  }
  return getContract(id)
}

/** Job harian: kontrak aktif yang akan berakhir dalam <days> hari. */
export async function expiringContracts(days: number): Promise<any[]> {
  return query(
    `SELECT c.*, t.nama_lengkap AS nama_penyewa FROM contracts c
     JOIN tenants t ON t.id=c.penyewa_id
     WHERE c.status='aktif' AND c.tanggal_selesai BETWEEN now()::date AND (now() + ($1 || ' days')::interval)::date`,
    [days],
  )
}

/** Job harian: selesaikan kontrak expired, kosongkan kamar, nonaktifkan penyewa. */
export async function finalizeExpiredContracts(): Promise<number> {
  return withTx(async (tx) => {
    const result = await tx.query(
      `SELECT id, penyewa_id, kamar_id FROM contracts
       WHERE status='aktif' AND tanggal_selesai < now()::date`,
    )
    const items = result.rows as { id: string; penyewa_id: string; kamar_id: string }[]
    for (const item of items) {
      await tx.exec(`UPDATE contracts SET status='selesai' WHERE id=$1`, [item.id])
      await tx.exec(`UPDATE rooms SET status='kosong' WHERE id=$1`, [item.kamar_id])
      const active = Number((await tx.scalar<number>(
        `SELECT count(*) FROM contracts WHERE penyewa_id=$1 AND status='aktif'`,
        [item.penyewa_id],
      )) ?? 0)
      if (active === 0) {
        await tx.exec(`UPDATE tenants SET status='nonaktif' WHERE id=$1`, [item.penyewa_id])
      }
    }
    return items.length
  })
}

export async function contractPdf(id: string): Promise<{ bytes: Buffer; filename: string }> {
  const contract = await getContract(id)
  const tenant = await queryOne(`SELECT * FROM tenants WHERE id=$1`, [contract.penyewa_id])
  if (!tenant) throw internal('Penyewa tidak ditemukan')

  // Decrypt gagal -> biarkan nilai NIK apa adanya (seperti Go).
  const plain = decrypt(String(tenant.nik ?? ''), config.encryptionKey)
  const decryptedNik = plain || String(tenant.nik ?? '')

  const roomNo = await queryOne<{ nomor: string }>(`SELECT nomor FROM rooms WHERE id=$1`, [contract.kamar_id])
  if (!roomNo) throw internal('Kamar tidak ditemukan')
  const prop = await queryOne<{ nama: string }>(
    `SELECT p.nama FROM properties p JOIN rooms r ON r.properti_id=p.id WHERE r.id=$1`,
    [contract.kamar_id],
  )
  if (!prop) throw internal('Properti tidak ditemukan')
  const owner = await queryOne<{ nama: string }>(
    `SELECT u.nama FROM users u JOIN properties p ON p.owner_id=u.id JOIN rooms r ON r.properti_id=p.id WHERE r.id=$1`,
    [contract.kamar_id],
  )

  const bytes = await contractPdfBuffer(
    contract,
    { ...tenant, nik: decryptedNik },
    String(roomNo.nomor ?? ''),
    String(prop.nama ?? ''),
    String(owner?.nama ?? 'Pemilik Kos'),
  )
  return { bytes, filename: `kontrak-${contract.nomor_kontrak}.pdf` }
}
