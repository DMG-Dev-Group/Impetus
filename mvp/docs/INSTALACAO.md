# Instalação — MVP do Impetus (Fatia 1)

### mvp/docs/

Como colocar o Impetus de pé: o cérebro central em uma máquina, e um agente em
cada máquina do time.

**Nesta fatia tudo roda em terminal aberto.** Subir como serviço do sistema
operacional (liga junto com a máquina, sem terminal) é a Fatia 6. Por enquanto,
se o terminal fechar, o processo morre.

---

## 0. Pré-requisitos

- **Node.js 20 ou superior** em todas as máquinas (`node --version`).
- Um **número de WhatsApp dedicado ao Impetus**. Não use o número pessoal de
  ninguém — o Baileys registra o cérebro como um aparelho conectado dessa conta.
- Para rodar em máquinas diferentes: o cérebro precisa estar num endereço
  alcançável pelas outras (IP público, domínio, ou pelo menos a mesma rede
  local). Os agentes não precisam de endereço nenhum — eles ligam para fora.

---

## 1. Instalar as dependências

Uma vez só, na raiz de `mvp/`:

```bash
cd mvp
npm install
```

Isso resolve os três workspaces (`protocol`, `brain`, `agent`) de uma vez.

---

## 2. Escolher o PAIRING_SECRET

O `PAIRING_SECRET` é o que impede qualquer um de conectar um agente no seu
cérebro. Ele precisa ser **exatamente igual** no cérebro e em todos os agentes.

Gere um valor aleatório e longo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Guarde o resultado — você vai colar ele em vários `.env`.

> **Ressalva honesta:** nesta fatia é **um secret só, compartilhado por todos os
> agentes**. Quem tem o secret pode registrar uma máquina com qualquer nick.
> Isso é aceitável no cenário atual (time pequeno, ambiente controlado, sem
> exposição pública) e está registrado como simplificação consciente. Secret por
> máquina é evolução prevista, não esquecimento.

---

## 3. Subir o cérebro central

Na máquina que vai ficar sempre ligada:

```bash
cd mvp/apps/brain
cp .env.example .env
```

Edite o `.env`:

```bash
WS_PORT=8080
PAIRING_SECRET=<o valor que você gerou no passo 2>
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b
WHATSAPP_ALLOWED_NUMBERS=5598900000000,5598911111111
```

> **`GROQ_API_KEY` e `GROQ_MODEL` são novidade da Fatia 2.** Se você
> instalou o Impetus antes dela, são as únicas variáveis que precisa acrescentar
> ao `.env` que já existe — as outras três continuam iguais. Veja como obtê-las
> logo abaixo.
>
> **Histórico de provedores** (se você configurou o Impetus em versões
> anteriores): a interpretação já usou `ANTHROPIC_API_KEY` (Anthropic) e depois
> `OPENROUTER_API_KEY` (OpenRouter). **Ambas podem ser removidas** — o Impetus
> passou a usar o Groq, e essas variáveis não são mais lidas. A troca foi feita
> porque o Groq tem tier gratuito muito mais generoso (ver o limite abaixo).

**Sobre `WHATSAPP_ALLOWED_NUMBERS`:** números separados por vírgula, formato
internacional, **só dígitos** — sem `+`, sem espaço, sem parêntese, sem traço.
Um número brasileiro fica `55` + DDD + número. Quem não estiver nessa lista é
ignorado em silêncio.

> **Celular brasileiro: tanto faz com ou sem o 9º dígito.** `5598981908366` e
> `559881908366` são tratados como a mesma linha — o Impetus normaliza os dois
> lados antes de comparar. Isso é necessário porque o WhatsApp nem sempre entrega
> o número na mesma forma em que ele foi digitado aqui.

### Obter a `GROQ_API_KEY` (Fatia 2 em diante)

É ela que permite ao Impetus **entender frases**, em vez de só reconhecer a
palavra exata `status`. O Groq roda modelos de linguagem com um tier gratuito
generoso — que é o que o Impetus usa por padrão.

