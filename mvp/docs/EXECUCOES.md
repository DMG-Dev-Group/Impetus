# Log de Execuções — MVP do Impetus

### mvp/docs/

Registro do que foi pedido e do que foi de fato entregue, execução por execução.
Divergências entre prompt e entrega são registradas **aqui**, nunca editadas
retroativamente no prompt original.

**Ordem cronológica — a entrada mais antiga vem primeiro.** Entradas antigas não
são apagadas nem reescritas quando uma fatia nova chega; no máximo ganham uma nota
de atualização datada, como aconteceu com o critério 2 da Fatia 1.

## Linha do tempo

| Data | Entrada | Status |
|---|---|---|
| 19/07/2026 | [Fatia 1 — Esqueleto Andante](#fatia-1--esqueleto-andante) | ✅ entregue e validado em uso real |
| 19/07/2026 | [Correção — números autorizados no WhatsApp](#correção--números-autorizados-não-reconhecidos-no-whatsapp) | ✅ resolvido e validado em uso real |
| 19/07/2026 | [Fatia 2 — Interpretação de linguagem natural](#fatia-2--interpretação-de-linguagem-natural) | ✅ validado em uso real; 5 protocolos + campo alvo; migrado para Groq (`gpt-oss-120b`) com **24/24 de intenção e 17/17 de alvo** |

---

## Fatia 1 — Esqueleto Andante

**Data:** 19/07/2026
**Prompt:** "Prompt Master — Fatia 1: Esqueleto Andante" (`mvp/prompts`)
**Status:** entregue e verificado — com ressalva no critério 2 (ver abaixo)

### O que foi pedido

Provar, com o mínimo de código possível, que o loop completo funciona: mensagem
no WhatsApp → cérebro central → agente local → resposta de volta no WhatsApp.
Um único comando fixo (`status`), sem IA. Objetivo real: eliminar as duas maiores
incertezas técnicas do projeto — estabilidade do Baileys, e conexão de saída do
agente através de NAT/firewall com reconexão automática.

### O que foi entregue

Monorepo em `mvp/` com npm workspaces e três pacotes:

- **`packages/protocol`** — só tipos TypeScript: o envelope e os seis tipos de
  mensagem da fatia. Nenhuma lógica.
- **`apps/brain`** — Baileys (WhatsApp) + servidor WebSocket + `Map` de agentes
  em memória + validação de `PAIRING_SECRET` + filtro de números autorizados +
  o comando `status` com timeout de 5s por agente.
- **`apps/agent`** — cliente WebSocket de saída, registro, heartbeat de 30s,
  resposta ao `status` com uptime do processo, reconexão automática a cada 5s.

Documentação gerada: `FUNCIONAMENTO.md`, `MANUAL.md`, `INSTALACAO.md` e esta
entrada.

### Verificação dos critérios de aceite

| # | Critério | Status |
|---|---|---|
| 1 | `npm install` resolve os três workspaces | ✅ verificado |
| 2 | `brain` sobe, mostra QR, loga "conectado ao WhatsApp" | ✅ verificado *(ver atualização)* |
| 3 | `agent` conecta e registra; `brain` loga | ✅ verificado |
| 4 | Segundo agente com outro nick também registra | ✅ verificado |
| 5 | `status` retorna a lista com as máquinas e uptimes | ✅ verificado |
| 6 | Agente derrubado some da lista | ✅ verificado |
| 7 | `brain` reiniciado → agentes reconectam sozinhos | ✅ verificado |

**Ressalva do critério 2 (na entrega original):** foi verificado que o `brain`
sobe, conecta aos servidores do WhatsApp e **renderiza um QR code real no
terminal**. O escaneamento em si não foi feito, porque exige o celular com o
número dedicado do Impetus em mãos.

> **Atualização (19/07/2026, mesma data):** o QR foi escaneado pelo time, a sessão
> foi persistida em `auth_info/` e o `brain` passou a reconectar sozinho sem pedir
> QR de novo. Após a correção de `@lid` + 9º dígito registrada na entrada seguinte, o
> comando `status` foi enviado pelo WhatsApp e respondido de ponta a ponta.
> **O critério 2 está cumprido, e a incerteza "autenticação e estabilidade do
> Baileys" — uma das duas que esta fatia existe para eliminar — está fechada**
> quanto a autenticação. Estabilidade em prazo longo (dias/semanas de sessão
> aberta) só o uso contínuo vai dizer.
>
> Vale registrar que **a fatia só ficou de fato provada depois dessa correção**:
> a entrega original passava nos testes de transporte mas não teria funcionado
> com uma mensagem real de WhatsApp brasileiro. Foi exatamente o tipo de coisa
> que a fatia existia para descobrir cedo.

**A segunda incerteza continua aberta:** a travessia de NAT real, com dois PCs
físicos em redes diferentes, ainda não foi testada — só agentes locais na mesma
máquina.

**Como os critérios 3–7 foram verificados:** por um teste de fumaça automatizado
(`npm run smoke`) que sobe um cérebro real, conecta agentes reais nele e exercita
registro, recusa por secret inválido, `status`, desconexão, reinício do cérebro
com reconexão, e timeout de agente mudo. Os sete checks passam. **Não foi testado
com dois PCs físicos em redes diferentes** — a travessia de NAT real (a segunda
incerteza que a fatia existe para eliminar) também depende de teste manual do time.

### Bug encontrado durante a verificação (e corrigido)

O critério 7 **falhou na primeira execução**, e a causa vale registro porque não
era óbvia:

`wss.close()` apenas para de aceitar conexões novas — **não fecha as conexões já
abertas**. O agente nunca recebia evento de `close` e portanto nunca disparava a
reconexão.

Investigando, ficou claro que isso não era só um detalhe do teste: era um bug
real de produção com duas faces. Quando uma máquina entra em **sleep** (cenário
explicitamente previsto no `00_DECISOES.md`), o socket fica *meio-aberto* e
nenhum dos lados recebe `close`. Sem tratamento:

- o cérebro manteria a máquina no `Map` para sempre;
- o agente ficaria parado achando que está conectado, **sem nunca reconectar** —
  exatamente a capacidade que esta fatia existe para provar.

Correções aplicadas (não estavam no prompt, foram necessárias para o critério 7
passar de verdade):

1. `AgentRegistry.close()` agora fecha as conexões abertas antes de fechar o servidor.
2. **Cérebro:** ping de protocolo a cada 30s; socket que não devolve `pong` é
   derrubado e sai do `Map`.
3. **Agente:** watchdog que, após 75s sem sinal do cérebro, derruba a própria
   conexão para forçar o ciclo de reconexão.

### Divergências em relação ao prompt

**Estrutura de pastas — o ponto que mais divergiu.** O prompt afirma que
`impetus-spec/`, `mvp/docs/` e `mvp/prompts/` já existiam. **Não existiam.** O
repositório continha apenas cinco arquivos na raiz: `00_DECISOES.md`,
`01_VISAO.md`, `DESCRITIVO_MVP.md`, `manifesto-impetus.md` e
`impetus-diagrama.html`. Consequências:

- `mvp/` foi criado do zero, incluindo `docs/`.
- O `00_PROCESSO_DOCUMENTACAO.md` referenciado no prompt **não existe**. Os
  quatro documentos foram escritos seguindo a intenção descrita na seção 8 do
  prompt. Convém criar o processo formal e conferir se o formato bate.
- Os documentos da raiz (que se identificam internamente como `impetus-spec/mvp/`)
  **não foram movidos** — reorganizar a documentação existente não foi pedido.
- **O prompt da Fatia 1 não foi arquivado em `mvp/prompts/`**, porque chegou como
  mensagem de chat, não como arquivo. Recomenda-se salvá-lo lá manualmente, para
  cumprir a regra de que o prompt fica arquivado sem edição.

**Baileys pinado em `6.7.23`, não na versão `latest`.** No npm, a tag `latest` do
`@whiskeysockets/baileys` aponta hoje para `7.0.0-rc13` — um *release candidate*.
A linha estável está na tag `legacy` (`6.7.23`). Como esta fatia existe
justamente para provar estabilidade do Baileys, usar um RC contaminaria o
resultado: uma falha não distinguiria "Baileys é instável" de "peguei uma versão
de teste". Versão exata, sem `^`, pelo mesmo motivo. **Vale reavaliar quando o
7.0 estabilizar.**

**Adições fora da estrutura descrita no prompt:**

- `mvp/tsconfig.base.json` — config de TypeScript compartilhada pelos três
  pacotes, para não repetir as mesmas opções em três arquivos.
- `apps/brain/src/format.ts` — as funções que formatam a resposta do WhatsApp
  foram separadas do `index.ts`. Motivo concreto: `index.ts` executa `main()` ao
  ser importado, então qualquer coisa que precise apenas formatar texto subiria o
  cérebro inteiro junto (incluindo o Baileys). Funções puras separadas do
  entrypoint do processo.
- `mvp/scripts/smoke-transport.ts` + `npm run smoke` — o teste de fumaça descrito
  acima. Não foi pedido; foi escrito para verificar os critérios de aceite em vez
  de declará-los cumpridos sem evidência. Foi ele que revelou o bug do critério 7.
- `BRAIN_ID` exportado do `protocol` — uma constante (`"brain"`) em vez do
  literal repetido nos dois lados. É a única coisa além de tipos no pacote.
- `@hapi/boom` declarado explicitamente no `brain` (vem transitivamente com o
  Baileys, mas o código o usa direto para ler o código de desconexão).

**Decisões de implementação que o prompt não especificava:**

- **Grupos do WhatsApp são ignorados.** Apenas conversa direta
  (`@s.whatsapp.net`) é atendida. O prompt fala em "números autorizados", o que
  não se traduz bem para grupo (onde remetente e conversa são coisas diferentes).
  Merece decisão explícita antes da Fatia 2.
- **Nick duplicado: a conexão nova ganha.** Se um agente registra um nick que já
  está no `Map`, a conexão anterior é derrubada. Isso cobre o caso real de uma
  máquina que reconecta após sleep antes de o `close` antigo ser percebido. O
  efeito colateral é que dois agentes mal configurados com o mesmo nick ficam se
  derrubando alternadamente — daí o aviso no `INSTALACAO.md`.
- **Timeout de 5s por agente, em paralelo**, não 5s para o conjunto. Uma máquina
  lenta não atrasa as outras.
- **Log do Baileys silenciado** (`pino` em nível `silent`). O log próprio dele é
  barulhento demais e afogaria as linhas que interessam (conexão, QR, comandos),
  o que iria contra o princípio de transparência em vez de a favor.

### Dívidas conscientes deixadas nesta fatia

Nenhuma destas é esquecimento; todas são simplificação registrada:

- **Um `PAIRING_SECRET` único para todos os agentes.** Quem tem o secret registra
  uma máquina com qualquer nick. Aceitável no cenário atual (time pequeno,
  ambiente controlado, sem exposição pública); secret por máquina é a evolução
  natural.
- **Sem TLS.** A conexão é `ws://`, não `wss://` — o secret trafega em texto
  claro. Aceitável em rede local ou teste; **precisa virar `wss://` antes de o
  cérebro ficar exposto na internet de verdade.**
- **`heartbeat` não alimenta nenhuma lógica de liveness** — quem detecta conexão
  morta é o ping/pong de protocolo. O heartbeat da aplicação existe conforme o
  contrato, mas hoje é redundante. Vale decidir na Fatia 2 se ele ganha função
  própria ou sai do protocolo.
- **`parseEnvelope` duplicado nos dois lados.** O prompt determinou que
  `protocol` fosse só tipos, então cada lado faz seu próprio `JSON.parse` +
  `switch`. Se a Fatia 2 aumentar o número de tipos de mensagem, esse parsing
  provavelmente deve subir para o `protocol`.
---

## Correção — números autorizados não reconhecidos no WhatsApp

**Data:** 19/07/2026
**Status:** ✅ resolvido e validado em uso real

### Sintoma relatado

Mensagens enviadas por um número que está em `WHATSAPP_ALLOWED_NUMBERS` não são
reconhecidas: o comando `status` não gera resposta nem log. A mensagem está sendo
descartada em silêncio em algum ponto do filtro.

### Hipóteses a verificar

1. **JID no formato `@lid`.** O WhatsApp vem migrando conversas 1:1 para um ID
   interno (`@lid`) em vez do número puro. O filtro atual exige estritamente
   `remoteJid.endsWith("@s.whatsapp.net")` e descarta todo o resto — o que
   descartaria essas mensagens sem deixar rastro.
2. **9º dígito dos celulares brasileiros.** O número pode chegar no `remoteJid`
   com ou sem o 9º dígito, e não bater com o valor exato digitado no `.env`.

As duas podem estar acontecendo ao mesmo tempo.

### Verificação prévia dos campos do Baileys 6.7.23

Antes de escrever qualquer código, os campos foram conferidos no pacote instalado
(`node_modules/@whiskeysockets/baileys/lib/Types/Message.d.ts`), e o resultado
**corrigiu parcialmente a premissa do pedido**:

- `msg.key.senderPn` — ✅ existe.
- `msg.key.remoteJidAlt` — ❌ **não existe nesta versão.** O campo análogo
  disponível é `msg.key.senderLid`.
- Também disponíveis em `WAMessageKey`: `participantPn`, `participantLid`.
- Helpers de JID exportados e úteis aqui: `isJidUser`, `isLidUser`, `isJidGroup`,
  `jidDecode`, `jidNormalizedUser`.

A solução final vai usar `senderPn` + `senderLid`, **não** `remoteJidAlt`.

### Diagnóstico (log real coletado)

Um log de debug temporário foi adicionado no início do loop de mensagens, **antes
de qualquer filtro** (inclusive antes do `fromMe`) — porque para entender um
descarte silencioso é preciso ver o que está sendo descartado, não o que passa.
Ele imprimiu o `msg.key` e a lista de autorizados; o `PAIRING_SECRET` nunca foi
logado. **Esse bloco já foi removido** (ver "Alteração final" abaixo).

O log capturado:

```
msg.key = {"remoteJid":"122183615541479@lid","fromMe":false,
           "id":"AC5F...","senderPn":"559881908366@s.whatsapp.net"}
autorizados no .env = ["5598981908366"]
```

**As duas hipóteses se confirmaram ao mesmo tempo, e em série:**

1. O `remoteJid` veio como `122183615541479@lid` — um identificador interno sem
   relação com a linha. O filtro `endsWith("@s.whatsapp.net")` descartava isso em
   silêncio. O número real estava em `senderPn`.
2. **E o sentido do 9º dígito era o inverso do que se costuma supor:**

   ```
   .env      5598981908366   →  55 + 98 + 9 + 81908366   (13 dígitos)
   senderPn   559881908366   →  55 + 98 +     81908366   (12 dígitos)
   ```

   O WhatsApp entregou **sem** o 9 extra; o `.env` tinha **com**.

Isso importa para quem for mexer nisso depois: os dois bugs estavam em série.
**Corrigir só o `@lid` não teria resolvido nada** — a mensagem passaria do filtro
de JID e morreria na comparação de número, dando a falsa impressão de que o
`@lid` não era a causa.

### Correção de premissa do pedido

O pedido original citava `msg.key.remoteJidAlt`. Conferido no pacote instalado
(`lib/Types/Message.d.ts`), **esse campo não existe no Baileys 6.7.23**. O que
existe em `WAMessageKey`: `senderPn`, `senderLid`, `participantPn`,
`participantLid`. A solução usa `senderPn`.

### Alteração final

**Arquivo alterado: `apps/brain/src/whatsapp.ts` — e nenhum outro.**

Duas funções puras, exportadas para poderem ser testadas sem subir o processo:

- **`extrairNumeroRemetente(key)`** — usa `senderPn` quando o `remoteJid` é
  `@lid`, senão usa o próprio `remoteJid`. Retorna `null` para grupo, broadcast,
  newsletter e `@lid` sem `senderPn`. Usa os helpers do próprio Baileys
  (`isJidGroup`, `isLidUser`, `isJidUser`, `jidDecode`) em vez de manipular
  string de JID na mão.
- **`canonicalizarNumero(bruto)`** — reduz o número à forma curta (sem o 9
  extra). Aplica-se **somente** a `55` com 13 dígitos onde o dígito após o DDD é
  `9`; números de outros países e fixos passam intactos.

Os autorizados são canonicalizados **uma vez, na subida** do processo, e a
comparação é feita entre formas canônicas — então tanto faz se a pessoa digitou o
número com ou sem o 9 no `.env`.

O comportamento de **silêncio** para números não autorizados foi preservado, e o
bloco de debug foi removido: o arquivo voltou a ter apenas os logs originais.

### Verificação

**Por teste automatizado (feito nesta sessão):** 8 combinações das duas funções
puras — o caso real do log, as duas variantes BR nos dois formatos de JID
(`@lid` e `@s.whatsapp.net`), número não autorizado, grupo, `@lid` sem `senderPn`,
e `status@broadcast`. Todas passaram, e o `npm run build` compila limpo.

**Por uso real (confirmado pelo usuário):** o comando `status` mandado pelo
WhatsApp passou a ser reconhecido e respondido de ponta a ponta.

> Registro honesto de quem verificou o quê: o processo `brain` que subi em
> background **não capturou** o `comando recebido` nos logs — a validação em uso
> real foi feita pelo usuário na execução dele. O teste das funções puras, esse
> sim, foi executado e conferido nesta sessão.

### Ficou de fora / a observar

- **O envio da resposta para um JID `@lid` não foi testado isoladamente** por
  mim. Como o `status` foi respondido com sucesso no uso real, na prática funciona
  — mas se aparecer um caso de "comando reconhecido e resposta não chega", é aqui
  que se deve olhar primeiro.
- `senderLid` e `participantPn`/`participantLid` não são usados. Vão importar
  quando (e se) grupos entrarem em escopo.

---

---

## Fatia 2 — Interpretação de linguagem natural

**Data:** 19/07/2026 (entrega) → 20/07/2026 (validado em uso real)
**Status:** ✅ funcionando — ver as duas sub-entradas ao final desta seção

### O que foi pedido

Trocar a comparação exata de string (`texto === "status"`) por interpretação de
linguagem natural via API da Anthropic, com saída estruturada em JSON. Responder
`"Ainda não sei fazer isso."` quando a intenção não for reconhecida, em vez de
ignorar em silêncio. Reservar no `protocol` — **sem implementar** — os comandos
futuros (`find`, `gitStatus`, `listFiles`, `shareFile`) e o tipo de mensagem
`cmd.confirm`.

### O que foi entregue

**`apps/brain/src/intent.ts`** (novo) — recebe o texto cru, consulta um modelo de
linguagem e devolve `{intent: "status"}` ou `{intent: "unknown"}`. Isolado por
design: não conhece o WhatsApp nem os agentes. *(A entrega original usava
`claude-sonnet-4-6`; ver a troca de provedor mais abaixo nesta mesma entrada.)*

**`apps/brain/src/index.ts`** — a comparação de string saiu; o `onCommand` agora
chama `interpretarIntencao()` e trata os dois ramos.

**`apps/brain/.env.example`** — nova variável para a credencial do provedor.

**`packages/protocol/src/index.ts`** — `CommandName` passa a ser uma união com os
quatro comandos futuros; `MessageType` ganha `cmd.confirm`. Ambos com comentário
explícito de que são placeholder. **Nenhum handler foi escrito para nenhum deles.**

`apps/agent` **não foi alterado** — o `switch` existente já tratava comando
desconhecido, e a união mais larga compila sem mudança.

### Saída estruturada

A chamada usa `output_config.format` com um JSON Schema de `enum: ["status",
"unknown"]` e `additionalProperties: false`. A API garante a forma da resposta —
não há texto solto para o cérebro interpretar.

Ajustes deliberados, não pedidos no prompt: `thinking: {type: "disabled"}` e
`effort: "low"`. Classificar uma frase curta não precisa de raciocínio extendido,
e sem o `effort` explícito o Sonnet 4.6 usaria `high` por padrão — latência e
custo que não se justificam num gateway de chat. `max_tokens: 256`.

### Duas verificações que mudaram o resultado

**1. `claude-sonnet-4-6` é um ID válido — eu disse que não era, e estava errado.**
Na resposta anterior afirmei que o ID não parecia válido. Está no catálogo
(Claude Sonnet 4.6, ativo, 1M de contexto). O modelo pedido foi usado sem
substituição.

**2. Confirmado que o Sonnet 4.6 suporta structured outputs.** A lista de modelos
suportados que eu tinha em mãos **não incluía** o Sonnet 4.6 — o que teria
justificado trocar de modelo ou de abordagem. Antes de mexer, consultei a
documentação oficial, que lista o Sonnet 4.6 como suportado na Claude API. A
lista que eu tinha estava incompleta. **Nada foi trocado.**

O registro fica aqui porque as duas verificações quase levaram a mudanças
desnecessárias no que foi pedido.

### Verificação

| O que | Como | Resultado |
|---|---|---|
| Os três workspaces compilam | `npm run build` | ✅ limpo |
| Transporte da Fatia 1 não regrediu | `npm run smoke` | ✅ 9 checks passam |
| Tipos novos do protocolo compilam nos dois lados | `tsc` em `brain` e `agent` | ✅ |
| **Interpretação funciona de verdade** | — | ❌ **não testado** |

**Nenhuma chamada real à API foi feita.** Não há `ANTHROPIC_API_KEY` configurada
neste ambiente e o `ant` CLI não está instalado, então o `intent.ts` **nunca
executou** — está verificado por compilação e pela documentação da API, não por
uso. Isso significa que erros que só aparecem em runtime continuam possíveis: um
`output_config` recusado, o schema rejeitado, o parse falhando, o prompt
classificando mal.

**O que o time precisa fazer para fechar esta fatia:**

1. Pôr `ANTHROPIC_API_KEY` no `.env` do `brain`.
2. Mandar `status` — deve continuar funcionando como antes.
3. Mandar uma frase equivalente (`"quais máquinas estão online?"`) — deve cair no
   mesmo caminho.
4. Mandar algo fora de escopo (`"zipa o projeto X"`) — deve responder
   `"Ainda não sei fazer isso."`
5. Conferir no log a linha `[brain] intencao interpretada: ...` em cada caso.

### Correção de documentação (mesma data, após revisão do time)

A entrega inicial da Fatia 2 atualizou **apenas** `FUNCIONAMENTO.md` e
`EXECUCOES.md`. O time apontou quatro problemas, todos procedentes:

| Problema | Correção |
|---|---|
| `INSTALACAO.md` não mencionava `ANTHROPIC_API_KEY` — **quem seguisse o guia não conseguiria subir a Fatia 2** | Nova seção "Obter a ANTHROPIC_API_KEY", a variável no bloco `.env`, nota de que é a única adição para quem já tinha instalado, checklist de validação da Fatia 2 e 3 linhas novas no troubleshooting |
| `MANUAL.md` não foi tocado e **afirmava o oposto do comportamento novo** ("só a palavra `status`", "mensagem ignorada sem resposta") | Reescrito para linguagem natural, com exemplos de frases, a distinção entre `"Ainda não sei fazer isso."` e erro de infraestrutura, e uma tabela de histórico por fatia |
| `EXECUCOES.md` estava em ordem inversa (mais recente primeiro) | Reordenado cronologicamente — Fatia 1 → Correção → Fatia 2 — com índice de linha do tempo no topo e a referência cruzada interna corrigida ("entrada acima" → "entrada seguinte") |
| Faltava histórico cumulativo em `FUNCIONAMENTO.md` | Nova seção 9 registrando o que cada fatia acrescentou e quais seções foram afetadas |

**A regra que passa a valer:** a pasta `docs/` inteira é atualizada a cada fatia,
não só os arquivos que o prompt nomear. Documentação antiga **não é apagada nem
reescrita do zero** — ganha seções novas e entradas de histórico, de forma que dê
para reconstruir o que era verdade em cada momento. O `EXECUCOES.md` segue a
linha do tempo das fases.

Vale registrar a causa: o prompt da Fatia 2 pedia explicitamente para atualizar
`FUNCIONAMENTO.md` e `EXECUCOES.md`, e eu tratei essa lista como exaustiva. Um
`MANUAL.md` que descreve comportamento que não existe mais é pior do que um
desatualizado por omissão — ele **mente** para quem usa.

### Troca de provedor: Anthropic → OpenRouter (mesma data)

**Motivo:** a conta da Anthropic ficou sem créditos. O time pediu para usar a API
gratuita do OpenRouter.

**O que mudou no código:** somente `apps/brain/src/intent.ts`, mais o
`package.json` (SDK) e o `.env.example` (variáveis). **Nenhum outro arquivo de
código foi tocado** — o `index.ts`, o `protocol`, o `whatsapp.ts` e o `agent`
ficaram intactos, porque a assinatura `interpretarIntencao(texto) → Intencao` não
mudou.

Vale registrar: o isolamento do `intent.ts`, que foi decisão de design da entrega
original, se pagou na primeira vez que foi testado. A troca de provedor custou um
arquivo.

**SDK:** saiu `@anthropic-ai/sdk`, entrou `openai` — o OpenRouter expõe uma API
compatível com a da OpenAI, então é o SDK oficial apontado para outra `baseURL`.
Não há dependência de código com a OpenAI em si.

**Modelo: `openai/gpt-oss-20b:free`**, configurável por `OPENROUTER_MODEL`.

#### Verificação que definiu a escolha do modelo

A exigência de *structured outputs* da fatia quase não sobrevive ao tier gratuito.
Antes de escolher, consultei a API pública de modelos do OpenRouter:

- **338 modelos** no catálogo total
- **14** gratuitos (sufixo `:free`)
- **apenas 5** desses suportam `structured_outputs`

Ou seja: **a maioria dos modelos gratuitos quebraria o requisito de "sem texto
solto na resposta"**. `openai/gpt-oss-20b:free` foi escolhido por estar nessa
interseção, com 131k de contexto e bom seguimento de instrução. O comando para
reconferir a lista (ela muda) está no `INSTALACAO.md` e no comentário do
`intent.ts`.

Também foi verificado na documentação do OpenRouter o formato exato do parâmetro
(`response_format: {type: "json_schema", json_schema: {name, strict, schema}}`) —
diferente do `output_config.format` da Anthropic.

#### Defesa extra que não existia na versão Anthropic

O schema deveria bastar, mas a confiança na obediência cai com modelo gratuito e
pequeno. Foram acrescentados:

1. erro explícito quando o `JSON.parse` falha, nomeando o modelo e mostrando o
   início da resposta — para o diagnóstico não virar adivinhação;
2. validação do enum: valor fora de `status`/`unknown` loga aviso e é tratado como
   `unknown`, em vez de circular pelo sistema.

`temperature: 0` também entrou — classificação deve ser determinística.

#### ⚠️ Implicação de privacidade — decisão consciente pendente

O texto de **toda mensagem autorizada** passa a sair da infraestrutura do time
para o OpenRouter e daí para o provedor do modelo. **No tier gratuito, alguns
provedores podem treinar em cima desse conteúdo** — a política varia por provedor.

As mensagens são conversa interna da DMG. Isso toca diretamente o princípio de
**propriedade do dado pelo usuário** do `manifesto-impetus.md` (Seção VII), que o
próprio documento classifica como inviolável.

**Mitigação disponível:** desmarcar treinamento para modelos gratuitos em
<https://openrouter.ai/settings/privacy>. O custo é uma lista menor de modelos
gratuitos disponíveis.

**Isto não é uma decisão que eu deva tomar sozinho** — está documentado no
`INSTALACAO.md` e no `MANUAL.md` (em linguagem de usuário: "não mande pelo Impetus
nada que você não mandaria para fora da empresa"), e fica registrado aqui como
pendência consciente para o time resolver.

#### Também não testado

A troca **não foi executada contra a API** pelo mesmo motivo da entrega original:
não há `OPENROUTER_API_KEY` neste ambiente. O que foi verificado: compilação
limpa, smoke da Fatia 1 sem regressão, ausência de qualquer referência residual à
Anthropic no código e nos configs, e o suporte a structured outputs do modelo
escolhido (via API pública de modelos). **O `intent.ts` continua nunca tendo
executado.**

### Primeiro uso real — classificação quebrada, e o que a guarda escondia

**Data:** 20/07/2026
**Status:** ✅ resolvido e medido — 16/16 num banco de frases

O time subiu a Fatia 2 com a chave do OpenRouter e testou pelo WhatsApp. Cinco
mensagens, três "certas": `"Tem algum usuário ativo?"` e
`"Tem algum usuário conectado?"` caíam em `unknown`, e uma deu resposta vazia. O
relato foi: *"a interpretação está muito fraca, quase inútil"*.

#### O que o teste manual fazia parecer

Um classificador ruim, resolvível com prompt melhor. Duas causas plausíveis, as
duas minhas:

1. **`"Na dúvida entre as duas, escolha unknown"`** — eu escrevi um viés explícito
   para `unknown`. Otimizei contra "executar o que não foi pedido" e criei "não
   reconhecer o que foi pedido".
2. **Todos os exemplos diziam "máquinas"**, nenhum dizia "usuário". Modelo pequeno
   casa vocabulário em vez de generalizar semântica.

Corrigi as duas: prompt reescrito com a regra enunciada antes dos exemplos, lista
de sinônimos (`usuário`, `pessoa`, `gente`, `PC`, `computador`, `alguém`) e o
viés trocado por uma regra escopada — `unknown` só quando a **ação** for outra,
nunca por formulação desconhecida.

#### O que a medição revelou (e a inspeção não revelaria)

Em vez de reentregar, escrevi um banco de 16 frases e rodei contra a API real.
Resultado: **8/16**, e o log mostrou a causa verdadeira:

```
[intent] valor fora do enum: {"status":"unknown"} — tratando como unknown
```

**O modelo devolvia a chave `status`, não `intent`.** O
`openai/gpt-oss-20b:free` ignorava o schema por completo — nome de campo e enum —
apesar de a API de modelos do OpenRouter declarar `structured_outputs: true` para
ele. Até a palavra literal `status` classificava errado.

**E a minha "defesa extra" escondia isso.** A guarda de enum, que eu tinha
acrescentado na troca de provedor achando que era prudência, devolvia `unknown`
silenciosamente sempre que o schema não era respeitado. Efeito: **todo caso
`unknown` "passava"** — não por classificação, mas por fallback. A falha total do
schema se disfarçou de "classificador fraquinho".

> **Lição, e é a mais importante desta fatia:** uma guarda defensiva que converte
> falha em valor-padrão **não é robustez, é ocultação**. Ela transformou um erro
> alto e diagnosticável ("o modelo não respeita o schema") num sintoma difuso ("a
> interpretação é ruim"). A guarda agora **lança exceção**, nomeando o modelo e
> mostrando o conteúdo cru.

#### Troca de modelo, com evidência

Sondei os outros gratuitos que declaram suporte a structured outputs:

| Modelo | Resultado |
|---|---|
| `openai/gpt-oss-20b:free` | ignora o schema (chave errada) + respostas vazias frequentes |
| `nvidia/nemotron-3-super-120b-a12b:free` | 404 — bloqueado por política de dados |
| `nvidia/nemotron-nano-9b-v2:free` | 404 — bloqueado por política de dados |
| **`google/gemma-4-26b-a4b-it:free`** | **4/4, schema respeitado 4/4** |

Padrão passou a ser `google/gemma-4-26b-a4b-it:free`. Banco completo com o modelo
novo: **16/16 (100%)**, incluindo as duas frases que falharam no uso real.

Registro do 404: os modelos NVIDIA são recusados pelo *guardrail* de política de
dados da conta. Não foi investigado a fundo — mas indica que a configuração de
privacidade do OpenRouter **já está filtrando provedores**, o que é relevante para
a pendência de privacidade registrada acima.

#### Outras mudanças

- **Retry em resposta vazia** (2 tentativas). Modelo gratuito devolve vazio de vez
  em quando; sem retry, a pessoa recebe "Deu erro aqui do meu lado" numa mensagem
  perfeitamente válida. Só repete em resposta vazia — erro de rede, credencial ou
  limite sobe na hora, porque repetir não ajudaria.
- **`scripts/bench-intent.ts` + `npm run bench:intent`** — o banco de frases virou
  parte do repositório. Foi ele que achou o problema real; deixá-lo em pasta
  temporária seria perder a ferramenta que fez a diferença entre "acho que
  melhorou" e "16/16 medido".

#### ⚠️ Limite diário do tier gratuito — descoberto do jeito ruim

Os benchmarks **esgotaram a cota diária de modelos gratuitos** da conta
(`429 free-models-per-day`). Números confirmados na documentação do OpenRouter:

| Situação | Por minuto | Por dia |
|---|---|---|
| Sem créditos | 20 | **50** |
| Com US$ 10 comprados (uma vez, vitalício) | 20 | **1000** |

**50 mensagens por dia é o teto do time inteiro**, não por pessoa — e cada
mensagem enviada ao Impetus consome uma, inclusive as que ele não sabe atender.
Para uso real isso vai apertar rápido. Os US$ 10 são pagamento único e multiplicam
por 20.

Isso **não estava previsto** quando a troca para o OpenRouter foi feita: eu tinha
citado "limite de requisições" genericamente, sem os números. Com eles à vista, é
uma restrição de viabilidade, não um detalhe operacional.

### Ampliação — interpretação sobre os cinco protocolos

**Data:** 20/07/2026
**Status:** ✅ implementado e medido — 22/22 de intenção e 16/16 de alvo nos casos que responderam (2 casos perdidos por cota, nenhum por classificação)

#### O que foi pedido

Montar a base de interpretação sobre **todos os protocolos já definidos no
contrato**, não só `status`. Frases de exemplo devem **ensinar o padrão, não
delimitar** o que é aceito — a pessoa precisa poder se comunicar naturalmente.

#### O que mudou

**`intent` agora reaproveita `CommandName` do `protocol`.** O tipo passou a ser
`CommandName | "unknown"`, em vez de uma união própria. Isso amarra a camada de
interpretação ao contrato: acrescentar um comando ao protocolo passa a **quebrar
a compilação** até que ele seja ensinado ao classificador — em vez de a
interpretação silenciosamente nunca reconhecê-lo.

**Novo campo `alvo`.** A intenção passou a carregar o objeto do pedido (projeto,
pasta, arquivo, máquina), ou `null` quando não especificado. Isso era dívida
registrada na entrega da Fatia 2: sem alvo, classificar `find` é inútil — achar
o quê? O `null` é informação, não erro: é o que vai permitir perguntar "qual
projeto?" nas fatias seguintes.

**Prompt reescrito por protocolo.** Cada um ganhou: enunciado da finalidade,
vocabulário que costuma aparecer, e exemplos **marcados como ILUSTRATIVOS**. Mais
uma regra de desempate por resultado esperado (onde está → `find`; o que tem
dentro → `listFiles`; estado do git → `gitStatus`; receber o material →
`shareFile`).

Decisão de conteúdo que vale registro: **"zipar/compactar" foi classificado como
`shareFile`**, não como protocolo próprio. No contexto do Impetus, compactar não
é um fim — é o meio de receber o material. O contrato não tem comando de zip, e
inventar um seria alargar o protocolo sem necessidade.

**Resposta honesta por protocolo reconhecido.** Antes, tudo que não fosse
`status` respondia `"Ainda não sei fazer isso."`. Agora:

> Entendi: você quer localizar um projeto ou pasta — "Flora".
>
> Isso ainda não está pronto — vem numa próxima etapa do Impetus.

Reconhecer a intenção vale mais que um "não sei" genérico: a pessoa descobre que
o pedido **faz sentido** e que falta a ação, não a compreensão. E isso valida a
camada de classificação antes das fatias que vão implementar as ações.

O `Record` das descrições é tipado por `Exclude<CommandName, "status">` — comando
novo no protocolo exige uma frase aqui, senão não compila.

#### Benchmark reescrito para medir generalização, não memória

O banco passou de 16 para **24 casos, 4 por protocolo**, e ganhou uma regra
explícita no cabeçalho do arquivo:

> As frases do benchmark **não podem repetir os exemplos do prompt**.

O objetivo deixou de ser "o modelo acerta as frases conhecidas?" e passou a ser
"ele generaliza para formulações que nunca viu?". Por isso os casos usam gíria,
erro de digitação, falta de acento e ordem invertida de propósito —
`"as maquina tao de pe?"`, `"da um ls no projeto impetus"`,
`"ja commitaram tudo no impetus?"`. O benchmark também passou a medir extração de
`alvo` (17 dos 24 casos).

#### ⚠️ Não validado — e por que isso importa aqui

**A cota diária do OpenRouter estava esgotada** (`429 free-models-per-day`, teto
de 50/dia). O benchmark rodou e deu **0/24 — todas por erro de cota, nenhuma por
classificação**. Ou seja: o novo prompt e o campo `alvo` **não têm nenhuma
medição**.

Isso é exatamente o cenário em que esta sessão já errou uma vez: na entrega
anterior, o que parecia "classificação fraca" era o modelo ignorando o schema
inteiro — e só o benchmark revelou. **Inspeção de prompt não substitui medição.**

Especificamente não verificado:

- se o modelo respeita o schema com o campo `alvo` acrescentado (mudou a forma da
  resposta — antes um campo, agora dois, um deles `["string","null"]`);
- se generaliza para os quatro protocolos novos;
- se a extração de `alvo` funciona;
- se a regra de desempate resolve os casos ambíguos.

**Rodar quando a cota virar:**

```bash
cd mvp && npm run bench:intent
```

**Atualização (mesma data):** a cota virou e o benchmark foi rodado — mas a
primeira execução saiu **0/24, contra o modelo errado**. O `.env` do time ainda
apontava para `openai/gpt-oss-20b:free` (o modelo que ignora o schema), apesar de
o padrão do código e do `.env.example` já serem o `gemma`. A troca do `.env` tinha
sido sinalizada duas vezes e não aplicada; foi corrigida — só a linha
`OPENROUTER_MODEL`, sem tocar na chave. O resultado real, contra o `gemma`, está
registrado na sub-entrada seguinte.

> **Lição operacional:** `OPENROUTER_MODEL` no `.env` **sobrepõe** o padrão do
> código. Um benchmark que reporta `modelo X nao respeitou` no erro está dizendo
> qual modelo realmente rodou — confira essa linha antes de interpretar o
> resultado. Aqui, o "0/24" não era do prompt novo: era do modelo velho, que já
> se sabia quebrado.

#### Resultado real (contra `google/gemma-4-26b-a4b-it:free`)

Depois de corrigir o `.env`, o benchmark rodou contra o modelo certo:

```
intencao: 22/24 (92%)
alvo:     16/17 (94%)
```

**As duas falhas foram erro de cota, não de classificação:**

- `"localiza ai o diretorio do dmg saas"` → `429 Provider returned error`
- `"deleta tudo"` → `429 Rate limit exceeded: free-models-per-day`

Ou seja: **em todos os 22 casos que receberam resposta, a intenção foi
classificada corretamente; nos 16 casos de alvo que responderam, o alvo saiu
certo.** Zero erro de compreensão em 24 frases que **não estavam no prompt** — com
gíria (`"tem pc ligado ai"`), erro de digitação (`"quais sao os arquivo"`), sem
acento e ordem invertida, distribuídas pelos cinco protocolos.

Isso valida o objetivo do pedido — o usuário se comunica naturalmente e a
classificação generaliza — e valida o `gemma` como modelo padrão para os cinco
protocolos, não só para `status`.

Extração de alvo, observação: em alguns casos o modelo devolve o alvo com uma
palavra de contexto junto (`"notebook do guilherme"`, `"pasta do site"`). O
benchmark conta como acerto porque verifica se o alvo **contém** o esperado — e
para o uso pretendido (busca aproximada no índice, fatias futuras) isso é
suficiente. Se a busca vier a exigir o nome limpo, será refinamento de fatia
futura, não bug desta.

**Uma ressalva honesta:** os dois 429 no fim mostram que a cota diária de 50
requisições **se esgotou durante o próprio benchmark** (que consome 24). Não foi
possível reexecutar para cobrir os dois casos perdidos no mesmo dia. Eles não são
suspeitos — `"deleta tudo"` como `unknown` e `"localiza..."` como `find` são
óbvios pela regra — mas ficam formalmente sem medição até uma próxima execução.

#### Tensão operacional que isto expõe

O benchmark consome **24 das 50 requisições diárias** — quase metade da cota só
para validar. Na prática, no tier gratuito **não dá para validar e usar o bot no
mesmo dia** com folga. Isso reforça o caso dos US$ 10 de crédito (sobe para
1000/dia, compra única) registrado na entrada anterior.

### Troca de provedor: OpenRouter → Groq (por limite diário)

**Data:** 20/07/2026
**Status:** ✅ trocado e medido no Groq — **24/24 de intenção, 17/17 de alvo**

#### Motivo

O time relatou estar batendo no limite diário do OpenRouter. Diagnóstico: **o
limite (50/dia) não mudou; o uso é que mudou.** O `bench:intent` consome 24
requisições por rodada, e algumas rodadas de validação no mesmo dia esgotam a
cota. O uso real no WhatsApp (poucas mensagens) nunca chegava perto.

Como o gargalo era "validar consome quase metade da cota", a saída certa era um
tier gratuito bem maior. Pesquisadas as opções (registro da comparação abaixo), o
time escolheu **Groq**.

#### Comparação que embasou a escolha

| Opção | Grátis/dia | Saída estruturada | Privacidade |
|---|---|---|---|
| OpenRouter grátis (anterior) | 50 | sim (dependia do provedor) | modelos free podem treinar |
| **Groq grátis (escolhido)** | **~1.000 a 14.400** | **sim, modo estrito** (constrained decoding) | política própria, a conferir |
| Gemini grátis | maior que 50, encolhendo | sim | **treina nos dados, confirmado** |
| OpenRouter + US$ 10 | 1.000 | igual | igual |

O Groq ganhou em duas frentes: cota ~20× maior **e** modo estrito de saída
estruturada — que *garante* o schema via constrained decoding, em vez de depender
de qual provedor pega a requisição (a fraqueza que nos queimou no OpenRouter).

#### O que mudou no código

Só `apps/brain/src/intent.ts` e os arquivos de ambiente. De novo o isolamento do
módulo se pagou — terceira troca de provedor (Anthropic → OpenRouter → Groq),
sempre um arquivo.

- **SDK:** continua o `openai` — o Groq também expõe endpoint compatível. Removidos
  os cabeçalhos `HTTP-Referer`/`X-Title`, que eram específicos do OpenRouter.
- **Modelo padrão: `openai/gpt-oss-120b`.** No Groq, só `gpt-oss-120b` e
  `gpt-oss-20b` têm modo estrito. Escolhi o 120b por qualidade de classificação;
  o 20b tem cota maior e fica documentado como alternativa.
- **Variáveis:** `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` → `GROQ_API_KEY`/
  `GROQ_MODEL`. No `.env` do time, adicionei os slots do Groq **sem apagar** a
  chave antiga do OpenRouter (fica inerte, não é mais lida) — para não destruir
  credencial que ainda pode servir de fallback.

#### Ironia que precisa de teste

O modelo com schema estrito no Groq é o `gpt-oss-20b` — **o mesmo que nos falhou
no OpenRouter**. Lá ele ignorava o schema; no Groq o mecanismo é outro
(constrained decoding força o formato). Provavelmente funciona onde falhou — mas
qualidade de *classificação* é coisa separada de aderência ao *schema*, e o padrão
agora é o 120b justamente por isso. Só o benchmark confirma.

#### ⚠️ Não medido — repetindo a disciplina desta sessão

> **Atualização (mesma data):** o time configurou a `GROQ_API_KEY` e o benchmark
> rodou. Resultado na sub-entrada seguinte — **24/24 e 17/17**. As três dúvidas
> abaixo foram todas respondidas na prática.

Quando esta entrada foi escrita, ainda não havia `GROQ_API_KEY` no ambiente, então
o `intent.ts` no Groq nunca tinha executado. Ficava sem medição:

- se o `gpt-oss-120b` respeita o schema com o campo `alvo` (deveria, é modo
  estrito — mas "deveria" não é "foi medido");
- se classifica os cinco protocolos tão bem quanto o gemma (22/24);
- se a extração de alvo funciona.

**Fechar assim que a chave existir:**

```bash
# 1. GROQ_API_KEY no .env do brain
# 2:
cd mvp && npm run bench:intent
```

Esta é, textualmente, a mesma situação que já mordeu esta sessão duas vezes: o que
parece pronto por inspeção não está medido. O status fica ⚠️ até o benchmark rodar
contra o Groq.

#### Achado ao rodar no Groq: 400 transitório do modo estrito

Com a chave configurada, o benchmark rodou — e apareceu **um** `400 Failed to
validate JSON` em 24 casos (`"tem algo pra subir no flora?"`). Não era
classificação errada nem cota: era erro do modo estrito do Groq.

Antes de tratar, diagnostiquei se era **determinístico** (schema incompatível) ou
**transitório**. Rodei a frase que falhou 5× em dois formatos de schema para
`alvo`:

| Schema para `alvo` | Resultado |
|---|---|
| `type: ["string","null"]` (o atual) | **5/5 sem erro** |
| `anyOf: [{string},{null}]` (alternativa) | 4/5 — o 400 apareceu 1× |

Conclusão: **transitório, e o schema atual é o melhor dos dois.** O 400 é ruído do
constrained decoding — aparece esporadicamente na mesma requisição que funciona na
tentativa seguinte, independente do schema. Não é para trocar o schema; é para dar
retry.

**Correção:** o retry que já existia para resposta vazia passou a cobrir também
esse 400 específico (`json_validate_failed`). A distinção é deliberada — 401
(credencial), 404 (modelo) e 429 (cota) **não** são repetidos, porque são
determinísticos ou de cota, e repetir só esconderia o problema ou queimaria
requisição. Orçamento subiu de 2 para 3 tentativas.

(Nota: o probe de diagnóstico usou um prompt simplificado, então a classificação
que ele mostrou — `shareFile`/`status` para aquela frase — **não** reflete o
prompt real. O que o prompt real faz com ela saiu no benchmark completo abaixo.)

#### Resultado no Groq (com o retry no lugar)

```
modelo:   openai/gpt-oss-120b
intencao: 24/24 (100%)
alvo:     17/17 (100%)
```

**Perfeito nos cinco protocolos.** E o retry se provou no próprio benchmark:
**dois** `400 transitorio` apareceram — um deles exatamente o
`"tem algo pra subir no flora?"` que havia falhado no run do time — e **ambos
foram recuperados na tentativa seguinte**, com intenção e alvo corretos
(`gitStatus` / `flora`). Sem o retry, teriam sido 22/24; com ele, 24/24.

Comparando as duas medições da fatia:

| Modelo (provedor) | Intenção | Alvo | Observação |
|---|---|---|---|
| `gemma-4-26b` (OpenRouter) | 22/24 | 16/17 | 2 falhas por cota (429), não classificação |
| **`gpt-oss-120b` (Groq)** | **24/24** | **17/17** | 2 falhas transitórias, ambas recuperadas por retry |

O `gpt-oss-120b` no Groq classificou tão bem quanto o gemma **e** o modo estrito
(mais o retry) eliminou as falhas que restavam. A troca de provedor, feita por
causa do limite diário, saiu de graça em qualidade — nenhuma regressão.

Ampliação e troca de provedor **fechadas e medidas**.

### Fora de escopo (respeitado)

Nada de sistema de arquivos, git ou envio de arquivo; nada de grupos; nenhum
fluxo de confirmação (só o tipo reservado); heartbeat intocado; `parseEnvelope`
segue duplicado nos dois lados, como pedido.

### Dívidas que esta fatia cria

- **Sem contexto de conversa.** Cada mensagem é interpretada isolada — "e o
  outro?" não resolve. O `00_DECISOES.md` trata contexto de conversa como missão
  central do Impetus, então isso vai voltar.
- **A intenção não carrega parâmetros.** Só o nome da ação. `find` vai precisar do
  alvo da busca, então o schema vira uma união discriminada — provavelmente junto
  com `CmdResponsePayload.result`, que hoje tem só o formato do `status`.
- **Um cliente Anthropic novo por mensagem.** `new Anthropic()` roda a cada
  chamada. Irrelevante neste volume; vale hoistar se o tráfego crescer.
- **Sem teste automatizado da interpretação.** O `npm run smoke` cobre transporte,
  não intenção. Um conjunto de frases de exemplo com intenção esperada seria o
  caminho — mas exige chave de API, e a classificação não é determinística.
- **Custo por mensagem agora é diferente de zero**, inclusive para mensagens que
  o Impetus não sabe atender: toda mensagem de número autorizado vira uma chamada
  de API antes de qualquer decisão.

---
---

*Log iniciado na execução da Fatia 1. Ordem cronológica: a entrada mais antiga vem primeiro.*
