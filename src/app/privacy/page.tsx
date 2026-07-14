import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  Database,
  LockKeyhole,
  Mail,
  MessageCircle,
  Scale,
  ShieldCheck,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Política de privacidade e proteção de dados da plataforma Garça Branca Gestão Rural.',
  robots: {
    index: true,
    follow: false,
  },
};

const sections = [
  {
    icon: Database,
    title: '1. Dados que tratamos',
    content: (
      <>
        <p>Podemos tratar as seguintes categorias de dados, conforme o uso da plataforma:</p>
        <ul>
          <li>dados de identificação e acesso, como nome, e-mail, função e registros de autenticação;</li>
          <li>dados profissionais e operacionais informados por usuários autorizados;</li>
          <li>mensagens, números de telefone e anexos enviados ao canal oficial de WhatsApp;</li>
          <li>registros técnicos, de segurança, auditoria, erros e uso das funcionalidades;</li>
          <li>conteúdo fornecido às funcionalidades de inteligência artificial e respectivas respostas.</li>
        </ul>
      </>
    ),
  },
  {
    icon: Scale,
    title: '2. Finalidades e bases legais',
    content: (
      <>
        <p>Os dados são utilizados para operar e proteger o sistema, autenticar usuários, registrar atividades rurais, gerar relatórios, processar comunicações, oferecer suporte e cumprir obrigações legais.</p>
        <p>O tratamento poderá se apoiar na execução de contratos e procedimentos relacionados, no cumprimento de obrigação legal ou regulatória, no exercício regular de direitos, no legítimo interesse e, quando necessário, no consentimento do titular.</p>
      </>
    ),
  },
  {
    icon: Bot,
    title: '3. Inteligência artificial',
    content: (
      <>
        <p>A inteligência artificial auxilia na interpretação de mensagens, organização de informações, elaboração de análises e sugestão de ações. O sistema aplica controles de autorização, rastreabilidade e validação antes de alterações operacionais relevantes.</p>
        <p>O titular pode solicitar informações e revisão sobre tratamento automatizado que afete seus interesses, nos termos da legislação aplicável.</p>
      </>
    ),
  },
  {
    icon: MessageCircle,
    title: '4. WhatsApp e comunicações',
    content: (
      <p>Ao contatar o canal oficial, a Meta e o WhatsApp também poderão tratar dados de acordo com suas próprias políticas. As mensagens recebidas são usadas para atender solicitações e registrar operações autorizadas. Dados de teste e conteúdos que atingem o prazo de retenção são descartados, anonimizados ou restritos conforme os controles do sistema.</p>
    ),
  },
  {
    icon: ShieldCheck,
    title: '5. Compartilhamento e transferências',
    content: (
      <p>Os dados podem ser processados por fornecedores essenciais de infraestrutura, banco de dados, hospedagem, inteligência artificial e comunicação, atualmente incluindo Supabase, Vercel, OpenAI e Meta/WhatsApp. O compartilhamento é limitado ao necessário para a prestação dos serviços. Alguns fornecedores podem processar dados em outros países, mediante medidas contratuais e técnicas compatíveis com a legislação aplicável.</p>
    ),
  },
  {
    icon: LockKeyhole,
    title: '6. Segurança e retenção',
    content: (
      <p>Adotamos medidas técnicas e administrativas como controle de acesso, separação de privilégios, comunicação criptografada, validação de assinaturas, registros de auditoria e rotinas de recuperação. Os dados são mantidos pelo período necessário às finalidades informadas, à segurança da operação e às obrigações legais, e depois eliminados, anonimizados ou arquivados com acesso restrito.</p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(33,88,61,0.10),transparent_32%),linear-gradient(to_bottom,#f7f9f6,#eef2ee)] px-4 py-8 sm:px-6 sm:py-12">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-foreground/[0.06]">
        <header className="border-b border-border bg-[#17382a] px-6 py-8 text-white sm:px-10 sm:py-10">
          <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao acesso
          </Link>
          <div className="mt-8 flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Garça Branca Gestão Rural</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Política de Privacidade</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">Transparência sobre como a plataforma trata e protege dados pessoais em seus canais e funcionalidades.</p>
            </div>
          </div>
          <p className="mt-7 text-xs text-white/50">Última atualização: 13 de julho de 2026</p>
        </header>

        <div className="space-y-9 px-6 py-8 sm:px-10 sm:py-10">
          <section className="space-y-3 text-sm leading-7 text-muted-foreground">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Quem controla os dados</h2>
            <p>A Garça Branca Gestão Rural é uma plataforma privada voltada à administração da Fazenda Garça Branca. Para os tratamentos descritos nesta política, a operação responsável pela plataforma atua como controladora dos dados pessoais fornecidos por usuários, colaboradores, prestadores e demais pessoas que utilizem seus canais oficiais.</p>
            <p>Esta política observa a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD).</p>
          </section>

          {sections.map(({ icon: Icon, title, content }) => (
            <section key={title} className="grid gap-4 border-t border-border pt-8 sm:grid-cols-[44px_1fr]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="space-y-3 text-sm leading-7 text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
                {content}
              </div>
            </section>
          ))}

          <section className="grid gap-4 border-t border-border pt-8 sm:grid-cols-[44px_1fr]">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Scale className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-3 text-sm leading-7 text-muted-foreground">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">7. Direitos do titular</h2>
              <p>Nos termos da LGPD, o titular pode solicitar confirmação do tratamento, acesso, correção, anonimização, bloqueio ou eliminação quando cabível, portabilidade, informação sobre compartilhamentos, revisão de decisões automatizadas e revogação do consentimento.</p>
              <p>Para proteger o próprio titular, poderemos solicitar informações adicionais para confirmar a identidade e a legitimidade do pedido.</p>
            </div>
          </section>

          <section className="rounded-xl border border-primary/20 bg-primary/[0.055] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-foreground">Contato sobre privacidade</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Solicitações e dúvidas sobre dados pessoais podem ser enviadas para:</p>
                <a href="mailto:gabrielpvh372@gmail.com" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">gabrielpvh372@gmail.com</a>
              </div>
            </div>
          </section>

          <section className="border-t border-border pt-8 text-sm leading-7 text-muted-foreground">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">8. Atualizações desta política</h2>
            <p className="mt-3">Esta política poderá ser atualizada para refletir mudanças legais, operacionais ou tecnológicas. A versão vigente estará sempre disponível nesta página, com a respectiva data de atualização.</p>
          </section>
        </div>
      </article>
    </main>
  );
}
