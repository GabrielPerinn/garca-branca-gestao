import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasPdfSignature,
  MAX_WHATSAPP_PDF_BYTES,
  safePdfFilename,
} from '../src/lib/ai/pdf-document'

test('reconhece a assinatura PDF mesmo depois de um pequeno preâmbulo', () => {
  assert.equal(hasPdfSignature(Buffer.from('%PDF-1.7\n')), true)
  assert.equal(hasPdfSignature(Buffer.from('\uFEFF\n%PDF-1.4\n')), true)
  assert.equal(hasPdfSignature(Buffer.from('arquivo que não é pdf')), false)
})

test('normaliza o nome do documento sem permitir caminhos', () => {
  assert.equal(safePdfFilename('../../Nota Fiscal 123', 'wamid:test'), '..-..-Nota Fiscal 123.pdf')
  assert.equal(safePdfFilename(undefined, 'wamid:/perigoso'), 'documento-wamid--perigoso.pdf')
})

test('mantém o limite do PDF compatível com a leitura da OpenAI', () => {
  assert.equal(MAX_WHATSAPP_PDF_BYTES, 50 * 1024 * 1024)
})
