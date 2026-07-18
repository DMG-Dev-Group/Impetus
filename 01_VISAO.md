# 01 — Visão

### impetus-spec

---

## Propósito deste documento

O manifesto (`00_MANIFESTO.md`) estabelece por que o Impetus existe e quais princípios são invioláveis. Este documento responde a uma pergunta diferente: **para onde o Impetus vai, em que ordem, e como saberemos se estamos certos em cada etapa.**

Um manifesto não muda. Uma visão muda — deve mudar — à medida que a realidade responde às apostas feitas. Este documento é revisado a cada fase concluída; o manifesto não é.

---

## A gênese

O Impetus não nasceu como plano de produto. Nasceu de uma fricção concreta: agentes de codificação (Claude Code, Codex) produzem alterações locais em uma máquina específica, e essas alterações ficam inacessíveis fora dela. A primeira ideia foi pontual — um bot que expusesse remotamente o que havia sido alterado. A necessidade de "estar presente em mais de um ambiente" foi o que transformou uma solução pontual em uma tese mais ampla sobre contexto fragmentado entre ferramentas.

Isso importa para a visão porque define a ordem natural de expansão: **do específico para o geral**, nunca o contrário. Cada fase abaixo parte de um uso real e comprovado antes de generalizar.

---

## Fase 0 — MVP interno (DMG)

**Escopo:** o dashboard organizacional da DMG (Damage Group) passa a ser o primeiro ambiente onde o Impetus existe. Não é um protótipo descartável — é o primeiro usuário real, com necessidade real.

**O que existe nesta fase:**
- Abas de projeto com anotações e upload de arquivos.
- Conexão de leitura com o repositório do time (histórico, status, alterações recentes de agentes de IA).
- Resumos financeiros e informações organizacionais centralizadas.

**O que deliberadamente não existe ainda:** deploy automatizado a partir do dashboard, múltiplos tenants, qualquer usuário fora da DMG. Ver seção "Não-metas".

**Usuário desta fase:** a própria equipe DMG. Não existe cliente externo. Isso é uma escolha, não uma limitação temporária lamentável — dogfooding é o único ambiente de teste que gera pressão real de uso sem custo de aquisição de cliente.

---

## Fase 1 — Ponte validada para times técnicos

**Escopo:** com a Fase 0 estável e em uso diário, o Impetus passa a se conectar a ferramentas além do repositório interno da DMG — GitHub/GitLab, Slack, um gestor de tarefas (Jira ou Linear). O critério de avanço para esta fase não é tempo decorrido; é a Fase 0 ter sobrevivido ao uso real sem gerar desconfiança da própria equipe.

**O que muda:** o Impetus deixa de ser "o dashboard da DMG" e passa a ser testável por outro time técnico externo, em regime de acesso restrito e acompanhado — não lançamento público.

**Usuário desta fase:** times de desenvolvimento pequenos (2 a 15 pessoas) que já usam GitHub/GitLab + Slack/Discord + um gestor de tarefas, e sentem o mesmo problema de fragmentação que originou o Impetus.

---

## Fase 2 — Produto

**Escopo:** abertura para clientes pagantes fora do círculo de validação direta. Modelo de permissões, segurança e billing precisam estar maduros antes desta fase começar — não depois.

**Usuário desta fase:** o mesmo perfil da Fase 1, agora sem relação direta com a equipe fundadora.

**Critério de entrada nesta fase:** existir pelo menos um time externo (Fase 1) que dependa do Impetus operacionalmente e reportaria perda real se o sistema saísse do ar. Sem esse sinal, abrir para produto é prematuro, independentemente de pressão de prazo ou vontade de acelerar.

---

## Fase 3 — Expansão além do contexto técnico

**Escopo:** extensão do modelo de contexto unificado para áreas não-técnicas da organização (financeiro, atendimento, operações) — o núcleo operacional descrito no manifesto como visão de longo prazo.

Esta fase não tem cronograma. Ela só faz sentido depois que a Fase 2 comprovar, com clientes reais, que o modelo de contexto compartilhado generaliza além do caso de uso original (times de dev). Anunciar esta fase antes da Fase 2 estar validada seria repetir o erro descrito na primeira crítica a este projeto: confundir a visão de vinte anos com o escopo do ano um.

---

## Não-metas (o que o Impetus não persegue agora)

Ser explícito sobre não-metas é tão importante quanto metas, porque evita que ambição de longo prazo vaze para decisões de curto prazo.

- **Não** substituir GitHub, Jira, Slack ou qualquer ferramenta já em uso — o Impetus é ponte, não substituto (ver `00_MANIFESTO.md`, Seção III).
- **Não** buscar clientes fora do perfil "time técnico pequeno" antes da Fase 2.
- **Não** implementar deploy automatizado via dashboard antes de o modelo de permissões e auditoria (ver `08_SEGURANCA.md`) estar especificado e testado.
- **Não** tratar a Fase 3 como compromisso de roadmap — é direção, não prazo.

---

## Critérios de sucesso por fase

Sucesso aqui não é medido por métricas de vaidade (número de features, tamanho do manifesto, cobertura de ferramentas integradas). É medido por dependência operacional real:

- **Fase 0:** a equipe DMG notaria a ausência do Impetus se ele saísse do ar por um dia.
- **Fase 1:** um time externo, sem vínculo com os fundadores, opta por continuar usando o Impetus depois do período de teste guiado, sem ser convencido a permanecer.
- **Fase 2:** existe pelo menos um cliente disposto a pagar o valor total (não desconto de early adopter) pelo produto.
- **Fase 3:** um departamento não-técnico de uma organização cliente pede, por iniciativa própria, para ser conectado ao Impetus — sinal de que o modelo generalizou sem precisar ser empurrado.

Se uma fase não atingir seu critério, a resposta correta é permanecer nela e revisar a hipótese — não avançar de calendário.

---

## Panorama competitivo e posicionamento

O Impetus não compete com ERPs, CRMs ou suítes de gestão — essa categorização foi descartada no manifesto. Os concorrentes reais são de duas naturezas:

**Camadas de contexto/conhecimento com IA** — Glean e produtos equivalentes que indexam ferramentas corporativas para busca e resposta via IA. A diferença de posicionamento do Impetus é tratar contexto como grafo acionável (o sistema pode agir sobre o contexto, não apenas responder perguntas sobre ele), não apenas como índice de busca.

**Automação/iPaaS com IA por cima** — Zapier, Make, n8n, e camadas de IA como Copilot sobre o Microsoft Graph. A diferença aqui é que essas ferramentas tratam integração como automação de eventos entre sistemas que permanecem conceitualmente separados; o Impetus trata a unificação de contexto como modelo de dados nativo, não como automação por cima de fronteiras que continuam existindo.

Essa distinção precisa se manter verdadeira na prática, não apenas no discurso — é o critério que separa o Impetus de uma reformulação de produtos que já existem.

---

## Horizonte de vinte anos

O manifesto já descreve a aposta de longo prazo: a unidade atômica de interação com software migrar de "tela" para "contexto conectado". Esta visão não antecipa cronograma para essa transição — apenas garante que cada fase descrita acima constrói na direção certa, sem exigir que a aposta de vinte anos se prove correta para que o ano um already entregue valor.

---

*Este documento é revisado ao final de cada fase concluída. O manifesto (`00_MANIFESTO.md`) não é revisado pela mesma razão.*
