'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Executa uma ação aprovada no banco de dados
async function executeAction(supabase: any, actionType: string, payload: Record<string, any>): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  switch (actionType) {

    case 'create_expense': {
      const { error } = await supabase.from('expenses').insert({
        amount: payload.amount ?? 0,
        description: payload.description ?? 'Lançado via IA',
        category: payload.category ?? 'IA',
        expense_date: payload.expense_date ?? payload.date ?? today,
        status: 'active',
      });
      if (error) throw new Error(`Erro ao criar despesa: ${error.message}`);
      break;
    }

    case 'create_revenue': {
      const { error } = await supabase.from('revenues').insert({
        amount: payload.amount ?? 0,
        description: payload.description ?? 'Receita via IA',
        category: payload.category ?? 'IA',
        revenue_date: payload.revenue_date ?? payload.date ?? today,
        status: 'active',
      });
      if (error) throw new Error(`Erro ao criar receita: ${error.message}`);
      break;
    }

    case 'create_task': {
      const { error } = await supabase.from('tasks').insert({
        title: payload.title ?? payload.description ?? 'Tarefa via IA',
        description: payload.description ?? null,
        priority: payload.priority ?? 'medium',
        due_date: payload.due_date ?? payload.date ?? null,
        status: 'pending',
      });
      if (error) throw new Error(`Erro ao criar tarefa: ${error.message}`);
      break;
    }

    case 'record_cattle_sale': {
      const { error } = await supabase.from('cattle_sales').insert({
        buyer_name: payload.buyer_name ?? payload.buyer ?? 'Comprador via IA',
        quantity: payload.quantity ?? 1,
        gross_amount: payload.gross_amount ?? payload.amount ?? 0,
        negotiation_date: payload.negotiation_date ?? payload.date ?? today,
        shipment_date: payload.shipment_date ?? null,
        payment_status: 'pending',
        status: 'active',
      });
      if (error) throw new Error(`Erro ao registrar venda: ${error.message}`);
      break;
    }

    case 'record_cattle_movement': {
      const movType = payload.movement_type ?? 'transfer';
      const qty = payload.quantity ?? 1;

      // Insere o movimento
      const { error: movError } = await supabase.from('cattle_movements').insert({
        movement_type: movType,
        quantity: qty,
        movement_date: payload.movement_date ?? payload.date ?? today,
        reason: payload.reason ?? null,
        notes: payload.human_summary ?? null,
        status: 'active',
      });
      if (movError) throw new Error(`Erro ao registrar movimento: ${movError.message}`);

      // Se é compra, cria ou atualiza um lote
      if (movType === 'purchase') {
        const lotName = payload.lot_name ?? `${payload.animal_category ?? 'Gado'} — Compra ${new Date().toLocaleDateString('pt-BR')}`;
        const { error: lotError } = await supabase.from('cattle_lots').insert({
          name: lotName,
          category: payload.animal_category ?? null,
          current_quantity: qty,
          origin: payload.origin ?? 'Compra via IA',
          status: 'active',
        });
        if (lotError) throw new Error(`Erro ao criar lote: ${lotError.message}`);
      }
      break;
    }

    case 'record_weighing': {
      const { error } = await supabase.from('weighings').insert({
        weighing_date: payload.weighing_date ?? payload.date ?? today,
        quantity_weighed: payload.quantity_weighed ?? null,
        average_weight: payload.average_weight ?? null,
        total_weight: payload.total_weight ?? (payload.average_weight && payload.quantity_weighed ? payload.average_weight * payload.quantity_weighed : null),
        notes: payload.notes ?? 'Registrado via IA',
      });
      if (error) throw new Error(`Erro ao registrar pesagem: ${error.message}`);
      break;
    }

    case 'record_employee_payment': {
      // Tenta encontrar o funcionário pelo nome
      let employeeId: string | null = null;
      if (payload.employee_name) {
        const { data: emp } = await supabase
          .from('employees')
          .select('id')
          .ilike('full_name', `%${payload.employee_name}%`)
          .limit(1)
          .single();
        employeeId = emp?.id ?? null;
      }

      const { error } = await supabase.from('employee_payments').insert({
        employee_id: employeeId,
        payment_type: payload.payment_type ?? 'salário',
        amount: payload.amount ?? 0,
        payment_date: payload.payment_date ?? payload.date ?? today,
        description: payload.description ?? `${payload.payment_type ?? 'Pagamento'} via IA`,
        status: 'active',
      });
      if (error) throw new Error(`Erro ao registrar pagamento: ${error.message}`);
      break;
    }

    default:
      throw new Error(`Intent '${actionType}' não tem executor implementado.`);
  }
}

export async function approvePendingAction(actionId: string) {
  const supabase = await createAdminClient();

  // 1. Buscar a ação
  const { data: action, error: fetchError } = await supabase
    .from('pending_actions')
    .select('*')
    .eq('id', actionId)
    .single();

  if (fetchError || !action) throw new Error('Ação não encontrada.');
  if (action.confirmation_status !== 'pending') throw new Error('Ação já processada.');

  const payload = action.interpreted_data_json ?? {};

  // 2. Executar ação primária
  await executeAction(supabase, action.action_type, payload);

  // 3. Executar ações secundárias (ex: compra de gado → despesa automática)
  if (payload.secondary_actions && Array.isArray(payload.secondary_actions)) {
    for (const secondary of payload.secondary_actions) {
      try {
        const secondaryPayload = typeof secondary.extracted_data === 'string'
          ? JSON.parse(secondary.extracted_data)
          : secondary.extracted_data;
        await executeAction(supabase, secondary.intent, secondaryPayload);
      } catch (err: any) {
        console.error(`Erro na ação secundária ${secondary.intent}:`, err.message);
        // Não falha a aprovação por ação secundária — só loga
      }
    }
  }

  // 4. Marcar como concluída
  await supabase.from('pending_actions').update({
    confirmation_status: 'completed',
    updated_at: new Date().toISOString(),
  }).eq('id', actionId);

  // 5. Registrar no audit_log
  await supabase.from('audit_logs').insert({
    action: 'approve_pending_action',
    table_name: 'pending_actions',
    record_id: actionId,
    new_values: { action_type: action.action_type, payload },
  }).maybeSingle();

  // 6. Revalidar todas as páginas afetadas
  revalidatePath('/');
  revalidatePath('/pending-actions');
  revalidatePath('/finance');
  revalidatePath('/tasks');
  revalidatePath('/cattle');
  revalidatePath('/sales');
  revalidatePath('/employees');

  return { success: true };
}

export async function rejectPendingAction(actionId: string) {
  const supabase = await createAdminClient();
  await supabase
    .from('pending_actions')
    .update({ confirmation_status: 'discarded', updated_at: new Date().toISOString() })
    .eq('id', actionId);

  // Registrar no audit_log
  await supabase.from('audit_logs').insert({
    action: 'reject_pending_action',
    table_name: 'pending_actions',
    record_id: actionId,
    new_values: { reason: 'Rejected by user' },
  }).maybeSingle();

  revalidatePath('/pending-actions');
  return { success: true };
}
