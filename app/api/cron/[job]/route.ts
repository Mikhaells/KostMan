import { NextRequest, NextResponse } from 'next/server'
import { ensureDatabase } from '@/lib/server/db'
import { fail } from '@/lib/server/http'
import { notifyAdmins } from '@/lib/server/notify'
import { generateMonthlyInvoices, markOverdueInvoices, sendDueReminders } from '@/lib/services/billing'
import { expiringContracts, finalizeExpiredContracts } from '@/lib/services/contract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Dijalankan Vercel Cron (GET, user-agent vercel-cron/1.0).
 * Set CRON_SECRET di Vercel agar Vercel mengirim Authorization: Bearer <secret>.
 * Endpoint ini tidak dipakai UI dan menolak request biasa.
 */
export async function GET(request: NextRequest, { params }: { params: { job: string } }) {
  try {
    const secret = process.env.CRON_SECRET
    const authorization = request.headers.get('authorization') || ''
    const userAgent = request.headers.get('user-agent') || ''
    const authorized = secret
      ? authorization === `Bearer ${secret}`
      : userAgent.startsWith('vercel-cron/')
    if (!authorized) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Akses ditolak' }, { status: 401 })
    }

    await ensureDatabase()
    const job = params.job

    if (job === 'daily') {
      const terlambat = await markOverdueInvoices()
      const kontrakSelesai = await finalizeExpiredContracts()
      const pengingat = await sendDueReminders(3)
      const akanBerakhir = await expiringContracts(7)
      for (const contract of akanBerakhir) {
        await notifyAdmins(
          'Kontrak akan berakhir',
          `${contract.nomor_kontrak} akan berakhir ${String(contract.tanggal_selesai).slice(0, 10)}`,
          'contract_ending',
          { id: contract.id },
          String(contract.owner_id ?? ''),
        )
      }
      return NextResponse.json({
        success: true,
        message: 'OK',
        data: {
          tagihan_terlambat: terlambat,
          kontrak_selesai: kontrakSelesai,
          pengingat_tagihan: pengingat,
          kontrak_akan_berakhir: akanBerakhir.length,
        },
      })
    }

    if (job === 'monthly') {
      const dibuat = await generateMonthlyInvoices()
      return NextResponse.json({ success: true, message: 'OK', data: { tagihan_dibuat: dibuat } })
    }

    return NextResponse.json({ success: false, code: 'NOT_FOUND', message: 'Job tidak ditemukan' }, { status: 404 })
  } catch (error) {
    return fail(error)
  }
}
