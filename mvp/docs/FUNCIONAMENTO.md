# Funcionamento — MVP do Impetus

### mvp/docs/

Como as peças do MVP funcionam por dentro. Documento técnico, escrito para quem
vai mexer no código. Quem só quer usar o Impetus pelo WhatsApp deve ler o
`MANUAL.md`; quem vai instalar, o `INSTALACAO.md`.

Estado atual: **`status`, `find`, `listFiles` e `shareFile` funcionam de
verdade.** Só falta `gitStatus` e o modelo de confirmação por classe de ação
— ver a seção final.

---

## 1. As duas peças

O Impetus não é um programa por computador. É uma identidade única, dividida em
dois papéis com responsabilidades diferentes:

| Peça | Onde roda | Quantos | Responsabilidade |
|---|---|---|---|
| **`brain`** (cérebro central) | Um servidor sempre ligado | Exatamente 1 | Falar com o WhatsApp, saber quais máquinas existem, coordenar |
| **`agent`** (agente local) | Na máquina de cada pessoa do time | 1 por máquina | Executar o que exige estar fisicamente naquela máquina |

Além dos dois, existe um terceiro pacote que não roda: **`packages/protocol`**,
que contém apenas tipos TypeScript. Ele define o formato das mensagens trocadas
entre `brain` e `agent`.

Isso importa por um motivo arquitetural: **`brain` e `agent` não se conhecem.**
Nenhum dos dois importa código do outro. Os dois importam o mesmo contrato.
Trocar o transporte (hoje WebSocket) por outra coisa no futuro não deveria
exigir reescrever os dois lados — só a camada que fala o transporte.

---

## 2. Direção da conexão (e por que isso é o ponto central)

**O agente sempre liga para o cérebro. O cérebro nunca liga para o agente.**

Essa não é uma escolha estética. A maioria dos computadores de casa e escritório
está atrás de NAT ou firewall, sem IP público acessível de fora. Se o cérebro
precisasse "ligar para dentro" da rede de cada máquina, cada pessoa do time
teria que configurar redirecionamento de porta no roteador — inviável na prática.

Fazendo o agente ligar para fora e manter essa conexão aberta, o problema
desaparece: a conexão de saída passa por qualquer NAT doméstico sem configuração
nenhuma. É o mesmo padrão usado por Slack, Discord e Tailscale.

Consequência prática: o cérebro precisa de um endereço alcançável da internet
(IP público ou domínio). Os agentes não precisam de endereço nenhum.

---

## 3. Ciclo de vida de uma conexão de agente

```
agent                                  brain
  |                                      |
  |-- abre WebSocket ------------------->|
  |-- register {nick, secret} ---------->|
  |                                      |-- valida secret contra PAIRING_SECRET
  |<------------- registered {ok:true} --|-- grava no Map<nick, socket>
  |                                      |
  |-- heartbeat (a cada 30s) ----------->|
  |<------------------- heartbeat_ack ---|
  |                                      |
  |<------ ping (a cada 30s, protocolo) -|
  |-- pong (automático) ---------------->|
```

**Se o secret não bater**, o cérebro responde `registered {ok:false, reason}` e
fecha a conexão. O agente loga o motivo e **encerra o processo** — não adianta
ficar tentando reconectar com um secret errado, isso só geraria ruído infinito
no log.

**Se a conexão cair** (rede, cérebro reiniciado, máquina suspendeu), o agente
tenta reconectar a cada 5 segundos, indefinidamente, logando cada tentativa. Ao
reconectar, o fluxo de `register` acontece de novo do zero.

### 3.1. Detecção de conexão morta (as duas pontas)

Este ponto mereceu atenção extra porque é onde a Fatia 1 mais facilmente daria
uma falsa sensação de funcionar.

Quando uma máquina entra em **sleep** ou a rede some sem aviso, o socket TCP não
é fechado de forma limpa: ele fica *meio-aberto*. Nenhum dos dois lados recebe
evento de `close`. Sem tratamento, isso produziria dois bugs simétricos:

- No **cérebro**: o agente ficaria no `Map` para sempre, e o `status` mostraria
  uma máquina "conectada" que na verdade está dormindo.
- No **agente**: ele ficaria parado achando que está conectado, e **nunca
  dispararia a reconexão** — que é justamente a coisa que esta fatia existe
  para provar.

Por isso as duas pontas têm detecção ativa:

- **Cérebro → agente:** ping de protocolo a cada 30s. Se um socket não devolveu
  `pong` desde o ping anterior, ele é derrubado (`terminate`) e sai do `Map`.
- **Agente → cérebro:** um *watchdog* checa a cada 10s há quanto tempo o cérebro
  não dá sinal de vida (qualquer mensagem ou ping conta). Passando de 75s de
  silêncio, o agente derruba a própria conexão — o que dispara o `close` e,
  por consequência, o ciclo normal de reconexão.

Os 75s são folga deliberada de ~2,5× o intervalo de heartbeat: um ack perdido
não derruba a conexão, um silêncio real derruba.

---

## 4. Ciclo de vida de uma mensagem `status`

Este é o caminho completo, de ponta a ponta, que a Fatia 1 existe para provar:

