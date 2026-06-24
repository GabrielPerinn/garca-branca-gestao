'use client'

import { useState } from "react";
import { processMessage } from "./actions";
import { Bot, Send, Inbox, Bell, AlertTriangle, Zap, Plus, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

const EXAMPLES = [
  { label: "Compra de gado", text: "Comprei 2 bezerros hoje por R$ 1.800 cada" },
  { label: "Venda de gado", text: "Mandei 60 cabeças pro Marfrig hoje" },
  { label: "Nascimento", text: "Nasceram 4 bezerros essa manhã no pasto 1" },
  { label: "Morte", text: "Perdemos um boi hoje, achamos morto no pasto 3" },
  { label: "Pesagem", text: "Pesamos o lote hoje, média 420kg, 80 cabeças" },
  { label: "Movimentação", text: "Passei 50 cabeças do pasto 2 pro pasto 5 hoje" },
  { label: "Funcionário", text: "Paguei João R$ 800 de adiantamento hoje" },
  { label: "Insumo", text: "Comprei 10 sacos de sal mineral por R$ 650" },
  { label: "Receita", text: "Recebi R$ 12.000 de arrendamento do vizinho hoje" },
  { label: "Tarefa", text: "Fala pro Pedro consertar a cerca do pasto 3 urgente" },
  { label: "Observação", text: "A bomba da aguada do pasto 7 quebrou" },
  { label: "Risco alto", text: "Chegou a fiscalização do IBAMA hoje de manhã" },
];

type MessageResult = {
  reply: string;
  ai_data: string;
};

type HistoryItem = {
  input: string;
  output: MessageResult;
  intent?: string;
  confidence?: number;
  hasSecondary?: boolean;
};

const intentLabels: Record<string, { label: string; color: string }> = {
  create_expense: { label: 'Despesa', color: 'text-red-400' },
  create_revenue: { label: 'Receita', color: 'text-green-400' },
  record_cattle_movement: { label: 'Gado — Movimentação', color: 'text-blue-400' },
  record_cattle_sale: { label: 'Venda de Gado', color: 'text-purple-400' },
  record_weighing: { label: 'Pesagem', color: 'text-cyan-400' },
  create_task: { label: 'Tarefa', color: 'text-amber-400' },
  record_employee_payment: { label: 'Pagamento Funcionário', color: 'text-orange-400' },
  general_observation: { label: 'Observação de Campo', color: 'text-muted-foreground' },
  answer_question: { label: 'Pergunta', color: 'text-primary' },
  unknown: { label: 'Indefinido', color: 'text-destructive' },
};

export function AiTestClient() {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<'mock' | 'openai'>('mock');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  async function handleSend(text: string) {
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      const res = await processMessage(text, provider);
      setHistory(prev => [{ input: text, output: res as MessageResult }, ...prev]);
      setExpandedIdx(0);
      if (text === message) setMessage("");
    } catch (err: any) {
      setHistory(prev => [{ input: text, output: { reply: `Erro: ${err.message}`, ai_data: 'Erro' } }, ...prev]);
    }
    setLoading(false);
  }

  function getDestinationBadge(reply: string) {
    const r = reply?.toLowerCase() || '';
    if (r.includes('erro') || r.includes('⚠️') || r.includes('❌')) {
      return <span className="flex items-center gap-1.5 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-full px-2.5 py-1"><AlertTriangle className="h-3 w-3" /> Erro</span>;
    }
    if (r.includes('caixa de entrada') || r.includes('observação') || r.includes('revisão')) {
      return <span className="flex items-center gap-1.5 text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1"><Inbox className="h-3 w-3" /> Caixa de Entrada</span>;
    }
    return <span className="flex items-center gap-1.5 text-xs font-medium text-green-500 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-1"><Bell className="h-3 w-3" /> Ação Pendente</span>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Simulador de IA</h1>
          <p className="text-muted-foreground mt-1">
            Teste como a IA interpreta mensagens do campo. Mensagens ambíguas → <strong>Caixa de Entrada</strong>. Ações claras → <strong>Ações Pendentes</strong>.
          </p>
        </div>
      </div>

      {/* Provider + info */}
      <div className="bg-card border border-border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="font-medium text-foreground text-sm">Motor de IA</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mock = offline sem custo. GPT-4o-mini = OpenAI real (requer OPENAI_API_KEY).
          </p>
        </div>
        <div className="flex gap-1 p-1 bg-muted rounded-xl">
          <button onClick={() => setProvider('mock')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${provider === 'mock' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Zap className="h-3.5 w-3.5" /> Mock
          </button>
          <button onClick={() => setProvider('openai')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${provider === 'openai' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Bot className="h-3.5 w-3.5" /> GPT-4o-mini
          </button>
        </div>
      </div>

      {/* Exemplos por categoria */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Exemplos de frases de campo</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map(ex => (
            <button
              key={ex.text}
              onClick={() => handleSend(ex.text)}
              disabled={loading}
              className="group text-xs px-3 py-1.5 bg-muted hover:bg-primary/10 hover:text-primary border border-border hover:border-primary/30 rounded-lg transition-colors disabled:opacity-50 text-muted-foreground flex items-center gap-1.5"
            >
              <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <label className="block text-sm font-medium text-foreground">Mensagem de campo</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="w-full h-24 bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
          placeholder='Ex: "Comprei 2 bezerros hoje por R$ 1.800 cada"'
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(message); }}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">⌘+Enter para enviar</p>
          <button
            onClick={() => handleSend(message)}
            disabled={loading || !message.trim()}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processando...</> : <><Send className="h-4 w-4" /> Enviar</>}
          </button>
        </div>
      </div>

      {/* Histórico */}
      {history.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">Histórico desta sessão ({history.length})</p>
          {history.map((r, i) => {
            const isExpanded = expandedIdx === i;
            const isOccurrence = r.output.reply?.toLowerCase().includes('caixa de entrada') || r.output.reply?.toLowerCase().includes('revisão');
            return (
              <div key={i} className={`bg-card border rounded-2xl overflow-hidden transition-colors ${isExpanded ? 'border-primary/30' : 'border-border'}`}>
                <button
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${isOccurrence ? 'bg-amber-500' : 'bg-green-500'}`} />
                  <p className="flex-1 text-sm font-medium text-foreground truncate">"{r.input}"</p>
                  {getDestinationBadge(r.output.reply)}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-border p-4 bg-muted/20 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-primary uppercase tracking-wide">{provider === 'mock' ? 'Mock Engine' : 'GPT-4o-mini'}</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{r.output.reply}</p>
                    {!isOccurrence && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Plus className="h-3 w-3 text-green-500" />
                        <span>Ação aguardando aprovação em <strong>Ações Pendentes</strong></span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {history.length === 0 && (
        <div className="text-center py-16 bg-card border border-border rounded-2xl">
          <Bot className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-medium text-foreground mb-1">Nenhuma mensagem ainda</p>
          <p className="text-sm text-muted-foreground">Use os exemplos acima ou digite uma mensagem de campo.</p>
        </div>
      )}
    </div>
  );
}
