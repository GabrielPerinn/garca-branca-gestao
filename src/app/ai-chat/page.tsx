'use client'

import { useState } from 'react'
import { Send, Image as ImageIcon, Bot, User, Loader2 } from 'lucide-react'
import { processChatAction } from './actions'

type Message = { role: 'user' | 'ai', content: string, imageUrl?: string, data?: any }

export default function AiChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: 'Olá! Sou a IA da Garça Branca. Você pode me contar o que aconteceu hoje na fazenda ou enviar a foto de um recibo/comprovante que eu extraio os dados para você.' }
  ])
  const [input, setInput] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() && !imageFile) return

    const formData = new FormData()
    formData.append('message', input)
    if (imageFile) formData.append('image', imageFile)

    const newMessages: Message[] = [...messages, { 
      role: 'user', 
      content: input, 
      imageUrl: imageFile ? URL.createObjectURL(imageFile) : undefined 
    }]
    
    setMessages(newMessages)
    setInput('')
    setImageFile(null)
    setLoading(true)

    const res = await processChatAction(formData)

    if (res.success && res.result) {
      setMessages([...newMessages, { 
        role: 'ai', 
        content: res.result.human_summary || 'Processado com sucesso.',
        data: res.result.extracted_data
      }])
    } else {
      setMessages([...newMessages, { role: 'ai', content: 'Erro ao processar: ' + res.error }])
    }
    setLoading(false)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Bot className="h-8 w-8 text-primary" /> Chat de Inteligência
        </h1>
        <p className="text-muted-foreground mt-1">Converse com a IA para lançar dados ou envie notas fiscais.</p>
      </div>

      <div className="flex-1 bg-card rounded-2xl border border-border shadow-sm flex flex-col overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent/20 text-accent'
              }`}>
                {msg.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl p-4 ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-muted rounded-tl-none text-foreground'
              }`}>
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Upload" className="max-w-sm rounded-lg mb-3 border border-border/50" />
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.data && Object.keys(msg.data).length > 0 && (
                  <pre className="mt-3 p-3 bg-background/50 rounded-lg text-xs overflow-x-auto text-foreground/80">
                    {JSON.stringify(msg.data, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
          {loading && (
             <div className="flex gap-4">
              <div className="h-10 w-10 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-none p-4 flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Interpretando imagem e texto...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-border bg-muted/20">
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="relative">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
              <label 
                htmlFor="file-upload" 
                className={`flex items-center justify-center h-12 w-12 rounded-xl border border-border cursor-pointer transition-colors ${imageFile ? 'bg-primary/20 text-primary border-primary/50' : 'bg-background hover:bg-muted text-muted-foreground'}`}
              >
                <ImageIcon className="h-5 w-5" />
              </label>
            </div>
            
            <div className="flex-1 bg-background rounded-xl border border-border flex flex-col focus-within:ring-2 focus-within:ring-primary/50 transition-all overflow-hidden">
              {imageFile && (
                <div className="px-4 py-2 bg-muted/50 border-b border-border text-xs text-muted-foreground flex justify-between">
                  <span>Anexo: {imageFile.name}</span>
                  <button type="button" onClick={() => setImageFile(null)} className="text-destructive hover:underline">Remover</button>
                </div>
              )}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Digite o que aconteceu (ex: Comprei 10 vacinas por R$200)"
                className="w-full h-12 px-4 bg-transparent border-none focus:outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <button 
              type="submit" 
              disabled={loading || (!input.trim() && !imageFile)}
              className="h-12 px-6 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <Send className="h-5 w-5" />
              <span>Enviar</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
