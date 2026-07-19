# Descritivo do MVP — Impetus

### impetus-spec/mvp/

Este documento complementa o `00_DECISOES.md`. Onde o log registra *o quê* foi decidido, este documento explica *como* cada peça funciona e *por quê* foi decidida assim. É um retrato do MVP como está desenhado até aqui — não é o descritivo final do Impetus, que só deve ser escrito depois de testado na prática (ver `01_VISAO.md`).

---

## 1. O que o MVP precisa provar

Antes de entrar em cada peça técnica, vale lembrar o que está sendo validado: que um agente presente nas máquinas do time, acessível por linguagem natural via WhatsApp, consegue reduzir fricção real do dia a dia (achar arquivo, saber status de repositório) sem exigir que ninguém memorize comando ou caminho. Se isso não se provar verdadeiro em uso real da equipe DMG, nenhuma decisão de arquitetura abaixo importa — a Fase 0 existe justamente pra testar essa hipótese antes de generalizar.

---

## 2. Presença: uma entidade, várias máquinas

O Impetus não existe como um programa independente por computador — existe como **uma identidade única**, materializada em duas partes com papéis diferentes:

- **Agentes locais**, um por máquina do time, responsáveis por tudo que exige acesso físico ao disco daquela máquina: ler arquivo, rodar comando git, zipar pasta.
- **Um cérebro central**, hospedado à parte, responsável por receber a mensagem do WhatsApp, entender a intenção por trás dela, decidir a qual máquina (ou máquinas) aquilo se refere, e coordenar a resposta.

Do ponto de vista de quem manda mensagem no WhatsApp, isso é invisível — parece "conversar com o Impetus", não "conversar com o agente do PC de fulano". Essa é a diferença entre "vários assistentes instalados" e "uma entidade comum que conecta máquinas", que foi a exigência original.

Cada máquina recebe um **nick/ID** no momento em que o agente é pareado com ela (ex: `PC-Daniel`, `PC-Guilherme`). Esse nome existe por dois motivos práticos: permite que o usuário especifique diretamente qual máquina quer, quando isso importa ("zipa o projeto X no PC-Daniel"); e permite que o Impetus pergunte de volta, de forma legível, quando não foi especificado e existe ambiguidade ("achei o projeto X em duas máquinas: `PC-Daniel` e `PC-Guilherme` — qual delas?").

**WhatsApp é o primeiro gateway, não o único, e não é o Impetus em si.** Na V2 do MVP, o dashboard (`DMG_SaaS`) passa a ser um segundo gateway, falando com o mesmo cérebro central. Isso só é possível sem retrabalho porque a arquitetura de longo prazo do Impetus já prevê uma camada de Interfaces plural desde o início (`02_ARQUITETURA.md`) — o MVP está, sem querer, validando essa premissa de design mais cedo do que o esperado.

---

## 3. Busca inteligente de arquivos e pastas

O pedido original era claro: ninguém deveria precisar informar caminho de pasta pro Impetus, porque isso contradiz a filosofia de simplicidade. A solução não depende de "a IA adivinhar o sistema de arquivos" — depende de dar à IA um **índice pra consultar**, do mesmo jeito que uma pessoa também não decoraria caminho, mas saberia procurar.

Cada agente local mantém um índice leve das pastas de projeto que reconhece: nome, caminho completo, se é repositório git, data da última modificação. Esse índice é atualizado periodicamente ou reage a mudanças no sistema de arquivos (dependendo de como for implementado).

O fluxo de um pedido como *"quero a pasta de arquivos zipada do projeto X"* é:

1. A camada de linguagem natural (via API da Anthropic) interpreta a frase e a transforma numa chamada de ferramenta estruturada — algo como `{ ação: "zipar", alvo: "X" }`. Esse é o mesmo padrão de *tool use* que ferramentas como o Claude Code já usam — não é coincidência, foi literalmente a origem da ideia do Impetus.
2. O cérebro central (ou o agente local, dependendo de onde o índice vive) busca no índice por correspondência aproximada com "X".
3. **Se achar mais de uma pasta candidata, ou mais de uma máquina candidata, pergunta antes de agir.**
4. **Mesmo se achar exatamente uma correspondência, ainda assim pede confirmação antes de executar** — essa é uma regra deliberada, mais rígida do que "só perguntar quando ambíguo", porque cobre o caso de um erro de correspondência que pareça certo mas não seja.

