import 'server-only'

import { createClient, createServiceRoleClient, requireUserContext } from '@/lib/supabase/server'

export type TwinOverview = {
  farm_id: string | null
  entity_count: number
  event_count: number
  active_relation_count: number
  last_event_at: string | null
  entities_by_type: Record<string, number>
}

export type TwinEvent = {
  id: string
  entity_type: string
  entity_id: string
  entity_display_name: string
  event_type: string
  event_sequence: number
  visibility: 'standard' | 'restricted'
  occurred_at: string
  actor_profile_id: string | null
  actor_name: string | null
  source_channel: string
  changed_fields: string[]
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  metadata: Record<string, unknown>
  event_hash: string
}

export type TwinEntity = {
  id: string
  entity_type: string
  entity_id: string
  display_name: string
  lifecycle_status: string
  visibility: 'standard' | 'restricted'
  current_version: number
  current_state: Record<string, unknown>
  first_seen_at: string
  last_event_at: string
}

export type TwinRelation = {
  id: string
  from_entity_type: string
  from_entity_id: string
  relation_type: string
  to_entity_type: string
  to_entity_id: string
  valid_from: string
  source_event_id: string
}

export type TwinIntegrity = {
  checked_events: number
  invalid_events: number
  is_valid: boolean
  checked_at: string
}

export async function getTwinDashboardData() {
  const { profile } = await requireUserContext()
  const supabase = await createClient()
  const serviceClient = createServiceRoleClient({ actorProfileId: profile.id })

  const [farmResult, overviewResult, integrityResult, eventsResult, entitiesResult, relationsResult] = await Promise.all([
    serviceClient.from('farms').select('id, name').neq('status', 'deleted').order('created_at').limit(1).maybeSingle(),
    supabase.rpc('get_farm_twin_overview', { p_farm_id: null }),
    supabase.rpc('verify_farm_event_chain', { p_farm_id: null }),
    supabase.from('farm_events').select('id, entity_type, entity_id, entity_display_name, event_type, event_sequence, visibility, occurred_at, actor_profile_id, source_channel, changed_fields, before_state, after_state, metadata, event_hash').order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(300),
    supabase.from('farm_entities').select('id, entity_type, entity_id, display_name, lifecycle_status, visibility, current_version, current_state, first_seen_at, last_event_at').order('last_event_at', { ascending: false }).limit(500),
    supabase.from('farm_entity_relations').select('id, from_entity_type, from_entity_id, relation_type, to_entity_type, to_entity_id, valid_from, source_event_id').is('valid_to', null).order('valid_from', { ascending: false }).limit(500),
  ])

  const errors = [farmResult.error, overviewResult.error, integrityResult.error, eventsResult.error, entitiesResult.error, relationsResult.error].filter(Boolean)
  if (errors.length) throw new Error(errors[0]?.message || 'Não foi possível consultar o Garça Twin.')

  const events = (eventsResult.data ?? []) as Omit<TwinEvent, 'actor_name'>[]
  const actorIds = [...new Set(events.map(event => event.actor_profile_id).filter((value): value is string => Boolean(value)))]
  const actors = new Map<string, string>()
  if (actorIds.length) {
    const { data, error } = await supabase.from('users_profiles').select('id, full_name').in('id', actorIds)
    if (error) throw new Error(error.message)
    for (const actor of data ?? []) actors.set(actor.id, actor.full_name)
  }

  return {
    farm: farmResult.data,
    overview: (overviewResult.data || { farm_id: null, entity_count: 0, event_count: 0, active_relation_count: 0, last_event_at: null, entities_by_type: {} }) as TwinOverview,
    integrity: ((integrityResult.data as TwinIntegrity[] | null)?.[0] || { checked_events: 0, invalid_events: 0, is_valid: true, checked_at: new Date().toISOString() }),
    events: events.map(event => ({ ...event, actor_name: event.actor_profile_id ? actors.get(event.actor_profile_id) || null : null })) as TwinEvent[],
    entities: (entitiesResult.data ?? []) as TwinEntity[],
    relations: (relationsResult.data ?? []) as TwinRelation[],
  }
}

export async function getTwinEntityData(entityType: string, entityId: string) {
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(entityType) || !/^[0-9a-f-]{36}$/i.test(entityId)) return null
  await requireUserContext()
  const supabase = await createClient()
  const [entityResult, eventsResult, outgoingResult, incomingResult] = await Promise.all([
    supabase.from('farm_entities').select('*').eq('entity_type', entityType).eq('entity_id', entityId).maybeSingle(),
    supabase.from('farm_events').select('id, entity_type, entity_id, entity_display_name, event_type, event_sequence, visibility, occurred_at, actor_profile_id, source_channel, changed_fields, before_state, after_state, metadata, event_hash').eq('entity_type', entityType).eq('entity_id', entityId).order('event_sequence', { ascending: false }).limit(500),
    supabase.from('farm_entity_relations').select('*').eq('from_entity_type', entityType).eq('from_entity_id', entityId).is('valid_to', null).order('valid_from', { ascending: false }),
    supabase.from('farm_entity_relations').select('*').eq('to_entity_type', entityType).eq('to_entity_id', entityId).is('valid_to', null).order('valid_from', { ascending: false }),
  ])
  const error = entityResult.error || eventsResult.error || outgoingResult.error || incomingResult.error
  if (error) throw new Error(error.message)
  if (!entityResult.data) return null

  const rawEvents = (eventsResult.data ?? []) as Omit<TwinEvent, 'actor_name'>[]
  const actorIds = [...new Set(rawEvents.map(event => event.actor_profile_id).filter((value): value is string => Boolean(value)))]
  const relatedIds = [...new Set([
    ...(outgoingResult.data ?? []).map(relation => relation.to_entity_id),
    ...(incomingResult.data ?? []).map(relation => relation.from_entity_id),
  ])]
  const [actorsResult, relatedEntitiesResult] = await Promise.all([
    actorIds.length
      ? supabase.from('users_profiles').select('id, full_name').in('id', actorIds)
      : Promise.resolve({ data: [], error: null }),
    relatedIds.length
      ? supabase.from('farm_entities').select('entity_type, entity_id, display_name').in('entity_id', relatedIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (actorsResult.error || relatedEntitiesResult.error) {
    throw new Error(actorsResult.error?.message || relatedEntitiesResult.error?.message || 'Não foi possível carregar os vínculos da entidade.')
  }
  const actors = new Map((actorsResult.data ?? []).map(actor => [actor.id, actor.full_name]))
  const relatedNames = Object.fromEntries((relatedEntitiesResult.data ?? []).map(entity => [`${entity.entity_type}:${entity.entity_id}`, entity.display_name]))

  return {
    entity: entityResult.data as TwinEntity,
    events: rawEvents.map(event => ({ ...event, actor_name: event.actor_profile_id ? actors.get(event.actor_profile_id) || null : null })) as TwinEvent[],
    outgoing: (outgoingResult.data ?? []) as TwinRelation[],
    incoming: (incomingResult.data ?? []) as TwinRelation[],
    relatedNames,
  }
}
