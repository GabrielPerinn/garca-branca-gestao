import 'server-only'

import { z } from 'zod'
import { completeRuralActionPlan, interpretRuralMessage, type AIInputDocument } from './interpreter'
import type { AIResponse } from '@/lib/validation/ai-schema'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { answerDatabaseQuestion } from '@/lib/ai/database-questions'
import {
  classifyConversationalMessage,
  classifyDatabaseQuestion,
  isLikelyKnowledgeQuestion,
} from '@/lib/ai/question-classifier'
import { blockingFieldLabels } from '@/lib/ai/action-metadata'
import { answerKnowledgeQuestion, type ConversationMessage } from '@/lib/ai/knowledge'
import { getAIResponsePlanIssues, parseActionData } from '@/lib/ai/action-plan'
import {
  classifyConversationReply,
  conversationMessages,
  formatClarificationReply,
} from '@/lib/ai/conversation-language'

const messageSchema = z.string().trim().min(1, 'Mensagem vazia.').max(4_000, 'Mensagem muito longa.')

export interface IncomingMessageContext {
  senderPhone?: string
  senderUserId?: string | null
  externalMessageId?: string
  incomingMessageId?: string
  imageBase64?: string
  documentFile?: AIInputDocument
  inputModality?: 'text' | 'audio' | 'image' | 'document'
  forceProvider?: 'mock' | 'openai'
  returnDetails?: boolean
  conversationHistory?: ConversationMessage[]
}

export interface IncomingMessageResult {
  reply: string
  destination: 'answer' | 'occurrence' | 'pending_action'
  pendingActionId?: string
}

type OpenClarification = {
  id: string
  original_text: string
  plan_json: AIResponse
  source_message_id: string | null
  input_modality: 'text' | 'audio' | 'image' | 'document'
}

function buildPendingPayload(plan: AIResponse) {
  return {
    ...parseActionData(plan.extracted_data),
    human_summary: plan.human_summary,
    missing_fields: plan.missing_fields ?? [],
    secondary_actions: plan.secondary_actions ?? null,
  }
}

async function loadRecentUserHistory(
  supabase: ReturnType<typeof createServiceRoleClient>,
  messageContext: IncomingMessageContext,
): Promise<ConversationMessage[]> {
  if (messageContext.conversationHistory) return messageContext.conversationHistory
  if (!messageContext.senderUserId && !messageContext.senderPhone) return []

  let query = supabase
    .from('incoming_messages')
    .select('text_content, created_at')
    .eq('processing_status', 'processed')
    .not('text_content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(8)
  query = messageContext.senderUserId
    ? query.eq('sender_user_id', messageContext.senderUserId)
    : query.eq('sender_phone', messageContext.senderPhone!)
  if (messageContext.externalMessageId) query = query.neq('external_message_id', messageContext.externalMessageId)

  const { data, error } = await query
  if (error) {
    console.error('[Garça Branca] Não foi possível carregar o histórico recente:', error.message)
    return []
  }
  return (data ?? [])
    .reverse()
    .flatMap(row => typeof row.text_content === 'string' && row.text_content.trim()
      ? [{ role: 'user' as const, content: row.text_content.trim() }]
      : [])
}

function normalizeCompletePlan(plan: AIResponse): AIResponse {
  const summarySentences = plan.human_summary
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/^(informe|informar|falta|faltam|preciso|precisamos|para continuar)\b/i.test(sentence.trim()))
  return {
    ...plan,
    missing_fields: [],
    human_summary: summarySentences.join(' ').trim() || 'Plano completo preparado para sua confirmação.',
  }
}

export function processIncomingMessage(
  rawText: string,
  messageContext: IncomingMessageContext & { returnDetails: true }
): Promise<IncomingMessageResult>
export function processIncomingMessage(
  rawText: string,
  messageContext?: IncomingMessageContext
): Promise<string>

