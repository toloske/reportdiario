
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase Environment Variables!", {
        url: !!supabaseUrl,
        key: !!supabaseAnonKey
    });
    // We don't throw immediately to allow app to generic render a "Config missing" error if needed
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
