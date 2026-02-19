
-- Create the table for daily reports
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  date DATE NOT NULL,
  svc_id TEXT NOT NULL,
  acceptance_type TEXT NOT NULL,
  
  -- Flattened Categories (Offer/Capacity)
  offer_bulk_van INTEGER DEFAULT 0,
  capacity_bulk_van INTEGER DEFAULT 0,
  
  offer_equipe_unica INTEGER DEFAULT 0,
  capacity_equipe_unica INTEGER DEFAULT 0,
  
  offer_pool_bulk_vuc INTEGER DEFAULT 0,
  capacity_pool_bulk_vuc INTEGER DEFAULT 0,
  
  offer_equipe_unica_pool INTEGER DEFAULT 0,
  capacity_equipe_unica_pool INTEGER DEFAULT 0,
  
  offer_utilitarios INTEGER DEFAULT 0,
  capacity_utilitarios INTEGER DEFAULT 0,
  
  offer_van INTEGER DEFAULT 0,
  capacity_van INTEGER DEFAULT 0,
  
  offer_veiculo_passeio INTEGER DEFAULT 0,
  capacity_veiculo_passeio INTEGER DEFAULT 0,
  
  offer_vuc INTEGER DEFAULT 0,
  capacity_vuc INTEGER DEFAULT 0,
  
  -- Justifications (concatenated string)
  justifications TEXT,
  
  -- Attachment URL
  attachment_url TEXT
);

-- Enable RLS (Row Level Security) but allow public insert for this app context (since we removed auth)
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for all users" ON public.daily_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable read for all users" ON public.daily_reports FOR SELECT USING (true);

-- Create Storage Bucket if it doesn't exist (simulated via SQL, usually done via API/UI but we can try inserting into storage.buckets if permissions allow, or just assume it exists/notify user)
-- Note: Creating buckets via SQL is not standard in Supabase client usually, but we can try to insert if the schema exposes it. 
-- Ideally, we'd use the JS client to create the bucket, but let's try to set up the policy for 'comprovantes' assuming it will be created.

-- We will handle bucket creation in the code or ask user to create it if this fails, 
-- but we can try to insert into storage.buckets if the user has permissions. 
-- For now, let's just ensure the table exists.
