'use client'

import { useState } from "react";
import { createDocument, deleteDocument } from "./actions";

export function DocumentsClientPage({ documents, dbError }: any) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">Documentos</h1>
        <button onClick={() => setShowModal(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded">Novo Documento</button>
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
          {documents.map((d: any) => (
            <tr key={d.id} className="border-t">
              <td className="p-4">{new Date(d.created_at).toLocaleDateString('pt-BR')}</td>
              <td className="p-4">{d.title}</td>
              <td className="p-4">{d.document_type}</td>
              <td className="p-4">
                <button onClick={() => deleteDocument(d.id)} className="text-red-500">Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-background p-6 rounded max-w-md w-full">
            <h3 className="text-xl mb-4">Registrar Documento</h3>
            <form action={async (fd) => { await createDocument(fd); setShowModal(false); }} className="space-y-4 flex flex-col">
              <input name="title" placeholder="Título" required className="border p-2" />
              <input name="type" placeholder="Tipo (ex: CAR, Contrato)" required className="border p-2" />
              <button type="submit" className="bg-primary text-white p-2">Salvar</button>
              <button type="button" onClick={() => setShowModal(false)} className="p-2">Cancelar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
