import { Pool, type PoolClient, types } from 'pg'
import { randomUUID } from 'node:crypto'
import { config } from './config'
import { encrypt, hashPassword, sha256 } from './crypto'
import { SCHEMA_SQL } from './schema'
import { OWNER_SCOPE_SQL } from './schema-owner'

// Go's BIGINT/NUMERIC come back as strings by default; the UI expects numbers.
types.setTypeParser(20, (value) => Number(value))
types.setTypeParser(1700, (value) => Number(value))

const useSsl = !/sslmode=disable/i.test(config.databaseUrl)
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
})

export interface Tx {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }>
  one: <T = any>(sql: string, params?: unknown[]) => Promise<T | null>
  scalar: <T = any>(sql: string, params?: unknown[]) => Promise<T | null>
  exec: (sql: string, params?: unknown[]) => Promise<number>
}

async function runQuery(client: PoolClient | Pool, sql: string, params: unknown[] = []) {
  return client.query(sql, params)
}

export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureDatabase()
  const result = await runQuery(pool, sql, params)
  return result.rows as T[]
}

export async function queryOne<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function scalar<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  const row = await queryOne<Record<string, T>>(sql, params)
  if (!row) return null
  return Object.values(row)[0] ?? null
}

export async function exec(sql: string, params: unknown[] = []): Promise<number> {
  await ensureDatabase()
  const result = await runQuery(pool, sql, params)
  return result.rowCount ?? 0
}

export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  await ensureDatabase()
  const client = await pool.connect()
  const tx: Tx = {
    query: (sql, params = []) => client.query(sql, params),
    one: async (sql, params = []) => (await client.query(sql, params)).rows[0] ?? null,
    scalar: async <T = any>(sql: string, params: unknown[] = []): Promise<T | null> => {
      const r = await client.query(sql, params)
      return (r.rows.length ? Object.values(r.rows[0])[0] : null) as T | null
    },
    exec: async (sql, params = []) => (await client.query(sql, params)).rowCount ?? 0,
  }
  try {
    await client.query('BEGIN')
    const result = await fn(tx)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

let ready: Promise<void> | null = null

export function ensureDatabase(): Promise<void> {
  if (!ready) ready = prepare().catch((error) => {
    ready = null
    throw error
  })
  return ready
}

async function prepare(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS kosman_schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
    await client.query('SELECT pg_advisory_lock(74319028374652)')
    try {
      const applied = await client.query(`SELECT 1 FROM kosman_schema_migrations WHERE name='000001_init'`)
      if (!applied.rowCount) {
        await client.query('BEGIN')
        await client.query(SCHEMA_SQL)
        await client.query(`INSERT INTO kosman_schema_migrations (name) VALUES ('000001_init')`)
        await client.query('COMMIT')
      }
      const scoped = await client.query(`SELECT 1 FROM kosman_schema_migrations WHERE name='000002_owner_scope'`)
      if (!scoped.rowCount) {
        await client.query('BEGIN')
        await client.query(OWNER_SCOPE_SQL)
        await client.query(`INSERT INTO kosman_schema_migrations (name) VALUES ('000002_owner_scope')`)
        await client.query('COMMIT')
      }
      await seedIfEmpty(client)
    } finally {
      await client.query('SELECT pg_advisory_unlock(74319028374652)')
    }
  } finally {
    client.release()
  }
}

