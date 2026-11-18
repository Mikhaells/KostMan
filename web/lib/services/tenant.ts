import { randomUUID } from 'node:crypto'
import { config } from '@/lib/server/config'
import { decrypt, encrypt, hashPassword, sha256 } from '@/lib/server/crypto'
import { exec, query, queryOne, scalar, withTx } from '@/lib/server/db'
import { badRequest, internal, notFound, toError, type Paginated, type Pagination } from '@/lib/server/http'
import { json, optional, statusOrDefault, validEmail, validateNIK, validatePassword, validatePhone } from '@/lib/server/util'

const allowedTenantStatus = ['aktif', 'nonaktif']

function validateTenant(input: any): void {
  const namaLengkap = String(input?.nama_lengkap ?? '')
  const nik = String(input?.nik ?? '').trim()
  const kontakNama = String(input?.kontak_darurat_nama ?? '')
  const kontakHP = String(input?.kontak_darurat_hp ?? '')

  if (namaLengkap.trim() === '') throw badRequest('Nama lengkap wajib diisi')
  validateNIK(nik)
  if (!validEmail(String(input?.email ?? '').trim().toLowerCase())) throw badRequest('Email tidak valid')
  validatePhone(String(input?.no_hp ?? ''))
  if (kontakNama.trim() === '' || kontakHP.trim() === '') throw badRequest('Kontak darurat wajib diisi')
}

/** Meniru TenantService.decrypt(): NIK hanya diganti bila dekripsi berhasil. */
function decryptNik<T = any>(tenant: T): T {
  if (!tenant) return tenant
  const row = tenant as any
  const plain = decrypt(String(row.nik ?? ''), config.encryptionKey)
  if (plain) row.nik = plain
  // Go model menandai nik_hash dengan json:"-" — jangan kirim ke klien.
  delete row.nik_hash
  return tenant
}

export async function listTenants(q: Pagination, search: string, status: string): Promise<Paginated<any>> {
  const conditions: string[] = ['1=1']
  const args: unknown[] = []

  if (search) {
    args.push(`%${search}%`)
    conditions.push(`(nama_lengkap ILIKE $${args.length} OR email ILIKE $${args.length})`)
  }
  if (status) {
    args.push(status)
    conditions.push(`status = $${args.length}`)
  }
  const where = conditions.join(' AND ')

  const total = Number((await scalar<number>(`SELECT count(*) FROM tenants WHERE ${where}`, args)) ?? 0)
  const sql = `SELECT * FROM tenants WHERE ${where} ORDER BY created_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`
  args.push(q.limit, q.offset)
  const items = await query(sql, args)
  return { items: items.map((t) => decryptNik(t)), total }
}

export async function getTenant(id: string): Promise<any> {
  const row = await queryOne(`SELECT * FROM tenants WHERE id=$1`, [id])
  if (!row) throw notFound('Penyewa tidak ditemukan')
  return decryptNik(row)
}

export async function getTenantByUser(userID: string): Promise<any> {
  const row = await queryOne(`SELECT * FROM tenants WHERE user_id=$1`, [userID])
  if (!row) throw notFound('Profil penyewa tidak ditemukan')
  return decryptNik(row)
}

