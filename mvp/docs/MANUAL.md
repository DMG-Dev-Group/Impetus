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

Ele **entende** cinco tipos de pedido, e já **faz de verdade** quatro deles:

| Você pede | Ele hoje |
|---|---|
| Quais máquinas estão no ar | ✅ **responde de verdade** |
| Achar um projeto ou pasta | ✅ **responde de verdade** |
| Listar arquivos de uma pasta | ✅ **responde de verdade** |
| Receber um arquivo (ou zipar e mandar) | ✅ **responde de verdade** |
| Estado do git (branch, o que mudou) | reconhece e avisa que ainda não faz |

No único que falta, a resposta é assim:

> Entendi: você quer ver o estado do git de um projeto — "Flora".
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

## Achar um projeto, pasta ou arquivo

**O que faz:** procura em todas as máquinas conectadas — **não só pastas de
projeto, também arquivos soltos** (ex.: um `.rar`, um `.pdf` que esteja junto
das pastas) — e diz onde está: em qual máquina, o caminho completo, e (só para
pasta) se é um repositório git e quando foi modificado pela última vez.

Ele só enxerga o que está **direto dentro** das pastas configuradas — não entra
procurando dentro de cada projeto. Achar um arquivo específico *dentro* de um
projeto (ex.: um relatório dentro da pasta do Flora) ainda não está pronto.

**Como pedir:** também naturalmente. Todas estas funcionam:

- `onde está o projeto Flora?`
- `acha a pasta do site da DMG`
- `cadê o Tendresse`
- `você tem o projeto X aí?`
- `localiza o dmg saas`

**Não precisa saber o nome exato.** O Impetus procura por aproximação — `flora`
encontra `FloraBeauty`, `dmg saas` encontra `DMG_SaaS`, etc.

### O que esperar de resposta

**Achou exatamente um:**

```
Achei: FloraBeauty — PC-Daniel
C:\Users\Daniel\Documents\Codes\DMG\FloraBeauty
é um repositório git, última modificação em 21/07/2026.
```

**Achou mais de um** (mesmo nome existe em mais de uma máquina, ou mais de um
projeto parecido) — o Impetus pergunta qual, numerado:

```
Achei mais de um projeto parecido com "flora":

1. FloraBeauty — PC-Daniel (C:\...\FloraBeauty)
2. Flora-Docs — PC-Guilherme (C:\...\Flora-Docs)

Responda com o número ou o nome, pra eu saber qual.
```

Você pode responder **`1`**, **`2`**, ou até só **`flora-docs`** — qualquer um
dos três funciona. Essa resposta **precisa vir logo em seguida**: se você
demorar mais de alguns minutos ou mandar outra coisa antes, o Impetus esquece a
pergunta e trata sua próxima mensagem como um pedido novo.

**Não achou nada:**

```
Não encontrei nenhum projeto parecido com "xyz" em nenhuma máquina conectada.
```

**Você pediu sem dizer o quê** (`"acha o projeto"`, sem nome) — o Impetus
pergunta de volta:

```
Qual projeto ou pasta você quer localizar?
```

E sua próxima mensagem — só o nome, sem precisar repetir "acha" — já é a busca.

---

## Listar o que tem numa pasta

**O que faz:** mostra o conteúdo de uma pasta — um nível só, pastas primeiro
(marcadas com `/`), depois arquivos com o tamanho. Não entra dentro de
subpastas — se quiser ver o que tem dentro de uma subpasta, peça por ela
especificamente.

**Como pedir:**

- `lista o que tem na pasta Flora`
- `o que tem dentro do projeto X?`
- `mostra o conteúdo da pasta Y`

Se você não disser qual pasta, ou o nome bater em mais de uma, o Impetus
pergunta de volta — exatamente como já faz pra "achar um projeto" (ver acima):
mesma pergunta, mesma forma de responder (número ou nome).

### O que esperar de resposta

```
FloraBeauty — PC-Daniel:

src/
node_modules/
README.md (2.1 KB)
package.json (512 B)
```

**Se você pedir a listagem de um ARQUIVO** (não pasta):

```
"relatorio.pdf" é um arquivo, não uma pasta — não tem conteúdo pra listar.
```

Nesse caso, o que você provavelmente queria é **receber** o arquivo — ver a
próxima seção.

---

## Receber um arquivo ou pasta

**O que faz:** manda de volta, pelo próprio WhatsApp, um arquivo específico ou
uma pasta inteira. **Se você pedir uma pasta em vez de um arquivo, o Impetus
zipa ela antes de mandar** — automaticamente, sem precisar pedir "zipa" à
parte.

**Como pedir:**

- `me manda o relatorio.pdf`
- `zipa o projeto Flora e manda`
- `quero receber a pasta do site da DMG`
- `me envia aquele arquivo`

Assim como nos outros dois, se faltar dizer o quê, ou o nome for ambíguo, o
Impetus pergunta de volta.

### O que esperar de resposta

**Pedindo um arquivo específico:**

```
Mandando relatorio.pdf...
```

...seguido do arquivo de verdade, anexado na conversa.

**Pedindo uma pasta:**

```
Mandando FloraBeauty.zip...
```

...seguido do `.zip` da pasta. O zip **não leva** `node_modules`, `.git`, nem
qualquer outra coisa que o `.gitignore` da própria pasta exclua — só o que
faria sentido compartilhar.

**Se o arquivo (ou a pasta zipada) for grande demais:**

```
Não consegui enviar: arquivo tem 45.2MB, acima do limite de 20.0MB
```

Existe um teto de tamanho (configurável por quem administra o agente) — pra
não travar tentando mandar algo grande demais pra caber numa mensagem de
WhatsApp.

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

**Ele perguntou qual eu quis dizer, e eu demorei pra responder / mandei outra
coisa.**
A pergunta expira sozinha depois de alguns minutos. Se isso acontecer, é só
pedir de novo — não tem problema nenhum, ele só descarta a pergunta antiga e
trata sua mensagem seguinte como um pedido novo.

---

## O que o Impetus **não** faz hoje

Para não gerar expectativa errada:

- **Ver o estado do git** de um projeto — ele *entende* o pedido, mas ainda não
  *executa*. Os outros quatro (status, achar, listar, receber/zipar arquivo) já
  funcionam de verdade.
- **Lembrar do que você falou várias mensagens atrás.** A única exceção é
  quando o próprio Impetus faz uma pergunta (ex.: "qual desses?", "qual
  projeto?") — aí sua resposta imediata é entendida. Fora isso, cada mensagem é
  lida isolada: `"e o outro?"` ou `"aquele projeto"`, ditos do nada, não
  funcionam — repita o que quer dizer por extenso.
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
| Find real | Achar projeto/pasta passou a funcionar de verdade — não só "entender", executa. Ganhou a capacidade de perguntar de volta ("qual desses?", "qual projeto?") e entender a resposta imediata a essa pergunta específica. |
| Find (uso real) | Passou a achar também arquivo solto (não só pasta de projeto) — ex. um `.rar` do lado das pastas. |
| listFiles + shareFile | Listar o conteúdo de uma pasta, e receber um arquivo (ou pasta zipada automaticamente) pelo próprio WhatsApp, passaram a funcionar de verdade — só "estado do git" continua faltando dos cinco tipos de pedido. |

---

*Manual atualizado na etapa de `listFiles`/`shareFile`. Cresce a cada fatia
nova — entradas antigas ficam no histórico acima, não são apagadas.*
