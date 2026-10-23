# Publicar

1. **Banco:** Supabase → SQL Editor → cole e execute `supabase/017_desempenho.sql` (pode repetir sem problema).
2. **Vercel → Settings → Environment Variables:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (secret), `APP_ORIGIN` (ex.: `https://seu-site.vercel.app`). Faça redeploy.
3. **Miniaturas das fotos atuais:** `.env.local` com as mesmas chaves, `pip install pillow`, `python scripts/otimizar_fotos.py`.
4. **Fotos novas do WhatsApp:** `python scripts/importar_fotos.py` (simula) e depois `--enviar`. Abra *Fotos* no site, vincule cada uma à peça e confira a quantidade.
5. **Segurança:** as chaves secret/service_role foram coladas em conversa. No Supabase → API Keys, gere novas e atualize na Vercel.
