-- The current product has no global farm selector. Enforce one active farm so
-- inventory, livestock and finance can never be silently mixed across units.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_farm
  ON public.farms ((1))
  WHERE COALESCE(status, 'active') <> 'deleted';

COMMENT ON INDEX public.uq_single_active_farm
  IS 'Garante uma única propriedade ativa até que todos os módulos suportem seleção multiunidade.';

COMMIT;
