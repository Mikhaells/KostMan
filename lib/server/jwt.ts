import { SignJWT, jwtVerify } from 'jose'
import { randomUUID } from 'node:crypto'
import { config } from './config'

export interface Claims {
  uid: string
  role: 'super_admin' | 'owner' | 'manager' | 'tenant'
  typ: 'access' | 'refresh'
}

const encoder = new TextEncoder()

export async function signToken(claims: Claims, secret: string, ttlSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ uid: claims.uid, role: claims.role, typ: claims.typ })
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
    return payload as unknown as Claims
  } catch {
    return null
  }
}

export async function accessToken(uid: string, role: Claims['role']) {
  return signToken({ uid, role, typ: 'access' }, config.jwtSecret, config.accessTtlSeconds)
}

export async function refreshToken(uid: string, role: Claims['role']) {
  return signToken({ uid, role, typ: 'refresh' }, config.refreshSecret, config.refreshTtlSeconds)
}
