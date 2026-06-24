'use client'

import { useState } from "react";
import { createMovement, deleteMovement } from "./actions";

export function MovementsClientPage({ movements, dbError }: any) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">Movimentações de Estoque</h1>
        <button onClick={() => setShowModal(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded">Nova Movimentação</button>
      </div>

      {dbError && <p className="text-red-500">{dbError}</p>}

      <table className="w-full text-left border">
        <thead>
          <tr className="bg-muted">
            <th className="p-4">Data</th>
            <th className="p-4">Tipo</th>
            <th className="p-4">Quantidade</th>
            <th className="p-4">Ações</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m: any) => (
            <tr key={m.id} className="border-t">
              <td className="p-4">{new Date(m.movement_date).toLocaleDateString('pt-BR')}</td>
              <td className="p-4">{m.movement_type === 'in' ? 'Entrada' : 'Saída'}</td>
              <td className="p-4">{m.quantity}</td>
              <td className="p-4">
                <button onClick={() => deleteMovement(m.id)} className="text-red-500">Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-background p-6 rounded max-w-md w-full">
            <h3 className="text-xl mb-4">Registrar Movimentação</h3>
            <form action={async (fd) => { await createMovement(fd); setShowModal(false); }} className="space-y-4 flex flex-col">
              <input name="date" type="date" required className="border p-2" />
              <select name="type" className="border p-2">
                <option value="in">Entrada</option>
                <option value="out">Saída</option>
              </select>
              <input name="quantity" type="number" step="0.01" placeholder="Quantidade" required className="border p-2" />
              <button type="submit" className="bg-primary text-white p-2">Salvar</button>
              <button type="button" onClick={() => setShowModal(false)} className="p-2">Cancelar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
