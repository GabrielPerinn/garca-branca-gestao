'use client'

import { useState } from "react";
import { createPayment, deletePayment } from "./actions";

export function EmployeePaymentsClient({ payments, dbError }: any) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">Pagamentos de Funcionários</h1>
        <button onClick={() => setShowModal(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded">Novo Pagamento</button>
      </div>

      {dbError && <p className="text-red-500">{dbError}</p>}

      <table className="w-full text-left border">
        <thead>
          <tr className="bg-muted">
            <th className="p-4">Data</th>
            <th className="p-4">Valor</th>
            <th className="p-4">Descrição</th>
            <th className="p-4">Ações</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p: any) => (
            <tr key={p.id} className="border-t">
              <td className="p-4">{new Date(p.payment_date).toLocaleDateString('pt-BR')}</td>
              <td className="p-4">R$ {p.amount}</td>
              <td className="p-4">{p.description}</td>
              <td className="p-4">
                <button onClick={() => deletePayment(p.id)} className="text-red-500">Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-background p-6 rounded max-w-md w-full">
            <h3 className="text-xl mb-4">Registrar Pagamento</h3>
            <form action={async (fd) => { await createPayment(fd); setShowModal(false); }} className="space-y-4 flex flex-col">
              <input name="date" type="date" required className="border p-2" />
              <input name="amount" type="number" step="0.01" placeholder="Valor (R$)" required className="border p-2" />
              <input name="description" placeholder="Descrição (ex: Adiantamento)" required className="border p-2" />
              <button type="submit" className="bg-primary text-white p-2">Salvar</button>
              <button type="button" onClick={() => setShowModal(false)} className="p-2">Cancelar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
