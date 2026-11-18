import { exec, query, queryOne, scalar } from '@/lib/server/db'
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  toError,
  type Paginated,
  type Pagination,
} from '@/lib/server/http'
import { json, optional, statusOrDefault } from '@/lib/server/util'

const allowedPropertyTypes = ['kos_putri', 'kos_putra', 'kos_campur', 'kontrakan', 'rumah']
const allowedPropertyStatuses = ['aktif', 'nonaktif', 'maintenance']

function validateProperty(input: any): void {
  const nama = String(input?.nama ?? '')
  const alamat = String(input?.alamat ?? '')
  const kota = String(input?.kota ?? '')
  const provinsi = String(input?.provinsi ?? '')
  const foto = Array.isArray(input?.foto) ? input.foto : []

  if (nama.trim().length < 3) throw badRequest('Nama properti minimal 3 karakter')
  if (!allowedPropertyTypes.includes(input?.tipe)) throw badRequest('Tipe properti tidak valid')
  if (alamat.trim() === '' || kota.trim() === '' || provinsi.trim() === '') {
    throw badRequest('Alamat, kota, dan provinsi wajib diisi')
  }
  if (foto.length > 10) throw badRequest('Maksimal 10 foto properti')
}

export async function listProperties(
  ownerID: string,
  q: Pagination,
  search: string,
  status: string,
): Promise<Paginated<any>> {
  const conditions: string[] = ['p.deleted_at IS NULL']
  const args: unknown[] = []

  if (ownerID) {
    args.push(ownerID)
    conditions.push(`p.owner_id = $${args.length}`)
  }
  if (search) {
    args.push(`%${search}%`)
    conditions.push(`(p.nama ILIKE $${args.length} OR p.kota ILIKE $${args.length})`)
  }
  if (status) {
    args.push(status)
    conditions.push(`p.status = $${args.length}`)
  }
  const where = conditions.join(' AND ')

  const total = Number((await scalar<number>(`SELECT count(*) FROM properties p WHERE ${where}`, args)) ?? 0)
  const sql = `SELECT p.*, (SELECT count(*) FROM rooms r WHERE r.properti_id = p.id) AS jumlah_kamar
    FROM properties p WHERE ${where} ORDER BY p.created_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`
  args.push(q.limit, q.offset)
  const items = await query(sql, args)
  return { items, total }
}

export async function getProperty(id: string, ownerID: string): Promise<any> {
  const args: unknown[] = [id]
  let sql = `SELECT p.*, (SELECT count(*) FROM rooms r WHERE r.properti_id = p.id) AS jumlah_kamar
     FROM properties p WHERE p.id=$1 AND p.deleted_at IS NULL`
  if (ownerID) {
    sql += ` AND p.owner_id=$2`
    args.push(ownerID)
  }
  const row = await queryOne(sql, args)
  if (!row) throw notFound('Properti tidak ditemukan')
  return row
}

export async function createProperty(ownerID: string, input: any): Promise<any> {
  validateProperty(input)
  const status = statusOrDefault(input?.status, allowedPropertyStatuses, 'aktif')
  try {
    return await queryOne(
      `INSERT INTO properties (owner_id, nama, tipe, alamat, kota, provinsi, kode_pos, latitude,
        longitude, deskripsi, fasilitas, foto, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        ownerID,
        String(input.nama).trim(),
        input.tipe,
        input.alamat,
        input.kota,
        input.provinsi,
        optional(input.kode_pos),
        input.latitude ?? null,
        input.longitude ?? null,
        optional(input.deskripsi),
        json(input.fasilitas),
        json(input.foto),
        status,
      ],
    )
  } catch (error) {
    throw toError(error, 'Gagal menyimpan properti')
  }
}

export async function updateProperty(id: string, ownerID: string, input: any): Promise<any> {
  await getProperty(id, ownerID)
  validateProperty(input)
  const status = statusOrDefault(input?.status, allowedPropertyStatuses, 'aktif')
  try {
    return await queryOne(
      `UPDATE properties SET nama=$1, tipe=$2, alamat=$3, kota=$4, provinsi=$5, kode_pos=$6,
        latitude=$7, longitude=$8, deskripsi=$9, fasilitas=$10, foto=$11, status=$12
       WHERE id=$13 AND deleted_at IS NULL RETURNING *`,
      [
        String(input.nama).trim(),
        input.tipe,
        input.alamat,
        input.kota,
        input.provinsi,
        optional(input.kode_pos),
        input.latitude ?? null,
        input.longitude ?? null,
        optional(input.deskripsi),
        json(input.fasilitas),
        json(input.foto),
        status,
        id,
      ],
    )
  } catch (error) {
    throw toError(error, 'Gagal menyimpan properti')
  }
}

export async function deleteProperty(id: string, ownerID: string): Promise<void> {
  await getProperty(id, ownerID)
  const active = Number(
    (await scalar<number>(
      `SELECT count(*) FROM contracts c JOIN rooms r ON r.id = c.kamar_id
       WHERE r.properti_id = $1 AND c.status = 'aktif'`,
      [id],
    )) ?? 0,
  )
  if (active > 0) throw conflict('Properti masih memiliki kamar dengan kontrak aktif')
  const args: unknown[] = [id]
  let sql = `UPDATE properties SET deleted_at = now() WHERE id=$1 AND deleted_at IS NULL`
  if (ownerID) {
    sql += ` AND owner_id=$2`
    args.push(ownerID)
  }
  const affected = await exec(sql, args)
  if (!affected) throw notFound('Properti tidak ditemukan')
}

export async function restoreProperty(id: string, ownerID: string): Promise<any> {
  const args: unknown[] = [id]
  let sql = `UPDATE properties SET deleted_at = NULL WHERE id=$1`
  if (ownerID) {
    sql += ` AND owner_id=$2`
    args.push(ownerID)
  }
  const row = await queryOne(`${sql} RETURNING *`, args)
  if (!row) throw notFound('Properti tidak ditemukan')
  return row
}

export async function listDeletedProperties(q: Pagination, ownerID: string): Promise<Paginated<any>> {
  const args: unknown[] = []
  const scope = ownerID ? ` AND owner_id=$1` : ''
  if (ownerID) args.push(ownerID)
  const total = Number((await scalar<number>(`SELECT count(*) FROM properties WHERE deleted_at IS NOT NULL${scope}`, args)) ?? 0)
  const items = await query(
    `SELECT * FROM properties WHERE deleted_at IS NOT NULL${scope} ORDER BY deleted_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, q.limit, q.offset],
  )
  return { items, total }
}
