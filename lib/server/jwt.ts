import { SignJWT, jwtVerify } from 'jose'
import { randomUUID } from 'node:crypto'
import { config } from './config'

export interface Claims {
  uid: string
  role: 'super_admin' | 'owner' | 'manager' | 'tenant'
  typ: 'access' | 'refresh'
  /** ID owner pemilik data. Kosong hanya untuk super_admin (akses global). */
  owner_id: string
}

const encoder = new TextEncoder()

export async function signToken(claims: Claims, secret: string, ttlSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ uid: claims.uid, role: claims.role, typ: claims.typ, owner_id: claims.owner_id ?? '' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('kosman-api')
    .setSubject(claims.uid)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(encoder.encode(secret))
}

export async function verifyToken(token: string, secret: string): Promise<Claims | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), { issuer: 'kosman-api' })
    if (!payload.uid || !payload.role || (payload.typ !== 'access' && payload.typ !== 'refresh')) return null
    const claims = payload as unknown as Claims
    // Token lama (sebelum migrasi multi-owner) tidak punya owner_id.
    if (!claims.owner_id) claims.owner_id = ''
    return claims
  } catch {
    return null
  }
}

export async function accessToken(uid: string, role: Claims['role'], ownerID = '') {
  return signToken({ uid, role, typ: 'access', owner_id: ownerID }, config.jwtSecret, config.accessTtlSeconds)
}

export async function refreshToken(uid: string, role: Claims['role'], ownerID = '') {
  return signToken({ uid, role, typ: 'refresh', owner_id: ownerID }, config.refreshSecret, config.refreshTtlSeconds)
}
