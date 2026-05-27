-- =============================================================================
-- Delfos V03.1.0 — Database Schema
-- Run in Supabase SQL Editor (project: lequhlqelxgiusugcbxp)
-- Order: 1/5
-- =============================================================================

-- ── Reference: countries ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.countries (
    code  TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- ── Reference: archetypes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.archetypes (
    code            CHAR(1) PRIMARY KEY,
    label           TEXT    NOT NULL,
    has_people_kpis BOOLEAN NOT NULL,
    min_score       INT     NOT NULL,
    typical_roles   TEXT
);

-- ── Users ────────────────────────────────────────────────────────────────────
-- Managers are pre-seeded. Employees are created on first SSO login via trigger.
CREATE TABLE IF NOT EXISTS public.users (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id      UUID        UNIQUE,       -- populated on first login by trigger below
    email        TEXT        UNIQUE NOT NULL,
    full_name    TEXT        NOT NULL,
    level        TEXT        NOT NULL,     -- C-Suite | Country Manager | Director | Sr. Manager | Manager | Team Lead | Coordinator | Employee
    country      TEXT        REFERENCES public.countries(code),
    is_manager   BOOLEAN     NOT NULL DEFAULT false,
    is_pco_admin BOOLEAN     NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_auth_id     ON public.users (auth_id);

-- Trigger: when a user authenticates, link their auth.users record to public.users
-- If the email already exists (pre-seeded manager), sets auth_id.
-- If not (new employee), creates a minimal public.users row.
CREATE OR REPLACE FUNCTION public.link_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.users
    SET auth_id = NEW.id
    WHERE LOWER(email) = LOWER(NEW.email)
      AND auth_id IS NULL;

    IF NOT FOUND THEN
        INSERT INTO public.users (auth_id, email, full_name, level)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            'Employee'
        )
        ON CONFLICT (email) DO UPDATE SET auth_id = EXCLUDED.auth_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.link_auth_user();

-- ── Submissions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.submissions (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID         REFERENCES public.users(id),        -- nullable pre-auth
    manager_id           UUID         REFERENCES public.users(id),        -- nullable pre-auth
    manager_email        TEXT,                                            -- denormalized fallback for manager lookup
    archetype            CHAR(1)      NOT NULL CHECK (archetype IN ('A','B','C','D')),
    country              TEXT         NOT NULL REFERENCES public.countries(code),
    payload              JSONB        NOT NULL,  -- full Submission record (see blueprint §3.2)
    total_budget         NUMERIC(5,2) NOT NULL,  -- Bonus Potential 0..100
    weak_count           INT          NOT NULL DEFAULT 0,
    has_team_coverage    BOOLEAN      NOT NULL,
    coverage_cap_applied BOOLEAN      NOT NULL,
    app_version          TEXT         NOT NULL DEFAULT 'V03.1.0',
    submitted_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_user_submitted    ON public.submissions (user_id,      submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_subs_manager_submitted ON public.submissions (manager_id,   submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_subs_manager_email     ON public.submissions (LOWER(manager_email), submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_subs_country_submitted ON public.submissions (country,      submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_subs_archetype         ON public.submissions (archetype,    submitted_at DESC);

-- ── Telemetry events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.telemetry_events (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT        NOT NULL,
    user_id    UUID        REFERENCES public.users(id),
    payload    JSONB       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_created ON public.telemetry_events (event_name, created_at DESC);

-- ── Cascade objectives ───────────────────────────────────────────────────────
-- Replaces the hardcoded CASCADE_DATA constant in the original .jsx
CREATE TABLE IF NOT EXISTS public.cascade_objectives (
    id             TEXT         PRIMARY KEY,  -- e.g. 'co_cod', 'au_rtb', 'es_ebitda'
    scope          TEXT         NOT NULL CHECK (scope IN ('corporate','country')),
    country        TEXT         REFERENCES public.countries(code),  -- NULL for corporate
    locked         BOOLEAN      NOT NULL,     -- true = shareholder-agreed, CHRO cannot edit
    category       TEXT,
    text           TEXT         NOT NULL,
    weight_percent NUMERIC(5,2),
    cycle_year     INT          NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cascade_scope_country ON public.cascade_objectives (scope, country, cycle_year);
