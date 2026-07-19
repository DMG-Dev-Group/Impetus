# Log de Execuções — MVP do Impetus

### mvp/docs/

Registro do que foi pedido e do que foi de fato entregue, execução por execução.
Divergências entre prompt e entrega são registradas **aqui**, nunca editadas
retroativamente no prompt original.

---

## Fatia 1 — Esqueleto Andante

**Data:** 19/07/2026
**Prompt:** "Prompt Master — Fatia 1: Esqueleto Andante" (`mvp/prompts`)
**Status:** entregue e verificado — com ressalva no critério 2 (ver abaixo)

### O que foi pedido

Provar, com o mínimo de código possível, que o loop completo funciona: mensagem
no WhatsApp → cérebro central → agente local → resposta de volta no WhatsApp.
Um único comando fixo (`status`), sem IA. Objetivo real: eliminar as duas maiores
incertezas técnicas do projeto — estabilidade do Baileys, e conexão de saída do
agente através de NAT/firewall com reconexão automática.

### O que foi entregue

Monorepo em `mvp/` com npm workspaces e três pacotes:

- **`packages/protocol`** — só tipos TypeScript: o envelope e os seis tipos de
  mensagem da fatia. Nenhuma lógica.
- **`apps/brain`** — Baileys (WhatsApp) + servidor WebSocket + `Map` de agentes
  em memória + validação de `PAIRING_SECRET` + filtro de números autorizados +
  o comando `status` com timeout de 5s por agente.
- **`apps/agent`** — cliente WebSocket de saída, registro, heartbeat de 30s,
  resposta ao `status` com uptime do processo, reconexão automática a cada 5s.

Documentação gerada: `FUNCIONAMENTO.md`, `MANUAL.md`, `INSTALACAO.md` e esta
entrada.

### Verificação dos critérios de aceite

| # | Critério | Status |
|---|---|---|
| 1 | `npm install` resolve os três workspaces | ✅ verificado |
| 2 | `brain` sobe, mostra QR, loga "conectado ao WhatsApp" | ⚠️ **parcial** |
| 3 | `agent` conecta e registra; `brain` loga | ✅ verificado |
| 4 | Segundo agente com outro nick também registra | ✅ verificado |
| 5 | `status` retorna a lista com as máquinas e uptimes | ✅ verificado |
| 6 | Agente derrubado some da lista | ✅ verificado |
| 7 | `brain` reiniciado → agentes reconectam sozinhos | ✅ verificado |

**Ressalva do critério 2:** foi verificado que o `brain` sobe, conecta aos
servidores do WhatsApp e **renderiza um QR code real no terminal**. O escaneamento
em si não foi feito, porque exige o celular com o número dedicado do Impetus em
mãos. **Isso é o único ponto da fatia que continua não provado em ambiente real e
precisa ser feito manualmente pelo time.** Enquanto não for feito, a incerteza
"autenticação e estabilidade do Baileys" — uma das duas que a fatia existe para
eliminar — permanece parcialmente aberta.

**Como os critérios 3–7 foram verificados:** por um teste de fumaça automatizado
(`npm run smoke`) que sobe um cérebro real, conecta agentes reais nele e exercita
registro, recusa por secret inválido, `status`, desconexão, reinício do cérebro
com reconexão, e timeout de agente mudo. Os sete checks passam. **Não foi testado
com dois PCs físicos em redes diferentes** — a travessia de NAT real (a segunda
incerteza que a fatia existe para eliminar) também depende de teste manual do time.

### Bug encontrado durante a verificação (e corrigido)

O critério 7 **falhou na primeira execução**, e a causa vale registro porque não
era óbvia:

`wss.close()` apenas para de aceitar conexões novas — **não fecha as conexões já
abertas**. O agente nunca recebia evento de `close` e portanto nunca disparava a
reconexão.

Investigando, ficou claro que isso não era só um detalhe do teste: era um bug
real de produção com duas faces. Quando uma máquina entra em **sleep** (cenário
explicitamente previsto no `00_DECISOES.md`), o socket fica *meio-aberto* e
nenhum dos lados recebe `close`. Sem tratamento:

- o cérebro manteria a máquina no `Map` para sempre;
- o agente ficaria parado achando que está conectado, **sem nunca reconectar** —
  exatamente a capacidade que esta fatia existe para provar.

Correções aplicadas (não estavam no prompt, foram necessárias para o critério 7
passar de verdade):

1. `AgentRegistry.close()` agora fecha as conexões abertas antes de fechar o servidor.
2. **Cérebro:** ping de protocolo a cada 30s; socket que não devolve `pong` é
   derrubado e sai do `Map`.
3. **Agente:** watchdog que, após 75s sem sinal do cérebro, derruba a própria
   conexão para forçar o ciclo de reconexão.

### Divergências em relação ao prompt

**Estrutura de pastas — o ponto que mais divergiu.** O prompt afirma que
`impetus-spec/`, `mvp/docs/` e `mvp/prompts/` já existiam. **Não existiam.** O
repositório continha apenas cinco arquivos na raiz: `00_DECISOES.md`,
`01_VISAO.md`, `DESCRITIVO_MVP.md`, `manifesto-impetus.md` e
`impetus-diagrama.html`. Consequências:

