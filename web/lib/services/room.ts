import { exec, query, queryOne, scalar } from '@/lib/server/db'
import {
  badRequest,
  conflict,
  internal,
  notFound,
  toError,
  type Paginated,
  type Pagination,
} from '@/lib/server/http'
import { json, optional, statusOrDefault } from '@/lib/server/util'

const allowedRoomStatus = ['kosong', 'terisi', 'maintenance', 'reserved']

function validateRoom(input: any): void {
  const nomor = String(input?.nomor ?? '')
  const tipe = String(input?.tipe ?? '')
  const foto = Array.isArray(input?.foto) ? input.foto : []

  if (nomor.trim() === '' || tipe.trim() === '') throw badRequest('Nomor dan tipe kamar wajib diisi')
  if (Number(input?.harga_bulanan ?? 0) <= 0) throw badRequest('Harga bulanan harus lebih dari 0')
  if (foto.length > 10) throw badRequest('Maksimal 10 foto kamar')
}

export async function listRooms(propertyID: string, status: string, q: Pagination): Promise<Paginated<any>> {
  const conditions: string[] = ['1=1']
  const args: unknown[] = []

  if (propertyID) {
    args.push(propertyID)
    conditions.push(`r.properti_id = $${args.length}`)
  }
  if (status) {
    args.push(status)
    conditions.push(`r.status = $${args.length}`)
  }
  const where = conditions.join(' AND ')

  const total = Number((await scalar<number>(`SELECT count(*) FROM rooms r WHERE ${where}`, args)) ?? 0)
  const sql = `SELECT r.*, p.nama AS nama_properti FROM rooms r JOIN properties p ON p.id=r.properti_id
    WHERE ${where} ORDER BY r.nomor LIMIT $${args.length + 1} OFFSET $${args.length + 2}`
  args.push(q.limit, q.offset)
  const items = await query(sql, args)
  return { items, total }
}

export async function getRoom(id: string): Promise<any> {
  const row = await queryOne(
    `SELECT r.*, p.nama AS nama_properti FROM rooms r JOIN properties p ON p.id=r.properti_id WHERE r.id=$1`,
    [id],
  )
  if (!row) throw notFound('Kamar tidak ditemukan')
  return row
}

export async function createRoom(propertyID: string, input: any): Promise<any> {
  validateRoom(input)
  const status = statusOrDefault(input?.status, allowedRoomStatus, 'kosong')

  const exists = Number(
    (await scalar<number>(`SELECT count(*) FROM properties WHERE id=$1 AND deleted_at IS NULL`, [propertyID])) ?? 0,
  )
  if (exists === 0) throw notFound('Properti tidak ditemukan')

  try {
    return await queryOne(
      `INSERT INTO rooms (properti_id, nomor, tipe, luas_m2, harga_bulanan, harga_tahunan, deposit,
        fasilitas, foto, status, keterangan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        propertyID,
        String(input.nomor).trim(),
        String(input.tipe).trim(),
        input.luas_m2 ?? null,
        Number(input.harga_bulanan),
        input.harga_tahunan ?? null,
        Number(input.deposit ?? 0),
        json(input.fasilitas),
        json(input.foto),
        status,
        optional(input.keterangan),
      ],
    )
  } catch (error) {
    throw toError(error, 'Nomor kamar sudah digunakan di properti ini')
  }
}

export async function updateRoom(id: string, input: any): Promise<any> {
  const room = await getRoom(id)
  validateRoom(input)

  // Go mempertahankan status lama jika status baru kosong/tidak dikenal.
  const status = input?.status && allowedRoomStatus.includes(input.status) ? input.status : room.status

  try {
    return await queryOne(
      `UPDATE rooms SET nomor=$1, tipe=$2, luas_m2=$3, harga_bulanan=$4, harga_tahunan=$5,
        deposit=$6, fasilitas=$7, foto=$8, status=$9, keterangan=$10 WHERE id=$11 RETURNING *`,
      [
        String(input.nomor).trim(),
        String(input.tipe).trim(),
        input.luas_m2 ?? null,
        Number(input.harga_bulanan),
        input.harga_tahunan ?? null,
        Number(input.deposit ?? 0),
        json(input.fasilitas),
        json(input.foto),
        status,
        optional(input.keterangan),
        id,
      ],
    )
  } catch (error) {
    throw toError(error, 'Nomor kamar sudah digunakan di properti ini')
  }
}

export async function setRoomStatus(id: string, status: string): Promise<any> {
  if (!allowedRoomStatus.includes(status)) throw badRequest('Status kamar tidak valid')
  await getRoom(id)
  const row = await queryOne(`UPDATE rooms SET status=$1 WHERE id=$2 RETURNING *`, [status, id])
  if (!row) throw internal('Gagal memperbarui status kamar')
  return row
}

export async function deleteRoom(id: string): Promise<void> {
  const active = Number(
    (await scalar<number>(`SELECT count(*) FROM contracts WHERE kamar_id=$1 AND status='aktif'`, [id])) ?? 0,
  )
  if (active > 0) throw conflict('Kamar memiliki kontrak aktif dan tidak bisa dihapus')
  const affected = await exec(`DELETE FROM rooms WHERE id=$1`, [id])
  if (!affected) throw notFound('Kamar tidak ditemukan')
}