1. Alguém manda `status` no WhatsApp para o número do Impetus.
2. O Baileys, dentro do `brain`, recebe o evento `messages.upsert`.
3. O `brain` identifica quem mandou (ver 4.1 — não é tão direto quanto parece) e
   descarta a mensagem se: for do próprio bot, não for conversa direta (grupos
   ficam fora nesta fatia), ou **o número não estiver em
   `WHATSAPP_ALLOWED_NUMBERS`**. Número não autorizado é ignorado em **silêncio
   absoluto** — sem resposta, e sem logar o conteúdo. Responder qualquer coisa
   confirmaria a existência do bot para quem não deveria saber dele.
4. O texto cru é mandado para a **camada de interpretação** (`intent.ts`), que
   consulta a API da Anthropic e devolve `{intent: "status"}` ou
   `{intent: "unknown"}` — ver 4.2. Se for `unknown`, o Impetus responde
   `"Ainda não sei fazer isso."` e para aqui.
5. Se o `Map` de agentes estiver vazio, responde
   `"Nenhuma máquina conectada no momento."` e para aqui.
6. Se houver agentes, o `brain` dispara um `cmd.request {command:"status"}` para
   **todos em paralelo**, cada um com seu próprio `id` de envelope e sua própria
   janela de 5 segundos. Uma máquina lenta não atrasa as outras além desse limite.
7. Cada `agent` responde `cmd.response` com seu `nick` e `uptimeSeconds`
   (`process.uptime()` — tempo desde que **o processo do agente** subiu, não
   desde que a máquina ligou).
8. O `brain` casa cada resposta com o request pelo `id` do envelope, monta uma
   linha por máquina e manda de volta pelo WhatsApp.

Máquinas que não responderem dentro dos 5 segundos entram na lista como
`"PC-X — sem resposta"`, em vez de sumirem silenciosamente. A resposta prefere
dizer "não sei" a omitir.

### 4.1. Descobrir quem mandou a mensagem (mais difícil do que parece)

O passo 3 acima parece trivial — "pega o número do remetente" — mas foi onde a
Fatia 1 quebrou em uso real. Dois problemas somados, e **em série**:

**a) O `remoteJid` nem sempre é o número.** O WhatsApp vem migrando as conversas
1:1 para um identificador interno, o `@lid`:

```
remoteJid: "122183615541479@lid"      ← não tem relação com a linha
senderPn:  "559881908366@s.whatsapp.net"  ← o número real está aqui
```

Por isso a extração usa `senderPn` quando o `remoteJid` é `@lid`, e o próprio
`remoteJid` quando é o formato antigo. Um filtro que exija `@s.whatsapp.net`
descarta a mensagem inteira sem deixar rastro.

**b) O 9º dígito dos celulares brasileiros.** A mesma linha existe em duas formas,
e **o WhatsApp não entrega necessariamente a que a pessoa digitou no `.env`**:

```
5598981908366   →  55 + 98 + 9 + 81908366   (13 dígitos, com o 9 extra)
 559881908366   →  55 + 98 +     81908366   (12 dígitos, sem)
```

Por isso os dois lados são reduzidos a uma **forma canônica** (a curta, sem o 9)
antes de comparar. Os autorizados são canonicalizados uma vez, na subida do
processo. A regra se aplica **só** a `55` com 13 dígitos onde o dígito após o DDD
é `9` — números de outros países e fixos passam intactos.

As duas funções (`extrairNumeroRemetente` e `canonicalizarNumero`) são puras e
exportadas justamente para poderem ser testadas sem subir o processo e sem
depender do WhatsApp.

> Por que isso merece um item próprio na documentação: **corrigir só o `@lid` não
> resolve.** A mensagem passa do filtro de JID e morre na comparação de número,
> dando a impressão de que o `@lid` não era a causa. Quem for mexer aqui depois
> precisa saber que são dois problemas, não um.

### 4.2. A camada de interpretação (Fatia 2)

Até a Fatia 1, o cérebro comparava a mensagem com a string `"status"`. Agora ele
manda o texto cru para um modelo de linguagem e recebe de volta uma decisão
estruturada. Isso é o que faz `"quais máquinas estão online?"` e `"quem tá ligado
agora"` chegarem no mesmo lugar que `"status"`.

**A interpretação cobre os cinco protocolos do contrato**, não só o `status`:

| Intenção | Finalidade | Implementado? |
|---|---|---|
| `status` | Quais máquinas estão no ar, e há quanto tempo | ✅ sim |
| `find` | Localizar uma pasta ou projeto | ✅ sim |
| `listFiles` | Ver o conteúdo de uma pasta | ✅ sim |
| `shareFile` | Receber um arquivo ou pasta (inclui "zipar e mandar") | ✅ sim |
| `gitStatus` | Estado do repositório: branch, alterações, último commit | ❌ reservado |
| `unknown` | Nenhum protocolo corresponde | — |

**O tipo vem do `protocol`.** `Intencao.intent` é `CommandName | "unknown"`, onde
`CommandName` é o mesmo tipo que o `cmd.request` usa. Isso amarra a interpretação
ao contrato: acrescentar um comando ao protocolo **quebra a compilação** até que
ele seja ensinado ao classificador — em vez de a interpretação silenciosamente
nunca reconhecê-lo.

