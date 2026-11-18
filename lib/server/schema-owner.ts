// Migrasi 000002: isolasi data per owner.
// Dipisah dari SCHEMA_SQL supaya database lama tetap ter-upgrade otomatis.
export const OWNER_SCOPE_SQL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_users_owner ON users(owner_id);

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_id);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_id);

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_contracts_owner ON contracts(owner_id);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_invoices_owner ON invoices(owner_id);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(owner_id);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(owner_id);

UPDATE users SET owner_id = id WHERE role = 'owner' AND owner_id IS NULL;

DO $$
DECLARE first_owner UUID;
BEGIN
  SELECT id INTO first_owner FROM users WHERE role = 'owner' AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  IF first_owner IS NOT NULL THEN
    UPDATE users SET owner_id = first_owner WHERE owner_id IS NULL;

    UPDATE rooms r SET owner_id = p.owner_id
      FROM properties p WHERE p.id = r.properti_id AND r.owner_id IS NULL;

    UPDATE tenants t SET owner_id = u.owner_id
      FROM users u WHERE u.id = t.user_id AND t.owner_id IS NULL;
    UPDATE tenants SET owner_id = first_owner WHERE owner_id IS NULL;

    UPDATE contracts c SET owner_id = t.owner_id
      FROM tenants t WHERE t.id = c.penyewa_id AND c.owner_id IS NULL;
    UPDATE contracts c SET owner_id = p.owner_id
      FROM rooms r JOIN properties p ON p.id = r.properti_id
      WHERE r.id = c.kamar_id AND c.owner_id IS NULL;

    UPDATE invoices i SET owner_id = p.owner_id
      FROM properties p WHERE p.id = i.properti_id AND i.owner_id IS NULL;
    UPDATE invoices i SET owner_id = c.owner_id
      FROM contracts c WHERE c.id = i.kontrak_id AND i.owner_id IS NULL;

    UPDATE payments p SET owner_id = i.owner_id
      FROM invoices i WHERE i.id = p.tagihan_id AND p.owner_id IS NULL;

    UPDATE tickets t SET owner_id = p.owner_id
      FROM properties p WHERE p.id = t.properti_id AND t.owner_id IS NULL;
    UPDATE tickets t SET owner_id = tn.owner_id
      FROM tenants tn WHERE tn.id = t.penyewa_id AND t.owner_id IS NULL;
  END IF;
END $$;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_email_key;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_nik_hash_key;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_user_id_key;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_owner_email_key;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_owner_nik_hash_key;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_owner_user_key;
ALTER TABLE tenants ADD CONSTRAINT tenants_owner_email_key UNIQUE (owner_id, email);
ALTER TABLE tenants ADD CONSTRAINT tenants_owner_nik_hash_key UNIQUE (owner_id, nik_hash);
ALTER TABLE tenants ADD CONSTRAINT tenants_owner_user_key UNIQUE (owner_id, user_id);

ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_nomor_kontrak_key;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_owner_nomor_key;
ALTER TABLE contracts ADD CONSTRAINT contracts_owner_nomor_key UNIQUE (owner_id, nomor_kontrak);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_nomor_invoice_key;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_owner_nomor_key;
ALTER TABLE invoices ADD CONSTRAINT invoices_owner_nomor_key UNIQUE (owner_id, nomor_invoice);

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_nomor_tiket_key;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_owner_nomor_key;
ALTER TABLE tickets ADD CONSTRAINT tickets_owner_nomor_key UNIQUE (owner_id, nomor_tiket);
`
