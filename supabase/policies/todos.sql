-- Todos RLS policies and grants
GRANT SELECT ON public.view_today_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_item(text, uuid) TO authenticated;
