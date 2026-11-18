function env(key: string, fallback = ''): string {
  const value = process.env[key]
  return value && value.trim() ? value.trim() : fallback
}

function intEnv(key: string, fallback: number): number {
  const n = Number(process.env[key])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const jwtSecret = env('JWT_SECRET', 'dev-only-access-secret-change-me-please')
const refreshSecret = env('JWT_REFRESH_SECRET', 'dev-only-refresh-secret-change-me-please')
const accessMinutes = intEnv('JWT_ACCESS_TTL_MINUTES', 1440)
const refreshDays = intEnv('JWT_REFRESH_TTL_DAYS', 7)

export const config = {
  appUrl: env('APP_URL', process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  databaseUrl: env('DATABASE_URL', 'postgres://postgres:password@127.0.0.1:5432/kosman?sslmode=disable'),
  jwtSecret,
  refreshSecret,
  accessTtlSeconds: accessMinutes * 60,
  refreshTtlSeconds: refreshDays * 24 * 60 * 60,
  encryptionKey: env('ENCRYPTION_KEY', jwtSecret),
  resendApiKey: env('RESEND_API_KEY'),
  smtpFrom: env('SMTP_FROM', 'KosMan <noreply@kosman.id>'),
  cloudinaryCloudName: env('CLOUDINARY_CLOUD_NAME'),
  cloudinaryUploadPreset: env('CLOUDINARY_UPLOAD_PRESET'),
  maxUploadBytes: intEnv('MAX_UPLOAD_MB', 5) * 1024 * 1024,
}
