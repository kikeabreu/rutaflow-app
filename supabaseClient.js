import { createClient } from '@supabase/supabase-js'

// Estas son "palabras clave" que Vercel llenará por ti
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey)