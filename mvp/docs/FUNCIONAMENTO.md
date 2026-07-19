# Funcionamento — MVP do Impetus

### mvp/docs/

Como as peças do MVP funcionam por dentro. Documento técnico, escrito para quem
vai mexer no código. Quem só quer usar o Impetus pelo WhatsApp deve ler o
`MANUAL.md`; quem vai instalar, o `INSTALACAO.md`.

Estado atual: **Fatia 1 — Esqueleto Andante**. Só existe o transporte, com um
único comando fixo (`status`). Não há interpretação de linguagem natural, nem
acesso a arquivos, nem git. Isso é deliberado — ver a seção final.

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
3. O `brain` descarta a mensagem se: for do próprio bot, não for conversa direta
   (grupos ficam fora nesta fatia), ou **o número não estiver em
   `WHATSAPP_ALLOWED_NUMBERS`**. Número não autorizado é ignorado em **silêncio
   absoluto** — sem resposta, e sem logar o conteúdo. Responder qualquer coisa
   confirmaria a existência do bot para quem não deveria saber dele.
4. O texto é normalizado (`trim` + `toLowerCase`). Se não for exatamente
   `status`, é ignorado com um log. (Linguagem natural é a Fatia 2.)
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

Os seis tipos existentes nesta fatia: `register`, `registered`, `heartbeat`,
`heartbeat_ack`, `cmd.request`, `cmd.response`.

O campo `id` é o que permite ter vários comandos em voo ao mesmo tempo sem
embaralhar respostas — o cérebro guarda um `Map<id, quem está esperando>` e
resolve pela chave quando a resposta chega.

---

## 6. Estado e persistência

**Não há banco de dados. Não há fila. Não há persistência de estado.**

O registro de agentes conectados é um `Map<nick, WebSocket>` em memória. Se o
cérebro reiniciar, o `Map` se perde — e isso é aceitável, porque os agentes
reconectam sozinhos e se re-registram em segundos.

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

- **Interpretação de linguagem natural / API da Anthropic** → Fatia 2. Só faz
  sentido construir depois que o transporte estiver provado em ambiente real.
- **Qualquer acesso ao sistema de arquivos** (índice, busca, git, zip).
- **Modelo de confirmação por classe de ação** — não existe ação de risco ainda.
- **Rodar como serviço do SO** (`node-windows`/`launchd`/`systemd`) → Fatia 6.
  Hoje roda em terminal aberto mesmo.
- **Pareamento formal por máquina** — hoje é um único `PAIRING_SECRET`
  compartilhado por todos os agentes (ver a ressalva de segurança no
  `INSTALACAO.md`).

---

*Documento gerado na execução da Fatia 1. Deve ser atualizado — não ignorado —
a cada fatia que mudar o funcionamento descrito aqui.*
