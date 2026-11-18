import { exec, query, scalar } from '@/lib/server/db'
import { notFound, type Paginated, type Pagination } from '@/lib/server/http'

export async function listNotifications(
  userID: string,
  unreadOnly: boolean,
  q: Pagination,
): Promise<Paginated<any>> {
  const conditions: string[] = ['user_id = $1']
  const args: unknown[] = [userID]
  if (unreadOnly) conditions.push('is_read = FALSE')
  const where = conditions.join(' AND ')

  const total = Number((await scalar<number>(`SELECT count(*) FROM notifications WHERE ${where}`, args)) ?? 0)

  args.push(q.limit, q.offset)
  const items = await query(
    `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    args,
  )
  return { items, total }
}

export async function unreadCount(userID: string): Promise<number> {
  return Number(
    (await scalar<number>(`SELECT count(*) FROM notifications WHERE user_id=$1 AND is_read=FALSE`, [userID])) ?? 0,
  )
}

export async function markNotificationRead(id: string, userID: string): Promise<void> {
  const affected = await exec(`UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2`, [id, userID])
  if (!affected) throw notFound('Notifikasi tidak ditemukan')
}

export async function markAllRead(userID: string): Promise<void> {
  await exec(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1 AND is_read=FALSE`, [userID])
}
