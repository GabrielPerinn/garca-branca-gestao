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
  provider: 'mock' | 'openai';
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
      setHistory(prev => [{ input: text, output: res as MessageResult, provider }, ...prev]);
      setExpandedIdx(0);
      if (text === message) setMessage("");
    } catch (err: any) {
      setHistory(prev => [{ input: text, output: { reply: `Erro: ${err.message}`, ai_data: 'Erro' }, provider }, ...prev]);
    }
    setLoading(false);
  }

  function getDestinationBadge(reply: string) {
    const r = reply?.toLowerCase() || '';
    if (r.includes('erro') || r.includes('⚠️') || r.includes('❌')) {
      return <span className="flex items-center gap-1.5 rounded-full border border-red-700/20 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> Erro</span>;
    }
    if (r.includes('caixa de entrada') || r.includes('observação') || r.includes('revisão')) {
      return <span className="flex items-center gap-1.5 rounded-full border border-amber-700/20 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"><Inbox className="h-3 w-3" aria-hidden="true" /> Caixa de Entrada</span>;
    }
    return <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary"><Bell className="h-3 w-3" aria-hidden="true" /> Ação Pendente</span>;
  }

  return (
    <div className="app-page max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Bot className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Simulador de IA</h1>
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
        <div className="flex gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Motor de inteligência artificial">
          <button type="button" aria-pressed={provider === 'mock'} onClick={() => setProvider('mock')} className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary sm:px-4 ${provider === 'mock' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Mock
          </button>
          <button type="button" aria-pressed={provider === 'openai'} onClick={() => setProvider('openai')} className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary sm:px-4 ${provider === 'openai' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Bot className="h-3.5 w-3.5" aria-hidden="true" /> GPT-4o-mini
          </button>
        </div>
      </div>

      {/* Exemplos por categoria */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Exemplos de frases de campo</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map(ex => (
            <button
              type="button"
              key={ex.text}
              onClick={() => handleSend(ex.text)}
              disabled={loading}
              className="group flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground outline-none transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <label htmlFor="ai-test-message" className="block text-sm font-medium text-foreground">Mensagem de campo</label>
        <textarea
          id="ai-test-message"
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="w-full h-24 bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
          placeholder='Ex: "Comprei 2 bezerros hoje por R$ 1.800 cada"'
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(message); }}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Ctrl/⌘ + Enter para enviar</p>
          <button
            type="button"
            onClick={() => handleSend(message)}
            disabled={loading || !message.trim()}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 sm:w-auto"
          >
            {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none" aria-hidden="true" /> Processando...</> : <><Send className="h-4 w-4" aria-hidden="true" /> Enviar</>}
          </button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{loading ? 'Mensagem em processamento.' : ''}</p>
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
                  type="button"
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  aria-expanded={isExpanded}
                  aria-controls={`ai-result-${i}`}
                  className="flex w-full flex-wrap items-center gap-3 p-4 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:flex-nowrap sm:gap-4"
                >
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${isOccurrence ? 'bg-amber-700' : 'bg-primary'}`} aria-hidden="true" />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">“{r.input}”</p>
                  {getDestinationBadge(r.output.reply)}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />}
                </button>

                {isExpanded && (
                  <div id={`ai-result-${i}`} className="space-y-3 border-t border-border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
                      <span className="text-xs font-semibold text-primary uppercase tracking-wide">{r.provider === 'mock' ? 'Mock Engine' : 'GPT-4o-mini'}</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{r.output.reply}</p>
                    {!isOccurrence && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Plus className="h-3 w-3 text-primary" aria-hidden="true" />
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
          <Bot className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
          <p className="font-medium text-foreground mb-1">Nenhuma mensagem ainda</p>
          <p className="text-sm text-muted-foreground">Use os exemplos acima ou digite uma mensagem de campo.</p>
        </div>
      )}
    </div>
  );
}
