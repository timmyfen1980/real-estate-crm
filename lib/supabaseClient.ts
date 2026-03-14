import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

console.log("SUPABASE URL:", supabaseUrl)
console.log("SUPABASE KEY:", supabaseAnonKey)

export const supabase = createBrowserClient(
  supabaseUrl,
  supabaseAnonKey
)