**A intenção carrega um alvo.** Além de `intent`, a resposta traz `alvo`: o
projeto, pasta, arquivo ou máquina que a frase menciona, ou `null` quando não foi
especificado. Sem isso, classificar `find` seria inútil — achar o quê? O `null`
é informação, não falha: é o que vai permitir perguntar *"qual projeto?"* quando
as ações existirem.

**Protocolo reconhecido mas não implementado tem resposta própria.** Em vez de um
`"Ainda não sei fazer isso."` genérico, o Impetus diz o que entendeu:

> Entendi: você quer localizar um projeto ou pasta — "Flora".
>
> Isso ainda não está pronto — vem numa próxima etapa do Impetus.

A pessoa descobre que o pedido **faz sentido** e que falta a ação, não a
compreensão. E a camada de classificação fica validada antes das fatias que vão
implementar cada ação.

**O módulo é isolado de propósito.** `intent.ts` não conhece o WhatsApp nem os
agentes: recebe uma frase, devolve uma intenção. Quem decide o que fazer com essa
intenção é o `index.ts`. Trocar o modelo — ou trocar o provedor inteiro — não
deveria exigir mexer em mais nada. **Isso já foi exercitado na prática:** a fatia
foi implementada primeiro contra a API da Anthropic e migrada para o OpenRouter
sem tocar em nenhum outro arquivo de código.

**Provedor: Groq.** Roda modelos de linguagem com um tier gratuito generoso, atrás
de uma API compatível com a da OpenAI. Por isso o SDK usado é o `openai`, apenas
com a `baseURL` apontada para o Groq — não há dependência de código com a OpenAI
em si. O modelo padrão é gratuito.

**Saída estruturada, não texto solto.** A chamada usa `response_format` do tipo
`json_schema`, com `strict: true`, `enum: ["status", "unknown"]` e
`additionalProperties: false`. O provedor garante que a resposta é exatamente um
desses dois valores.

**Configuração e por quê:**

| Ajuste | Valor | Motivo |
|---|---|---|
| Provedor | Groq | Tier gratuito muito mais generoso que o OpenRouter (~1.000/dia vs 50); saída estruturada em modo estrito |
| Modelo | `openai/gpt-oss-120b` | Modo estrito garante o schema (constrained decoding). Configurável por `GROQ_MODEL`; `gpt-oss-20b` é a alternativa de cota maior — ver 4.3 |
| `temperature` | `0` | Classificação deve ser determinística: a mesma frase deve cair sempre na mesma intenção |
| `max_tokens` | `256` | A resposta é um JSON de uma linha |
| Retry | 3 tentativas, em resposta vazia **e** no 400 transitório do Groq | O modo estrito do Groq devolve `json_validate_failed` esporadicamente (ruído do constrained decoding, confirmado transitório). Credencial (401), modelo (404) e cota (429) **não** são repetidos — determinísticos ou de cota |

**Validação da resposta — e por que ela falha alto.** Depois do `JSON.parse`, o
código confere que `intent` está no enum. Se não estiver, **lança exceção**
nomeando o modelo e mostrando o conteúdo cru.

Isso já foi implementado do jeito errado, e vale registrar por quê: a versão
anterior devolvia `unknown` silenciosamente nesse caso, como "defesa". Quando o
modelo então em uso passou a ignorar o schema inteiro, essa guarda converteu
"o modelo está quebrado" em "toda mensagem é desconhecida" — o sintoma virou
"a interpretação é fraca" e a causa ficou invisível (ver 4.3).

> **Guarda que vira valor-padrão não é robustez, é ocultação.** Se o contrato foi
> violado, o certo é falhar de forma diagnosticável.

**Falha de API não vira "não sei fazer isso".** Se a chamada falhar (rede,
credencial errada, limite de uso do tier gratuito), a exceção sobe e o handler do
WhatsApp responde com uma mensagem de erro genérica. Isso é deliberado: responder
`"Ainda não sei fazer isso."` numa falha de infraestrutura esconderia um problema
operacional atrás de uma mensagem de produto, e ninguém iria investigar.

**Onde os dados vão parar.** O texto de toda mensagem autorizada sai da
infraestrutura do time e vai para o Groq. A política de dados deve ser conferida
(ver `INSTALACAO.md`), e a decisão é do time — mas a implicação está registrada
aqui porque toca o princípio de **propriedade do dado pelo usuário** do manifesto.
Nenhum tier gratuito de LLM está isento dessa análise; a troca de provedor não a
dispensa.

**Teto de uso.** O tier gratuito do Groq permite cerca de **1.000 requisições por
dia na conta inteira** com o modelo padrão (o `gpt-oss-20b` tem cota maior) — 20×
o que o provedor anterior dava. Como cada mensagem recebida consome uma, o teto
continua importando, mas deixou de ser gargalo para uso de um time pequeno. Ver
`INSTALACAO.md`.

### 4.2.1. Como o prompt é construído (e por que assim)

O prompt é a peça central do módulo. O princípio que rege sua estrutura:

> **Enunciar a regra de cada protocolo antes dos exemplos, e deixar explícito que
> os exemplos ilustram, não delimitam.**

Modelos pequenos tendem a tratar lista de exemplos como *lista de permissão*: se
o prompt só mostra frases, uma formulação nova vira `unknown`. A regra semântica
é o que permite generalizar.

