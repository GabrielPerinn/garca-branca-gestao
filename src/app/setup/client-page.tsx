'use client'

import { useState } from 'react'
import { setupFarm } from './actions'
import { Tractor, MapPin, FileText, ArrowRight, Check } from 'lucide-react'

const STEPS = [
  { id: 1, title: 'Bem-vindo', icon: Tractor },
  { id: 2, title: 'Sua Fazenda', icon: MapPin },
  { id: 3, title: 'Concluído', icon: Check },
]

export function SetupClientPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(fd: FormData) {
    setLoading(true)
    try {
      await setupFarm(fd)
    } catch (e: any) {
      alert(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background pointer-events-none" />

      <div className="relative w-full max-w-xl">
        {/* Progress steps */}
        <div className="flex items-center justify-center gap-3 mb-10">
          {STEPS.map((s, i) => {
            const done = step > s.id
            const active = step === s.id
            return (
              <div key={s.id} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 ${done ? 'bg-green-500 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {done ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
                  </div>
                  <span className={`text-xs font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{s.title}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-16 h-0.5 mb-5 transition-all duration-300 ${done ? 'bg-green-500' : 'bg-border'}`} />
                )}
              </div>
            )
          })}
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Step 1: Boas-vindas */}
          {step === 1 && (
            <div className="p-10 text-center space-y-6">
              <div className="h-20 w-20 mx-auto rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-3xl shadow-2xl shadow-primary/40">
                GB
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Bem-vindo ao sistema</h1>
                <p className="text-muted-foreground mt-3 leading-relaxed">
                  Garça Branca é o seu sistema completo de gestão rural com IA integrada. Antes de começar, vamos configurar as informações da sua fazenda.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-2">
                {[
                  { icon: '🐄', label: 'Controle de gado e lotes' },
                  { icon: '💰', label: 'Financeiro e vendas' },
                  { icon: '🤖', label: 'IA para campo' },
                ].map(f => (
                  <div key={f.label} className="p-4 bg-muted/50 rounded-xl text-center">
                    <p className="text-2xl mb-2">{f.icon}</p>
                    <p className="text-xs text-muted-foreground font-medium leading-tight">{f.label}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep(2)}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-xl font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30"
              >
                Começar configuração <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2: Dados da fazenda */}
          {step === 2 && (
            <form action={handleSubmit} className="p-10 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Dados da Fazenda</h2>
                <p className="text-muted-foreground mt-1">Essas informações serão usadas em todo o sistema e pela IA para contextualizar suas mensagens.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Nome da Fazenda <span className="text-destructive">*</span>
                  </label>
                  <input
                    name="farm_name"
                    placeholder="Fazenda Garça Branca"
                    required
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors text-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Localização / Município
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      name="location"
                      placeholder="Cáceres - MT"
                      className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Área Total (hectares)
                  </label>
                  <input
                    name="total_area"
                    type="number"
                    step="0.1"
                    placeholder="1500"
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    <FileText className="inline h-4 w-4 mr-1 mb-0.5" />
                    Observações sobre a fazenda
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    placeholder="Ex: Fazenda mista com pecuária de corte e leite. Atividade principal: engorda de boi gordo..."
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    💡 Quanto mais detalhes você colocar aqui, mais precisa será a IA ao interpretar suas mensagens.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-lg shadow-primary/30"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Configurando...
                    </>
                  ) : (
                    <>Salvar e Entrar no Sistema <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
