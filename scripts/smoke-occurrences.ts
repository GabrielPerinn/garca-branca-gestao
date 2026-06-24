import { config } from 'dotenv';
import { resolve } from 'path';

// Load variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

// Forçar uso do MockAI para o smoke test previsível
process.env.USE_MOCK_AI = 'true';

import { createClient } from '@supabase/supabase-js';
import { interpretRuralMessage } from '../src/lib/ai/interpreter';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function runTest() {
  console.log("Iniciando Smoke Test do Módulo de Ocorrências...\n");

  const message = "O bebedouro do pasto 5 está vazando.";
  let occurrenceId = "";
  let taskId = "";

  try {
    // 1. Interpretar a mensagem com o AI Provider
    const aiResult = await interpretRuralMessage(message);
    
    if (aiResult.intent !== 'general_observation') {
      throw new Error(`Esperava intent 'general_observation', mas recebeu '${aiResult.intent}'`);
    }

    // 2. Inserir Ocorrência
    const { data: occData, error: occError } = await supabase.from('occurrences').insert({
      original_text: message,
      title: 'Mensagem de Campo / Indefinida',
      description: aiResult.human_summary || message,
      suggested_category: aiResult.intent,
      tags: aiResult.extracted_data || {},
      priority: 'medium',
      status: 'pending_review'
    }).select('id').single();

    if (occError) throw new Error("Falha ao criar occurrence: " + occError.message);
    occurrenceId = occData.id;
    console.log("PASS: occurrence criada (" + occurrenceId + ")");

    // 3. Verificar se a occurrence foi salva corretamente
    const { data: checkOcc, error: checkOccErr } = await supabase.from('occurrences').select('*').eq('id', occurrenceId).single();
    if (checkOccErr || !checkOcc) throw new Error("Falha ao buscar occurrence criada.");
    if (checkOcc.original_text !== message) throw new Error("original_text não foi preservado.");
    if (checkOcc.status !== 'pending_review') throw new Error("Status inicial incorreto.");
    if (checkOcc.suggested_category !== 'general_observation') throw new Error("Categoria sugerida não gravada.");
    
    // 4. Converter essa occurrence para uma task real
    const payload = {
      title: "Consertar bebedouro",
      description: message,
      status: "pending"
    };

    const { data: taskData, error: taskError } = await supabase.from('tasks').insert(payload).select('id').single();
    if (taskError) throw new Error("Falha ao criar task: " + taskError.message);
    taskId = taskData.id;
    console.log("PASS: task criada (" + taskId + ")");

    // 5. Atualizar a occurrence para converted
    const { error: updateError } = await supabase.from('occurrences').update({
      status: 'converted',
      converted_to_table: 'tasks',
      converted_to_id: taskId
    }).eq('id', occurrenceId);
    
    if (updateError) throw new Error("Falha ao atualizar occurrence: " + updateError.message);

    const { data: finalOcc, error: finalOccErr } = await supabase.from('occurrences').select('*').eq('id', occurrenceId).single();
    if (finalOccErr) throw new Error("Falha ao buscar occurrence atualizada.");
    if (finalOcc.status !== 'converted') throw new Error("A ocorrência não mudou para 'converted'.");
    if (finalOcc.converted_to_table !== 'tasks') throw new Error("Tabela convertida incorreta.");
    if (finalOcc.converted_to_id !== taskId) throw new Error("ID de conversão incorreto.");
    
    console.log("PASS: occurrence convertida");

    // 6. Verificar se foi criado audit_log (deve haver 3 logs: insert occurrence, insert task, update occurrence)
    // O mais recente para essa ocorrência deve ser o UPDATE.
    const { data: auditData, error: auditErr } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('table_name', 'occurrences')
      .eq('record_id', occurrenceId)
      .eq('action', 'UPDATE')
      .order('changed_at', { ascending: false })
      .limit(1);

    if (auditErr) throw new Error("Erro ao checar auditoria: " + auditErr.message);
    if (!auditData || auditData.length === 0) {
      throw new Error("Audit log do UPDATE da ocorrência não foi encontrado!");
    }

    const { data: auditTaskData, error: auditTaskErr } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('table_name', 'tasks')
      .eq('record_id', taskId);

    if (auditTaskErr || !auditTaskData || auditTaskData.length === 0) {
       throw new Error("Audit log do INSERT da tarefa não foi encontrado!");
    }

    console.log("PASS: audit_log criado");
    console.log("\n✅ Todos os testes passaram com sucesso!");
    process.exit(0);

  } catch (error: any) {
    console.error("\nFAIL: " + error.message);
    process.exit(1);
  }
}

runTest();
