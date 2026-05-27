-- Temporary mock login (remove when Entra ID is configured)
CREATE OR REPLACE FUNCTION public.mock_login(p_email TEXT)
RETURNS JSON
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT row_to_json(t) FROM (
    SELECT
      u.id,
      u.email,
      u.full_name,
      u.level,
      u.is_manager,
      u.is_pco_admin,
      u.auth_id,
      u.country                AS country_code,
      c.label                  AS country_label
    FROM  public.users    u
    LEFT JOIN public.countries c ON c.code = u.country
    WHERE LOWER(u.email) = LOWER(p_email)
    LIMIT 1
  ) t
$$;