export async function createTenant(input: any): Promise<any> {
  validateTenant(input)
  if (String(input?.foto_ktp ?? '').trim() === '') {
    throw badRequest('Foto KTP wajib diunggah sebelum kontrak dibuat')
  }

  const email = String(input.email).trim().toLowerCase()
  const nik = String(input.nik).trim()
  const encrypted = encrypt(nik, config.encryptionKey)
  const status = statusOrDefault(input?.status, allowedTenantStatus, 'aktif')

  return withTx(async (tx) => {
    let userID: string | null = null

    if (input?.buat_akun_portal) {
      const password = String(input.password ?? '') || 'Kos12345'
      validatePassword(password)
      const hash = await hashPassword(password)

      let created: { id: string } | null = null
      try {
        created = await tx.one<{ id: string }>(
          `INSERT INTO users (nama, email, password_hash, role, no_hp) VALUES ($1,$2,$3,'tenant',$4) RETURNING id`,
          [input.nama_lengkap, email, hash, input.no_hp],
        )
      } catch (error) {
        throw toError(error, 'Email sudah terdaftar sebagai user')
      }
      if (!created) throw internal('Gagal membuat akun user')
      userID = created.id
    }

    let tenant: any
    try {
      tenant = await tx.one(
        `INSERT INTO tenants (nama_lengkap, nik, nik_hash, email, no_hp, alamat_asal, pekerjaan,
          kontak_darurat_nama, kontak_darurat_hp, foto_ktp, dokumen_lain, status, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          String(input.nama_lengkap).trim(),
          encrypted,
          sha256(nik),
          email,
          input.no_hp,
          optional(input.alamat_asal),
          optional(input.pekerjaan),
          input.kontak_darurat_nama,
          input.kontak_darurat_hp,
          input.foto_ktp,
          json(input.dokumen_lain),
          status,
          userID,
        ],
      )
    } catch (error) {
      throw toError(error, 'Email atau NIK sudah terdaftar')
    }
    if (!tenant) throw internal('Gagal menyimpan penyewa')
    return decryptNik(tenant)
  })
}

export async function updateTenant(id: string, input: any): Promise<any> {
  const old = await getTenant(id)
  validateTenant(input)

  const nik = String(input.nik).trim()
  const encrypted = encrypt(nik, config.encryptionKey)
  const status = statusOrDefault(input?.status, allowedTenantStatus, old.status)
  const fotoKTP = input?.foto_ktp ? input.foto_ktp : old.foto_ktp

  let tenant: any
  try {
    tenant = await queryOne(
      `UPDATE tenants SET nama_lengkap=$1, nik=$2, nik_hash=$3, email=$4, no_hp=$5, alamat_asal=$6,
        pekerjaan=$7, kontak_darurat_nama=$8, kontak_darurat_hp=$9, foto_ktp=$10, dokumen_lain=$11, status=$12
       WHERE id=$13 RETURNING *`,
      [
        String(input.nama_lengkap).trim(),
        encrypted,
        sha256(nik),
        String(input.email ?? '').toLowerCase(),
        input.no_hp,
        optional(input.alamat_asal),
        optional(input.pekerjaan),
        input.kontak_darurat_nama,
        input.kontak_darurat_hp,
        fotoKTP,
        json(input.dokumen_lain),
        status,
        id,
      ],
    )
  } catch (error) {
    throw toError(error, 'Email atau NIK sudah terdaftar')
  }
  if (!tenant) throw notFound('Penyewa tidak ditemukan')
  return decryptNik(tenant)
}

export async function setTenantStatus(id: string, status: string): Promise<any> {
  if (status !== 'aktif' && status !== 'nonaktif') throw badRequest('Status tidak valid')
  const row = await queryOne(`UPDATE tenants SET status=$1 WHERE id=$2 RETURNING *`, [status, id])
  if (!row) throw notFound('Penyewa tidak ditemukan')
  return decryptNik(row)
}

export async function tenantHistory(tenantID: string): Promise<any[]> {
  return query(
    `SELECT c.*, r.nomor AS nomor_kamar, p.nama AS nama_properti
     FROM contracts c JOIN rooms r ON r.id=c.kamar_id JOIN properties p ON p.id=r.properti_id
     WHERE c.penyewa_id=$1 ORDER BY c.tanggal_mulai DESC`,
    [tenantID],
  )
}

export async function ensurePortalUser(tenantID: string, password: string): Promise<string> {
  const tenant = await getTenant(tenantID)
  if (tenant.user_id) return String(tenant.user_id)

  const plain = password || 'Kos12345'
  validatePassword(plain)
  const hash = await hashPassword(plain)
  const uid = randomUUID()

  try {
    await exec(
      `INSERT INTO users (id, nama, email, password_hash, role, no_hp) VALUES ($1,$2,$3,$4,'tenant',$5)`,
      [uid, tenant.nama_lengkap, tenant.email, hash, tenant.no_hp],
    )
  } catch (error) {
    throw toError(error, 'Email sudah terdaftar sebagai user')
  }
  await exec(`UPDATE tenants SET user_id=$1 WHERE id=$2`, [uid, tenantID])
  return uid
}