async function seedIfEmpty(client: PoolClient): Promise<void> {
  const count = await client.query('SELECT count(*)::int AS n FROM users')
  if (Number(count.rows[0]?.n ?? 0) > 0) return

  const hash = await hashPassword('Admin123')
  const ownerID = randomUUID()
  const managerID = randomUUID()
  const tenantUsers = [randomUUID(), randomUUID(), randomUUID()]
  const stamp = (s: string) => JSON.stringify(s)

  const insertUser = (id: string, nama: string, email: string, role: string, ownerId: string) =>
    client.query(
      `INSERT INTO users (id,nama,email,password_hash,role,no_hp,status,owner_id) VALUES ($1,$2,$3,$4,$5,'081234567890','aktif',$6)
       ON CONFLICT (email) DO NOTHING`,
      [id, nama, email, hash, role, ownerId],
    )

  await insertUser(ownerID, 'Budi Santoso', 'owner@kosman.id', 'owner', ownerID)
  await insertUser(managerID, 'Siti Aminah', 'manager@kosman.id', 'manager', ownerID)
  for (let i = 0; i < tenantUsers.length; i++) {
    await insertUser(tenantUsers[i], `Penyewa ${i + 1}`, `penyewa${i + 1}@kosman.id`, 'tenant', ownerID)
  }

  const prop1 = randomUUID()
  const prop2 = randomUUID()
  const insertProperty = (id: string, nama: string, tipe: string, kota: string) =>
    client.query(
      `INSERT INTO properties (id,owner_id,nama,tipe,alamat,kota,provinsi,status,fasilitas,foto)
       VALUES ($1,$2,$3,$4,$5,$6,'Jawa Barat','aktif',$7,'[]')`,
      [id, ownerID, nama, tipe, `Jl. Melati No. ${kota}`, kota, stamp('["wifi","parkir","dapur"]')],
    )
  await insertProperty(prop1, 'Kos Melati Putri', 'kos_putri', 'Bandung')
  await insertProperty(prop2, 'Kontrakan Anggrek', 'kontrakan', 'Bandung')

  const rooms = [
    [prop1, 'A01', 1500000, 'terisi'],
    [prop1, 'A02', 1600000, 'terisi'],
    [prop1, 'A03', 1500000, 'kosong'],
    [prop1, 'A04', 1400000, 'maintenance'],
    [prop2, 'B01', 2500000, 'terisi'],
    [prop2, 'B02', 2500000, 'kosong'],
  ] as const
  const roomIDs = rooms.map(() => randomUUID())
  for (let i = 0; i < rooms.length; i++) {
    await client.query(
      `INSERT INTO rooms (id,owner_id,properti_id,nomor,tipe,harga_bulanan,deposit,status,fasilitas,foto)
       VALUES ($1,$2,$3,$4,'single',$5,500000,$6,$7,'[]')`,
      [roomIDs[i], ownerID, rooms[i][0], rooms[i][1], rooms[i][2], rooms[i][3], stamp('["AC","kasur","lemari"]')],
    )
  }

  const tenantIDs = [randomUUID(), randomUUID(), randomUUID()]
  const names = ['Andi Pratama', 'Dewi Lestari', 'Rizky Ramadhan']
  for (let i = 0; i < 3; i++) {
    const nik = `320400123456${String(i + 1).padStart(4, '0')}`
    await client.query(
      `INSERT INTO tenants (id,owner_id,nama_lengkap,nik,nik_hash,email,no_hp,pekerjaan,kontak_darurat_nama,kontak_darurat_hp,foto_ktp,status,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Karyawan','Keluarga','081211112222','/uploads/ktp-contoh.jpg','aktif',$8)`,
      [tenantIDs[i], ownerID, names[i], encrypt(nik), sha256(nik), `penyewa${i + 1}@kosman.id`, `0812999900${i + 1}`, tenantUsers[i]],
    )
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const ym = `${monthStart.getFullYear()}${String(monthStart.getMonth() + 1).padStart(2, '0')}`
  const prices = [1500000, 1600000, 2500000]
  const invoiceTotals = [1650000, 1750000, 2650000]
  const contractIDs = [randomUUID(), randomUUID(), randomUUID()]
  const invoiceIDs = [randomUUID(), randomUUID(), randomUUID()]
  const propFor = [prop1, prop1, prop2]
  const statuses = ['dibayar', 'terkirim', 'terlambat']
  for (let i = 0; i < 3; i++) {
    await client.query(
      `INSERT INTO contracts (id,owner_id,nomor_kontrak,penyewa_id,kamar_id,tanggal_mulai,tanggal_selesai,harga_sewa,deposit,deposit_dibayar,status,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,500000,TRUE,'aktif',$9)`,
      [contractIDs[i], ownerID, `KTR-${ym}-${String(i + 1).padStart(4, '0')}`, tenantIDs[i], roomIDs[i], monthStart, monthEnd, prices[i], ownerID],
    )
  }
  for (let i = 0; i < 3; i++) {
    const due = new Date(monthStart.getFullYear(), monthStart.getMonth(), 10)
    const created = new Date(now.getTime() - i * 86400000)
    await client.query(
      `INSERT INTO invoices (id,owner_id,nomor_invoice,kontrak_id,penyewa_id,properti_id,periode_mulai,periode_selesai,
        jumlah_pokok,item_tambahan,diskon,denda,total,tanggal_jatuh_tempo,status,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,$11,$12,$13,$14)`,
      [invoiceIDs[i], ownerID, `INV-${ym}-${String(i + 1).padStart(4, '0')}`, contractIDs[i], tenantIDs[i], propFor[i],
        monthStart, monthEnd, prices[i], '[{"nama":"Listrik","jumlah":150000}]', invoiceTotals[i], due, statuses[i], created],
    )
  }
  await client.query(`UPDATE invoices SET tanggal_bayar=now(), metode_bayar='transfer_bank' WHERE id=$1`, [invoiceIDs[0]])
  await client.query(
    `INSERT INTO payments (owner_id,tagihan_id,jumlah,metode,bukti_bayar,tanggal_bayar,status,diverifikasi_oleh)
     VALUES ($1,$2,1650000,'transfer_bank','/uploads/bukti-contoh.jpg',$3,'verified',$4)`,
    [ownerID, invoiceIDs[0], new Date(now.getTime() - 5 * 86400000), ownerID],
  )
  await client.query(
    `INSERT INTO payments (owner_id,tagihan_id,jumlah,metode,bukti_bayar,tanggal_bayar,status)
     VALUES ($1,$2,800000,'transfer_bank','/uploads/bukti-contoh-2.jpg',$3,'pending')`,
    [ownerID, invoiceIDs[2], new Date(now.getTime() - 86400000)],
  )

  const tickets = [
    ['AC kamar tidak dingin', 'listrik', 'urgent', 'open'],
    ['Kran air bocor', 'air', 'tinggi', 'in_progress'],
    ['Lemari rusak', 'furniture', 'sedang', 'resolved'],
  ]
  for (let i = 0; i < tickets.length; i++) {
    await client.query(
      `INSERT INTO tickets (owner_id,nomor_tiket,penyewa_id,kamar_id,properti_id,judul,deskripsi,kategori,prioritas,foto,status,assigned_to,resolusi,resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]',$10,$11,$12,$13)`,
      [ownerID, `TKT-${ym}-${String(i + 1).padStart(4, '0')}`, tenantIDs[i], roomIDs[i], propFor[i], tickets[i][0],
        'Mohon dibantu segera, terima kasih.', tickets[i][1], tickets[i][2], tickets[i][3], managerID,
        tickets[i][3] === 'resolved' ? 'Sudah diperbaiki' : null, tickets[i][3] === 'resolved' ? now : null],
    )
  }

  await client.query(
    `INSERT INTO settings (owner_id,key,value) VALUES ($1,'denda','{"nominal":10000,"tipe":"harian","grace_period":3}')
     ON CONFLICT (owner_id,key) DO NOTHING`,
    [ownerID],
  )
  await client.query(
    `INSERT INTO bank_accounts (owner_id,bank,nomor_rekening,nama_pemilik,is_primary)
     VALUES ($1,'BCA','1234567890','Budi Santoso',TRUE)`,
    [ownerID],
  )
}
