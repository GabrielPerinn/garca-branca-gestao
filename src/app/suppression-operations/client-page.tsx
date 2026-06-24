'use client'

import { useState } from "react";
import { createSuppression, deleteSuppression } from "./actions";

export function SuppressionClientPage({ records, dbError }: any) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">Supressão (Limpeza)</h1>
        <button onClick={() => setShowModal(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded">Nova Operação</button>
      </div>

      {dbError && <p className="text-red-500">{dbError}</p>}

      <table className="w-full text-left border">
        <thead>
          <tr className="bg-muted">
            <th className="p-4">Data</th>
            <th className="p-4">Localização</th>
            <th className="p-4">Área Limpa (ha)</th>
            <th className="p-4">Ações</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r: any) => (
            <tr key={r.id} className="border-t">
              <td className="p-4">{new Date(r.operation_date).toLocaleDateString('pt-BR')}</td>
              <td className="p-4">{r.location_description}</td>
              <td className="p-4">{r.area_cleared}</td>
              <td className="p-4">
                <button onClick={() => deleteSuppression(r.id)} className="text-red-500">Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-background p-6 rounded max-w-md w-full">
            <h3 className="text-xl mb-4">Registrar Supressão</h3>
            <form action={async (fd) => { await createSuppression(fd); setShowModal(false); }} className="space-y-4 flex flex-col">
              <input name="date" type="date" required className="border p-2" />
              <input name="location" placeholder="Localização" required className="border p-2" />
              <input name="area" type="number" step="0.01" placeholder="Área (ha)" required className="border p-2" />
              <button type="submit" className="bg-primary text-white p-2">Salvar</button>
              <button type="button" onClick={() => setShowModal(false)} className="p-2">Cancelar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