export async function processIncomingMessage(
  rawText: string,
  messageContext: IncomingMessageContext = {}
): Promise<string | IncomingMessageResult> {
  const text = messageSchema.parse(rawText)
  const supabase = createServiceRoleClient({
    actorProfileId: messageContext.senderUserId ?? undefined,
  })
  const conversationHistory = await loadRecentUserHistory(supabase, messageContext)
  const deterministicQuestion = classifyDatabaseQuestion(text)
  const likelyKnowledgeQuestion = isLikelyKnowledgeQuestion(text)
  const respond = (reply: string, destination: IncomingMessageResult['destination']) => (
    messageContext.returnDetails ? { reply, destination } : reply
  )

  let openClarification: OpenClarification | null = null
  if (messageContext.senderUserId || messageContext.senderPhone) {
    let expireQuery = supabase
      .from('ai_clarifications')
      .update({ status: 'expired' })
      .eq('status', 'open')
      .lte('expires_at', new Date().toISOString())
    expireQuery = messageContext.senderUserId
      ? expireQuery.eq('sender_user_id', messageContext.senderUserId)
      : expireQuery.eq('sender_phone', messageContext.senderPhone!)
    const { error: expireError } = await expireQuery
    if (expireError) throw new Error(`Erro ao expirar complemento antigo: ${expireError.message}`)

    let clarificationQuery = supabase
      .from('ai_clarifications')
      .select('id, original_text, plan_json, source_message_id, input_modality')
      .eq('status', 'open')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
    clarificationQuery = messageContext.senderUserId
      ? clarificationQuery.eq('sender_user_id', messageContext.senderUserId)
      : clarificationQuery.eq('sender_phone', messageContext.senderPhone!)
    const { data, error } = await clarificationQuery.maybeSingle()
    if (error) throw new Error(`Erro ao recuperar complemento pendente: ${error.message}`)
    openClarification = data as OpenClarification | null
  }

  const isClarificationCancellation = classifyConversationReply(text) === 'cancel'
  if (openClarification && isClarificationCancellation) {
    const { error } = await supabase.from('ai_clarifications').update({
      status: 'cancelled',
      last_message_id: messageContext.externalMessageId ?? null,
    }).eq('id', openClarification.id).eq('status', 'open')
    if (error) throw new Error(`Erro ao cancelar complemento: ${error.message}`)
    return respond(conversationMessages.clarificationCancelled, 'answer')
  }

  const conversationalResponse = classifyConversationalMessage(text)
  if (conversationalResponse && !openClarification) {
    return respond(conversationalResponse.reply, 'answer')
  }

  if (deterministicQuestion) {
    const reply = await answerDatabaseQuestion(supabase, deterministicQuestion)
    return respond(reply, 'answer')
  }

  const [
    { data: farms },
    { data: pastures },
    { data: lots },
    { data: employees },
    { data: inventoryItems },
    { data: openTasks },
    { data: landParcels },
    { data: ruralContracts },
    { data: livestockProtocols },
  ] = await Promise.all([
    supabase.from('farms').select('name, location_description, municipality, state_code, total_area_ha, productive_area_ha, primary_activity, livestock_system, notes').neq('status', 'deleted').limit(1),
    supabase.from('pastures').select('name').neq('status', 'deleted').limit(30),
    supabase.from('cattle_lots').select('name').neq('status', 'deleted').limit(30),
    supabase.from('employees').select('full_name').neq('status', 'deleted').limit(30),
    supabase.from('inventory_items').select('name, unit').neq('status', 'deleted').limit(50),
    supabase.from('tasks').select('title').in('status', ['pending', 'in_progress']).limit(50),
    supabase.from('land_parcels').select('name').neq('status', 'deleted').limit(50),
    supabase.from('rural_contracts').select('title').eq('status', 'active').limit(30),
    supabase.from('livestock_protocols').select('name, next_due_date').eq('status', 'active').order('next_due_date').limit(50),
  ])

  const farm = farms?.[0]
  const activityLabels: Record<string, string> = {
    beef_cattle: 'pecuária de corte',
    dairy_cattle: 'pecuária leiteira',
    mixed_cattle: 'pecuária mista',
    agriculture: 'agricultura',
    mixed_farming: 'agropecuária',
    other: 'atividade rural diversificada',
  }
  const livestockLabels: Record<string, string> = {
    extensive: 'sistema extensivo',
    semi_intensive: 'sistema semi-intensivo',
    intensive: 'sistema intensivo',
    not_applicable: 'sistema pecuário não aplicável',
  }
  const operationalFacts = farm ? [
    farm.primary_activity ? `Atividade principal: ${activityLabels[farm.primary_activity] ?? farm.primary_activity}.` : null,
    farm.livestock_system ? `Manejo: ${livestockLabels[farm.livestock_system] ?? farm.livestock_system}.` : null,
    farm.total_area_ha ? `Área total: ${farm.total_area_ha} ha.` : null,
    farm.productive_area_ha ? `Área produtiva: ${farm.productive_area_ha} ha.` : null,
    landParcels?.length ? `A operação reúne ${landParcels.length} propriedades físicas analisadas em conjunto.` : null,
    farm.notes,
  ].filter(Boolean).join(' ') : undefined
  const context = {
    farmName: farm?.name,
    farmLocation: farm?.municipality
      ? `${farm.municipality}${farm.state_code ? `/${farm.state_code}` : ''}`
      : farm?.location_description,
    farmNotes: operationalFacts,
    pastureNames: pastures?.map(p => p.name).filter(Boolean),
    cattleLotNames: lots?.map(lot => lot.name).filter(Boolean),
    employeeNames: employees?.map(employee => employee.full_name).filter(Boolean),
    inventoryItemNames: inventoryItems?.map(item => `${item.name}${item.unit ? ` (${item.unit})` : ''}`).filter(Boolean),
    taskNames: openTasks?.map(task => task.title).filter(Boolean),
    landParcelNames: landParcels?.map(parcel => parcel.name).filter(Boolean),
    ruralContractNames: ruralContracts?.map(contract => contract.title).filter(Boolean),
    livestockProtocolNames: livestockProtocols?.map(protocol => `${protocol.name} (${protocol.next_due_date})`).filter(Boolean),
  }

  if (openClarification) {
    try {
      const completion = await completeRuralActionPlan({
        originalText: openClarification.original_text,
        draftPlan: openClarification.plan_json,
        followupText: text,
        imageBase64: messageContext.imageBase64,
        documentFile: messageContext.documentFile,
        context,
        safetyIdentity: messageContext.senderUserId ?? messageContext.senderPhone,
      })
      if (completion.isRelated) {
        const remainingIssues = getAIResponsePlanIssues(completion.plan)
        if (remainingIssues.length > 0) {
          const { error } = await supabase.from('ai_clarifications').update({
            plan_json: completion.plan,
            missing_fields: remainingIssues,
            last_message_id: messageContext.externalMessageId ?? null,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
          }).eq('id', openClarification.id).eq('status', 'open')
          if (error) throw new Error(`Erro ao atualizar complemento: ${error.message}`)
          return respond(formatClarificationReply(completion.plan, remainingIssues), 'answer')
        }

        const completePlan = normalizeCompletePlan(completion.plan)

        const { error: pendingError } = await supabase.from('pending_actions').insert({
          source_message_id: openClarification.source_message_id,
          action_type: completePlan.intent,
          confidence_score: completePlan.confidence,
          interpreted_data_json: {
            ...buildPendingPayload(completePlan),
            source_message_id: openClarification.source_message_id,
          },
          missing_fields_json: [],
          requires_confirmation: true,
          confirmation_status: 'pending',
          requested_by_user_id: messageContext.senderUserId ?? null,
          requested_by_phone: messageContext.senderPhone ?? null,
          input_modality: openClarification.input_modality,
          plan_version: 2,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
        })
        if (pendingError) throw new Error(`Erro ao salvar ação pendente: ${pendingError.message}`)
        const { error: resolveError } = await supabase.from('ai_clarifications').update({
          status: 'resolved',
          plan_json: completePlan,
          missing_fields: [],
          last_message_id: messageContext.externalMessageId ?? null,
        }).eq('id', openClarification.id).eq('status', 'open')
        if (resolveError) throw new Error(`Erro ao concluir complemento: ${resolveError.message}`)
        return respond(completePlan.human_summary, 'pending_action')
      }
    } catch (error) {
      console.error('[AI] Falha ao completar plano pendente:', error instanceof Error ? error.message : error)
      return respond(
        'Não consegui associar essa resposta ao cadastro que está aguardando complemento. Responda novamente com o dado solicitado, de forma direta; o plano anterior continua guardado.',
        'answer',
      )
    }
  }

  if (conversationalResponse) {
    return respond(conversationalResponse.reply, 'answer')
  }

  if (likelyKnowledgeQuestion) {
    const reply = await answerKnowledgeQuestion({
      supabase,
      question: text,
      farmContext: context,
      conversationHistory,
      safetyIdentity: messageContext.senderUserId ?? messageContext.senderPhone,
    })
    return respond(reply, 'answer')
  }

  const aiResult = await interpretRuralMessage(
    text,
    messageContext.imageBase64,
    messageContext.forceProvider,
    context,
    messageContext.senderUserId ?? messageContext.senderPhone,
    messageContext.documentFile,
  )

  if (aiResult.intent === 'answer_question') {
    const reply = await answerKnowledgeQuestion({
      supabase,
      question: text,
      farmContext: context,
      conversationHistory,
      safetyIdentity: messageContext.senderUserId ?? messageContext.senderPhone,
    })
    return respond(reply, 'answer')
  }

  const extractedData = parseActionData(aiResult.extracted_data)

  const planIssues = getAIResponsePlanIssues(aiResult)
  const blockingFields = planIssues.map(issue => issue.field)

  if (
    aiResult.should_create_pending_action
    && aiResult.confidence >= 0.70
    && planIssues.length > 0
  ) {
    if (messageContext.senderUserId || messageContext.senderPhone) {
      const { error: clarificationError } = await supabase.from('ai_clarifications').insert({
        sender_user_id: messageContext.senderUserId ?? null,
        sender_phone: messageContext.senderPhone ?? null,
        source_message_id: messageContext.externalMessageId ?? null,
        original_text: text,
        plan_json: aiResult,
        missing_fields: planIssues,
        input_modality: messageContext.inputModality
          ?? (messageContext.documentFile ? 'document' : messageContext.imageBase64 ? 'image' : 'text'),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      })
      if (clarificationError) throw new Error(`Erro ao salvar complemento pendente: ${clarificationError.message}`)
    }
    return respond(formatClarificationReply(aiResult, planIssues), 'answer')
  }
  const fallbackSummary = blockingFields.length > 0
    ? `${aiResult.human_summary} Para preparar a ação com segurança, envie novamente informando: ${blockingFields.map(field => blockingFieldLabels[field] ?? field).join(', ')}.`
    : aiResult.human_summary
  const isFallback =
    aiResult.intent === 'general_observation' ||
    aiResult.intent === 'unknown' ||
    aiResult.confidence < 0.70 ||
    !aiResult.should_create_pending_action ||
    blockingFields.length > 0

  if (isFallback) {
    const { error } = await supabase.from('occurrences').insert({
      original_text: text,
      title: blockingFields.length > 0
        ? `Dados pendentes: ${text.substring(0, 55)}${text.length > 55 ? '...' : ''}`
        : aiResult.intent === 'general_observation'
        ? `Campo: ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`
        : 'Mensagem Indefinida',
      description: fallbackSummary || text,
      suggested_category: aiResult.intent,
      tags: { ...extractedData, blocking_fields: blockingFields },
      priority: aiResult.risk_level === 'high' ? 'high' : aiResult.risk_level === 'medium' ? 'medium' : 'low',
      source_message_id: messageContext.incomingMessageId ?? null,
      status: 'pending_review',
    })

    if (error) throw new Error(`Erro ao salvar ocorrência: ${error.message}`)
    return respond(
      fallbackSummary || 'Recebi sua mensagem e salvei na Caixa de Entrada para revisão.',
      'occurrence',
    )
  }

  const completePlan = normalizeCompletePlan(aiResult)
  const fullPayload = {
    ...buildPendingPayload(completePlan),
    source_message_id: messageContext.externalMessageId ?? null,
  }

  const { error } = await supabase.from('pending_actions').insert({
    source_message_id: messageContext.externalMessageId ?? null,
    action_type: completePlan.intent,
    confidence_score: completePlan.confidence,
    interpreted_data_json: fullPayload,
    missing_fields_json: [],
    requires_confirmation: true,
    confirmation_status: 'pending',
    requested_by_user_id: messageContext.senderUserId ?? null,
    requested_by_phone: messageContext.senderPhone ?? null,
    input_modality: messageContext.inputModality
      ?? (messageContext.documentFile ? 'document' : messageContext.imageBase64 ? 'image' : 'text'),
    plan_version: 2,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
  })

  if (error) throw new Error(`Erro ao salvar ação pendente: ${error.message}`)
  return respond(completePlan.human_summary, 'pending_action')
}

