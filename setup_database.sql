
-- 1. DROP the old table to ensure clean schema (since it's dev/test phase)
DROP TABLE IF EXISTS public.daily_reports;

-- 2. Create the table with NEW Categories
CREATE TABLE public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  date DATE NOT NULL,
  svc_id TEXT NOT NULL,
  acceptance_type TEXT NOT NULL,
  
  -- NEW Flattened Categories
  -- BULK - VUC EQUIPE ÚNICA POOL
  offer_bulk_vuc_pool INTEGER DEFAULT 0,
  capacity_bulk_vuc_pool INTEGER DEFAULT 0,
  
  -- UTILITÁRIOS
  offer_utilitarios INTEGER DEFAULT 0,
  capacity_utilitarios INTEGER DEFAULT 0,
  
  -- BULK - VAN EQUIPE ÚNICA POOL
  offer_bulk_van_pool INTEGER DEFAULT 0,
  capacity_bulk_van_pool INTEGER DEFAULT 0,
  
  -- VAN
  offer_van INTEGER DEFAULT 0,
  capacity_van INTEGER DEFAULT 0,
  
  -- VEÍCULO DE PASSEIO
  offer_veiculo_passeio INTEGER DEFAULT 0,
  capacity_veiculo_passeio INTEGER DEFAULT 0,
  
  -- VUC
  offer_vuc INTEGER DEFAULT 0,
  capacity_vuc INTEGER DEFAULT 0,
  
  -- Justifications (concatenated string of ALL vehicles now)
  justifications TEXT,
  
  -- Attachment URL
  attachment_url TEXT
);

-- 3. Enable Security & Policies again
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'daily_reports' AND policyname = 'Enable insert for all users') THEN
        CREATE POLICY "Enable insert for all users" ON public.daily_reports FOR INSERT WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'daily_reports' AND policyname = 'Enable read for all users') THEN
        CREATE POLICY "Enable read for all users" ON public.daily_reports FOR SELECT USING (true);
    END IF;
END $$;
