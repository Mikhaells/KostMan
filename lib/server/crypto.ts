import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { config } from './config'

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export async function checkPassword(hash: string, plain: string): Promise<boolean> {
  if (!hash || !plain) return false
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

function key(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

/** AES-256-GCM, compatible with the Go implementation: base64(nonce + ciphertext). */
export function encrypt(plain: string, secret = config.encryptionKey): string {
  if (!plain) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64')
}

export function decrypt(encoded: string, secret = config.encryptionKey): string {
  if (!encoded) return ''
  try {
    const raw = Buffer.from(encoded, 'base64')
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(raw.length - 16)
    const data = raw.subarray(12, raw.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', key(secret), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

export function maskNIK(nik: string): string {
  if (nik.length <= 8) return '*'.repeat(nik.length)
  return nik.slice(0, 4) + '*'.repeat(nik.length - 8) + nik.slice(-4)
}