Isso não é teoria — foi o bug do primeiro prompt desta fatia. Os exemplos só
falavam "máquinas", e `"Tem algum usuário ativo?"` caía em `unknown`. A correção
foi enunciar a finalidade e listar vocabulário equivalente (`usuário`, `pessoa`,
`gente`, `PC`, `computador`, `alguém`), não acrescentar mais exemplos.

Cada protocolo no prompt tem três partes:

1. **Finalidade** — o que a pessoa quer que aconteça.
2. **Vocabulário** — palavras que costumam aparecer, generosamente.
3. **Exemplos** — marcados como `ILUSTRATIVOS, nao exaustivos`.

Mais uma regra de desempate por **resultado esperado**, para os casos ambíguos:
onde está → `find`; o que tem dentro → `listFiles`; estado do git → `gitStatus`;
receber o material → `shareFile`.

Uma decisão de conteúdo que vale explicar: **"zipar/compactar" classifica como
`shareFile`.** No contexto do Impetus, compactar não é um fim — é o meio de
receber o material. O contrato não tem comando de zip, e criar um alargaria o
protocolo sem necessidade.

### 4.3. Como medir a qualidade da classificação

`npm run bench:intent` passa 24 frases rotuladas (4 por protocolo) pela
classificação e reporta acerto de intenção **e** de extração de alvo. **Use ao
trocar de modelo ou mexer no prompt** — e não confie em teste manual por WhatsApp
para julgar qualidade.

> **As frases do benchmark não repetem os exemplos do prompt — de propósito.**
> Repetir mediria memória; o que interessa é generalização. Por isso os casos
> usam gíria, erro de digitação e falta de acento (`"as maquina tao de pe?"`,
> `"da um ls no projeto impetus"`). Mantenha essa regra ao acrescentar casos.

O motivo é concreto. No OpenRouter (provedor anterior), o `gpt-oss-20b` aparecia
na lista de modelos com suporte a structured outputs, mas **na prática ignorava o
schema**: devolvia `{"status":"unknown"}` — chave errada, enum ignorado. Pelo
WhatsApp isso parecia apenas classificação ruim, porque a guarda de então
mascarava tudo como `unknown`. O benchmark expôs a causa na primeira execução.

**Duas medições registradas:**

- **`google/gemma-4-26b-a4b-it:free` (OpenRouter, banco dos cinco protocolos):**
  **22/24 de intenção, 16/17 de alvo** — as duas falhas foram erro de cota (429),
  não de classificação. Nos casos que responderam, acerto total.
- **`openai/gpt-oss-120b` (Groq, padrão atual):** **24/24 de intenção, 17/17 de
  alvo.** Nenhuma regressão em relação ao gemma; o modo estrito mais o retry no
  400 transitório eliminaram as falhas que restavam. Dois `400 json_validate_failed`
  apareceram durante o run e foram recuperados por retry.

Ao avaliar um modelo novo, olhe duas coisas separadas:

1. **Ele respeita o schema?** Se o log falar em "não respeitou o schema", pare por
   aqui — não adianta ajustar prompt. (No Groq, o modo estrito deveria garantir
   isso — mas confirme.)
2. **Ele classifica bem?** Só faz sentido perguntar depois que (1) estiver ok.

O benchmark consome **24 requisições**. No tier do Groq (~1.000/dia) isso é
folgado — deixou de haver a tensão "validar OU usar no mesmo dia" que existia com
o OpenRouter.

**Na dúvida, `unknown`.** O prompt instrui explicitamente a preferir `unknown`
quando a frase é ambígua. É melhor dizer que não sabe do que executar um comando
que a pessoa não pediu — o mesmo princípio de cautela que vai reger o modelo de
confirmação nas fatias seguintes.

### 4.4. O índice local de arquivos (agente)

Cada agente mantém, em memória, um índice leve das pastas que ele reconhece —
`apps/agent/src/fileIndex.ts`. Configurado por `AGENT_INDEX_ROOTS` (opcional):
uma ou mais pastas raiz, separadas por vírgula.

**Escaneia só o primeiro nível.** Cada subpasta imediata de cada raiz é tratada
como "um projeto" — o índice não entra recursivamente dentro delas. Isso evita
escanear `node_modules` e afins, e é o suficiente para responder "onde está o
projeto X": o que tem *dentro* do projeto é problema do `listFiles`, de uma
fatia futura, não do `find`.

**Não é só pasta — arquivo solto no mesmo nível também entra.** Se houver um
arquivo dentro da raiz configurada (ex.: um `.rar` de backup ao lado das pastas
de projeto), ele também vira candidato. `FindMatch` tem um campo `kind:
"folder" | "file"` para o cérebro saber a diferença na hora de formatar a
resposta — `isGitRepo` só faz sentido para pasta, e é sempre `false` para
arquivo.

Para cada entrada encontrada, guarda: `name`, `path`, `kind`, `isGitRepo`
(existe uma subpasta `.git`? só se checa para pasta) e `lastModified` (mtime,
ISO 8601). Atualizado por `setInterval` a cada 5 minutos — não por um
observador de sistema de arquivos. O `DESCRITIVO_MVP.md` permite qualquer um
dos dois; um watcher traria dependência e complexidade cross-platform
(comportamento diferente em Windows/Linux/macOS) sem necessidade clara nesta
etapa.

