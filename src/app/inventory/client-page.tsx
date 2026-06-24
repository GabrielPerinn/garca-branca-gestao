'use client'

import { useState } from "react";
import { Plus, Package, AlertTriangle, X, Trash2 } from "lucide-react";
import { createInventoryItem, deleteInventoryItem } from "./actions";

export function InventoryClientPage({ items, dbError }: any) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Estoque de Insumos</h1>
          <p className="text-muted-foreground mt-1">Controle de sal mineral, vacinas e mais.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 flex items-center gap-2 shadow-lg shadow-primary/20">
          <Plus className="h-5 w-5" /><span>Novo Insumo</span>
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {dbError ? <div className="p-8 text-center text-destructive">Erro: {dbError}</div> : 
         !items || items.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4"><Package className="h-8 w-8" /></div>
            <h3 className="text-lg font-medium text-foreground">Estoque vazio</h3>
            <p className="text-muted-foreground mt-1">Comece a cadastrar os insumos.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="p-4 font-medium text-sm text-muted-foreground">Produto</th>
                <th className="p-4 font-medium text-sm text-muted-foreground">Categoria</th>
                <th className="p-4 font-medium text-sm text-muted-foreground">Qtd. Atual</th>
                <th className="p-4 font-medium text-sm text-muted-foreground">Status</th>
                <th className="p-4 font-medium text-sm text-muted-foreground text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item: any) => {
                const isLow = item.minimum_quantity !== null && item.current_quantity <= item.minimum_quantity;
                return (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="p-4 font-medium">{item.name}</td>
                    <td className="p-4 text-muted-foreground">{item.category || '-'}</td>
                    <td className="p-4 font-bold">{item.current_quantity} {item.unit}</td>
                    <td className="p-4">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                          <AlertTriangle className="h-3 w-3" /> Estoque Baixo
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary">Adequado</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => deleteInventoryItem(item.id)} className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Cadastrar Insumo</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground"><X /></button>
            </div>
            <form action={async (formData) => { await createInventoryItem(formData); setShowModal(false); }} className="space-y-4">
              <input name="name" placeholder="Nome (ex: Sal Mineral)" required className="w-full h-10 px-3 rounded-md bg-background border border-border" />
              <input name="category" placeholder="Categoria (ex: Nutrição)" required className="w-full h-10 px-3 rounded-md bg-background border border-border" />
              <input name="unit" placeholder="Unidade (ex: sacos, frascos)" required className="w-full h-10 px-3 rounded-md bg-background border border-border" />
              <input name="quantity" type="number" placeholder="Quantidade Atual" required className="w-full h-10 px-3 rounded-md bg-background border border-border" />
              <input name="min_quantity" type="number" placeholder="Alerta de Estoque Mínimo" required className="w-full h-10 px-3 rounded-md bg-background border border-border" />
              <button type="submit" className="w-full h-10 bg-primary text-primary-foreground rounded-md font-bold">Salvar Insumo</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
