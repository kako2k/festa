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

const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON-AQUI';

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
