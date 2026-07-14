'use client'

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Mic, Send, X } from 'lucide-react';
import { processChatAction } from './actions';

type Message = { role: 'user' | 'ai'; content: string; imageUrl?: string; data?: unknown };

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/x-wav', 'audio/webm', 'video/mp4']);

export default function AiChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      content:
        'Olá, eu sou a Garça Branca. Posso consultar os dados da fazenda, responder perguntas de gestão rural e transformar relatos ou comprovantes em registros seguros para sua revisão. Experimente perguntar “como estão as finanças deste mês?” ou “quantos animais temos em cada lote?”.',
    },
  ]);
  const [input, setInput] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const objectUrlsRef = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, loading]);

  function clearAttachment() {
    setImageFile(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function clearAudio() {
    setAudioFile(null);
    setUploadError(null);
    if (audioInputRef.current) audioInputRef.current.value = '';
  }

  function handleFileChange(file: File | null) {
    setUploadError(null);
    if (!file) {
      clearAttachment();
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setUploadError('Use uma imagem JPEG, PNG ou WebP.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setUploadError('A imagem deve ter no máximo 5 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setImageFile(file);
    clearAudio();
  }

  function handleAudioChange(file: File | null) {
    setUploadError(null);
    if (!file) {
      clearAudio();
      return;
    }
    if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
      setUploadError('Use áudio MP3, M4A, OGG, WAV ou WebM.');
      if (audioInputRef.current) audioInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_AUDIO_SIZE) {
      setUploadError('O áudio deve ter no máximo 25 MB.');
      if (audioInputRef.current) audioInputRef.current.value = '';
      return;
    }
    setAudioFile(file);
    clearAttachment();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const messageText = input.trim();
    if ((!messageText && !imageFile && !audioFile) || loading) return;

    const formData = new FormData();
    formData.append('message', messageText);
    formData.append('history', JSON.stringify(
      messages
        .slice(1)
        .slice(-8)
        .map(message => ({
          role: message.role === 'ai' ? 'assistant' : 'user',
          content: message.content.slice(0, 1_000),
        })),
    ));
    if (imageFile) formData.append('image', imageFile);
    if (audioFile) formData.append('audio', audioFile);

    let previewUrl: string | undefined;
    if (imageFile) {
      previewUrl = URL.createObjectURL(imageFile);
      objectUrlsRef.current.add(previewUrl);
    }

    const newMessages: Message[] = [
      ...messages,
      {
        role: 'user',
        content: messageText || (audioFile ? `Áudio anexado: ${audioFile.name}` : 'Imagem anexada'),
        imageUrl: previewUrl,
      },
    ];

    setMessages(newMessages);
    setInput('');
    clearAttachment();
    clearAudio();
    setLoading(true);

    try {
      const response = await processChatAction(formData);
      if (response.success && response.result) {
        let extractedData: unknown = response.result.extracted_data;
        if (typeof extractedData === 'string') {
          try { extractedData = JSON.parse(extractedData); } catch { /* Exibe o texto original. */ }
        }
        setMessages([
          ...newMessages,
          {
            role: 'ai',
            content: response.result.human_summary || 'Processado com sucesso.',
            data: extractedData,
          },
        ]);
      } else {
        setMessages([
          ...newMessages,
          { role: 'ai', content: `Não foi possível processar a mensagem: ${response.error || 'erro desconhecido'}.` },
        ]);
      }
    } catch (caught) {
      setMessages([
        ...newMessages,
        {
          role: 'ai',
          content: `Não foi possível processar a mensagem: ${caught instanceof Error ? caught.message : 'tente novamente'}.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.75rem)] max-w-5xl flex-col p-4 sm:p-6 lg:h-dvh lg:p-8">
      <header className="mb-5 border-b border-border pb-5">
        <p className="app-kicker">Inteligência de gestão rural</p>
        <h1 className="mt-1 text-[1.75rem] font-semibold tracking-[-0.025em] text-foreground sm:text-[2rem]">
          Garça Branca
        </h1>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          Consulte a fazenda, esclareça dúvidas e organize operações em uma conversa segura.
        </p>
      </header>

      <section className="app-panel flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Conversa com o assistente">
        <div
          className="flex-1 space-y-1 overflow-y-auto p-4 sm:p-6"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={loading}
        >
          {messages.map((message, index) => (
            <article key={index} className={`border-b border-border/70 py-5 last:border-0 ${message.role === 'user' ? 'pl-0 sm:pl-16' : 'pr-0 sm:pr-16'}`}>
              <p className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] ${message.role === 'user' ? 'text-primary' : 'text-muted-foreground'}`}>
                {message.role === 'user' ? 'Você' : 'Garça Branca'}
              </p>
              <div
                className={`min-w-0 text-sm leading-6 ${message.role === 'user' ? 'text-foreground' : 'border-l-2 border-primary/35 pl-4 text-foreground'}`}
              >
                {message.imageUrl && (
                  <Image
                    src={message.imageUrl}
                    alt="Imagem anexada à mensagem"
                    width={640}
                    height={480}
                    unoptimized
                    className="mb-3 h-auto max-h-72 w-auto max-w-full rounded-lg border border-border/50 object-contain"
                  />
                )}
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                {message.data !== undefined && message.data !== null && (
                  <details className="mt-3 rounded-lg border border-border bg-muted/30 text-foreground">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      Ver dados extraídos
                    </summary>
                    <pre className="overflow-x-auto border-t border-border/60 p-3 text-xs text-foreground/80">
                      {JSON.stringify(message.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </article>
          ))}

          {loading && (
            <div className="flex items-center gap-2 border-l-2 border-primary/35 py-4 pl-4 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span>Garça Branca está consultando e analisando...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border bg-muted/25 p-3 sm:p-4">
          {uploadError && (
            <p className="mb-3 rounded-lg border border-red-700/20 bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="alert">
              {uploadError}
            </p>
          )}
          <form onSubmit={handleSubmit} className="grid grid-cols-[3rem_3rem_minmax(0,1fr)] items-end gap-2.5 sm:grid-cols-[3rem_3rem_minmax(0,1fr)_auto] sm:gap-3">
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                id="chat-file-upload"
                className="peer sr-only"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => handleFileChange(event.target.files?.[0] || null)}
                disabled={loading}
              />
              <label
                htmlFor="chat-file-upload"
                className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border outline-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 ${
                  imageFile
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title="Anexar imagem"
              >
                <ImageIcon className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Anexar imagem</span>
              </label>
            </div>

            <div className="relative">
              <input
                ref={audioInputRef}
                type="file"
                id="chat-audio-upload"
                className="peer sr-only"
                accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,.m4a,.mp3,.opus"
                onChange={(event) => handleAudioChange(event.target.files?.[0] || null)}
                disabled={loading}
              />
              <label
                htmlFor="chat-audio-upload"
                className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border outline-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 ${
                  audioFile
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title="Anexar áudio"
              >
                <Mic className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Anexar áudio</span>
              </label>
            </div>

            <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              {imageFile && (
                <div className="flex min-w-0 items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">Anexo: {imageFile.name}</span>
                  <button
                    type="button"
                    onClick={clearAttachment}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-700"
                    aria-label={`Remover anexo ${imageFile.name}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
              {audioFile && (
                <div className="flex min-w-0 items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">Áudio: {audioFile.name}</span>
                  <button
                    type="button"
                    onClick={clearAudio}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-700"
                    aria-label={`Remover áudio ${audioFile.name}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
              <label htmlFor="chat-message" className="sr-only">Mensagem para o assistente</label>
              <input
                id="chat-message"
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Pergunte sobre a fazenda ou registre uma operação"
                className="h-11 w-full border-none bg-transparent px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                disabled={loading}
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              disabled={loading || (!input.trim() && !imageFile && !audioFile)}
              className="app-button-primary col-span-3 h-11 sm:col-span-1"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
              <span>Enviar</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
