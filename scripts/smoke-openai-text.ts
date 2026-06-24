import { config } from 'dotenv';
import { resolve } from 'path';

// Load variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { interpretRuralMessage } from '../src/lib/ai/interpreter';

const testPhrases = [
  "João recebeu 300 de adiantamento.",
  "Comprei 10 sacos de sal por 1800.",
  "Nasceram 3 bezerros no pasto 4.",
  "Vendi 20 bois pro frigorífico.",
  "O bebedouro do pasto 5 está vazando.",
  "A fiscalização passou perto da área nova.",
  "Tiramos 4 cargas de cascalho da entrada."
];

async function runTest() {
  console.log("Iniciando Smoke Test da OpenAI (Texto)...\n");

  if (!process.env.OPENAI_API_KEY) {
    console.error("ERRO: OPENAI_API_KEY não está configurada no .env.local");
    process.exit(1);
  }

  for (const phrase of testPhrases) {
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
