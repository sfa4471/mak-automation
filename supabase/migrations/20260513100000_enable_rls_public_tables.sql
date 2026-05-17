-- Enable RLS on all app tables. No policies for anon/authenticated: PostgREST
-- access from the browser is denied; the Node server uses the service role and bypasses RLS.
-- See server/db/supabase.js

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workpackages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp1_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proctor_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.density_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rebar_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_project_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_deliveries ENABLE ROW LEVEL SECURITY;
