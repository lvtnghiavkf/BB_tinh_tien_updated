import { createClient } from '@supabase/supabase-js';

// Fallback placeholder prevents createClient from throwing during module init
// when env vars are missing — the actual connection error is caught in App.tsx
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://placeholder.supabase.co';
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey);
