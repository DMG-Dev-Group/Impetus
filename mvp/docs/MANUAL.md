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

## Fale naturalmente

**Você não precisa decorar comando.** Escreva como escreveria para um colega —
com gíria, sem acento, com erro de digitação, frase curta. O Impetus lê e entende
a intenção.

## O que ele faz hoje

**Uma coisa, de verdade: dizer quais máquinas estão ligadas.**

Mas ele **entende** cinco tipos de pedido, e responde de forma diferente conforme
o caso:

| Você pede | Ele hoje |
|---|---|
| Quais máquinas estão no ar | ✅ **responde de verdade** |
| Achar um projeto ou pasta | reconhece e avisa que ainda não faz |
| Estado do git (branch, o que mudou) | reconhece e avisa que ainda não faz |
| Listar arquivos de uma pasta | reconhece e avisa que ainda não faz |
| Receber um arquivo (ou zipar e mandar) | reconhece e avisa que ainda não faz |

Nos quatro últimos, a resposta é assim:

> Entendi: você quer localizar um projeto ou pasta — "Flora".
>
> Isso ainda não está pronto — vem numa próxima etapa do Impetus.

Isso é diferente de `"Ainda não sei fazer isso."` — aqui ele **entendeu** seu
pedido, só falta a ação existir. Se ele repetiu de volta o que você quis dizer, a
interpretação funcionou.

---

## Ver as máquinas conectadas

**O que faz:** lista quais máquinas do time estão conectadas ao Impetus agora, e
há quanto tempo cada uma está no ar.

**Como pedir:** do jeito que for natural pra você. Todas estas funcionam:

- `status`
- `quais máquinas estão online?`
- `quem tá ligado agora`
- `o PC do Daniel tá no ar?`
- `me dá um resumo das máquinas`

Maiúscula, minúscula, acento e pontuação não importam. A palavra `status` continua
funcionando exatamente como antes — ela não deixou de valer, só deixou de ser a
única forma.

> **Se ele não entender, ele diz.** Quando a frase não é clara, o Impetus prefere
> responder `"Ainda não sei fazer isso."` a chutar. Isso é de propósito: é melhor
> ele admitir que não entendeu do que executar algo que você não pediu. Se
> acontecer com um pedido que deveria funcionar, reformule mais direto — e avise
> quem cuida do Impetus, porque dá pra ajustar.

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

## Uma coisa que você precisa saber

**Para entender sua frase, o Impetus manda o texto dela para um serviço externo**
(o Groq, que roda o modelo de linguagem). Isso vale para **toda** mensagem que
você mandar — inclusive as que ele não sabe atender.

Consequência prática: **não mande pelo Impetus nada que você não mandaria para
fora da empresa** — senha, chave de API, dado de cliente, informação sigilosa. Ele
não é um canal interno fechado.

O que ele *não* manda para fora: nome das máquinas, uptime, e qualquer coisa que
os agentes locais leiam. Só o texto da sua mensagem sai.

---

## Coisas que vão acontecer (e são normais)

**Ele respondeu `"Ainda não sei fazer isso."`**
Significa que o pedido não se encaixou em nenhum dos cinco tipos que ele conhece —
por exemplo `"cria um repositório"`, `"apaga a pasta X"` ou conversa fiada. Se
você acha que deveria ter se encaixado, tente ser mais direto e avise quem cuida
do Impetus: dá para medir e ajustar.

**Ele respondeu `"Entendi: você quer... Isso ainda não está pronto"`**
Correto e esperado. Ele entendeu certo; a ação é que ainda não foi construída.
Até a Fatia 1 ele ignorava em silêncio; agora você sabe que a mensagem chegou e
foi compreendida.

**Ele respondeu `"Deu erro aqui do meu lado ao processar isso."`**
Isso é diferente de `"Ainda não sei fazer isso."` — significa que o Impetus não
conseguiu nem interpretar sua mensagem. Não é você. As causas comuns:

- **Acabou a cota do dia.** O serviço que interpreta as frases é gratuito e tem
  teto diário somando o time todo (hoje na casa de ~1.000 mensagens/dia). Difícil
  de bater no uso normal, mas possível.
- Problema de configuração ou de rede do lado dele.

Nos dois casos, avise quem cuida do Impetus — o log dele diz qual foi.

**Ele entendeu errado o que eu pedi.**
Acontece, especialmente com frases muito curtas ou ambíguas. Tente ser mais
direto (`"quais máquinas estão online?"`). Se um pedido que deveria funcionar
falha de forma consistente, avise — dá para medir e ajustar.

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

Para não gerar expectativa errada:

- **Achar, listar, mandar ou zipar arquivo, e ver git** — ele *entende* esses
  pedidos, mas ainda não *executa* nenhum deles.
- **Lembrar do que você falou na mensagem anterior.** Cada mensagem é lida
  isolada, então `"e o outro?"` ou `"aquele projeto"` não funcionam — repita o
  que quer dizer por extenso.
- Funcionar em grupo — só conversa direta com o número do Impetus.
- Qualquer coisa fora desses cinco tipos: criar repositório, apagar arquivo,
  instalar programa, mandar email.

---

## Histórico

| Fatia | O que mudou pra quem usa |
|---|---|
| 1 | Só a palavra exata `status`. Qualquer outra mensagem era ignorada em silêncio. |
| 2 | Passou a entender pedido em linguagem natural, e a responder `"Ainda não sei fazer isso."` em vez de ficar mudo. A partir daqui, o texto das suas mensagens passa por um serviço externo — ver a seção acima. |
| 2 (ampliação) | Passou a entender cinco tipos de pedido (máquinas, achar, git, listar, receber arquivo) e a repetir de volta o que entendeu quando a ação ainda não existe. |

---

*Manual atualizado na Fatia 2. Cresce a cada fatia nova — entradas antigas ficam
no histórico acima, não são apagadas.*