- `mvp/` foi criado do zero, incluindo `docs/`.
- O `00_PROCESSO_DOCUMENTACAO.md` referenciado no prompt **não existe**. Os
  quatro documentos foram escritos seguindo a intenção descrita na seção 8 do
  prompt. Convém criar o processo formal e conferir se o formato bate.
- Os documentos da raiz (que se identificam internamente como `impetus-spec/mvp/`)
  **não foram movidos** — reorganizar a documentação existente não foi pedido.
- **O prompt da Fatia 1 não foi arquivado em `mvp/prompts/`**, porque chegou como
  mensagem de chat, não como arquivo. Recomenda-se salvá-lo lá manualmente, para
  cumprir a regra de que o prompt fica arquivado sem edição.

**Baileys pinado em `6.7.23`, não na versão `latest`.** No npm, a tag `latest` do
`@whiskeysockets/baileys` aponta hoje para `7.0.0-rc13` — um *release candidate*.
A linha estável está na tag `legacy` (`6.7.23`). Como esta fatia existe
justamente para provar estabilidade do Baileys, usar um RC contaminaria o
resultado: uma falha não distinguiria "Baileys é instável" de "peguei uma versão
de teste". Versão exata, sem `^`, pelo mesmo motivo. **Vale reavaliar quando o
7.0 estabilizar.**

**Adições fora da estrutura descrita no prompt:**

- `mvp/tsconfig.base.json` — config de TypeScript compartilhada pelos três
  pacotes, para não repetir as mesmas opções em três arquivos.
- `apps/brain/src/format.ts` — as funções que formatam a resposta do WhatsApp
  foram separadas do `index.ts`. Motivo concreto: `index.ts` executa `main()` ao
  ser importado, então qualquer coisa que precise apenas formatar texto subiria o
  cérebro inteiro junto (incluindo o Baileys). Funções puras separadas do
  entrypoint do processo.
- `mvp/scripts/smoke-transport.ts` + `npm run smoke` — o teste de fumaça descrito
  acima. Não foi pedido; foi escrito para verificar os critérios de aceite em vez
  de declará-los cumpridos sem evidência. Foi ele que revelou o bug do critério 7.
- `BRAIN_ID` exportado do `protocol` — uma constante (`"brain"`) em vez do
  literal repetido nos dois lados. É a única coisa além de tipos no pacote.
- `@hapi/boom` declarado explicitamente no `brain` (vem transitivamente com o
  Baileys, mas o código o usa direto para ler o código de desconexão).

**Decisões de implementação que o prompt não especificava:**

- **Grupos do WhatsApp são ignorados.** Apenas conversa direta
  (`@s.whatsapp.net`) é atendida. O prompt fala em "números autorizados", o que
  não se traduz bem para grupo (onde remetente e conversa são coisas diferentes).
  Merece decisão explícita antes da Fatia 2.
- **Nick duplicado: a conexão nova ganha.** Se um agente registra um nick que já
  está no `Map`, a conexão anterior é derrubada. Isso cobre o caso real de uma
  máquina que reconecta após sleep antes de o `close` antigo ser percebido. O
  efeito colateral é que dois agentes mal configurados com o mesmo nick ficam se
  derrubando alternadamente — daí o aviso no `INSTALACAO.md`.
- **Timeout de 5s por agente, em paralelo**, não 5s para o conjunto. Uma máquina
  lenta não atrasa as outras.
- **Log do Baileys silenciado** (`pino` em nível `silent`). O log próprio dele é
  barulhento demais e afogaria as linhas que interessam (conexão, QR, comandos),
  o que iria contra o princípio de transparência em vez de a favor.

### Dívidas conscientes deixadas nesta fatia

Nenhuma destas é esquecimento; todas são simplificação registrada:

- **Um `PAIRING_SECRET` único para todos os agentes.** Quem tem o secret registra
  uma máquina com qualquer nick. Aceitável no cenário atual (time pequeno,
  ambiente controlado, sem exposição pública); secret por máquina é a evolução
  natural.
- **Sem TLS.** A conexão é `ws://`, não `wss://` — o secret trafega em texto
  claro. Aceitável em rede local ou teste; **precisa virar `wss://` antes de o
  cérebro ficar exposto na internet de verdade.**
- **`heartbeat` não alimenta nenhuma lógica de liveness** — quem detecta conexão
  morta é o ping/pong de protocolo. O heartbeat da aplicação existe conforme o
  contrato, mas hoje é redundante. Vale decidir na Fatia 2 se ele ganha função
  própria ou sai do protocolo.
- **`parseEnvelope` duplicado nos dois lados.** O prompt determinou que
  `protocol` fosse só tipos, então cada lado faz seu próprio `JSON.parse` +
  `switch`. Se a Fatia 2 aumentar o número de tipos de mensagem, esse parsing
  provavelmente deve subir para o `protocol`.

---

*Log iniciado na execução da Fatia 1.*
