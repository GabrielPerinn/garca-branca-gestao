import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { ok: boolean; message: string; latency_ms?: number }> = {};

  // 1. Variáveis de ambiente obrigatórias
  const requiredEnv = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const missingEnv = requiredEnv.filter(k => !process.env[k]);
  checks.env = {
    ok: missingEnv.length === 0,
    message: missingEnv.length === 0
      ? 'Todas as variáveis obrigatórias configuradas'
      : `Faltando: ${missingEnv.join(', ')}`,
  };

  // 2. Supabase connectivity
  try {
    const t0 = Date.now();
    const supabase = await createAdminClient();
    const { count, error } = await supabase
      .from('farms')
      .select('*', { count: 'exact', head: true });

    checks.database = {
      ok: !error,
      message: error ? `Erro: ${error.message}` : `Conexão OK (${count ?? 0} fazendas)`,
      latency_ms: Date.now() - t0,
    };
  } catch (err: any) {
    checks.database = { ok: false, message: `Falha na conexão: ${err.message}` };
  }

  // 3. WhatsApp configurado?
  const whatsappVars = ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'];
  const configuredWA = whatsappVars.filter(k => !!process.env[k]);
  checks.whatsapp = {
    ok: configuredWA.length === whatsappVars.length,
    message: configuredWA.length === 0
      ? 'Não configurado (webhook funciona, mas não envia respostas)'
      : configuredWA.length === whatsappVars.length
        ? 'Totalmente configurado ✓'
        : `Parcialmente configurado: ${configuredWA.join(', ')}`,
  };

  // 4. OpenAI configurado?
  checks.openai = {
    ok: true, // Não é obrigatório (usa mock)
    message: process.env.OPENAI_API_KEY
      ? `Configurada (provider: ${process.env.AI_PROVIDER || 'auto'})`
      : 'Não configurada — usando Mock AI (OK para testes)',
  };

  // 5. Webhook URL
  const appUrl = process.env.APP_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null;
  checks.webhook_url = {
    ok: !!appUrl,
    message: appUrl
      ? `${appUrl}/api/webhook/whatsapp`
      : 'APP_BASE_URL não configurada (configure após deploy)',
  };

  const allOk = Object.values(checks).every(c => c.ok);
  const totalLatency = Date.now() - startTime;

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    latency_ms: totalLatency,
    checks,
  }, {
    status: allOk ? 200 : 207,
    headers: { 'Cache-Control': 'no-store' },
  });
}
