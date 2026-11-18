-- KosMan initial schema — idempotent (safe to run on every cold start).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'owner', 'manager', 'tenant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'owner',
    no_hp           VARCHAR(20),
    avatar          TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif')),
    failed_login    INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    email_verified_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id),
    nama        VARCHAR(100) NOT NULL CHECK (char_length(nama) >= 3),
    tipe        VARCHAR(30) NOT NULL CHECK (tipe IN ('kos_putri','kos_putra','kos_campur','kontrakan','rumah')),
    alamat      TEXT NOT NULL,
    kota        VARCHAR(50) NOT NULL,
    provinsi    VARCHAR(50) NOT NULL,
    kode_pos    VARCHAR(10),
    latitude    NUMERIC(10,8),
    longitude   NUMERIC(11,8),
    deskripsi   TEXT,
    fasilitas   JSONB NOT NULL DEFAULT '[]'::jsonb,
    foto        JSONB NOT NULL DEFAULT '[]'::jsonb,
    status      VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif','maintenance')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_deleted ON properties(deleted_at);

CREATE TABLE IF NOT EXISTS rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    properti_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    nomor           VARCHAR(20) NOT NULL,
    tipe            VARCHAR(50) NOT NULL,
    luas_m2         NUMERIC(8,2),
    harga_bulanan   BIGINT NOT NULL CHECK (harga_bulanan >= 0),
    harga_tahunan   BIGINT,
    deposit         BIGINT NOT NULL DEFAULT 0,
    fasilitas       JSONB NOT NULL DEFAULT '[]'::jsonb,
    foto            JSONB NOT NULL DEFAULT '[]'::jsonb,
    status          VARCHAR(20) NOT NULL DEFAULT 'kosong' CHECK (status IN ('kosong','terisi','maintenance','reserved')),
    keterangan      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (properti_id, nomor)
);
CREATE INDEX IF NOT EXISTS idx_rooms_property ON rooms(properti_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);

CREATE TABLE IF NOT EXISTS tenants (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_lengkap            VARCHAR(100) NOT NULL,
    nik                     TEXT NOT NULL,
    nik_hash                TEXT NOT NULL UNIQUE,
    email                   VARCHAR(150) NOT NULL UNIQUE,
    no_hp                   VARCHAR(20) NOT NULL,
    alamat_asal             TEXT,
    pekerjaan               VARCHAR(100),
    kontak_darurat_nama     VARCHAR(100) NOT NULL,
    kontak_darurat_hp       VARCHAR(20) NOT NULL,
    foto_ktp                TEXT,
    dokumen_lain            JSONB NOT NULL DEFAULT '[]'::jsonb,
    status                  VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
    user_id                 UUID UNIQUE REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

CREATE TABLE IF NOT EXISTS contracts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_kontrak       VARCHAR(30) NOT NULL UNIQUE,
    penyewa_id          UUID NOT NULL REFERENCES tenants(id),
    kamar_id            UUID NOT NULL REFERENCES rooms(id),
    tanggal_mulai       DATE NOT NULL,
    tanggal_selesai     DATE NOT NULL,
    harga_sewa          BIGINT NOT NULL,
    deposit             BIGINT NOT NULL DEFAULT 0,
    deposit_dibayar     BOOLEAN NOT NULL DEFAULT FALSE,
    status              VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','selesai','batal','diperpanjang')),
    catatan             TEXT,
    dokumen_kontrak     TEXT,
    created_by          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (tanggal_selesai > tanggal_mulai)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_contract_per_room ON contracts(kamar_id) WHERE status = 'aktif';
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(penyewa_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end ON contracts(tanggal_selesai);

CREATE TABLE IF NOT EXISTS invoices (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_invoice           VARCHAR(30) NOT NULL UNIQUE,
    kontrak_id              UUID NOT NULL REFERENCES contracts(id),
    penyewa_id              UUID NOT NULL REFERENCES tenants(id),
    properti_id             UUID NOT NULL REFERENCES properties(id),
    periode_mulai           DATE NOT NULL,
    periode_selesai         DATE NOT NULL,
    jumlah_pokok            BIGINT NOT NULL,
    item_tambahan           JSONB NOT NULL DEFAULT '[]'::jsonb,
    diskon                  BIGINT NOT NULL DEFAULT 0,
    denda                   BIGINT NOT NULL DEFAULT 0,
    total                   BIGINT NOT NULL,
    tanggal_jatuh_tempo     DATE NOT NULL,
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','terkirim','dibayar','sebagian','terlambat','batal')),
    tanggal_bayar           TIMESTAMPTZ,
    metode_bayar            VARCHAR(20) CHECK (metode_bayar IN ('transfer_bank','cash','ewallet')),
    catatan                 TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(penyewa_id);
CREATE INDEX IF NOT EXISTS idx_invoices_property ON invoices(properti_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(tanggal_jatuh_tempo);

CREATE TABLE IF NOT EXISTS payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tagihan_id          UUID NOT NULL REFERENCES invoices(id),
    jumlah              BIGINT NOT NULL CHECK (jumlah > 0),
    metode              VARCHAR(20) NOT NULL CHECK (metode IN ('transfer_bank','cash','ewallet')),
    bukti_bayar         TEXT,
    tanggal_bayar       DATE NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
    diverifikasi_oleh   UUID REFERENCES users(id),
    catatan_admin       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(tagihan_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS tickets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_tiket     VARCHAR(20) NOT NULL UNIQUE,
    penyewa_id      UUID NOT NULL REFERENCES tenants(id),
    kamar_id        UUID NOT NULL REFERENCES rooms(id),
    properti_id     UUID NOT NULL REFERENCES properties(id),
    judul           VARCHAR(100) NOT NULL,
    deskripsi       TEXT NOT NULL,
    kategori        VARCHAR(20) NOT NULL CHECK (kategori IN ('listrik','air','furniture','kebersihan','lainnya')),
    prioritas       VARCHAR(20) NOT NULL DEFAULT 'sedang' CHECK (prioritas IN ('rendah','sedang','tinggi','urgent')),
    foto            JSONB NOT NULL DEFAULT '[]'::jsonb,
    status          VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
    assigned_to     UUID REFERENCES users(id),
    resolusi        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON tickets(penyewa_id);
CREATE INDEX IF NOT EXISTS idx_tickets_property ON tickets(properti_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(prioritas);

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    judul       VARCHAR(150) NOT NULL,
    isi         TEXT NOT NULL,
    tipe        VARCHAR(50) NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS bank_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank            VARCHAR(50) NOT NULL,
    nomor_rekening  VARCHAR(50) NOT NULL,
    nama_pemilik    VARCHAR(100) NOT NULL,
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_owner ON bank_accounts(owner_id);

CREATE TABLE IF NOT EXISTS settings (
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key         VARCHAR(80) NOT NULL,
    value       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_id, key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id),
    aksi        VARCHAR(80) NOT NULL,
    entitas     VARCHAR(50) NOT NULL,
    entitas_id  UUID,
    detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated') THEN
    CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_properties_updated') THEN
    CREATE TRIGGER trg_properties_updated BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rooms_updated') THEN
    CREATE TRIGGER trg_rooms_updated BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tenants_updated') THEN
    CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contracts_updated') THEN
    CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invoices_updated') THEN
    CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payments_updated') THEN
    CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tickets_updated') THEN
    CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
