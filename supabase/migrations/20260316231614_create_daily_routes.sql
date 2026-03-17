-- Create the daily_routes table
CREATE TABLE public.daily_routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    plate VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure we don't insert the same plate for the same day twice
    CONSTRAINT uk_daily_routes_date_plate UNIQUE (date, plate)
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
