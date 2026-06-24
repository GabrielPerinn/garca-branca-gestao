'use client'

import { useState } from "react";
import { createAlert, deleteAlert } from "./actions";

export function AlertsClientPage({ alerts, dbError }: any) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">Alertas</h1>
        <button onClick={() => setShowModal(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded">Novo Alerta</button>
      </div>

      {dbError && <p className="text-red-500">{dbError}</p>}

      <table className="w-full text-left border">
        <thead>
          <tr className="bg-muted">
            <th className="p-4">Data</th>
            <th className="p-4">Título</th>
            <th className="p-4">Tipo</th>
            <th className="p-4">Ações</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a: any) => (
            <tr key={a.id} className="border-t">
              <td className="p-4">{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
              <td className="p-4">{a.title}</td>
              <td className="p-4">{a.alert_type}</td>
              <td className="p-4">
                <button onClick={() => deleteAlert(a.id)} className="text-red-500">Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-background p-6 rounded max-w-md w-full">
            <h3 className="text-xl mb-4">Criar Alerta</h3>
            <form action={async (fd) => { await createAlert(fd); setShowModal(false); }} className="space-y-4 flex flex-col">
              <input name="title" placeholder="Título do Alerta" required className="border p-2" />
              <input name="type" placeholder="Tipo (ex: Estoque, Gado)" required className="border p-2" />
              <input name="description" placeholder="Descrição" required className="border p-2" />
              <button type="submit" className="bg-primary text-white p-2">Salvar</button>
              <button type="button" onClick={() => setShowModal(false)} className="p-2">Cancelar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
