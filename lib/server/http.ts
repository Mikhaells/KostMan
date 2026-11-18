import { NextResponse } from 'next/server'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const badRequest = (message: string) => new ApiError(400, 'BAD_REQUEST', message)
export const unauthorized = (message: string) => new ApiError(401, 'UNAUTHORIZED', message)
export const forbidden = (message: string) => new ApiError(403, 'FORBIDDEN', message)
export const notFound = (message: string) => new ApiError(404, 'NOT_FOUND', message)
export const conflict = (message: string) => new ApiError(409, 'CONFLICT', message)
export const internal = (message: string) => new ApiError(500, 'INTERNAL_ERROR', message)

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, message: 'OK', data }, { status })
}

export function created(data: unknown) {
  return NextResponse.json({ success: true, message: 'Created', data }, { status: 201 })
}

export function list<T>(data: T[], meta: Record<string, number>) {
  return NextResponse.json({ success: true, message: 'OK', data, meta })
}

export function noContent() {
  return new NextResponse(null, { status: 204 })
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { success: false, message: error.message, error: error.message, code: error.code },
      { status: error.status },
    )
  }
  const message = error instanceof Error ? error.message : 'Terjadi kesalahan tak terduga'
  console.error('[api]', error)
  return NextResponse.json(
    { success: false, message, error: message, code: 'INTERNAL_ERROR' },
    { status: 500 },
  )
}

export interface Pagination {
  page: number
  limit: number
  offset: number
}

export interface Paginated<T> {
  items: T[]
  total: number
}

export function pagination(url: URL): Pagination {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const rawLimit = Number(url.searchParams.get('limit')) || 20
  const limit = rawLimit < 1 || rawLimit > 100 ? 20 : rawLimit
  return { page, limit, offset: (page - 1) * limit }
}

export function meta(q: Pagination, total: number) {
  return {
    page: q.page,
    limit: q.limit,
    total,
    total_pages: q.limit > 0 ? Math.ceil(total / q.limit) : 0,
  }
}

export async function body(request: Request): Promise<any> {
  try {
    return await request.json()
  } catch {
    throw badRequest('Body JSON tidak valid')
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase()
  return message.includes('duplicate key') || message.includes('unique constraint') || message.includes('23505')
}

export function toError(error: unknown, fallbackMessage: string): ApiError {
  if (error instanceof ApiError) return error
  if (isUniqueViolation(error)) return conflict(fallbackMessage)
  return internal(error instanceof Error ? error.message : String(error))
}