1. Crie conta em <https://console.groq.com/> (login com Google ou GitHub serve).
2. Vá em <https://console.groq.com/keys> → **Create API Key**, dê um nome
   (ex.: `impetus-brain`) e copie o valor. Começa com `gsk_` e **só aparece
   uma vez** — se perder, gere outra.
3. Cole no `.env` do `brain`, em `GROQ_API_KEY`.

**Não precisa cadastrar cartão** para o tier gratuito.

#### Limite diário

O tier gratuito do Groq é **por conta, não por pessoa**, e varia por modelo:

| Modelo | Por minuto | Por dia |
|---|---|---|
| `openai/gpt-oss-120b` (padrão) | 30 | ~1.000 |
| `openai/gpt-oss-20b` | 30 | maior (o 20b tem cota mais folgada) |

**Cada mensagem mandada ao Impetus consome uma requisição** — inclusive as que ele
não sabe atender, porque a interpretação acontece antes de qualquer decisão. Ainda
assim, ~1.000/dia é **20× o que o provedor anterior (OpenRouter) dava de graça**, e
folgado para o uso de um time pequeno.

Quando estoura, o Impetus responde `"Deu erro aqui do meu lado"` em toda mensagem
até o limite virar, e o log mostra `429 Rate limit exceeded`. Os limites exatos da
sua conta ficam em <https://console.groq.com/settings/limits>.

#### ⚠️ Privacidade: leia antes de usar em conversa real

O texto de **toda mensagem** que chega de um número autorizado é enviado ao Groq
para ser interpretado. As mensagens são conversa interna do time — então, antes de
usar com conteúdo real, **confira a política de dados do Groq** em
<https://groq.com/privacy-policy/> e nas configurações da conta.

Isso não é burocracia: o `manifesto-impetus.md` (Seção VII) trata **propriedade
do dado pelo usuário** como princípio inviolável. Mandar conversa da equipe para
um terceiro contradiz isso se o terceiro usar esse conteúdo. A decisão de aceitar
ou não o risco é do time — mas precisa ser consciente, não acidental. (Vale o
mesmo alerta que já valia para o OpenRouter: nenhum tier gratuito de LLM está
isento dessa análise.)

#### Trocar de modelo

`GROQ_MODEL` é opcional; sem ela vale o padrão `openai/gpt-oss-120b`.

**O modelo escolhido precisa suportar saída estruturada em MODO ESTRITO** — é isso
que garante que a resposta venha como JSON válido em vez de texto solto. No Groq,
**apenas `openai/gpt-oss-120b` e `openai/gpt-oss-20b`** têm modo estrito (via
*constrained decoding*, que força o formato do schema).

- **`gpt-oss-120b`** (padrão) — prioriza qualidade de classificação.
- **`gpt-oss-20b`** — cota diária maior, modelo menor. Alternativa se a cota
  apertar, ao custo de possível queda na qualidade.

> **Sempre valide ao trocar de modelo.** Rode o benchmark:
>
> ```bash
> GROQ_MODEL="openai/gpt-oss-20b" npm run bench:intent
> ```
>
> Ele passa 24 frases (nenhuma copiada do prompt) e mostra acerto de intenção e
> de alvo. **Consome 24 requisições** — folgado no limite do Groq, mas conte.
>
> Por que insistir nisso: no provedor anterior, o `gpt-oss-20b` **aparecia como
> compatível e na prática ignorava o schema**. O modo estrito do Groq usa um
> mecanismo diferente que deve corrigir isso — mas "deve" não é "foi medido".

Se um modelo não respeitar o schema, o sintoma é o Impetus responder
`"Deu erro aqui do meu lado"` em toda mensagem, com o log dizendo
`não respeitou o schema` e mostrando o que veio.

#### Outros cuidados

- **Nunca versione a chave no git.** Ela vive só no `.env`, que já está no
  `.gitignore` — do mesmo jeito que o `PAIRING_SECRET` e a pasta `auth_info/`.
- **Sem a chave o cérebro sobe normalmente**, conecta no WhatsApp e aceita
  agentes — mas toda mensagem recebida falha na interpretação e responde erro. Se
  o `status` parou de funcionar depois de atualizar, é o primeiro lugar a olhar.

Suba:

```bash
npm run dev
```

### Escanear o QR

