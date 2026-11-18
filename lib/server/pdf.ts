import PDFDocument from 'pdfkit'

/**
 * Generator PDF ringan (pengganti gofpdf): A4, Helvetica, tabel
 * berbasis doc.text dengan kolom tetap. Mengembalikan Buffer PDF.
 */

type Doc = PDFKit.PDFDocument

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dateParts(value: unknown): [string, string, string] {
  if (value instanceof Date) {
    return [
      String(value.getFullYear()),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ]
  }
  const text = String(value ?? '')
  const [year = '', month = '', day = ''] = text.slice(0, 10).split('-')
  return [year, month, day]
}

/** time.Format("02 Jan 2006") */
function longDate(value: unknown): string {
  const [year, month, day] = dateParts(value)
  return `${day} ${MONTHS[Number(month) - 1] ?? ''} ${year}`
}

function rupiah(value: unknown): string {
  return `Rp${Number(value ?? 0)}`
}

function items(value: unknown): Array<{ nama: string; jumlah: number }> {
  if (Array.isArray(value)) return value as Array<{ nama: string; jumlah: number }>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function collect(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

function pageHeader(doc: Doc, title: string, margin: number, width: number): number {
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000').text(title, margin, 46, { width, align: 'left' })
  const lineY = doc.y + 4
  doc.save().strokeColor('#1e6950').lineWidth(1).moveTo(margin, lineY).lineTo(margin + width, lineY).stroke().restore()
  return lineY + 10
}

function pageFooter(doc: Doc, margin: number, width: number): void {
  doc.font('Helvetica-Oblique').fontSize(8).fillColor('#555555').text(
    'Dokumen ini dihasilkan otomatis oleh Sistem Manajemen Kos & Kontrakan.',
    margin,
    doc.page.height - 58,
    { width, align: 'center', lineBreak: false },
  )
}

/** Menuliskan satu baris tabel dengan latar belakang opsional. */
function row(doc: Doc, y: number, values: string[], widths: number[], bold: boolean, fill?: string): void {
  const height = 22
  const total = widths.reduce((sum, w) => sum + w, 0)
  if (fill) {
    doc.save().rect(widths[0] === undefined ? 0 : (doc.page.width - total) / 2, y, total, height).fill(fill).restore()
  }
  let x = (doc.page.width - total) / 2
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9).fillColor('#000000')
  values.forEach((value, index) => {
    const w = widths[index] ?? widths[widths.length - 1] ?? 60
    doc.text(String(value ?? ''), x + 4, y + 6, { width: w - 8, lineBreak: false, ellipsis: true })
    x += w
  })
}

export async function contractPdfBuffer(
  contract: any,
  tenant: any,
  roomNo: string,
  propertyName: string,
  ownerName: string,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 45 })
  const margin = 45
  const width = doc.page.width - margin * 2
  let y = pageHeader(doc, 'KONTRAK SEWA', margin, width)

  doc.font('Helvetica-Bold').fontSize(12).text(String(contract?.nomor_kontrak ?? ''), margin, y, { width, align: 'right' })
  y = doc.y + 6

  doc.font('Helvetica').fontSize(10)
  const lines = [
    `Pemilik: ${ownerName ?? ''}`,
    `Penyewa: ${tenant?.nama_lengkap ?? ''} (NIK ${tenant?.nik ?? ''})`,
    `Properti: ${propertyName ?? ''}, Kamar ${roomNo ?? ''}`,
    `Masa sewa: ${longDate(contract?.tanggal_mulai)} s/d ${longDate(contract?.tanggal_selesai)}`,
    `Harga sewa per bulan: ${rupiah(contract?.harga_sewa)}`,
    `Deposit: ${rupiah(contract?.deposit)}`,
  ]
  for (const line of lines) {
    doc.text(line, margin, y, { width })
    y = doc.y + 2
  }

  y += 10
  doc.font('Helvetica-Bold').text('Ketentuan:', margin, y, { width })
  y = doc.y + 2
  doc.font('Helvetica')
  for (const line of [
    '1. Pembayaran sewa dilakukan sebelum tanggal jatuh tempo yang ditentukan.',
    '2. Penyewa bertanggung jawab atas kerusakan yang timbul selama masa sewa.',
    '3. Deposit dikembalikan setelah kontrak berakhir dengan memperhatikan kondisi kamar.',
    '4. Kontrak dapat diperpanjang dengan persetujuan kedua belah pihak.',
  ]) {
    doc.text(line, margin, y, { width })
    y = doc.y + 2
  }

  y += 18
  const half = width / 2
  doc.font('Helvetica-Bold').text('Pemilik,', margin, y, { width: half, align: 'center' })
  doc.text('Penyewa,', margin + half, y, { width: half, align: 'center' })
  y += 24
  doc.font('Helvetica').text(`( ${ownerName ?? ''} )`, margin, y, { width: half, align: 'center' })
  doc.text(`( ${tenant?.nama_lengkap ?? ''} )`, margin + half, y, { width: half, align: 'center' })

  pageFooter(doc, margin, width)
  return collect(doc)
}

