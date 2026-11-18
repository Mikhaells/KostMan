import { config } from '@/lib/server/config'
import { checkPassword, decrypt, hashPassword, randomToken, sha256 } from '@/lib/server/crypto'
import { exec, query, queryOne, scalar, withTx } from '@/lib/server/db'
import { badRequest, conflict, forbidden, internal, notFound, unauthorized, type Paginated, type Pagination } from '@/lib/server/http'
import { accessToken, refreshToken, verifyToken } from '@/lib/server/jwt'
import { sendMail } from '@/lib/server/notify'
import { optional, validEmail, validatePassword } from '@/lib/server/util'

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: Record<string, unknown>
}

function publicUser(user: any) {
  if (!user) return user
  const { password_hash, failed_login, locked_until, ...rest } = user
  return rest
}

/** Registrasi publik hanya membuat owner baru; owner_id diarahkan ke dirinya sendiri. */
export async function register(input: any) {
  const created = await insertAccount(input, 'owner', '')
  await exec(`UPDATE users SET owner_id=$1 WHERE id=$1`, [created!.id])
  return created
}

/** Akun manager/tenant dibuat oleh owner dan mewarisi owner_id. */
async function insertAccount(input: any, role: string, ownerID: string) {
  const email = String(input?.email ?? '').trim().toLowerCase()
  const nama = String(input?.nama ?? '').trim()
  if (!nama || !validEmail(email)) throw badRequest('Nama dan email valid wajib diisi')
  validatePassword(String(input?.password ?? ''))
  const hash = await hashPassword(String(input.password))
  try {
    return await queryOne<{ id: string; nama: string; email: string; role: string; no_hp: string | null; status: string; created_at: string; updated_at: string }>(
      `INSERT INTO users (nama, email, password_hash, role, no_hp, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, nama, email, role, no_hp, status, created_at, updated_at`,
      [nama, email, hash, role, optional(input?.no_hp), ownerID || null],
    )
  } catch (error) {
    if (String((error as any)?.message).includes('duplicate')) throw conflict('Email sudah terdaftar')
    throw internal(String(error))
  }
}

async function issuePair(user: any): Promise<TokenPair> {
  const access = await accessToken(user.id, user.role, user.owner_id)
  const refresh = await refreshToken(user.id, user.role, user.owner_id)
  const expires = new Date(Date.now() + config.refreshTtlSeconds * 1000)
  await exec(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [
    user.id,
    sha256(refresh),
    expires,
  ])
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: 'Bearer',
    expires_in: config.accessTtlSeconds,
    user: publicUser(user),
  }
}

export async function login(input: any): Promise<TokenPair> {
  const email = String(input?.email ?? '').trim().toLowerCase()
  const user = await queryOne(`SELECT * FROM users WHERE email=$1 AND deleted_at IS NULL`, [email])
  if (!user) throw unauthorized('Email atau password salah')
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    throw unauthorized('Akun terkunci sementara, coba lagi dalam 15 menit')
  }
  if (!(await checkPassword(user.password_hash, String(input?.password ?? '')))) {
    const failed = Number(user.failed_login ?? 0) + 1
    if (failed >= 5) {
      await exec(`UPDATE users SET failed_login=$1, locked_until=$2 WHERE id=$3`, [
        failed,
        new Date(Date.now() + 15 * 60 * 1000),
        user.id,
      ])
      throw unauthorized('Akun terkunci selama 15 menit setelah 5 kali gagal login')
    }
    await exec(`UPDATE users SET failed_login=$1 WHERE id=$2`, [failed, user.id])
    throw unauthorized('Email atau password salah')
  }
  if (user.status !== 'aktif') throw forbidden('Akun tidak aktif')
  await exec(`UPDATE users SET failed_login=0, locked_until=NULL WHERE id=$1`, [user.id])
  user.failed_login = 0
  user.locked_until = null
  return issuePair(user)
}

export async function refresh(rawToken: string): Promise<TokenPair> {
  const claims = await verifyToken(rawToken, config.refreshSecret)
  if (!claims || claims.typ !== 'refresh') throw unauthorized('Refresh token tidak valid')
  const hash = sha256(rawToken)
  const valid = await queryOne(
    `SELECT 1 FROM refresh_tokens WHERE token_hash=$1 AND revoked=FALSE AND expires_at>now()`,
    [hash],
  )
  if (!valid) throw unauthorized('Refresh token tidak valid atau sudah kedaluwarsa')
  const user = await queryOne(`SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL`, [claims.uid])
  if (!user) throw unauthorized('User tidak ditemukan')
  const access = await accessToken(user.id, user.role, user.owner_id)
  const nextRefresh = await refreshToken(user.id, user.role, user.owner_id)
  await withTx(async (tx) => {
    await tx.exec(`UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=$1`, [hash])
    await tx.exec(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [
      user.id,
      sha256(nextRefresh),
      new Date(Date.now() + config.refreshTtlSeconds * 1000),
    ])
  })
  return {
    access_token: access,
    refresh_token: nextRefresh,
    token_type: 'Bearer',
    expires_in: config.accessTtlSeconds,
    user: publicUser(user),
  }
}

export async function logout(rawToken: string): Promise<void> {
  if (!rawToken) return
  await exec(`UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=$1`, [sha256(rawToken)])
}