---

## 4. Reconhecimento de repositório git

Essa função não exige nada exótico — o próprio git já expõe tudo que foi pedido, através de comandos padrão que o agente local executa sobre a pasta (via a biblioteca `simple-git`, em vez de invocar o CLI manualmente linha por linha):

- **É repositório?** Verificação simples: existe uma pasta `.git` ali dentro.
- **Branch atual:** equivalente a `git branch --show-current`.
- **Separação entre alterado e não commitado:** equivalente a `git status` — arquivos modificados, novos (não rastreados) e deletados aparecem em categorias distintas.
- **Última alteração:** aqui existem duas perguntas diferentes que parecem uma só — "quando foi o último commit" (`git log -1`) e "quando foi a última alteração no disco, commitada ou não" (data de modificação do arquivo, `mtime`). O log de decisões marca isso como pendente de confirmação na hora da implementação, porque a resposta certa depende do que o usuário realmente quer saber em cada pergunta.

---

## 5. Modelo de confirmação e segurança

A regra central: **confirmação é exigida quando a ação pode causar dano ao sistema — não como resposta a um medo genérico de ataque externo.** Isso foi uma escolha consciente do usuário: o risco de alguém de fora descobrir o número de WhatsApp e emitir comandos foi avaliado como baixo nesta fase (grupo e contatos restritos, ambiente de teste controlado, projeto sem exposição pública) — então a camada de confirmação não existe para se defender de invasor, existe para evitar que um pedido ambíguo, mal-interpretado ou uma resposta apressada cause um dano que ninguém queria (apagar a pasta errada, sobrescrever algo).

Isso leva a uma tabela de tratamento diferente por tipo de ação, com timeout de confirmação também variando (ações reversíveis toleram mais tempo de espera; ações destrutivas exigem confirmação mais explícita — não basta responder "sim", e o tempo de espera é mais curto, para reduzir a janela em que uma confirmação десcontextualizada poderia ser mal-interpretada):

- Leitura simples → sem confirmação.
- Cópia/compartilhamento (não altera nem apaga nada na origem) → sem confirmação.
- Ação reversível que altera algo (mover, renomear) → confirmação simples, poucos minutos de espera.
- Ação destrutiva ou irreversível (deletar, sobrescrever, git push forçado) → confirmação explícita — o usuário precisa digitar algo específico, não só responder "sim" — com janela de espera mais curta.

Um detalhe prático dentro disso: ao zipar uma pasta, o Impetus não deve incluir artefatos reproduzíveis como `node_modules`. Em vez de fixar essa exclusão como lista hardcoded no código (frágil, porque cada projeto pode ter convenções diferentes), o agente lê o `.gitignore` da própria pasta (usando a biblioteca `ignore`, que já sabe interpretar a sintaxe de `.gitignore`) — reaproveitando uma decisão que o próprio time do projeto já tomou, em vez de duplicá-la.

---

## 6. Contexto de conversa

O usuário descreveu isso como a missão central do Impetus: manter um ambiente conectado numa única direção. Na prática do MVP, isso significa que o cérebro central precisa lembrar, dentro de uma mesma conversa de WhatsApp, a que "ele"/"aquele projeto" se refere, mesmo que tenha sido mencionado mensagens atrás — sem exigir que o usuário repita o nome completo toda vez.

É importante não confundir duas camadas que soam parecidas: esse contexto de conversa é curto prazo e vive por sessão de chat — resolve pronomes e referências recentes. O **Grafo de Contexto** (descrito em `02_ARQUITETURA.md`) é outra coisa: é conhecimento institucional permanente, que sobrevive além de qualquer conversa individual. O MVP precisa da primeira camada pra funcionar bem no dia a dia; a segunda só entra quando o Impetus se conectar de fato ao restante do ecossistema (Fase 1 em diante).

---

## 7. Stack técnica e por quê

**WhatsApp — Baileys, não API oficial.** A API oficial (Meta/Twilio) é o caminho estável e dentro dos termos de uso, mas exige aprovação de conta business e tem custo por mensagem. Baileys é gratuito e não exige aprovação — a troca é operar fora dos termos de uso oficiais, algo aceitável no cenário atual (ambiente de teste controlado, risco de banimento tolerável nesta fase). Entre bibliotecas não-oficiais, Baileys foi preferido a `whatsapp-web.js` porque fala o protocolo do WhatsApp Web diretamente por WebSocket — `whatsapp-web.js` precisa manter um navegador Chromium headless rodando o tempo todo, o que pesa mais num processo que já precisa ficar de pé 24/7.

