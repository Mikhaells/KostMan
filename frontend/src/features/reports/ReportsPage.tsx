import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { api, downloadFile, errorMessage } from '../../lib/api'
import { monthStartISO, rupiah, todayISO } from '../../lib/format'
import { usePropertyOptions } from '../../hooks/useLookups'
import { Button, Card, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select, Table, Td, Th } from '../../components/ui'
import type { ReportData } from '../../types'

const kinds = [
  { value: 'pendapatan', label: 'Pendapatan' },
  { value: 'okupansi', label: 'Okupansi' },
  { value: 'tunggakan', label: 'Tunggakan' },
  { value: 'penyewa', label: 'Penyewa' },
  { value: 'maintenance', label: 'Maintenance' },
]

export default function ReportsPage() {
  const properties = usePropertyOptions()
  const [kind, setKind] = useState('pendapatan')
  const [from, setFrom] = useState(monthStartISO())
  const [to, setTo] = useState(todayISO())
  const [propertyId, setPropertyId] = useState('')
  const [applied, setApplied] = useState({ kind: 'pendapatan', from: monthStartISO(), to: todayISO(), propertyId: '' })

  const report = useQuery({
    queryKey: ['reports', applied.kind, applied.from, applied.to, applied.propertyId],
    queryFn: () => api.get<ReportData>(`/reports/${applied.kind}`, {
      from: applied.from, to: applied.to, properti_id: applied.propertyId || undefined,
    }),
  })

  const exportReport = (format: 'pdf' | 'excel') => {
    const params = new URLSearchParams({ format, from, to })
    if (propertyId) params.set('properti_id', propertyId)
    downloadFile(`/reports/${kind}/export?${params.toString()}`, `laporan-${kind}.${format === 'pdf' ? 'pdf' : 'xlsx'}`)
  }

  const data = report.data
  const headers = data?.Headers ?? []
  const rows = data?.Rows ?? []

  return (
    <>
      <PageHeader
        title="Laporan"
        subtitle="Lihat dan ekspor laporan operasional kos."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportReport('excel')}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            <Button variant="outline" size="sm" onClick={() => exportReport('pdf')}><FileText className="h-4 w-4" /> PDF</Button>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Jenis laporan">
            <Select value={kind} onChange={(event) => setKind(event.target.value)}>
              {kinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </Select>
          </Field>
          <Field label="Dari tanggal"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="Sampai tanggal"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          <Field label="Properti">
            <Select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              <option value="">Semua properti</option>
              {(properties.data?.items ?? []).map((property) => <option key={property.id} value={property.id}>{property.nama}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => setApplied({ kind, from, to, propertyId })}><Download className="h-4 w-4" /> Tampilkan</Button>
          </div>
        </div>
      </Card>

      <Card>
        {report.isLoading ? <Loading /> : report.isError ? <ErrorState message={errorMessage(report.error)} onRetry={() => report.refetch()} /> : (
          headers.length === 0 || rows.length === 0 ? (
            <EmptyState title="Tidak ada data" description="Ubah rentang tanggal atau filter properti untuk melihat laporan." />
          ) : (
            <Table>
              <thead><tr>{headers.map((header) => <Th key={header}>{header}</Th>)}</tr></thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <Td key={cellIndex} className={typeof cell === 'number' && /total|jumlah|harga|tagihan/i.test(headers[cellIndex] ?? '') ? 'font-semibold' : ''}>
                        {typeof cell === 'number' && /total|jumlah|harga|tagihan/i.test(headers[cellIndex] ?? '') ? rupiah(cell) : String(cell ?? '-')}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        )}
      </Card>
    </>
  )
}
