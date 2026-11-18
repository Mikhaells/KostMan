import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, CheckCheck } from 'lucide-react'
import { api, apiList, errorMessage } from '../../lib/api'
import { formatDateTime, timeAgo } from '../../lib/format'
import { toast } from '../../lib/toast'
import { Button, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination } from '../../components/ui'
import type { Notification } from '../../types'

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const list = useQuery({
    queryKey: ['notifications', page, unreadOnly],
    queryFn: () => apiList<Notification>('/notifications', { page, limit: 15, unread: unreadOnly || undefined }),
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      toast('Semua notifikasi ditandai dibaca')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  return (
    <>
      <PageHeader
        title="Notifikasi"
        subtitle="Pembaruan tagihan, pembayaran, dan tiket terbaru."
        actions={
          <>
            <Button variant={unreadOnly ? 'primary' : 'outline'} size="sm" onClick={() => { setUnreadOnly(!unreadOnly); setPage(1) }}><BellRing className="h-4 w-4" /> Belum Dibaca</Button>
            <Button variant="outline" size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending}><CheckCheck className="h-4 w-4" /> Tandai Semua Dibaca</Button>
          </>
        }
      />

      <Card>
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : (
          list.data!.items.length === 0 ? (
            <EmptyState title="Tidak ada notifikasi" description={unreadOnly ? 'Semua notifikasi sudah dibaca.' : 'Notifikasi akan muncul di sini.'} />
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {list.data!.items.map((item) => (
                  <div key={item.id} className={`flex gap-3 px-5 py-4 ${item.is_read ? '' : 'bg-brand-50/40'}`}>
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${item.is_read ? 'bg-slate-100 text-slate-500' : 'bg-brand-100 text-brand-600'}`}>
                      <Bell className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-800">{item.judul}</p>
                        {!item.is_read && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">{item.isi}</p>
                      <p className="mt-1 text-xs text-slate-400" title={formatDateTime(item.created_at)}>{timeAgo(item.created_at)}</p>
                    </div>
                    {!item.is_read && (
                      <Button variant="ghost" size="sm" onClick={() => markRead.mutate(item.id)}>Tandai dibaca</Button>
                    )}
                  </div>
                ))}
              </div>
              <Pagination page={page} pages={list.data!.meta.total_pages} total={list.data!.meta.total} onChange={setPage} />
            </>
          )
        )}
      </Card>
    </>
  )
}
