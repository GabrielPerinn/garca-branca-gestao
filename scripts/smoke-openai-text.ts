import { config } from 'dotenv';
import { resolve } from 'path';

// Load variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { completeRuralActionPlan, interpretRuralMessage } from '../src/lib/ai/interpreter';

const testPhrases = [
  "João recebeu 300 de adiantamento.",
  "Comprei 10 sacos de sal por 1800.",
  "Nasceram 3 bezerros no pasto 4.",
  "Vendi 20 bois pro frigorífico.",
  "O bebedouro do pasto 5 está vazando.",
  "A fiscalização passou perto da área nova.",
  "Tiramos 4 cargas de cascalho da entrada.",
  "Me lembre de vacinar o lote Matrizes no dia 20/08/2026 e repetir a cada 180 dias.",
  "Aplicamos hoje o protocolo Vacinação Matrizes em 180 cabeças.",
  "Pesagem do lote Bois Venda hoje: pesos 400, 420 e 440 kg.",
  "Ó, compra de dez bois hoje por cinquenta mil, a cerca do lote dois é pra arrumar até sexta, e paguei sessenta mil do sal.",
  "Não precisa mais arrumar a cerca do lote 2, cancela essa tarefa."
];

async function runTest() {
  console.log("Iniciando Smoke Test da OpenAI (Texto)...\n");

  if (!process.env.OPENAI_API_KEY) {
    console.error("ERRO: OPENAI_API_KEY não está configurada no .env.local");
    process.exit(1);
  }

  const filter = process.env.SMOKE_FILTER?.toLocaleLowerCase('pt-BR')
  const selectedPhrases = filter
    ? testPhrases.filter(phrase => phrase.toLocaleLowerCase('pt-BR').includes(filter))
    : testPhrases
  if (selectedPhrases.length === 0) throw new Error(`Nenhum cenário corresponde ao filtro '${filter}'.`)

  for (const phrase of selectedPhrases) {
    console.log(`\nTesting: "${phrase}"`);
    try {
      const result = await interpretRuralMessage(phrase, undefined, 'openai');
      console.log(`  Intent: ${result.intent}`);
      console.log(`  Risk: ${result.risk_level}`);
      console.log(`  Confidence: ${result.confidence}`);
      console.log(`  Requires Confirm: ${result.requires_confirmation}`);
      console.log(`  Should Pending Action: ${result.should_create_pending_action}`);
      console.log(`  Human Summary: ${result.human_summary}`);

      // Basic Assertions
      if (!result.intent) throw new Error("Intent missing");
      if (typeof result.confidence !== 'number') throw new Error("Confidence missing");
      if (result.confidence > 1 || result.confidence < 0) throw new Error("Confidence out of bounds");
      
      const isCritical = ['create_expense', 'record_cattle_sale'].includes(result.intent);
      if (isCritical && !result.requires_confirmation) {
         throw new Error(`Ação crítica (${result.intent}) não pediu requires_confirmation!`);
      }
      if (isCritical && !result.should_create_pending_action) {
         throw new Error(`Ação crítica (${result.intent}) deve gerar pending_action!`);
      }
      
      const isAmbiguous = phrase.includes('bebedouro') || phrase.includes('fiscalização');
      if (isAmbiguous && result.intent !== 'general_observation') {
         throw new Error(`Mensagem ambígua deveria ser general_observation, foi ${result.intent}`);
      }
      if (phrase.includes('cascalho') && result.intent !== 'record_gravel_operation') {
        throw new Error(`Retirada de cascalho deveria estruturar operação, foi ${result.intent}`);
      }
      if (phrase.includes('Me lembre de vacinar') && result.intent !== 'create_livestock_protocol') {
        throw new Error(`Agendamento sanitário deveria criar protocolo, foi ${result.intent}`);
      }
      if (phrase.includes('Aplicamos hoje o protocolo') && result.intent !== 'complete_livestock_protocol') {
        throw new Error(`Relato sanitário deveria concluir protocolo, foi ${result.intent}`);
      }
      if (phrase.includes('pesos 400') && result.intent !== 'record_weighing') {
        throw new Error(`Lista manual deveria criar pesagem, foi ${result.intent}`);
      }
      if (phrase.includes('pesos 400')) {
        const data = JSON.parse(result.extracted_data);
        if (JSON.stringify(data.individual_weights) !== JSON.stringify([400, 420, 440])) {
          throw new Error('Pesos individuais não foram preservados na interpretação.');
        }
      }
      if (phrase.startsWith('Ó, compra de dez bois')) {
        if (result.intent !== 'record_cattle_movement') {
          throw new Error(`Relato composto deveria começar pela compra do gado, foi ${result.intent}`);
        }
        if (result.secondary_actions?.length !== 3) {
          throw new Error(`Relato composto deveria gerar 4 registros, gerou ${1 + (result.secondary_actions?.length ?? 0)}`);
        }

        const correction = await completeRuralActionPlan({
          originalText: phrase,
          draftPlan: result,
          followupText: 'Não, falei errado: o pagamento do sal foi 58 mil.',
          safetyIdentity: 'smoke-openai-conversation',
        });
        if (!correction.isRelated) throw new Error('A correção natural não foi relacionada ao cadastro anterior.');
        const saltExpense = correction.plan.secondary_actions?.find(action =>
          action.intent === 'create_expense'
          && /sal/i.test(`${action.description} ${action.extracted_data}`)
        );
        const correctedAmount = saltExpense ? Number(JSON.parse(saltExpense.extracted_data).amount) : 0;
        if (correctedAmount !== 58_000) {
          throw new Error(`A correção do sal deveria resultar em R$ 58.000, recebeu ${correctedAmount}.`);
        }
      }
      if (phrase.startsWith('Não precisa mais arrumar')) {
        if (result.intent !== 'cancel_task' || result.action_type !== 'update') {
          throw new Error(`Cancelamento de tarefa deveria virar cancel_task/update, recebeu ${result.intent}/${result.action_type}.`);
        }
        const data = JSON.parse(result.extracted_data);
        if (!/cerca.*lote 2/i.test(String(data.task_name ?? ''))) {
          throw new Error(`A tarefa alvo não foi preservada: ${String(data.task_name ?? '')}`);
        }
        if (!result.requires_confirmation || !result.should_create_pending_action) {
          throw new Error('Cancelamento de tarefa existente deve exigir confirmação.');
        }
      }

      console.log("  ✅ PASS");

    } catch (e: any) {
      console.error(`  ❌ FAIL: ${e.message}`);
      process.exit(1);
    }
  }

  console.log("\n✅ Todos os testes OpenAI passaram com sucesso!");
  process.exit(0);
}

runTest();
