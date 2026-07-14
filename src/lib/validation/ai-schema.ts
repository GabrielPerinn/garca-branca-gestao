import { z } from "zod";

// Intenções suportadas pelo sistema
export const IntentEnum = z.enum([
  "create_expense",
  "create_revenue",
  "create_task",
  "complete_task",
  "cancel_task",
  "record_cattle_movement",
  "record_cattle_sale",
  "record_weighing",
  "create_livestock_protocol",
  "complete_livestock_protocol",
  "create_cattle_lot",
  "record_inventory_entry",
  "record_employee_payment",
  "record_gravel_operation",
  "record_suppression_operation",
  "create_rural_contract",
  "general_observation",
  "answer_question",
  "unknown"
]);

export type Intent = z.infer<typeof IntentEnum>;

// Ação secundária: para mensagens que geram mais de um evento no banco
export const SecondaryActionSchema = z.object({
  intent: IntentEnum,
  extracted_data: z.string().describe("Dados extras em JSON stringificado para esta ação secundária"),
  description: z.string().describe("Breve descrição do que esta ação secundária fará"),
});

export const AIResponseSchema = z.object({
  intent: IntentEnum,
  module: z.string().describe("Módulo relacionado: 'finance', 'livestock', 'maintenance', 'inventory', 'hr', 'gravel', 'environment', 'contracts', 'operations'"),
  action_type: z.string().describe("Tipo de ação: 'create', 'update', 'delete', 'read', 'query'"),
  confidence: z.number().min(0).max(1).describe("Confiança da IA (0 a 1). Use < 0.7 para mensagens ambíguas."),
  requires_confirmation: z.boolean().describe("True se a ação é financeira ou muta dados críticos."),
  should_create_pending_action: z.boolean().describe("True se der para estruturar os dados. False se for anotação genérica."),
  risk_level: z.enum(["low", "medium", "high"]).describe("Risco operacional. High para valores altos, questões ambientais, fiscalização."),
  extracted_data: z.string().describe("OBRIGATÓRIO: JSON stringificado com todos os dados extraídos da mensagem."),
  secondary_actions: z.array(SecondaryActionSchema).max(10).nullable().optional().describe("Lista de ações secundárias quando uma mensagem gera múltiplos eventos (ex: compra de gado = movimento + despesa)."),
  missing_fields: z.array(z.string()).nullable().describe("Campos importantes ausentes na mensagem."),
  human_summary: z.string().describe("Frase curta confirmando o que a IA entendeu. Se precisar de dados, pergunte diretamente."),
});

export type AIResponse = z.infer<typeof AIResponseSchema>;
export type SecondaryAction = z.infer<typeof SecondaryActionSchema>;