Na primeira vez, vai aparecer um QR code no terminal. No celular do número
dedicado do Impetus:

**WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho →**
aponte para o QR no terminal.

Deu certo quando o terminal loga:

```
[whatsapp] conectado ao WhatsApp
```

As credenciais ficam salvas na pasta `apps/brain/auth_info/`. **Nas próximas
vezes não vai pedir QR de novo** — ele reconecta sozinho.

> Se precisar reconectar do zero (trocou de número, ou o WhatsApp deslogou a
> sessão), apague a pasta `auth_info/` e suba de novo para gerar um QR novo.
>
> Nunca versione `auth_info/` no git — é credencial de acesso à conta de
> WhatsApp. Ela já está no `.gitignore`.

### Se o cérebro estiver em outra máquina/nuvem

A porta do `WS_PORT` (8080) precisa estar **aberta para entrada** e alcançável
pelos agentes. Isso significa liberar no firewall da máquina e, em VPS
(ex.: Oracle Cloud Always Free), também nas regras de rede do painel do provedor.

Teste rápido, de outra máquina:

```bash
curl -v telnet://SEU_IP:8080
```

Se não conectar, o problema é firewall — resolva isso antes de mexer no agente.

---

## 4. Subir um agente local

Em **cada** máquina do time:

```bash
cd mvp/apps/agent
cp .env.example .env
```

Edite o `.env`:

```bash
WS_BRAIN_URL=ws://IP-OU-DOMINIO-DO-CEREBRO:8080
AGENT_NICK=PC-Daniel
PAIRING_SECRET=<o MESMO valor do cérebro>
```

Três cuidados:

- **`WS_BRAIN_URL`** é `ws://` (não `http://`). Em teste na mesma máquina,
  `ws://localhost:8080`. Em máquinas diferentes, o IP ou domínio real do cérebro
  — `localhost` aqui aponta para a própria máquina do agente e não vai funcionar.
- **`AGENT_NICK`** é o nome que aparece na resposta do WhatsApp. Precisa ser
  **único entre as máquinas**. Se dois agentes usarem o mesmo nick, o segundo a
  registrar derruba a conexão do primeiro.
- **`PAIRING_SECRET`** tem que bater com o do cérebro, caractere por caractere.

Suba:

```bash
npm run dev
```

Deu certo quando o agente loga:

```
[agent] registrado como "PC-Daniel"
```

...e o cérebro loga, do outro lado:

```
[ws] agente registrado: PC-Daniel (total conectados: 1)
```

---

## 5. Testar duas máquinas na mesma máquina

Antes de sair instalando em PCs de verdade, dá para simular dois agentes em dois
terminais, sem duplicar o projeto — basta sobrescrever o nick na linha de comando:

```bash
# terminal 1
cd mvp/apps/agent && npm run dev

# terminal 2 (Linux/macOS/Git Bash)
cd mvp/apps/agent && AGENT_NICK=PC-Teste npm run dev

# terminal 2 (PowerShell)
cd mvp/apps/agent; $env:AGENT_NICK="PC-Teste"; npm run dev
```

Depois manda `status` no WhatsApp: devem aparecer as duas linhas.

Há também um teste automático que exercita o transporte inteiro (registro,
secret inválido, status, desconexão, reinício do cérebro com reconexão, timeout)
sem depender do WhatsApp:

```bash
cd mvp
npm run smoke
```

---

## 6. Checklist de validação

### Fatia 1 — transporte

Os sete critérios de aceite, na ordem em que convém testar:

1. `npm install` na raiz de `mvp/` resolve os três workspaces sem erro.
2. `npm run dev` no `brain` sobe, mostra o QR, e loga `conectado ao WhatsApp`
   depois de escaneado.
3. `npm run dev` no `agent` conecta e registra; o `brain` loga a conexão.
4. Um segundo agente, com outro `AGENT_NICK`, também conecta e registra.
5. `status` pelo número autorizado retorna as duas máquinas com seus uptimes.
6. Ctrl+C num dos agentes → `status` de novo não lista mais aquela máquina.
7. Matar o `brain` e subir de novo → os agentes reconectam sozinhos, sem
   ninguém tocar neles (leva até ~5s por tentativa).