function pendingPayloadToPlan(actionType: string, rawPayload: unknown, confidence: unknown): AIResponse {
  const payload = parseActionData(rawPayload)
  const {
    human_summary: humanSummary,
    missing_fields: missingFields,
    secondary_actions: rawSecondaryActions,
    source_message_id: _sourceMessageId,
    ...primaryData
  } = payload
  void _sourceMessageId
  const secondaryActions = Array.isArray(rawSecondaryActions)
    ? rawSecondaryActions.flatMap((rawAction) => {
      const action = parseActionData(rawAction)
      if (typeof action.intent !== 'string') return []
      return [{
        intent: action.intent as AIResponse['intent'],
        description: typeof action.description === 'string' ? action.description : 'Informação relacionada',
        extracted_data: JSON.stringify(parseActionData(action.extracted_data)),
      }]
    })
    : null

  return {
    intent: actionType as AIResponse['intent'],
    module: 'operations',
    action_type: ['complete_task', 'cancel_task', 'complete_livestock_protocol'].includes(actionType) ? 'update' : 'create',
    confidence: Number(confidence ?? 0.9),
    requires_confirmation: true,
    should_create_pending_action: true,
    risk_level: 'medium',
    extracted_data: JSON.stringify(primaryData),
    secondary_actions: secondaryActions,
    missing_fields: Array.isArray(missingFields)
      ? missingFields.filter((field): field is string => typeof field === 'string')
      : [],
    human_summary: typeof humanSummary === 'string' ? humanSummary : 'Cadastro preparado para confirmação.',
  }
}

