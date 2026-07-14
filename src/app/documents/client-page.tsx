'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Plus } from 'lucide-react';
import { createDocument, deleteDocument } from './actions';
import { ConfirmDeleteButton } from '@/components/ui/ConfirmDeleteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { fieldClassName, FormField } from '@/components/ui/FormField';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDateTime } from '@/lib/formatters';

type Feedback = { kind: 'error' | 'success'; message: string } | null;

export function DocumentsClientPage({ documents, dbError }: any) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function openModal() {
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate(formData: FormData) {
    setPending(true);
    setFormError(null);
    try {
      await createDocument(formData);
      setShowModal(false);
      setFeedback({ kind: 'success', message: 'Documento registrado com sucesso.' });
      router.refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar o documento.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteDocument(id);
    setFeedback({ kind: 'success', message: 'Documento excluído.' });
    router.refresh();
  }

  const createButton = (
    <button type="button" onClick={openModal} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      <Plus className="h-4 w-4" aria-hidden="true" />
      Novo documento
    </button>
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Governança"
        title="Documentos"
        description={`${documents.length} documento${documents.length === 1 ? '' : 's'} cadastrado${documents.length === 1 ? '' : 's'}.`}
        action={createButton}
      />

      <InlineFeedback kind="error" message={dbError} />
      <InlineFeedback kind={feedback?.kind} message={feedback?.message} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="documents-list-title">
        <h2 id="documents-list-title" className="sr-only">Lista de documentos</h2>
        {documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-12 w-12" aria-hidden="true" />}
            title="Nenhum documento cadastrado"
            description="Organize contratos, licenças, registros ambientais e outros documentos da fazenda."
            action={createButton}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[680px] text-left">
              <caption className="sr-only">Documentos cadastrados</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Cadastrado em</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Título</th>
                  <th scope="col" className="p-4 text-sm font-semibold text-muted-foreground">Tipo</th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map((document: any) => (
                  <tr key={document.id} className="transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap p-4 text-sm text-muted-foreground">{formatDateTime(document.created_at)}</td>
                    <th scope="row" className="p-4 font-semibold text-foreground">{document.title}</th>
                    <td className="p-4 text-sm text-muted-foreground">{document.document_type || 'Não informado'}</td>
                    <td className="p-4 text-right">
                      <ConfirmDeleteButton label={`Excluir documento ${document.title}`} onConfirm={() => handleDelete(document.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showModal && (
        <Modal title="Novo documento" description="Cadastre a referência de um documento importante." onClose={() => setShowModal(false)}>
          <form action={handleCreate} className="space-y-4">
            <InlineFeedback kind="error" message={formError} />
            <FormField htmlFor="document-title" label="Título" required>
              <input id="document-title" name="title" required autoFocus className={fieldClassName} placeholder="Ex.: Cadastro Ambiental Rural" />
            </FormField>
            <FormField htmlFor="document-type" label="Tipo">
              <select id="document-type" name="type" className={fieldClassName} defaultValue="">
                <option value="">Selecione um tipo</option>
                <option value="Licença">Licença</option>
                <option value="Contrato">Contrato</option>
                <option value="Registro ambiental">Registro ambiental</option>
                <option value="Nota fiscal">Nota fiscal</option>
                <option value="Comprovante">Comprovante</option>
                <option value="Outro">Outro</option>
              </select>
            </FormField>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowModal(false)} disabled={pending} className="min-h-11 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">Cancelar</button>
              <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {pending ? 'Salvando...' : 'Salvar documento'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
