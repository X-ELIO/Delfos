-- =============================================================================
-- Delfos V03.1.0 — Row Level Security
-- Run after schema.sql (order: 2/5)
-- =============================================================================

-- ── Helper functions ─────────────────────────────────────────────────────────

-- Returns the public.users.id for the current auth session
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT id FROM public.users WHERE auth_id = auth.uid()
$$;

-- Returns true if the current user is a P&C admin
CREATE OR REPLACE FUNCTION public.is_pco_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT COALESCE(
        (SELECT is_pco_admin FROM public.users WHERE auth_id = auth.uid()),
        false
    )
$$;

-- ── countries ────────────────────────────────────────────────────────────────
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "countries_read_all"
    ON public.countries FOR SELECT USING (true);

-- ── archetypes ───────────────────────────────────────────────────────────────
ALTER TABLE public.archetypes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archetypes_read_all"
    ON public.archetypes FOR SELECT USING (true);

-- ── users ────────────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read the user/manager directory
CREATE POLICY "users_read_all"
    ON public.users FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Users can update their own row
CREATE POLICY "users_update_own"
    ON public.users FOR UPDATE
    USING (auth_id = auth.uid());

-- P&C admins can do everything
CREATE POLICY "pco_admin_manage_users"
    ON public.users FOR ALL
    USING (is_pco_admin());

-- ── submissions ──────────────────────────────────────────────────────────────
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Employees see only their own submission
CREATE POLICY "employee_own_submission"
    ON public.submissions FOR SELECT
    USING (user_id = current_user_id());

-- Managers see their direct reports' submissions (by UUID or email fallback)
CREATE POLICY "manager_see_reports"
    ON public.submissions FOR SELECT
    USING (
        manager_id = current_user_id()
        OR LOWER(manager_email) = (
            SELECT LOWER(email) FROM public.users WHERE auth_id = auth.uid()
        )
    );

-- P&C admins see everything
CREATE POLICY "pco_admin_all_submissions"
    ON public.submissions FOR ALL
    USING (is_pco_admin());

-- Any authenticated user can submit (INSERT)
CREATE POLICY "authenticated_insert_submission"
    ON public.submissions FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- ── telemetry_events ─────────────────────────────────────────────────────────
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

-- Only P&C admins can read telemetry
CREATE POLICY "pco_admin_read_telemetry"
    ON public.telemetry_events FOR SELECT
    USING (is_pco_admin());

-- Any authenticated user can insert telemetry events (best-effort, non-blocking)
CREATE POLICY "authenticated_insert_telemetry"
    ON public.telemetry_events FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- ── cascade_objectives ───────────────────────────────────────────────────────
ALTER TABLE public.cascade_objectives ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read cascade data
CREATE POLICY "cascade_read_all"
    ON public.cascade_objectives FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- P&C admins can edit only unlocked entries
CREATE POLICY "pco_admin_edit_cascade"
    ON public.cascade_objectives FOR UPDATE
    USING (is_pco_admin() AND NOT locked);

CREATE POLICY "pco_admin_insert_cascade"
    ON public.cascade_objectives FOR INSERT
    WITH CHECK (is_pco_admin());
