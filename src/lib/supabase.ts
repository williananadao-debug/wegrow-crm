import { createClient } from '@supabase/supabase-js';

// Verifique se NÃO há espaços extras nestas strings
const supabaseUrl = 'https://dzlahpfdgjaqecikkqye.supabase.co'; 
// Use a Anon Key completa que você copiou do painel
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6bGFocGZkZ2phcWVjaWtrcXllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTY3ODAsImV4cCI6MjA4NDE3Mjc4MH0.JuiLW4VLba0DGNv5lr7NRKhQhN0xUQPyuoR_y0CgnTE'; 

export const supabase = createClient(supabaseUrl, supabaseAnonKey);