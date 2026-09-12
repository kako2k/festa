/* =====================================================================
   supabase-config.js
   ---------------------------------------------------------------------
   ⚠️  ÚNICO ARQUIVO QUE VOCÊ PRECISA EDITAR PARA CONECTAR AO BANCO.

   Onde encontrar os valores:
   Supabase → seu projeto → Settings → API
     • Project URL           →  SUPABASE_URL
     • Project API keys: anon (public)  →  SUPABASE_ANON_KEY

   A chave "anon" é pública por natureza (fica visível no navegador).
   Quem protege os dados são as policies de RLS definidas em sql/schema.sql.
   NUNCA coloque aqui a chave "service_role".
   ===================================================================== */

const SUPABASE_URL = 'https://ykeicpyamgtjsyvoedef.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrZWljcHlhbWd0anN5dm9lZGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MDc2MTMsImV4cCI6MjEwNDM4MzYxM30.ZYLa7C314NLpx7J-878oJasn3eHK44btpnOuZk_2Vk0';

/* --------------------------------------------------------------------- */

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

// Aviso amigável se esquecer de preencher
if (SUPABASE_URL.includes('SEU-PROJETO')) {
  console.warn(
    '[config] Supabase ainda não configurado. Edite js/supabase-config.js ' +
    'com a URL e a chave anon do seu projeto.'
  );
}
