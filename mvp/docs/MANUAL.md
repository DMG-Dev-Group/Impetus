# Manual — Impetus pelo WhatsApp

### mvp/docs/

Este é o manual de quem **usa** o Impetus mandando mensagem. Não tem nada de
técnico aqui. Se você quer instalar, veja o `INSTALACAO.md`.

---

## O que o Impetus é

Você conversa com **um** Impetus, não com o agente de cada PC. Por baixo, ele
está conectado às máquinas do time — mas do seu lado é uma conversa só, com um
número de WhatsApp só.

---

## O que dá pra fazer hoje

**Um comando: `status`.**

Sim, só isso. Esta é a primeira fatia do projeto, e ela existe para provar que o
caminho todo funciona — sua mensagem sai do WhatsApp, chega no cérebro central,
ele pergunta pras máquinas, e a resposta volta pra você. Comandos úteis de
verdade (achar projeto, ver status de git, zipar pasta) vêm nas fatias seguintes,
e só fazem sentido depois que este caminho estiver provado.

---

## `status`

**O que faz:** lista quais máquinas do time estão conectadas ao Impetus agora, e
há quanto tempo cada uma está no ar.

**Como mandar:** só a palavra `status`. Maiúscula, minúscula e espaço sobrando
não importam — `status`, `STATUS` e ` Status ` funcionam igual.

### O que esperar de resposta

**Quando tem máquina conectada:**

```
PC-Daniel — online há 12 min
PC-Guilherme — online há 3h 40min
```

Uma linha por máquina. O tempo é **desde que o Impetus subiu naquela máquina** —
não desde que a máquina ligou. Se alguém reiniciou o Impetus no PC dela há 2
minutos, vai aparecer "há 2 min" mesmo que o computador esteja ligado desde
manhã.

**Quando não tem ninguém conectado:**

```
Nenhuma máquina conectada no momento.
```

Isso é normal fora do horário de trabalho — os agentes rodam nas máquinas das
pessoas, e máquina desligada (ou suspensa) não responde. Não é erro.

**Quando uma máquina não responde a tempo:**

```
PC-Daniel — online há 12 min
PC-Guilherme — sem resposta
```

`sem resposta` significa que a máquina estava conectada, mas não respondeu em 5
segundos. Costuma acontecer quando a máquina acabou de entrar em suspensão, ou
está com a rede muito ruim. Manda `status` de novo daqui a pouco.

---

## Coisas que vão acontecer (e são normais)

**Mandei outra coisa e o Impetus não respondeu nada.**
Correto. Hoje ele só entende `status`. Qualquer outra mensagem é ignorada, sem
resposta. Ele ainda não sabe conversar — isso é a Fatia 2.

**Mandei do meu número e não veio nada.**
Só números autorizados podem mandar comando. Se o seu não estiver na lista, o
Impetus ignora **em silêncio** — de propósito, ele não responde nem pra dizer
"você não tem permissão". Fale com quem administra o cérebro central para ser
incluído.

**Uma máquina sumiu da lista.**
A pessoa fechou o Impetus, desligou o PC, ou a máquina suspendeu. Quando ela
voltar, reconecta sozinha e aparece de novo — ninguém precisa fazer nada.

**Mandei `status` e demorou uns segundos.**
Esperado. O cérebro pergunta pra todas as máquinas e espera até 5 segundos pelas
respostas antes de te responder.

---

## O que o Impetus **não** faz hoje

Para não gerar expectativa errada — nada disto existe ainda:

- Entender frase solta ("me vê como tá o PC do Daniel") — só a palavra `status`.
- Achar, ler, mandar ou zipar arquivo.
- Falar qualquer coisa sobre git (branch, commit, alterações).
- Lembrar do que você falou na mensagem anterior.
- Funcionar em grupo — só conversa direta com o número do Impetus.

---

*Manual da Fatia 1. Cresce a cada fatia nova.*