export async function invoicePdfBuffer(invoice: any, tenant: any, propertyName: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 45 })
  const margin = 45
  const width = doc.page.width - margin * 2
  let y = pageHeader(doc, 'INVOICE / TAGIHAN', margin, width)

  doc.font('Helvetica-Bold').fontSize(12).text(String(invoice?.nomor_invoice ?? ''), margin, y, { width, align: 'right' })
  y = doc.y + 4

  doc.font('Helvetica').fontSize(10)
  for (const line of [
    `Penyewa: ${tenant?.nama_lengkap ?? ''}`,
    `Properti: ${propertyName ?? ''}`,
    `Periode: ${longDate(invoice?.periode_mulai)} s/d ${longDate(invoice?.periode_selesai)}`,
    `Jatuh tempo: ${longDate(invoice?.tanggal_jatuh_tempo)}`,
  ]) {
    doc.text(line, margin, y, { width })
    y = doc.y + 2
  }

  y += 10
  const widths = [Math.round(width * 0.5), Math.round(width * 0.2), width - Math.round(width * 0.5) - Math.round(width * 0.2)]
  const left = (doc.page.width - width) / 2
  doc.save().rect(left, y, width, 22).fill('#ebf2ee').restore()
  row(doc, y, ['Keterangan', 'Qty', 'Jumlah'], widths, true)
  y += 26

  const lines: string[][] = [
    ['Sewa kamar', '1', rupiah(invoice?.jumlah_pokok)],
    ...items(invoice?.item_tambahan).map((item) => [String(item?.nama ?? ''), '1', rupiah(item?.jumlah)]),
    ['Diskon', '-', rupiah(invoice?.diskon)],
    ['Denda', '1', rupiah(invoice?.denda)],
  ]
  for (const values of lines) {
    if (y > doc.page.height - 110) {
      doc.addPage()
      y = pageHeader(doc, 'INVOICE / TAGIHAN (lanjutan)', margin, width)
      row(doc, y, ['Keterangan', 'Qty', 'Jumlah'], widths, true, '#ebf2ee')
      y += 26
    }
    row(doc, y, values, widths, false)
    y += 24
  }

  doc.save().rect(left, y, width, 26).fill('#ebf2ee').restore()
  row(doc, y + 2, ['TOTAL', '', rupiah(invoice?.total)], widths, true)
  y += 38
  doc.font('Helvetica').fontSize(10).text(`Status: ${invoice?.status ?? ''}`, margin, y, { width })

  pageFooter(doc, margin, width)
  return collect(doc)
}

export async function tablePdfBuffer(title: string, headers: string[], rowsData: string[][]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 34 })
  const margin = 34
  const width = doc.page.width - margin * 2
  const heads = headers.map(String)
  const colWidth = heads.length ? Math.floor(width / heads.length) : width
  const widths = heads.map(() => colWidth)
  const totalWidth = widths.reduce((sum, w) => sum + w, 0)

  let y = pageHeader(doc, String(title ?? ''), margin, width)
  const drawHead = () => {
    doc.save().rect((doc.page.width - totalWidth) / 2, y, totalWidth, 22).fill('#ebf2ee').restore()
    row(doc, y, heads, widths, true)
    y += 26
  }
  drawHead()

  for (const values of rowsData) {
    if (y > doc.page.height - 70) {
      doc.addPage()
      y = pageHeader(doc, String(title ?? ''), margin, width)
      drawHead()
    }
    row(doc, y, heads.map((_, index) => String(values?.[index] ?? '')), widths, false)
    y += 23
  }

  pageFooter(doc, margin, width)
  return collect(doc)
}
