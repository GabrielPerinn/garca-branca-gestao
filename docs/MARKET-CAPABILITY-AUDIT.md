# Auditoria de cobertura funcional — Garça Branca

Atualizada em 13/07/2026. Esta matriz evita a falsa impressão de que um cadastro
genérico de fazenda representa toda a operação pecuária. A comparação usa páginas
oficiais de soluções rurais e pecuárias e separa o que já é
operacional do que ainda precisa de produto, dados e testes próprios.

Escopo de produto confirmado: **gestão pecuária**. Agricultura, safras, aplicações
e colheita não fazem parte do produto. Quando uma área é arrendada a terceiros
para plantio, o sistema registra o vínculo no módulo de contratos e no financeiro,
sem assumir a gestão agronômica da lavoura.

## Cobertura atual

| Domínio | Referência de mercado | Estado no Garça Branca |
| --- | --- | --- |
| Base operacional | Operação, propriedades, pastos e localização | **Implementado:** uma operação consolidada com várias propriedades físicas, vínculo de posse/uso, matrícula, CAR, CCIR, CIB/NIRF, georreferenciamento e pastos vinculados à propriedade correta |
| Contratos agrários | Contratos, vencimentos e financeiro | **Implementado e ampliado:** arrendamento, parceria, comodato e subarrendamento distintos; contraparte, vigência, atividade, remuneração, cronograma, alertas e baixa financeira idempotente |
| Financeiro | Contas, caixa, categorias, resultado | **Implementado no núcleo:** despesas, receitas, folha, recebíveis de gado, relatórios e auditoria. **Pendente:** conciliação bancária/open finance, orçamento por centro de custo e fiscal completo |
| Pecuária | Lotes, pesagens, movimentações, pastos | **Implementado por lote:** sanidade e reprodução coletivas, protocolos, alarmes, baixas e recorrência. Identificação individual/EID não faz parte do manejo adotado. **Pendente:** custo completo por lote e indicadores reprodutivos avançados |
| Agricultura | Safra, planejamento, aplicações e colheita | **Fora do escopo.** Áreas cedidas para plantio são acompanhadas somente como propriedade, contrato, recebível, obrigação e risco patrimonial |
| Máquinas e estrutura | Patrimônio, horímetro, manutenção e custo/hora | **Fundação implementada:** máquinas, veículos, implementos, edificações, água, energia, curral e cercas; manutenção já existe. **Pendente:** abastecimento, ordem de serviço por ativo, depreciação e custo/hora consolidado |
| Estoque | Entradas/saídas, mínimos e custo | **Implementado:** movimentos transacionais, reversão e saldo mínimo. **Pendente:** lotes/validade, múltiplos depósitos, inventário cego e rastreabilidade até aplicação/campo |
| Pessoas e tarefas | Equipe, ordens, responsáveis e alertas | **Implementado:** funcionários, pagamentos, tarefas, responsáveis, prazos, cobrança de conclusão e alertas |
| IA multimodal | Texto, áudio, foto e múltiplas ações | **Implementado:** interpretação estruturada, áudio, imagem, plano composto, esclarecimento e aprovação. Pesagens de papel preservam a lista original e passam por conferência matemática independente; protocolos sanitários/reprodutivos são criados e concluídos pela Garça com transação integral. **Pendente:** suíte maior de avaliação por sotaque/cenário e catálogo de evidências visuais especializadas |
| Inteligência | Indicadores, anomalias, cenários e recomendações | **Implementado:** Inteligência Estratégica, Autopiloto, Garça Twin e Planejamento, incluindo consolidação de várias propriedades. **Pendente:** modelos zootécnicos calibrados, comparação por propriedade e benchmarking regional licenciado |
| Mobilidade e integrações | Offline, pesagem manual, máquinas e clima | **Implementado no núcleo de campo:** PWA, pacote local, fila idempotente para protocolos, pesagens, rebanho, tarefas, estoque e despesas, além de foto/áudio guardados sem sinal. **Pendente:** ampliar a resolução visual de conflitos, telemetria, clima e satélite |
| Fiscal e conformidade | NF-e, documentos, obrigações e rastreabilidade | **Parcial:** documentos, alertas e trilha de auditoria. **Pendente:** NF-e/SEFAZ, Livro Caixa, contratos de compra/venda, GTA e obrigações regulatórias por UF |

## Ordem de evolução recomendada

1. Sanidade e reprodução coletivas: protocolos por lote/categoria/propriedade,
   carências, recorrência, confirmação e alarmes multicanal.
2. Operação offline-first: fila local protegida, sincronização idempotente,
   resolução de conflito e funcionamento integral em curral sem internet.
3. Pesagem manual por lote: digitação, foto da folha, áudio, sessões de curral,
   conferência de cálculos e validação de anomalias sem equipamento conectado.
4. Clima, satélite e pastagens: polígonos das propriedades, chuva, previsão,
   biomassa/cobertura, água, degradação e alertas de capacidade por pasto.
5. Telemetria: horímetro, localização, combustível, manutenção preventiva,
   disponibilidade e custo/hora de máquinas e veículos.
6. Custos e orçamento multidimensional: propriedade, pasto, lote, ativo,
   contrato e centro de custo.
7. Fiscal, comercial e rastreabilidade: NF-e, GTA, SISBOV quando aplicável,
   contratos de compra/venda, entregas, recebíveis e conciliação bancária.
8. Avaliação contínua da IA: conjunto de mensagens reais anonimizado, métricas por
   intenção/campo, regressão multimodal, taxa de esclarecimento e zero execução
   crítica sem confirmação.

## Fontes oficiais consultadas

- Aegro: <https://aegro.com.br/>
- Aegro Pecuária: <https://suporte.aegro.com.br/suporte/modulo-pecuaria-gerencie-seu-rebanho-integrado-ao->
- JetBov: <https://jetbov.com/planos-e-precos-v2/>
- Farmbox: <https://www.farmbox.com.br/>
- MyFarm: <https://lp.myfarm.com.br/>
- Siagri AgriManager: <https://www.siagri.com.br/produto/siagri-agrimanager/>
- AgriWebb: <https://www.agriwebb.com/mobile-app/>
- Decreto 59.566/1966: <https://www.presidencia.gov.br/ccivil_03/decreto/antigos/d59566.htm>
