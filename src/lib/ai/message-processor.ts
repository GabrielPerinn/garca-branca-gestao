import { interpretRuralMessage } from "./interpreter";
import { createAdminClient } from "@/lib/supabase/server";

export async function processIncomingMessage(
  text: string,
  senderPhone?: string,
  imageBase64?: string,
  forceProvider?: 'mock' | 'openai'
) {
  const supabase = await createAdminClient();

  // 1. Buscar contexto real da fazenda para enriquecer o prompt da IA
  const [
    { data: farms },
    { data: pastures },
    { data: lots },
    { data: employees },
  ] = await Promise.all([
    supabase.from('farms').select('name, location_description, notes').neq('status', 'deleted').limit(1),
    supabase.from('pastures').select('name').neq('status', 'deleted').limit(30),
    supabase.from('cattle_lots').select('name').neq('status', 'deleted').limit(30),
    supabase.from('employees').select('full_name').neq('status', 'deleted').limit(30),
  ]);

  const farm = farms?.[0];
  const context = {
    farmName: farm?.name,
    farmLocation: farm?.location_description,
    farmNotes: farm?.notes,
    pastureNames: pastures?.map((p: any) => p.name).filter(Boolean),
    cattleLotNames: lots?.map((l: any) => l.name).filter(Boolean),
    employeeNames: employees?.map((e: any) => e.full_name).filter(Boolean),
  };

  // 2. Interpreta a mensagem pela IA com contexto da fazenda
  const aiResult = await interpretRuralMessage(text, imageBase64, forceProvider, context);

  // 3. Normaliza extracted_data
  let extractedObj: Record<string, unknown> = {};
  if (typeof aiResult.extracted_data === 'string') {
    try { extractedObj = JSON.parse(aiResult.extracted_data); } catch { extractedObj = { raw: aiResult.extracted_data }; }
  } else if (aiResult.extracted_data && typeof aiResult.extracted_data === 'object') {
    extractedObj = aiResult.extracted_data as Record<string, unknown>;
  }

  // 4. Decide: fallback para Caixa de Entrada ou Ação Pendente
  const isFallback =
    aiResult.intent === 'general_observation' ||
    aiResult.intent === 'answer_question' ||
    aiResult.intent === 'unknown' ||
    aiResult.confidence < 0.70 ||
    aiResult.should_create_pending_action === false;

  if (isFallback) {
    const { error } = await supabase.from('occurrences').insert({
      original_text: text,
      title: aiResult.intent === 'general_observation'
        ? `Campo: ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`
        : 'Mensagem Indefinida',
      description: aiResult.human_summary || text,
      suggested_category: aiResult.intent,
      tags: extractedObj,
      priority: aiResult.risk_level === 'high' ? 'high' : aiResult.risk_level === 'medium' ? 'medium' : 'low',
      status: 'pending_review',
    });

    if (error) throw new Error("Erro ao salvar ocorrência: " + error.message);
    return aiResult.human_summary || "Recebi sua mensagem e salvei na Caixa de Entrada para revisão.";

  } else {
    // Incluir secondary_actions no payload para execução posterior
    const fullPayload = {
      ...extractedObj,
      human_summary: aiResult.human_summary,
      secondary_actions: aiResult.secondary_actions ?? null,
    };

    const { error } = await supabase.from('pending_actions').insert({
      action_type: aiResult.intent,
      confidence_score: aiResult.confidence,
      interpreted_data_json: fullPayload,
      confirmation_status: 'pending',
    });

    if (error) throw new Error("Erro ao salvar ação pendente: " + error.message);
    return aiResult.human_summary;
  }
}
