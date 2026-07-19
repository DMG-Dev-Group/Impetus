# Log de Decisões — Impetus & DMG_SaaS

### impetus-spec/mvp/

Log completo, sem filtragem, de toda decisão tomada até aqui. Formato: decisão → motivo, quando aplicável. Ordem: por tema, seguindo a ordem em que os temas surgiram na conversa.

---

## Identidade e nome

- **Nome oficial: Impetus.** O codinome anterior, "Danin", foi abandonado — não deve mais ser usado em nenhum documento ou código novo.
- **Impetus é ponte, não substituto.** Não exige abandonar GitHub, Jira, Slack ou qualquer ferramenta já em uso pelo time — conecta o que elas sabem.

---

## Fases de evolução (visão de longo prazo)

- **Fase 0** — MVP interno, uso exclusivo da equipe DMG.
- **Fase 1** — ponte validada com um time técnico externo, em regime acompanhado.
- **Fase 2** — produto, aberto a clientes pagantes fora do círculo de validação direta.
- **Fase 3** — expansão do modelo de contexto pra áreas não-técnicas da organização (sem cronograma).
- Regra fixa: nenhuma fase avança por calendário — só quando o critério de sucesso da fase anterior é atingido de verdade.

---

## Sequenciamento estratégico atual

- **Decisão:** consolidar o `DMG_SaaS` (dashboard) com dados e backend reais **antes** de conectar o Impetus a ele.
- Como consequência, a escrita dos documentos numerados do `impetus-spec/` (03 em diante) foi pausada — não abandonada.
- Motivo: não faz sentido construir a "ponte" antes de existir uma casa firme dos dois lados dela.
- **Decisão complementar:** escrever descritivos finais de arquitetura do Impetus antes dos testes do MVP seria contraditório — por isso a criação desta pasta `mvp/`, separada da numeração final do spec, pra registrar decisões e evoluções da fase de teste sem comprometer os documentos finais.

---

## Arquitetura do Impetus (quando ele existir como sistema separado)

- **Grafo de Contexto** como fonte única da verdade — nós e arestas, com origem e histórico rastreáveis.
- Cinco camadas, cada uma só fala com a adjacente: **Conectores → Grafo de Contexto → Sistema de Eventos → Rede de Agentes → Interfaces.**
- Banco de dados do Grafo de Contexto: **Postgres + Prisma** — não um banco de grafo dedicado (Neo4j) nesta fase. Motivo: time já tem experiência com Prisma; menor custo operacional; existe caminho de expansão não-destrutivo (extensão Apache AGE) se a complexidade de travessia crescer depois.
- Hospedagem do banco: **gerenciada** (Supabase, Neon ou Railway) — não self-hosted, para não gastar tempo de engenharia com manutenção de infraestrutura nesta fase.

---

## DMG_SaaS (o dashboard) — stack e estado

- **Frontend permanece vanilla HTML/CSS/JS, sem framework.** Decisão deliberada — o time já tem isso funcionando; trocar agora não trazia ganho real.
- **Dados do dashboard: Firestore, não Postgres.** Motivo: as coleções (`projetos`, `clientes`, `receitas`, `eventos`, `atividades`) são simples e tabulares; o time já usa Firebase em tudo; `onSnapshot` dá sincronização em tempo real sem custo de implementação.
- **Autenticação: Firebase Auth**, email/senha, sem cadastro público — acessos criados manualmente por membro do time.
- **Implementado nesta sessão:** `js/firebase-init.js`, `js/store.js` reescrito (mesma interface pública, agora Firestore por baixo), `js/auth.js` (portão de login), `firestore.rules` (qualquer autenticado pode ler/escrever), `SETUP-FIREBASE.md`.
- **Bug corrigido:** `app.js` carregava como script comum antes dos módulos ES (`store.js`, `auth.js`) terminarem de carregar, travando a inicialização. Corrigido com `defer` na tag do `app.js`.
- **Painel de integração com GitHub** na aba de detalhes do projeto — branch, linguagem, issues, estrelas, último commit. Funciona só para repositórios **públicos** — privados exigem backend proxy com token (não implementado ainda; token nunca deve ser exposto direto no JS do navegador).
- **Pendências conscientes, não resolvidas ainda:** backend proxy pro GitHub (repos privados); anotações e upload de arquivo por projeto; atividades geradas via webhook do GitHub; permissões por papel (hoje é tudo-ou-nada); separar `app.js` por view; limpeza automática do histórico de `atividades`.

