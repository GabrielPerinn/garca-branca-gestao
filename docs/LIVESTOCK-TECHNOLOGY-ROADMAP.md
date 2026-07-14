# Roadmap tecnológico pecuário

Atualizado em 13/07/2026. O produto administra uma única operação pecuária
consolidada, formada por várias propriedades físicas. Agricultura não faz parte
do escopo. Todo dado de campo precisa identificar, conforme aplicável:

`operação -> propriedade -> pasto/curral -> lote`

O manejo real é coletivo por lote, categoria, quantidade e marca a fogo. O
produto não exige brinco, RFID/EID nem cadastro animal individual. Integrações
de identificação individual permanecem opcionais e fora do núcleo.

## 1. Aplicativo offline-first

**Núcleo entregue em 13/07/2026.** Diário de campo, pacote local criptografado,
aparelhos revogáveis e sincronização idempotente já cobrem sanidade, pesagens,
rebanho coletivo, tarefas, estoque, despesas, foto e áudio. A próxima ampliação
será a tela especializada de resolução de conflitos e sessões de curral.

Objetivo: lançar manejo, pesagem, foto, áudio e tarefas mesmo sem sinal.

- banco local criptografado no aparelho;
- fila de comandos com identificador idempotente;
- sincronização incremental por propriedade;
- estados `local`, `sincronizando`, `confirmado` e `conflito` visíveis;
- regra de conflito por tipo de dado, sem “última gravação vence” para estoque,
  rebanho, pesagem ou financeiro;
- pacotes de trabalho baixados antes de ir ao campo;
- bloqueio e reprocessamento seguro de anexos grandes;
- auditoria preservando autor, aparelho, horário local e horário do servidor.

Critério de aceite: uma jornada completa de curral funciona em modo avião e é
sincronizada uma única vez quando o sinal retorna.

## 2. Sanidade e reprodução coletivas

**Núcleo entregue em 13/07/2026.** Além das telas e alarmes, a Garça cria e dá
baixa em protocolos por texto/áudio, consulta o histórico no banco e inclui essas
ações em planos compostos com confirmação e reversão transacional integral.

Organizar o calendário do rebanho sem criar milhares de animais fictícios.

- protocolos por operação, propriedade, lote ou categoria;
- vacinação, vermifugação, exames, manejo reprodutivo e outros eventos configuráveis;
- produto, dose, carência, instrução, responsável e quantidade atendida;
- vencimento, antecedência do aviso e recorrência automática;
- confirmação integral, parcial ou não realizada, mantendo histórico auditável;
- alertas dentro do sistema e cobrança pelo WhatsApp, com novo ciclo após a baixa.

Critério de aceite: um protocolo coletivo vencido não desaparece; ele é alertado,
confirmado por um responsável e reagendado de maneira rastreável.

## 3. Pesagem manual e desempenho

**Captura íntegra entregue em 13/07/2026.** Texto, áudio, foto da folha e diário
offline preservam pesos individuais; quantidade, soma e média são recalculadas
por código independente do modelo. Divergências abrem esclarecimento antes da
aprovação e continuam bloqueadas no banco. Sessões de curral e indicadores
zootécnicos avançados são a próxima camada.

- digitação do peso médio/total ou da lista de pesos anotada no papel;
- foto da folha ou mensagem de texto/áudio interpretada pela Garça, sempre com confirmação;
- preservação da imagem original, números extraídos, quantidade, total, média, operador e sessão;
- associação por lote, sessão de curral e conferência manual;
- ganho médio diário, curva de crescimento e projeção de peso/data de venda;
- comparação entre propriedades, pastos, lotes, suplementação e períodos;
- alertas de perda de peso, número improvável, erro de soma e leitura duvidosa da folha;
- nenhuma integração Bluetooth, RFID ou balança eletrônica é dependência do produto.

Critério de aceite: cada indicador permite abrir as pesagens que o formaram.

## 4. Clima e risco operacional

- coordenada e polígono de cada propriedade e pasto;
- estação meteorológica própria e provedor externo por adaptadores;
- chuva observada, previsão, temperatura, umidade, vento e estresse térmico;
- alertas por propriedade para manejo, água, fogo e logística;
- qualidade do dado e distância da estação sempre explícitas;
- histórico climático associado a desempenho animal e condição da pastagem.

Critério de aceite: previsões nunca são apresentadas como medições observadas e
todo alerta indica fonte, horário, propriedade e confiança.

## 5. Satélite e inteligência de pastagens

- polígonos versionados de propriedades e pastos;
- cobertura vegetal, vigor relativo, solo exposto, água e mudança de uso;
- série temporal por pasto, com comparação sazonal e contra a própria linha de base;
- fila de inspeção para imagens com nuvem, resolução insuficiente ou anomalias;
- cruzamento com chuva, lotação, movimentação e descanso;
- sugestão de vistoria, nunca diagnóstico definitivo sem confirmação de campo.

Critério de aceite: todo achado visual aponta imagem, data, polígono, método,
limitação e ação de verificação recomendada.

## 6. Telemetria de máquinas e ativos

- ativo, dispositivo, instalação, propriedade-base e responsável;
- posição, horímetro, odômetro, combustível e códigos de falha;
- geocercas das propriedades e alertas de deslocamento;
- manutenção por uso real, disponibilidade, ociosidade e custo/hora;
- eventos recebidos de forma idempotente e com detecção de lacunas;
- adaptadores por rastreador/fabricante e webhook assinado.

Critério de aceite: telemetria não altera financeiro ou manutenção sem uma regra
auditável e, quando necessário, aprovação humana.

## Sequência de construção

1. Protocolos coletivos de sanidade/reprodução e alarmes recorrentes.
2. Aplicativo offline e protocolo de sincronização idempotente.
3. Fluxo completo de pesagem manual por texto, áudio e foto da folha.
4. Geometria das propriedades/pastos e clima.
5. Satélite e modelos comparativos de pastagem.
6. Telemetria e manutenção baseada em uso.
7. Avaliação contínua da IA sobre todos os novos eventos.

Cada integração futura entra por um adaptador homologado. RFID/EID e balança
Bluetooth só seriam considerados se o manejo da fazenda mudar; não fazem parte
do plano atual. O núcleo trabalha com lote, papel, texto, áudio e foto.
