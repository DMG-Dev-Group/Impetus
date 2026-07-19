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
WHATSAPP_ALLOWED_NUMBERS=5598900000000,5598911111111
```

**Sobre `WHATSAPP_ALLOWED_NUMBERS`:** números separados por vírgula, formato
internacional, **só dígitos** — sem `+`, sem espaço, sem parêntese, sem traço.
Um número brasileiro fica `55` + DDD + número. Quem não estiver nessa lista é
ignorado em silêncio.

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

## 6. Checklist de validação da fatia

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
| Mandei `status` e não veio nada | Seu número não está em `WHATSAPP_ALLOWED_NUMBERS`, ou você mandou em grupo (grupos não são atendidos nesta fatia). |

---

*Documento gerado na execução da Fatia 1.*
