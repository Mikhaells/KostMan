import ExcelJS from 'exceljs'
import { query, scalar } from '@/lib/server/db'
import { badRequest } from '@/lib/server/http'
import { tablePdfBuffer } from '@/lib/server/pdf'
import { round2 } from '@/lib/server/util'

type Cell = string | number

interface ReportTable {
  Headers: string[]
  Rows: Cell[][]
}

/** Filter UUID kosong menjadi NULL agar `($n::uuid IS NULL OR col=$n)` mencocokkan semua baris. */
function uuidArg(s: string | null | undefined): string | null {
  return !s ? null : s
}

/** DATE dari pg datang sebagai Date; Go membaca kolom tersebut sebagai string YYYY-MM-DD. */
function cell(value: unknown): Cell {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

/** Go memindai kolom berdasarkan posisi (rows.Scan), bukan nama kolom turunan. */
function cells(row: Record<string, unknown>): Cell[] {
  return Object.values(row).map(cell)
}

async function safeScalar(sql: string, params: unknown[] = []): Promise<number> {
  try {
    return Number((await scalar<number>(sql, params)) ?? 0)
  } catch {
    return 0
  }
}

export async function dashboard(ownerID: string): Promise<Record<string, any>> {
  const out: Record<string, any> = {}
  const args: unknown[] = ownerID ? [ownerID] : []
  const own = (column: string) => (ownerID ? ` AND ${column}=$1` : '')

  out.pendapatan_bulan_ini = await safeScalar(
    `SELECT coalesce(sum(jumlah),0) FROM payments WHERE status='verified' AND date_trunc('month', created_at) = date_trunc('month', now())${own('owner_id')}`,
    args,
  )
  out.tagihan_belum_lunas = await safeScalar(
    `SELECT coalesce(sum(total),0) FROM invoices WHERE status IN ('terkirim','terlambat','sebagian')${own('owner_id')}`,
    args,
  )

  const occupied = await safeScalar(`SELECT count(*) FROM rooms WHERE status='terisi'${own('owner_id')}`, args)
  const totalRooms = await safeScalar(`SELECT count(*) FROM rooms WHERE 1=1${own('owner_id')}`, args)
  const occupancy = totalRooms > 0 ? (occupied / totalRooms) * 100 : 0
  out.okupansi = round2(occupancy)
  out.total_kamar = totalRooms
  out.kamar_terisi = occupied

  out.penyewa_aktif = await safeScalar(`SELECT count(*) FROM contracts WHERE status='aktif'${own('owner_id')}`, args)
  out.tiket_open = await safeScalar(
    `SELECT count(*) FROM tickets WHERE status IN ('open','in_progress')${own('owner_id')}`, args,
  )
  out.total_properti = await safeScalar(
    `SELECT count(*) FROM properties WHERE deleted_at IS NULL${own('owner_id')}`, args,
  )
  out.total_penyewa = await safeScalar(`SELECT count(*) FROM tenants WHERE status='aktif'${own('owner_id')}`, args)

  try {
    const rows = await query<{ bulan: string; total: number }>(
      `SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS bulan, coalesce(sum(jumlah),0) AS total
       FROM payments WHERE status='verified' AND created_at >= date_trunc('month', now()) - interval '5 months'${own('owner_id')}
       GROUP BY date_trunc('month', created_at) ORDER BY date_trunc('month', created_at)`,
      args,
    )
    out.grafik_pendapatan = rows.map((row) => ({ bulan: row.bulan, total: Number(row.total ?? 0) }))
  } catch {
    // seperti Go: kunci tidak diset bila query gagal
  }

  try {
    const rows = await query<{ nama: string; total: number; terisi: number }>(
      `SELECT p.nama, count(r.id) AS total,
         count(r.id) FILTER (WHERE r.status='terisi') AS terisi
       FROM properties p LEFT JOIN rooms r ON r.properti_id=p.id
       WHERE p.deleted_at IS NULL${own('p.owner_id')} GROUP BY p.id, p.nama ORDER BY p.nama`,
      args,
    )
    out.okupansi_per_properti = rows.map((row) => {
      const total = Number(row.total ?? 0)
      const terisi = Number(row.terisi ?? 0)
      return {
        nama: row.nama,
        total,
        terisi,
        persen: total > 0 ? round2((terisi / total) * 100) : 0,
      }
    })
  } catch {
    // seperti Go: kunci tidak diset bila query gagal
  }

  return out
}

async function reportTable(
  kind: string,
  from: string,
  to: string,
  propertyID: string,
  ownerID: string,
): Promise<{ table: ReportTable; title: string }> {
  const t: ReportTable = { Headers: [], Rows: [] }

  switch (kind) {
    case 'pendapatan': {
      t.Headers = ['Invoice', 'Penyewa', 'Properti', 'Tanggal Bayar', 'Total', 'Status']
      const rows = await query(
        `SELECT i.nomor_invoice, tn.nama_lengkap, pr.nama, coalesce(to_char(p.tanggal_bayar,'YYYY-MM-DD'),'-'), p.jumlah, p.status
         FROM payments p JOIN invoices i ON i.id=p.tagihan_id JOIN tenants tn ON tn.id=i.penyewa_id JOIN properties pr ON pr.id=i.properti_id
         WHERE p.status='verified' AND p.tanggal_bayar BETWEEN $1 AND $2 AND ($3::uuid IS NULL OR i.properti_id=$3)
         ${ownerID ? 'AND p.owner_id=$4' : ''}
         ORDER BY p.tanggal_bayar DESC`,
        ownerID ? [from, to, uuidArg(propertyID), ownerID] : [from, to, uuidArg(propertyID)],
      )
      t.Rows = rows.map(cells)
      break
    }
    case 'okupansi': {
      t.Headers = ['Properti', 'Kamar', 'Tipe', 'Status', 'Harga Bulanan']
      let sql = `SELECT p.nama, r.nomor, r.tipe, r.status, r.harga_bulanan FROM rooms r JOIN properties p ON p.id=r.properti_id WHERE p.deleted_at IS NULL`
      const params: unknown[] = []
      if (propertyID) {
        sql += ` AND p.id=$1`
        params.push(propertyID)
      }
      if (ownerID) {
        sql += ` AND r.owner_id=$${params.length + 1}`
        params.push(ownerID)
      }
      sql += ` ORDER BY p.nama, r.nomor`
      const rows = await query(sql, params)
      t.Rows = rows.map(cells)
      break
    }
    case 'tunggakan': {
      t.Headers = ['Invoice', 'Penyewa', 'Jatuh Tempo', 'Total', 'Umur (hari)', 'Aging', 'Status']
      const rows = await query(
        `SELECT i.nomor_invoice, tn.nama_lengkap, i.tanggal_jatuh_tempo, i.total,
           (now()::date - i.tanggal_jatuh_tempo) AS umur,
           CASE WHEN (now()::date - i.tanggal_jatuh_tempo) <= 30 THEN '0-30'
                WHEN (now()::date - i.tanggal_jatuh_tempo) <= 60 THEN '31-60' ELSE '60+' END AS aging, i.status
           FROM invoices i JOIN tenants tn ON tn.id=i.penyewa_id
           WHERE i.status IN ('terkirim','terlambat','sebagian')
             AND ($1::uuid IS NULL OR i.properti_id=$1)
             ${ownerID ? 'AND i.owner_id=$2' : ''}
             ORDER BY i.tanggal_jatuh_tempo`,
        ownerID ? [uuidArg(propertyID), ownerID] : [uuidArg(propertyID)],
      )
      t.Rows = rows.map(cells)
      break
    }
    case 'penyewa': {
      t.Headers = ['Nama', 'Email', 'No HP', 'Status', 'Kontrak Aktif', 'Bergabung']
      const rows = await query(
        `SELECT tn.nama_lengkap, tn.email, tn.no_hp, tn.status,
           (SELECT count(*) FROM contracts c JOIN rooms r ON r.id=c.kamar_id
             WHERE c.penyewa_id=tn.id AND c.status='aktif' AND ($1::uuid IS NULL OR r.properti_id=$1)),
           to_char(tn.created_at,'YYYY-MM-DD') AS bergabung
           FROM tenants tn
           WHERE ($1::uuid IS NULL OR EXISTS (
             SELECT 1 FROM contracts c JOIN rooms r ON r.id=c.kamar_id
             WHERE c.penyewa_id=tn.id AND r.properti_id=$1))
           ${ownerID ? 'AND tn.owner_id=$2' : ''}
            ORDER BY tn.nama_lengkap`,
        ownerID ? [uuidArg(propertyID), ownerID] : [uuidArg(propertyID)],
      )
      t.Rows = rows.map(cells)
      break
    }
    case 'maintenance': {
      t.Headers = ['Tiket', 'Judul', 'Kategori', 'Prioritas', 'Status', 'Dibuat', 'Selesai']
      const rows = await query(
        `SELECT nomor_tiket, judul, kategori, prioritas, status,
           to_char(created_at,'YYYY-MM-DD') AS dibuat, coalesce(to_char(resolved_at,'YYYY-MM-DD'),'-') AS selesai
           FROM tickets WHERE ($1::uuid IS NULL OR properti_id=$1)
           ${ownerID ? 'AND owner_id=$2' : ''} ORDER BY created_at DESC`,
        ownerID ? [uuidArg(propertyID), ownerID] : [uuidArg(propertyID)],
      )
      t.Rows = rows.map(cells)
      break
    }
    default:
      throw badRequest('Jenis laporan tidak dikenal')
  }

  return { table: t, title: `Laporan ${kind}` }
}

export async function reportData(
  kind: string,
  from: string,
  to: string,
  propertyID: string,
  ownerID: string,
): Promise<{ Headers: string[]; Rows: (string | number)[][] }> {
  const { table } = await reportTable(kind, from, to, propertyID, ownerID)
  return table
}

export async function exportReport(
  kind: string,
  from: string,
  to: string,
  propertyID: string,
  format: 'pdf' | 'xlsx',
  ownerID: string,
): Promise<{ bytes: Buffer; filename: string; contentType: string }> {
  const { table, title } = await reportTable(kind, from, to, propertyID, ownerID)
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Laporan')
    const header = sheet.addRow(table.Headers)
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    for (const row of table.Rows) sheet.addRow(row)
    sheet.columns.forEach((column) => {
      column.width = 22
    })
    const buffer = await workbook.xlsx.writeBuffer()
    return {
      bytes: Buffer.from(buffer),
      filename: `laporan-${kind}-${stamp}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
  }

  const rows = table.Rows.map((row) => row.map((v) => String(v)))
  const bytes = await tablePdfBuffer(title, table.Headers, rows)
  return {
    bytes,
    filename: `laporan-${kind}-${stamp}.pdf`,
    contentType: 'application/pdf',
  }
}
