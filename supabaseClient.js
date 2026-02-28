import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mxabgmaebqbrbwlgffae.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YWJnbWFlYnFicmJ3bGdmZmFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMTMwNzEsImV4cCI6MjA4Nzg4OTA3MX0.x8Vb8Ya-6CoCOiekhBXKEw4zU59usJWEQpXaEpo86Ug';
export const supabase = createClient(supabaseUrl, supabaseKey);