**Agente local:** Node.js + TypeScript, com `ws` (conexão de saída pro cérebro central), `simple-git` (comandos git sem chamar CLI manualmente), `archiver` (compactação), `ignore` (interpretação de `.gitignore`), e `fs` nativo pra leitura de arquivos.

**Cérebro central:** também Node.js + TypeScript — mesma linguagem dos dois lados, reduzindo a superfície de conhecimento que o time precisa manter. Roda Baileys, um servidor WebSocket (biblioteca `ws`) escutando as conexões dos agentes locais, e faz chamadas à API da Anthropic pra transformar linguagem natural em ação estruturada.

**Execução sem depender de terminal aberto:** o agente local roda como serviço do sistema operacional (`node-windows` no Windows, `launchd` no macOS, `systemd` no Linux) — sobe sozinho quando a máquina liga, sem exigir que a pessoa lembre de abrir nada manualmente.

---

## 8. Runtime 24/7 — duas realidades diferentes coexistindo

Esta foi uma dúvida central levantada na conversa, e vale registrar a resposta com cuidado, porque ela tem duas partes que não podem ser tratadas como a mesma coisa.

**O cérebro central precisa estar online o tempo todo, de verdade**, porque mensagem de WhatsApp pode chegar a qualquer hora. Isso exclui hospedagem serverless (ex: Firebase Cloud Functions) — funções serverless são desligadas entre chamadas, e a conexão WebSocket que o Baileys mantém com o WhatsApp precisa ficar viva continuamente, sem interrupção. Precisa ser um processo persistente, num servidor que fique sempre ligado.

**Os agentes locais, ao contrário, não ficam — e não deveriam fingir que ficam — online 24/7.** Eles dependem da máquina de cada pessoa estar ligada e conectada. Isso não é uma limitação a esconder; é uma realidade física que o sistema precisa comunicar com clareza ("essa máquina está offline agora") em vez de travar esperando uma resposta que não vai vir.

Dentro disso, vale a distinção entre estados da máquina:
- **Tela apagada ou bloqueada** não afeta nada — o processo continua rodando normalmente em segundo plano, porque o sistema operacional só desliga o monitor.
- **Suspensão (sleep) ou hibernação** derruba o agente de fato — a CPU para (sleep) ou o estado é salvo em disco e a máquina desliga (hibernação); a conexão de rede cai nos dois casos. O agente precisa reconectar sozinho, automaticamente, assim que a máquina acordar — sem exigir intervenção manual.

**A conexão entre agente local e cérebro central é sempre iniciada pelo agente, nunca pelo cérebro central.** Isso resolve um problema de rede comum: a maioria dos computadores em casas e escritórios está atrás de NAT ou firewall, sem endereço IP público acessível de fora. Se o cérebro central tivesse que "ligar para dentro" da rede de cada máquina, precisaria de configuração de rede complexa (redirecionamento de porta, IP fixo). Fazendo o agente "ligar para fora" e manter essa conexão aberta, o problema desaparece — é o mesmo padrão usado por aplicativos como Slack, Discord e Tailscale.

**Hospedagem gratuita real para o cérebro central** foi avaliada com cuidado, porque nem toda oferta "grátis" atende um processo que precisa ficar de pé o tempo todo: Render derruba processos por inatividade no plano gratuito (mataria a conexão do WhatsApp); Railway não oferece mais um plano gratuito permanente, só crédito de avaliação que expira. A opção genuinamente gratuita e adequada é o **Oracle Cloud "Always Free"**, que oferece uma VPS de verdade, sem prazo de expiração, com recursos suficientes pra esse tipo de carga de trabalho — ao custo de exigir configuração manual (acesso via SSH, subir o processo como serviço). Uma alternativa igualmente válida, dado que este é um projeto interno da própria DMG: usar uma máquina física dedicada (um mini-PC ou Raspberry Pi) sempre ligada no escritório, eliminando qualquer custo de nuvem.

---

*Este documento reflete o desenho do MVP no momento em que foi escrito. Deve ser revisado — não silenciosamente ignorado — assim que o uso real da equipe DMG confirmar ou contradizer alguma dessas decisões.*