---

## MVP do Impetus — presença e gateways

- **Gateway primário: WhatsApp.** Dashboard (`DMG_SaaS`) vira gateway adicional na **V2 do MVP**.
- **WhatsApp não é a entidade — é só um meio de acessá-la.** Outros gateways estão previstos no futuro (bate com a camada de Interfaces já desenhada na arquitetura: plural, intercambiável).
- **Não é "um Impetus por PC"** — é uma entidade comum que conecta todas as máquinas do time. Tecnicamente: um agente local por máquina (Conector) + um cérebro central que unifica a identidade.
- **Cada máquina tem um nick/ID próprio** pra diferenciação (ex: `PC-Daniel`, `PC-Guilherme`), registrado no pareamento inicial.
- **Se "projeto X" existir em mais de uma máquina, o nome da máquina deve vir especificado na frase — senão o Impetus pergunta qual delas.**

---

## MVP do Impetus — acesso a arquivos e busca inteligente

- Função pretendida: ler e compartilhar arquivos nas máquinas onde o agente estiver instalado.
- **Busca de projeto/pasta sem caminho especificado:** resolvida por um índice leve local (nome do projeto, caminho, se é repo git, última modificação), atualizado periodicamente ou por watcher de sistema de arquivos — não por "a IA adivinhar o sistema de arquivos".
- Fluxo: linguagem natural → IA interpreta e transforma em chamada de ferramenta estruturada → busca no índice por correspondência aproximada → se achar mais de uma pasta candidata, pergunta de volta antes de agir.
- **Regra de segurança:** mesmo que a busca encontre exatamente uma pasta correspondente, o Impetus **sempre pede confirmação antes de executar qualquer ação** sobre ela — não só em caso de ambiguidade.
- **Confirmação obrigatória apenas quando a ação pode causar dano ao sistema.** Leitura simples e cópia (compartilhar) não exigem confirmação, porque não alteram nem apagam nada na máquina original.
- **Timeout de confirmação varia por tipo de ação** — tabela proposta:
  - Leitura → sem confirmação, sem timeout.
  - Reversível, sai da máquina (zipar e enviar) → sem confirmação (não altera nada na origem).
  - Reversível mas altera algo (mover, renomear) → confirmação simples, timeout de 5 min.
  - Destrutiva/irreversível (deletar, sobrescrever, git push forçado) → confirmação explícita (digitar algo específico, não só "sim"), timeout de 2 min.
- **Zips de pasta não devem incluir `node_modules`** (nem equivalentes). Resolvido lendo o próprio `.gitignore` da pasta (via biblioteca `ignore`) em vez de fixar uma lista de exclusão no código — respeita o que o próprio projeto já declara.
- **Risco de ataque via descoberta do número de WhatsApp: considerado baixo nesta fase** — permissão restrita a grupo/contatos especificados, ambiente de teste controlado, projeto ainda desconhecido publicamente. Escopo de pastas e log de ação seguem como proteção contra erro operacional (não contra ataque), a critério do usuário se implementar agora ou depois.

---

## MVP do Impetus — reconhecimento de repositório git

- Pasta com `.git` → reconhecida como repositório.
- Branch atual: `git branch --show-current`.
- Separação entre arquivos alterados e não commitados: `git status` / `git status --porcelain`.
- Última alteração: `git log -1 --format=%cd` (último commit) — distinto de "última alteração no disco" (mtime do sistema de arquivos); qual das duas interpretações usar fica a confirmar na implementação.

