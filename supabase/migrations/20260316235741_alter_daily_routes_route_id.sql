-- Drop the old table completely because we are changing the core schema
-- and we just created it anyway (no real production data yet).
DROP TABLE IF EXISTS public.daily_routes;

CREATE TABLE public.daily_routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    route_id VARCHAR(50) NOT NULL UNIQUE, -- The core constraint
    date DATE NOT NULL,
    plate VARCHAR(20) NOT NULL,
    driver_id VARCHAR(50), -- Useful info from CSV
    driver_name VARCHAR(100),
    vehicle_type VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Establish RLS (Row Level Security) if used
ALTER TABLE public.daily_routes ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users (or public, depending on setup)
CREATE POLICY "Enable read access for all users" ON public.daily_routes
    AS PERMISSIVE FOR SELECT
    TO public
    USING (true);

-- Allow insert access for all users (or authenticated)
CREATE POLICY "Enable insert access for all users" ON public.daily_routes
    AS PERMISSIVE FOR INSERT
    TO public
    WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON public.daily_routes
    AS PERMISSIVE FOR UPDATE
    TO public
    USING (true)
    WITH CHECK (true);