/**
 * Aplica uma correção falada ou escrita ao último cadastro que ainda aguarda
 * confirmação. A alteração continua pendente e nunca é executada aqui.
 */
export async function revisePendingActionFromMessage(
  rawText: string,
  messageContext: IncomingMessageContext,
): Promise<IncomingMessageResult | null> {
  const text = messageSchema.parse(rawText)
  if (!messageContext.senderUserId && !messageContext.senderPhone) return null
  const supabase = createServiceRoleClient({ actorProfileId: messageContext.senderUserId ?? undefined })

  let query = supabase
    .from('pending_actions')
    .select('id, action_type, interpreted_data_json, confidence_score, source_message_id, plan_version')
    .eq('confirmation_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
  query = messageContext.senderUserId
    ? query.eq('requested_by_user_id', messageContext.senderUserId)
    : query.eq('requested_by_phone', messageContext.senderPhone!)
  const { data: pendingAction, error } = await query.maybeSingle()
  if (error) throw new Error(`Erro ao localizar cadastro para correção: ${error.message}`)
  if (!pendingAction) return null

  const { data: sourceMessage, error: sourceError } = pendingAction.source_message_id
    ? await supabase
      .from('incoming_messages')
      .select('text_content')
      .eq('external_message_id', pendingAction.source_message_id)
      .maybeSingle()
    : { data: null, error: null }
  if (sourceError) throw new Error(`Erro ao recuperar a mensagem original: ${sourceError.message}`)

  const draftPlan = pendingPayloadToPlan(
    pendingAction.action_type,
    pendingAction.interpreted_data_json,
    pendingAction.confidence_score,
  )
  const completion = await completeRuralActionPlan({
    originalText: sourceMessage?.text_content || draftPlan.human_summary,
    draftPlan,
    followupText: text,
    imageBase64: messageContext.imageBase64,
    documentFile: messageContext.documentFile,
    safetyIdentity: messageContext.senderUserId ?? messageContext.senderPhone,
  })
  if (!completion.isRelated) {
    return { reply: conversationMessages.correctionNotClear, destination: 'answer' }
  }
  if (completion.plan.intent !== pendingAction.action_type) {
    return { reply: conversationMessages.correctionChangesKind, destination: 'answer' }
  }

  const issues = getAIResponsePlanIssues(completion.plan)
  if (issues.length > 0) {
    return { reply: conversationMessages.correctionNotClear, destination: 'answer' }
  }

  const completePlan = normalizeCompletePlan(completion.plan)
  const revisedPayload = {
    ...buildPendingPayload(completePlan),
    source_message_id: pendingAction.source_message_id,
  }
  const { data: updated, error: updateError } = await supabase
    .from('pending_actions')
    .update({
      interpreted_data_json: revisedPayload,
      confidence_score: completePlan.confidence,
      missing_fields_json: [],
      plan_version: Number(pendingAction.plan_version || 1) + 1,
    })
    .eq('id', pendingAction.id)
    .eq('confirmation_status', 'pending')
    .select('id')
    .maybeSingle()
  if (updateError) throw new Error(`Erro ao salvar a correção: ${updateError.message}`)
  if (!updated) return { reply: conversationMessages.noPending, destination: 'answer' }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    table_name: 'pending_actions',
    record_id: pendingAction.id,
    action: 'revise_pending_action_whatsapp',
    before_data_json: pendingAction.interpreted_data_json,
    after_data_json: revisedPayload,
    changed_by: messageContext.senderUserId ?? null,
    reason: 'Correção solicitada em linguagem natural antes da confirmação.',
    source_message_id: messageContext.externalMessageId ?? null,
  })
  if (auditError) throw new Error(`Erro ao registrar a revisão: ${auditError.message}`)

  return {
    reply: completePlan.human_summary,
    destination: 'pending_action',
    pendingActionId: pendingAction.id,
  }
}