**Busca por normalização, não por biblioteca de fuzzy matching.** A query e cada
nome são normalizados (minúsculo, sem acento, **sem separador**) e comparados
por pontuação: match exato (100) > começa com (75) > nome contém a query (50).
É um índice leve, não um motor de busca — o objetivo é achar "onde", não
ranquear com precisão de produção. A remoção de acento compara **código Unicode
numérico** diretamente (faixa `U+0300`–`U+036F`, as marcas diacríticas que a
forma NFD separa da letra base), em vez de regex com o caractere escrito no
arquivo-fonte — evita depender de como o editor/encoding trata um combining
character solto no código.

**Espaço, `_`, `-` e `.` contam como o mesmo separador** (removidos antes de
comparar) — `"DMG_SaaS"`, `"dmg saas"` e `"dmg-saas"` normalizam para a mesma
chave. Achado testando contra a pasta real de um usuário (não os diretórios
sintéticos do `smoke-find.ts`): a forma como uma pasta é nomeada no disco
(convenção de programador, com underscore) e a forma como uma pessoa diz o nome
em voz alta (com espaço) são coisas diferentes, e a normalização inicial só
cobria acento/maiúscula.

**Não existe mais um ramo de pontuação para "a query contém o nome" (o
inverso de "nome contém a query").** Ele existia e foi removido depois de
causar um falso positivo real: como `.` também é separador removido, buscar
`"DMG_SaaS.rar"` normaliza para algo que "engole" o nome da pasta `DMG_SaaS`
mais o sufixo da extensão — e aquele ramo aceitava isso como match fraco,
trazendo a **pasta** quando a pessoa queria o **arquivo**. Removido, e resolvido
junto com a indexação de arquivos: agora `"DMG_SaaS.rar"` bate **exato** no
arquivo (100), e a pasta não entra em nenhum ramo (0) — sem coincidência. Ver
`EXECUCOES.md` para o relato completo das duas correções.

Se `AGENT_INDEX_ROOTS` não estiver configurada, o agente sobe normalmente e
`status` funciona igual — só que `find` nunca encontra nada nesse agente.

### 4.5. Ciclo de vida de uma mensagem `find`

Diferente do `status` (uma pergunta, uma resposta agregada), o `find` pode
gerar uma **pergunta de volta** antes de responder de verdade — e é aqui que
entra a primeira fatia de contexto de conversa do Impetus.

1. A interpretação (4.2) devolve `{intent: "find", alvo: "..." | null}`.
2. **Se `alvo` for `null`** (a pessoa pediu para achar algo sem dizer o quê): o
   Impetus responde `"Qual projeto ou pasta você quer localizar?"` e guarda uma
   pergunta pendente do tipo `find_target` para aquele número de telefone.
3. **Se houver `alvo`** (ou a próxima mensagem completar o passo 2): o cérebro
   manda `cmd.request` (`command: "find", query: alvo`) para **todos** os
   agentes conectados em paralelo — mesmo padrão de timeout por agente do
   `status`. Agentes com erro ou timeout **não aparecem na resposta** —
   diferente do `status`, onde a própria máquina é a informação pedida, aqui a
   pessoa quer saber onde o projeto está, não um relatório de saúde dos agentes.
4. Os matches de todos os agentes são agregados (mesmo projeto pode existir em
   mais de uma máquina) e a resposta depende da contagem:
   - **Zero:** `"Não encontrei nenhum projeto parecido com "X" em nenhuma
     máquina conectada."`
   - **Um:** nome, máquina, caminho, se é repositório git, última modificação.
   - **Mais de um:** lista numerada, e o Impetus guarda uma pergunta pendente
     do tipo `find_disambiguation` com os candidatos.
5. **A pergunta pendente é a fatia mínima de contexto.** Ela é um `Map` em
   memória (`apps/brain/src/pendingQuestions.ts`), chave = número de telefone
   canônico, **um slot por vez** — não é o sistema geral de "lembrar o que foi
   dito antes"; é só "há uma pergunta em aberto, a próxima mensagem
   provavelmente responde a ela". Antes de classificar qualquer mensagem nova,
   o cérebro confere se há uma pendência para aquele número:
   - `find_target`: a mensagem crua, sem passar pelo classificador, vira a
     query da busca (volta ao passo 3).
   - `find_disambiguation`: a mensagem é resolvida contra os candidatos por
     **número** (`1`, `2`...) ou por **substring do nome/nick**,
     deterministicamente (`resolverEscolha`) — não vale chamar o classificador
     de novo só para decidir qual opção a pessoa escolheu.
   - Se a resposta não bater com nenhum candidato, a pendência **não é
     forçada**: é descartada, e a mensagem é classificada do zero como pedido
     novo.
6. Pendência expira sozinha depois de 5 minutos (sem persistência — reinício do
   cérebro também limpa tudo, mesmo princípio do `AgentRegistry`).

### 4.5.1. `PendingQuestions` generalizada para `listFiles`/`shareFile`

Quando só existia `find`, a pergunta pendente era tipada especificamente:
`kind: "find_target" | "find_disambiguation"`. Ao chegar a segunda e terceira
ação que precisam do **mesmo** fluxo de resolver um alvo por busca — `listFiles`
e `shareFile` —, isso foi generalizado (`apps/brain/src/pendingQuestions.ts`):

