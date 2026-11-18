import { badRequest } from './http'

export function validEmail(value: string): boolean {
  const at = value.indexOf('@')
  return at > 0 && at < value.length - 1 && value.slice(at + 1).includes('.')
}

export function validatePassword(password: string): void {
  if (!password || password.length < 8 || !/[0-9]/.test(password) || !/[a-zA-Z]/.test(password)) {
    throw badRequest('Password minimal 8 karakter dan mengandung huruf serta angka')
  }
}

export function validateNIK(nik: string): void {
  if (!/^[0-9]{16}$/.test(nik)) throw badRequest('NIK harus 16 digit angka')
}

export function validatePhone(phone: string): void {
  if (!/^[0-9+\-\s]{8,20}$/.test(phone)) throw badRequest('Nomor telepon tidak valid')
}

export function parseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw badRequest('Format tanggal harus YYYY-MM-DD')
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw badRequest('Tanggal tidak valid')
  }
  return value
}

export function optional(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '' ? null : text
}

export function json(value: unknown): string {
  return JSON.stringify(value ?? [])
}

export function statusOrDefault(value: string, allowed: string[], fallback: string): string {
  return value && allowed.includes(value) ? value : fallback
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Menambahkan filter owner ke query. ownerID kosong berarti super_admin
 * (tanpa filter / melihat semua data).
 */
export function scopeOwner(conditions: string[], args: unknown[], ownerID: string, column = 'owner_id'): void {
  if (!ownerID) return
  args.push(ownerID)
  conditions.push(`${column} = $${args.length}`)
}

export function addDays(value: Date, days: number): Date {
  const copy = new Date(value)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export async function nextNumber(table: string, column: string, prefix: string, ownerID = ''): Promise<string> {
  const { scalar } = await import('./db')
  const args: unknown[] = [`${prefix}%`]
  let sql = `SELECT count(*) FROM ${table} WHERE ${column} LIKE $1`
  if (ownerID) {
    sql += ` AND owner_id = $2`
    args.push(ownerID)
  }
  const count = Number((await scalar<number>(sql, args)) ?? 0)
  return `${prefix}${String(count + 1).padStart(4, '0')}`
}
