import { createAdminClient } from "@/lib/supabase/server";
import { FarmsClientPage } from "./client-page";

export const dynamic = 'force-dynamic';

export default async function FarmsPage() {
  const supabase = await createAdminClient();
  const [operation, properties, pastures] = await Promise.all([
    supabase.from('farms').select('*').neq('status', 'deleted').order('created_at').limit(1).maybeSingle(),
    supabase.from('land_parcels').select('id, name, tenure_type, total_area_ha, usable_area_ha, municipality, state_code, property_registration, car_code, ccir_code, georeferencing_status').neq('status', 'deleted').order('name'),
    supabase.from('pastures').select('id, land_parcel_id').neq('status', 'deleted'),
  ]);
  return <FarmsClientPage operation={operation.data} properties={properties.data || []} pastures={pastures.data || []} dbError={operation.error?.message || properties.error?.message || pastures.error?.message} />;
}