```ts
type AcaoAlvo = "find" | "listFiles" | "shareFile";

type PendingQuestion =
  | { kind: "target"; acao: AcaoAlvo; askedAt: number }
  | { kind: "disambiguation"; acao: AcaoAlvo; candidatos: ...; askedAt: number };
```

`resolverEscolha` não mudou nada — já era agnóstico à ação (só resolve "qual
candidato" a partir de número ou nome). O que generalizou foi só o formato do
estado, não a lógica de resolução.

### 4.6. Ciclo de vida de `listFiles` e `shareFile`

Os dois reaproveitam **inteiramente** a resolução de alvo do `find` — mesma
busca no índice, mesma disambiguação, mesma pergunta pendente (4.5.1). A
diferença começa **depois** que um candidato único (nick + caminho) foi
resolvido: `index.ts` chama `executarAcao(acao, candidato, ...)`, que:

- Para `find`: só formata o que já foi encontrado (nada de rede nova).
- Para `listFiles`/`shareFile`: precisa voltar a **UM agente específico**
  (o do candidato resolvido) pedindo o conteúdo de verdade — diferente de
  `status`/`find`, que perguntam a **todos** os agentes conectados.

Por isso `AgentRegistry` ganhou `requestListFiles(nick, path)` e
`requestShareFile(nick, path)` (`apps/brain/src/wsServer.ts`) — direcionados a
um nick, reaproveitando o mesmo `enviarComandoEAguardar` genérico que já
existia para o broadcast.

**`listFiles` recusa educadamente um alvo que é arquivo, não pasta:** listar
"conteúdo" de um arquivo não faz sentido, então `executarAcao` intercepta esse
caso (`candidato.match.kind === "file"`) antes de sequer perguntar ao agente, e
responde `"X" é um arquivo, não uma pasta — não tem conteúdo pra listar.`.

**`shareFile` funciona pros dois** (arquivo e pasta) sem nenhum ramo especial
no cérebro — é o **agente** quem decide zipar ou não, com base no que existe
de verdade no disco dele (ver 4.7). O cérebro só repassa o caminho resolvido.

No agente (`apps/agent/src/wsClient.ts`), os dois handlers são assíncronos
(`responderListFiles`/`responderShareFile`) — diferente de `status`/`find`,
que respondem de forma síncrona. `listFiles` (`apps/agent/src/listFiles.ts`)
é uma listagem **rasa**: um nível só, mesmo critério do índice de `find`
(oculto não aparece), sem entrar em subpastas.

### 4.7. Zipar e enviar (`shareFile`, agente)

`apps/agent/src/shareFile.ts` decide entre dois caminhos com base no que
`statSync` diz sobre o caminho recebido:

- **Arquivo:** lê e devolve em base64 direto, com mimetype adivinhado por uma
  tabela fixa de extensão → mimetype (sem dependência nova para isso — é um
  `Record<string,string>` de ~20 entradas comuns).
- **Pasta:** zipa antes de enviar — a regra central pedida: *"se pedir uma
  pasta em vez de um arquivo, zipa e manda o zip"*. Usa `archiver` para gerar
  o zip e `ignore` para decidir o que entra, lendo o **próprio `.gitignore`
  da pasta** (mais `node_modules`/`.git` sempre, mesmo sem `.gitignore`) —
  reaproveitando a decisão já registrada no `00_DECISOES.md` de excluir
  artefatos via `.gitignore`, em vez de uma lista fixa que divergiria do que
  cada projeto realmente ignora.

**Teto de tamanho, checado ANTES de zipar.** `AGENT_MAX_FILE_MB` (padrão 20MB)
existe para ficar bem abaixo do limite de 100MB por mensagem do `ws`, mesmo
depois da inflação de ~33% do base64. Para pasta, em vez de zipar e abortar o
stream no meio se passar do teto (arriscado — não há garantia de que
`archive.abort()` deixa a `Promise` de `finalize()` resolver), o código
**soma antecipadamente** o tamanho do que entraria no zip (já descontando o
`.gitignore`), e lança antes de sequer instanciar o `archiver` se a soma
passar do limite. Troca deliberada: um zip bem comprimido que passaria pelo
teto depois de compactado é recusado sem tentar — simplicidade e
previsibilidade em vez de uma lógica de abort mais sofisticada e arriscada.

**Caminhos relativos usam `/` sempre, nunca `\`.** A sintaxe do `.gitignore` é
sempre `/`, mesmo em pastas do Windows — tanto a soma prévia de tamanho quanto
o filtro do `archiver` normalizam o separador antes de checar `ig.ignores()`.

> **Pegadinha real de versão do `archiver`, vale registrar.** A versão 8.0.0
> do pacote é **ESM puro** (`"type": "module"`, sem `require()` possível) —
> importá-la de um projeto `"module": "commonjs"` (como este) quebra em
> **runtime** com `ERR_REQUIRE_ESM`, não em tempo de compilação, e os próprios
> tipos de `@types/archiver@8` já não declaram mais a função-fábrica
> `archiver(formato, opções)` clássica (só `new ZipArchive(...)`). O projeto
> usa **`archiver@7.0.1`** (a última major ainda CommonJS, com a função-fábrica
> e os tipos correspondentes em `@types/archiver@7`) de propósito — não é
> desatualização por descuido.

**`AgentClientOptions.indexRoots` não influencia `listFiles`/`shareFile`.**
O índice (`fileIndex.ts`) só serve para **encontrar** o caminho via `find`; uma
vez resolvido, `listFiles`/`shareFile` operam sobre o `path` absoluto recebido
do cérebro, sem consultar o índice de novo.

---

## 5. O envelope

Toda mensagem, nos dois sentidos, tem o mesmo formato:

```ts
{
  v: 1,                    // versão do protocolo
  type: "cmd.request",     // o que é isso
  id: "uuid",              // casa request com response
  from: "brain",           // "brain" ou o nick do agente
  to: "PC-Daniel",
  ts: 1721400000000,       // Date.now()
  payload: { ... }         // conteúdo, específico por tipo
}
```

Os seis tipos com implementação: `register`, `registered`, `heartbeat`,
`heartbeat_ack`, `cmd.request`, `cmd.response`.

**`CmdRequestPayload`/`CmdResponsePayload` são uniões discriminadas por
`command`.** `status`, `find`, `listFiles` e `shareFile` têm payload próprio
(`StatusRequestPayload`/`FindRequestPayload`/`ListFilesRequestPayload`/
`ShareFileRequestPayload`, e as respostas correspondentes — `FindMatch[]` para
`find`, `FileEntry[]` para `listFiles`, `{fileName, contentBase64, mimeType}`
para `shareFile`). Isso não existia assim na Fatia 2 — o formato único de
então ("provavelmente vira uma união discriminada", dizia o comentário da
época) foi generalizado quando `find` chegou, e os dois comandos seguintes só
acrescentaram mais membros à mesma união.

Ainda resta **um placeholder de contrato — nome reservado, sem nenhuma lógica
dos dois lados**:

- **`cmd.confirm`** (tipo de mensagem) — vai carregar o pedido de confirmação
  antes de ações de risco. Nenhum lado envia nem trata.
- **`gitStatus`** (valor de `command`) — o único comando ainda sem payload
  definido. Um agente que receba isso hoje responde `ok: false` com "comando
  desconhecido", porque só `status`/`find`/`listFiles`/`shareFile` têm handler.

Eles existem para que o formato do protocolo já preveja esses passos, em vez de
precisar mudar depois. **A presença de um nome aqui não significa que ele
funciona** — verifique o handler antes de assumir que sim.

O campo `id` é o que permite ter vários comandos em voo ao mesmo tempo sem
embaralhar respostas — o cérebro guarda um `Map<id, quem está esperando>` e
resolve pela chave quando a resposta chega.

---

## 6. Estado e persistência

**Não há banco de dados. Não há fila. Não há persistência de estado.**

O registro de agentes conectados é um `Map<nick, WebSocket>` em memória. Se o
cérebro reiniciar, o `Map` se perde — e isso é aceitável, porque os agentes
reconectam sozinhos e se re-registram em segundos.

O mesmo vale para o **índice de arquivos** de cada agente (`Map` reconstruído a
cada refresh, nunca gravado em disco) e para a **pergunta pendente**
(`Map<numero, pergunta>` no cérebro, um slot por número, TTL de 5 minutos —
hoje compartilhada por `find`, `listFiles` e `shareFile`, ver 4.5.1). Se
qualquer um dos dois processos reiniciar no meio de uma pergunta pendente, ela
simplesmente some — a pessoa manda a mensagem de novo, sem dado inconsistente
para limpar.

`shareFile` também não persiste nada: o zip é montado inteiro em memória
(`Buffer.concat` dos chunks do `archiver`) e descartado depois de virar
base64 na resposta — não fica arquivo temporário nenhum no disco do agente.

A única coisa que é gravada em disco é a **credencial de sessão do WhatsApp**
(pasta `auth_info/`, via `useMultiFileAuthState` do Baileys), para não precisar
escanear o QR toda vez que o processo reinicia.

Isso é aplicação direta do princípio *simplicidade sobre sofisticação aparente*
(Manifesto, Seção VII): um `Map` resolve exatamente o que esta fatia precisa
provar. Fila e banco entram quando houver um problema real que os exija — não
antes.

---

## 7. O que deliberadamente não existe ainda

Nada disto é esquecimento; é sequenciamento:

- **`gitStatus`** — reservado no protocolo (nome do comando), sem payload nem
  implementação. Os outros quatro (`status`, `find`, `listFiles`, `shareFile`)
  já funcionam.
- **Modelo de confirmação por classe de ação** — o tipo `cmd.confirm` está
  reservado, mas não existe fluxo nenhum. Continua não sendo urgente: `status`,
  `find` e `listFiles` são leitura pura, e `shareFile` (mesmo zipando) não
  altera nada na origem — a regra do `00_DECISOES.md` ("leitura simples → sem
  confirmação"; "cópia/compartilhamento → sem confirmação, não altera a
  origem") já cobre os quatro. Fica urgente quando a primeira ação que
  *altera* algo (mover, sobrescrever, deletar) entrar em cena.
- **Contexto de conversa geral** — o `find` introduziu uma fatia **mínima**
  (pergunta pendente, um slot por número — ver 4.5/4.5.1), hoje compartilhada
  por `find`/`listFiles`/`shareFile`, mas isso não é o sistema geral de
  referência: `"e o outro?"` ou `"aquele projeto"`, ditos sem uma pergunta
  pendente explícita em aberto, ainda não são resolvidos.
- **Múltiplos comandos por mensagem** — pedir duas coisas numa frase só
  ("acha o projeto X e me diz o git dele") ainda vira uma intenção só. Combinar
  só faz sentido testar quando houver comportamento composto real para
  validar.
- **Listagem/zip recursivos** — `listFiles` e o índice de `find` são
  deliberadamente rasos (um nível). `shareFile` zipa uma pasta inteira
  recursivamente (isso já é necessário — um zip de projeto sem subpastas não
  serviria pra nada), mas **listar** o conteúdo continua raso por escolha.
- **Rodar como serviço do SO** (`node-windows`/`launchd`/`systemd`) → Fatia 6.
  Hoje roda em terminal aberto mesmo.
- **Pareamento formal por máquina** — hoje é um único `PAIRING_SECRET`
  compartilhado por todos os agentes (ver a ressalva de segurança no
  `INSTALACAO.md`).

---

## 8. Histórico de fatias

O que cada fatia acrescentou ao funcionamento descrito acima. Entradas antigas
não são apagadas quando uma fatia nova chega — o que muda é a seção
correspondente, e a linha aqui registra quando mudou.

| Fatia | O que entrou | Seções afetadas |
|---|---|---|
| **1 — Esqueleto Andante** | Transporte completo: Baileys, servidor WebSocket, registro de agentes, `status` por comparação de string fixa | 1 a 7 |
| **1 (correção)** | Extração robusta do número do remetente: `@lid` via `senderPn` + normalização do 9º dígito BR | 4.1 |
| **2 — Linguagem natural** | Camada de interpretação (`intent.ts`) com saída estruturada; placeholders de contrato (`cmd.confirm`, `find`, `gitStatus`, `listFiles`, `shareFile`) | 4, 4.2, 5, 7 |
| **2 (troca de provedor)** | Anthropic → OpenRouter com modelo gratuito, por falta de créditos. Só `intent.ts` mudou — o isolamento do módulo se pagou | 4.2 |
| **2 (correção pós-uso real)** | Modelo trocado para `gemma-4-26b` (o anterior ignorava o schema); prompt reescrito com regra explícita e sinônimos; guarda de enum passou a falhar alto em vez de devolver `unknown`; retry em resposta vazia; benchmark `bench:intent` | 4.2, 4.3 |
| **2 (5 protocolos)** | Interpretação estendida a `find`/`gitStatus`/`listFiles`/`shareFile`, com campo `alvo`; resposta própria por protocolo reconhecido mas não implementado. Medido 22/24 no gemma | 4, 4.2.1, 4.3 |
| **2 (troca para Groq)** | OpenRouter → Groq, por limite diário (50→~1.000). Modelo padrão `gpt-oss-120b`, modo estrito. Retry estendido ao 400 transitório do Groq. Medido: **24/24 intenção, 17/17 alvo** | 4.2, 4.3 |
| **Find real** | Contrato virou união discriminada (`FindRequestPayload`/`FindResponsePayload`/`FindMatch`); índice local por agente (`fileIndex.ts`); `wsServer` generalizado para comando arbitrário; pergunta pendente (`pendingQuestions.ts`) — a primeira fatia de contexto de conversa, escopada ao mínimo que o `find` precisa. Medido: `npm run smoke:find`, 22 checks, todos passam | 4.4, 4.5, 5, 6, 7 |
| **Find (primeiro uso real)** | Dois bugs achados testando contra a pasta real do usuário (não os diretórios sintéticos do smoke test): `.env` com o placeholder do `.env.example` nunca editado, e normalização sem tratar espaço/underscore/hífen/ponto como equivalentes. Ambos corrigidos | 4.4 |
| **Find (segundo uso real)** | Arquivos soltos na raiz não eram indexados (só pastas); a normalização por separador da correção anterior abriu um falso positivo (`.rar` batendo na pasta de nome parecido). `FindMatch` ganhou `kind: "folder"\|"file"`; arquivos passaram a ser indexados; ramo de pontuação frágil removido | 4.4 |
| **listFiles + shareFile** | Protocolo ganhou `ListFilesRequestPayload`/`ShareFileRequestPayload` e respostas correspondentes; `listFiles` (listagem rasa) e `shareFile` (arquivo único, ou zip de pasta respeitando `.gitignore` + `node_modules`/`.git`, com teto de tamanho via `AGENT_MAX_FILE_MB`) implementados no agente; `AgentRegistry` ganhou comando direcionado a um nick específico; `PendingQuestions` generalizada (`kind`/`acao`) para as 3 ações que resolvem alvo por busca; `whatsapp.ts` ganhou `enviarArquivo` (documento, não só texto). `archiver` fixado em `7.0.1` (a v8 é ESM puro, incompatível com o `commonjs` do projeto). Medido: `npm run smoke:files`, zip aberto de verdade para confirmar exclusão | 4, 4.5.1, 4.6, 4.7, 5, 6, 7 |

---

*Documento criado na Fatia 1, atualizado na Fatia 2, na etapa de `find` real e
na etapa de `listFiles`/`shareFile`. Deve ser atualizado — não ignorado, e não
reescrito do zero — a cada fatia que mudar o funcionamento descrito aqui.*