### Fatia 2 — interpretação de linguagem natural

Com a `GROQ_API_KEY` preenchida e pelo menos um agente conectado, mande as
mensagens abaixo pelo WhatsApp. Em cada uma, confira também a linha
`[brain] intencao interpretada: ...` no log do cérebro:

| Mande | Esperado no WhatsApp | Esperado no log |
|---|---|---|
| `status` | a lista de máquinas | `intencao interpretada: status` |
| `quais máquinas estão online?` | a mesma lista | `intencao interpretada: status` |
| `onde está o projeto Flora?` | `Entendi: você quer localizar...` | `find \| alvo: "Flora"` |
| `zipa o projeto X e manda` | `Entendi: você quer enviar...` | `shareFile \| alvo: "X"` |
| `bom dia` | `Ainda não sei fazer isso.` | `intencao interpretada: unknown` |

O segundo caso é o que prova a fatia: uma frase que **não contém a palavra
`status`** precisa chegar no mesmo lugar. O terceiro e o quarto provam a
ampliação: o Impetus reconhece o protocolo e o alvo mesmo sem saber executar.

Se uma frase equivalente cair em `"Ainda não sei fazer isso."`, a interpretação
está funcionando mas classificando mal — o ajuste é no prompt do `intent.ts`, não
no transporte. Meça antes de ajustar:

```bash
npm run bench:intent
```

Ele roda 24 frases (4 por protocolo), nenhuma delas copiada dos exemplos do
prompt — mede generalização, não memória. Reporta acerto de intenção e de
extração de alvo. **Consome 24 requisições** (folgado no limite do Groq).

---

## 7. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `variavel de ambiente X nao definida` | Faltou copiar `.env.example` para `.env`, ou o `.env` está na pasta errada (tem que ser dentro de `apps/brain/` ou `apps/agent/`). |
| Agente encerra com `registro recusado: secret de pareamento invalido` | `PAIRING_SECRET` diferente entre os dois lados. Espaço sobrando ou aspas coladas no `.env` contam como diferença. |
| Agente fica em `conectando... (tentativa N)` sem parar | O cérebro não está no ar, o endereço está errado, ou a porta está fechada no firewall. |
| QR aparece de novo toda vez que sobe | A pasta `auth_info/` não está sendo preservada entre execuções (rodando de outra pasta, ou apagando ela). |
| `status` responde "Nenhuma máquina conectada" com agente rodando | O agente conectou mas não registrou — olhe o log dele, provavelmente o secret. |
| Máquina aparece como `sem resposta` | A máquina suspendeu ou a rede caiu. O cérebro derruba a conexão morta em até 30s e ela some da lista. |
| Mandei `status` e não veio nada | Seu número não está em `WHATSAPP_ALLOWED_NUMBERS`, ou você mandou em grupo (grupos não são atendidos nesta fatia). O 9º dígito **não** é causa — as duas formas são aceitas. |
| Toda mensagem responde `"Deu erro aqui do meu lado"` | Falha na chamada ao Groq. O log do `brain` diz qual — veja as três linhas seguintes. Note que **não** é a mesma coisa que `"Ainda não sei fazer isso."`, que significa que a interpretação funcionou e classificou como fora de escopo. |
| Log: `429 Rate limit exceeded` | Estourou a cota diária da conta Groq. Só volta quando o limite virar. Se acontecer com frequência, troque `GROQ_MODEL` para `openai/gpt-oss-20b` (cota maior). |
| Log: `não respeitou o schema` | O modelo em `GROQ_MODEL` não suporta modo estrito. Use `openai/gpt-oss-120b` ou `openai/gpt-oss-20b`, e valide com `npm run bench:intent`. |
| Log: `resposta vazia ... mesmo após retry` | Instabilidade do modelo gratuito. O código já tenta 2 vezes; se persistir em toda mensagem, troque de modelo. |
| Frases equivalentes a `status` caem em `"Ainda não sei fazer isso."` | Classificação de fato errando. Rode `npm run bench:intent` para medir, e ajuste o prompt em `apps/brain/src/intent.ts` ou troque de modelo. |

---

*Documento gerado na execução da Fatia 1.*