---

## MVP do Impetus — contexto de conversa

- **Contexto de conversa deve persistir** — descrito pelo usuário como a própria missão central do Impetus ("manter o ambiente conectado em uma só direção").
- Distinção arquitetural importante: contexto de conversa (curto prazo, por sessão de chat, resolve referências tipo "ele" = último projeto mencionado) é uma camada diferente do Grafo de Contexto de longo prazo (conhecimento institucional permanente). Não devem ser confundidos na implementação.

---

## MVP do Impetus — stack técnico

- **WhatsApp: Baileys**, não a API oficial (Meta/Twilio). Motivo: gratuito, sem processo de aprovação de conta business; mais leve que `whatsapp-web.js` porque fala o protocolo direto por WebSocket, sem precisar de Chromium headless rodando.
- **Agente local (por máquina):** Node.js + TypeScript. Bibliotecas: `ws` (cliente WebSocket, conecta de saída pro cérebro central), `simple-git` (comandos git), `archiver` (zipar arquivos), `ignore` (interpretar `.gitignore`), `fs` nativo.
- **Cérebro central:** Node.js + TypeScript. Baileys (WhatsApp) + servidor WebSocket (biblioteca `ws`, escutando as conexões dos agentes locais) + chamadas à API da Anthropic pra interpretar linguagem natural.
- **Execução sem terminal aberto:** agente local roda como serviço do sistema operacional — `node-windows` no Windows, `launchd` no macOS, `systemd` no Linux. Sobe sozinho quando a máquina liga.

---

## MVP do Impetus — runtime e hospedagem 24/7

- **"Rodar 24/7" tem duas partes de natureza diferente:**
  - **Cérebro central** — precisa estar online 24/7 de verdade (mensagem pode chegar a qualquer hora). Não pode ser função serverless (ex: Firebase Cloud Functions) porque a conexão WebSocket do Baileys precisa ficar viva continuamente, e serverless desliga entre chamadas.
  - **Agentes locais** — inerentemente não ficam online 24/7, porque dependem da máquina de cada pessoa estar ligada. Isso não é bug, é física — o sistema precisa comunicar "máquina offline" em vez de travar esperando resposta.
- **Tela apagada/bloqueada não afeta o agente local** — processo continua rodando normalmente em segundo plano.
- **Sleep (suspensão) ou hibernação derruba o agente local** — CPU para (sleep) ou é como se tivesse desligado (hibernação); conexão cai nos dois casos. O agente deve reconectar sozinho automaticamente quando a máquina acordar.
- **Direção da conexão entre agente local e cérebro central: sempre de saída** (o agente liga pro cérebro, nunca o contrário) — resolve o problema de a maioria dos PCs de casa/escritório estar atrás de NAT/firewall sem IP público. Mesmo padrão usado por apps como Slack, Discord e Tailscale.
- **Hospedagem gratuita real do cérebro central:**
  - Railway e Render **não servem bem de graça** para isso — Render derruba processo por inatividade no plano free (mata a conexão do WhatsApp); Railway não tem mais plano gratuito permanente, só crédito de teste.
  - **Oracle Cloud "Always Free"** — VPS genuinamente grátis pra sempre, recursos suficientes pro workload. Exige configuração manual (SSH, subir o processo como serviço), mas é o free tier mais sério disponível hoje pra isso.
  - **Alternativa:** máquina física própria do DMG (PC dedicado ou Raspberry Pi) sempre ligada no escritório — custo zero de nuvem, condizente com o projeto ser interno e em ambiente controlado.
  - Railway/Fly.io pagos seguem como opção de menor fricção de setup, se preferirem pagar um valor baixo por mês em vez de configurar Oracle Cloud na mão.
