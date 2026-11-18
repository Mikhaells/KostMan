import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { toast } from '../../lib/toast'
import { Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Textarea } from '../../components/ui'
import type { BankAccount } from '../../types'

type SettingsMap = Record<string, unknown>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsMap>('/settings') })
  const banks = useQuery({ queryKey: ['settings', 'banks'], queryFn: () => api.get<BankAccount[]>('/settings/banks') })

  const [denda, setDenda] = useState({ nominal: '10000', grace_period: '3' })
  const [reminder, setReminder] = useState({ invoice_h: '3', kontrak_h: '7' })
  const [invoiceFooter, setInvoiceFooter] = useState('')
  const [template, setTemplate] = useState('')
  const [timezone, setTimezone] = useState('Asia/Jakarta')
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY')
  const [branding, setBranding] = useState({ nama: 'KosMan', logo: '' })
  const [notif, setNotif] = useState<Record<string, boolean>>({})
  const [bankModal, setBankModal] = useState(false)
  const [bankForm, setBankForm] = useState({ bank: '', nomor_rekening: '', nama_pemilik: '', is_primary: false })

  useEffect(() => {
    const data = settings.data
    if (!data) return
    const d = asRecord(data.denda)
    setDenda({ nominal: String(num(d.nominal, 10000)), grace_period: String(num(d.grace_period, 3)) })
    const r = asRecord(data.reminder)
    setReminder({ invoice_h: String(num(r.invoice_h, 3)), kontrak_h: String(num(r.kontrak_h, 7)) })
    setInvoiceFooter(str(data.invoice_footer))
    setTemplate(str(data.kontrak_template))
    setTimezone(str(data.timezone, 'Asia/Jakarta'))
    setDateFormat(str(data.date_format, 'DD/MM/YYYY'))
    const b = asRecord(data.branding)
    setBranding({ nama: str(b.nama, 'KosMan'), logo: str(b.logo) })
    setNotif(asRecord(data.notifikasi) as Record<string, boolean>)
  }, [settings.data])

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api.put(`/settings/${key}`, value),
    onSuccess: () => { toast('Pengaturan disimpan'); queryClient.invalidateQueries({ queryKey: ['settings'] }) },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const createBank = useMutation({
    mutationFn: () => api.post('/settings/banks', bankForm),
    onSuccess: () => {
      toast('Rekening ditambahkan')
      setBankModal(false)
      setBankForm({ bank: '', nomor_rekening: '', nama_pemilik: '', is_primary: false })
      queryClient.invalidateQueries({ queryKey: ['settings', 'banks'] })
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  const deleteBank = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/banks/${id}`),
    onSuccess: () => { toast('Rekening dihapus'); queryClient.invalidateQueries({ queryKey: ['settings', 'banks'] }) },
    onError: (error) => toast(errorMessage(error), 'error'),
  })

  return (
    <>
      <PageHeader title="Pengaturan" subtitle="Atur denda, reminder, format dokumen, dan rekening pembayaran." />

      {settings.isLoading ? <Loading /> : settings.isError ? <ErrorState message={errorMessage(settings.error)} onRetry={() => settings.refetch()} /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Denda Keterlambatan" subtitle="Dikenakan setelah masa tenggang." action={<Button size="sm" loading={save.isPending} onClick={() => save.mutate({ key: 'denda', value: { nominal: Number(denda.nominal), tipe: 'harian', grace_period: Number(denda.grace_period) } })}>Simpan</Button>} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Nominal per hari"><Input type="number" value={denda.nominal} onChange={(event) => setDenda((prev) => ({ ...prev, nominal: event.target.value }))} /></Field>
              <Field label="Masa tenggang (hari)"><Input type="number" value={denda.grace_period} onChange={(event) => setDenda((prev) => ({ ...prev, grace_period: event.target.value }))} /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Pengingat Otomatis" subtitle="Notifikasi sebelum jatuh tempo." action={<Button size="sm" loading={save.isPending} onClick={() => save.mutate({ key: 'reminder', value: { invoice_h: Number(reminder.invoice_h), kontrak_h: Number(reminder.kontrak_h) } })}>Simpan</Button>} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Tagihan (jam sebelum)"><Input type="number" value={reminder.invoice_h} onChange={(event) => setReminder((prev) => ({ ...prev, invoice_h: event.target.value }))} /></Field>
              <Field label="Kontrak (hari sebelum)"><Input type="number" value={reminder.kontrak_h} onChange={(event) => setReminder((prev) => ({ ...prev, kontrak_h: event.target.value }))} /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Format & Branding" action={<Button size="sm" loading={save.isPending} onClick={() => {
              save.mutate({ key: 'timezone', value: timezone })
              save.mutate({ key: 'date_format', value: dateFormat })
              save.mutate({ key: 'branding', value: branding })
            }}>Simpan</Button>} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Zona waktu"><Input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field>
              <Field label="Format tanggal"><Input value={dateFormat} onChange={(event) => setDateFormat(event.target.value)} /></Field>
              <Field label="Nama aplikasi"><Input value={branding.nama} onChange={(event) => setBranding((prev) => ({ ...prev, nama: event.target.value }))} /></Field>
              <Field label="URL logo"><Input value={branding.logo} onChange={(event) => setBranding((prev) => ({ ...prev, logo: event.target.value }))} /></Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Notifikasi" subtitle="Jenis pengingat yang aktif." action={<Button size="sm" loading={save.isPending} onClick={() => save.mutate({ key: 'notifikasi', value: notif })}>Simpan</Button>} />
            <div className="space-y-3 p-5">
              {[
                ['invoice_created', 'Tagihan baru dibuat'],
                ['invoice_reminder', 'Pengingat jatuh tempo'],
                ['payment_verified', 'Pembayaran terverifikasi'],
                ['ticket_resolved', 'Tiket selesai'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-700">
                  {label}
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={Boolean(notif[key])}
                    onChange={(event) => setNotif((prev) => ({ ...prev, [key]: event.target.checked }))}
                  />
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Footer Invoice" action={<Button size="sm" loading={save.isPending} onClick={() => save.mutate({ key: 'invoice_footer', value: invoiceFooter })}>Simpan</Button>} />
            <div className="p-5"><Textarea value={invoiceFooter} onChange={(event) => setInvoiceFooter(event.target.value)} /></div>
          </Card>

          <Card>
            <CardHeader title="Template Kontrak" subtitle="Variabel: {{nama}}, {{kamar}}, {{properti}}, {{mulai}}, {{selesai}}" action={<Button size="sm" loading={save.isPending} onClick={() => save.mutate({ key: 'kontrak_template', value: template })}>Simpan</Button>} />
            <div className="p-5"><Textarea className="min-h-[140px]" value={template} onChange={(event) => setTemplate(event.target.value)} /></div>
          </Card>
        </div>
      )}

      <Card className="mt-5">
        <CardHeader title="Rekening Bank" subtitle="Rekening untuk pembayaran transfer." action={<Button size="sm" onClick={() => setBankModal(true)}><Plus className="h-4 w-4" /> Tambah Rekening</Button>} />
        {banks.isLoading ? <Loading /> : banks.isError ? <ErrorState message={errorMessage(banks.error)} /> : (
          (banks.data ?? []).length === 0 ? <EmptyState title="Belum ada rekening" description="Tambahkan rekening agar penyewa dapat melakukan transfer." /> : (
            <div className="divide-y divide-slate-100">
              {(banks.data ?? []).map((bank) => (
                <div key={bank.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">{bank.bank} {bank.is_primary && <span className="ml-1 rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600">UTAMA</span>}</p>
                    <p className="text-sm text-slate-500">{bank.nomor_rekening} · a.n. {bank.nama_pemilik}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteBank.mutate(bank.id)} aria-label="Hapus"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                </div>
              ))}
            </div>
          )
        )}
      </Card>

      <Modal
        open={bankModal}
        onClose={() => setBankModal(false)}
        title="Tambah Rekening Bank"
        footer={<><Button variant="outline" onClick={() => setBankModal(false)}>Batal</Button><Button loading={createBank.isPending} onClick={() => createBank.mutate()}>Simpan</Button></>}
      >
        <div className="space-y-4">
          <Field label="Bank" required><Input value={bankForm.bank} onChange={(event) => setBankForm((prev) => ({ ...prev, bank: event.target.value }))} placeholder="BCA" /></Field>
          <Field label="Nomor rekening" required><Input value={bankForm.nomor_rekening} onChange={(event) => setBankForm((prev) => ({ ...prev, nomor_rekening: event.target.value }))} /></Field>
          <Field label="Nama pemilik" required><Input value={bankForm.nama_pemilik} onChange={(event) => setBankForm((prev) => ({ ...prev, nama_pemilik: event.target.value }))} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={bankForm.is_primary} onChange={(event) => setBankForm((prev) => ({ ...prev, is_primary: event.target.checked }))} />
            Jadikan rekening utama
          </label>
        </div>
      </Modal>
    </>
  )
}