export async function forgotPassword(email: string): Promise<void> {
  const normalized = String(email ?? '').trim().toLowerCase()
  const rows = await query<{ id: string }>(`SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL`, [normalized])
  if (!rows.length) return // jangan membocorkan keberadaan akun
  const raw = randomToken(32)
  await exec(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [
    rows[0].id,
    sha256(raw),
    new Date(Date.now() + 3600_000),
  ])
  const link = `${config.appUrl.replace(/\/$/, '')}/reset-password?token=${raw}`
  await sendMail(normalized, 'Reset password KosMan', `<p>Klik <a href="${link}">tautan ini</a> untuk mengatur ulang password Anda.</p>`)
}

export async function resetPassword(raw: string, password: string): Promise<void> {
  validatePassword(String(password ?? ''))
  const hash = await hashPassword(String(password))
  const rows = await query<{ user_id: string }>(
    `SELECT user_id FROM password_resets WHERE token_hash=$1 AND used=FALSE AND expires_at>now()`,
    [sha256(String(raw ?? ''))],
  )
  if (!rows.length) throw badRequest('Tautan reset tidak valid atau sudah kedaluwarsa')
  await withTx(async (tx) => {
    await tx.exec(`UPDATE users SET password_hash=$1, failed_login=0, locked_until=NULL WHERE id=$2`, [hash, rows[0].user_id])
    await tx.exec(`UPDATE password_resets SET used=TRUE WHERE token_hash=$1`, [sha256(String(raw))])
    await tx.exec(`UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=$1`, [rows[0].user_id])
  })
}

export async function getProfile(userId: string) {
  const user = await queryOne(`SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL`, [userId])
  if (!user) throw notFound('User tidak ditemukan')
  return publicUser(user)
}

export async function updateProfile(userId: string, input: any) {
  const nama = String(input?.nama ?? '').trim()
  if (!nama) throw badRequest('Nama wajib diisi')
  const row = await queryOne(`UPDATE users SET nama=$1, no_hp=$2 WHERE id=$3 RETURNING *`, [
    nama,
    optional(input?.no_hp),
    userId,
  ])
  if (!row) throw notFound('User tidak ditemukan')
  return publicUser(row)
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
  validatePassword(String(newPassword ?? ''))
  const row = await queryOne<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id=$1`, [userId])
  if (!row) throw notFound('User tidak ditemukan')
  if (!(await checkPassword(row.password_hash, String(oldPassword ?? '')))) {
    throw badRequest('Password lama tidak sesuai')
  }
  const hash = await hashPassword(String(newPassword))
  await exec(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, userId])
}

export async function listUsers(q: Pagination, search: string, ownerID: string): Promise<Paginated<any>> {
  const like = `%${search ?? ''}%`
  const args: unknown[] = [like]
  const scope = ownerID ? ` AND owner_id = $2` : ''
  if (ownerID) args.push(ownerID)
  const total = Number((await scalar<number>(
    `SELECT count(*) FROM users WHERE deleted_at IS NULL AND (nama ILIKE $1 OR email ILIKE $1)${scope}`,
    args,
  )) ?? 0)
  const items = await query(
    `SELECT * FROM users WHERE deleted_at IS NULL AND (nama ILIKE $1 OR email ILIKE $1)${scope}
     ORDER BY created_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, q.limit, q.offset],
  )
  return { items: items.map(publicUser), total }
}

export async function createUser(input: any, ownerID: string) {
  if (!ownerID) throw forbidden('Owner tidak dikenal')
  const role = String(input?.role || 'manager')
  if (!['manager', 'tenant'].includes(role)) throw badRequest('Role hanya boleh Manager atau Penyewa')
  return insertAccount(input, role, ownerID)
}

export async function updateUser(id: string, input: any, ownerID: string, actorID: string) {
  const existing = await queryOne<{ role: string; owner_id: string | null }>(
    `SELECT role, owner_id FROM users WHERE id=$1 AND deleted_at IS NULL`,
    [id],
  )
  if (!existing || (ownerID && String(existing.owner_id) !== String(ownerID))) {
    throw notFound('User tidak ditemukan')
  }
  if (id === actorID) throw badRequest('Gunakan menu profil untuk mengubah akun sendiri')
  if (String(existing.role) === 'owner' || String(existing.role) === 'super_admin') {
    throw forbidden('Akun owner/super admin tidak bisa diubah dari sini')
  }
  const role = String(input?.role || existing.role)
  if (!['manager', 'tenant'].includes(role)) throw badRequest('Role hanya boleh Manager atau Penyewa')
  const status = input?.status || 'aktif'
  const row = await queryOne(`UPDATE users SET nama=$1, no_hp=$2, role=$3, status=$4 WHERE id=$5 RETURNING *`, [
    input?.nama,
    optional(input?.no_hp),
    role,
    status,
    id,
  ])
  if (!row) throw notFound('User tidak ditemukan')
  return publicUser(row)
}

export async function deleteUser(id: string, ownerID: string, actorID: string): Promise<void> {
  if (id === actorID) throw badRequest('Tidak bisa menonaktifkan akun sendiri')
  const existing = await queryOne<{ role: string; owner_id: string | null }>(
    `SELECT role, owner_id FROM users WHERE id=$1 AND deleted_at IS NULL`,
    [id],
  )
  if (!existing || (ownerID && String(existing.owner_id) !== String(ownerID))) {
    throw notFound('User tidak ditemukan')
  }
  if (String(existing.role) === 'owner' || String(existing.role) === 'super_admin') {
    throw forbidden('Akun owner/super admin tidak bisa dihapus dari sini')
  }
  const affected = await exec(`UPDATE users SET deleted_at=now(), status='nonaktif' WHERE id=$1 AND deleted_at IS NULL`, [id])
  if (!affected) throw notFound('User tidak ditemukan')
}

export { decrypt }
