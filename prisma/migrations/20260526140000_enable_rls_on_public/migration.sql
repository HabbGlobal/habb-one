-- Row-Level Security auf ALLEN public-Tabellen aktivieren.
--
-- Hintergrund: Supabase exponiert per Default jede public-Tabelle über
-- PostgREST (REST-API unter https://<project>.supabase.co/rest/v1/...).
-- Ohne RLS kann jeder mit dem `anon`-API-Key (öffentlich by design)
-- alle Daten lesen/schreiben. Habb One nutzt PostgREST NICHT — Prisma
-- spricht direkt mit Postgres — aber Defense-in-Depth verlangt RLS.
--
-- Wirkung: ENABLE ROW LEVEL SECURITY ohne explizite Policies ist die
-- restriktivste Konfiguration: alle Zugriffe via `anon`/`authenticated`-
-- Rolle (PostgREST) bekommen 0 Zeilen. Unsere App verbindet als
-- `postgres` (BYPASSRLS=true, verifiziert via scripts/check-rls-state.ts)
-- — Prisma-Queries sind also unbeeinflusst.
--
-- Programmatischer Loop: greift JEDE public-Tabelle, auch die von
-- Prisma intern angelegte `_prisma_migrations`. Idempotent — ALTER
-- TABLE ... ENABLE ROW LEVEL SECURITY ist eine No-Op wenn RLS bereits
-- aktiv ist.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END;
$$;

-- Sanity-Check: nach der Aktivierung muss JEDE public-Tabelle
-- rowsecurity=true haben. Wenn nicht, schlägt die Migration mit einer
-- klaren Fehlermeldung fehl, statt halb-aktive RLS zurückzulassen.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(tablename, ', ') INTO missing
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
  WHERE t.schemaname = 'public' AND c.relrowsecurity = false;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS-Aktivierung unvollständig: % Tabelle(n) noch ohne RLS: %',
      array_length(string_to_array(missing, ', '), 1), missing;
  END IF;
END;
$$;
