import type { CommandName } from "@impetus/protocol";
import OpenAI from "openai";

/**
 * Interpretacao de linguagem natural: transforma o texto cru do WhatsApp numa
 * decisao estruturada.
 *
 * Este modulo nao conhece o WhatsApp nem os agentes. Ele recebe uma frase e
 * devolve uma intencao — quem decide o que fazer com ela e o `index.ts`.
 *
 * O provedor e o Groq, que expoe uma API compativel com a da OpenAI. Por isso o
 * SDK aqui e o `openai`, apenas apontado para outra `baseURL` — nao ha
 * dependencia de codigo com a OpenAI em si. (Antes o provedor era o OpenRouter;
 * a troca custou so este arquivo, por conta desse isolamento.)
 */

const BASE_URL = "https://api.groq.com/openai/v1";

/**
 * Modelo padrao. Configuravel por `GROQ_MODEL`.
 *
 * No Groq, o modo estrito de saida estruturada (que GARANTE o schema, via
 * constrained decoding) so existe em `openai/gpt-oss-20b` e `openai/gpt-oss-120b`.
 * O 120b foi escolhido como padrao por priorizar qualidade de classificacao; o
 * 20b tem cota diaria maior e serve de alternativa se a cota apertar.
 *
 * Historico que vale lembrar: o `gpt-oss-20b` FALHOU no OpenRouter — ignorava o
 * schema. No Groq o mecanismo e outro (constrained decoding forca o formato), mas
 * qualidade de classificacao e coisa separada de aderencia ao schema. Rode
 * `npm run bench:intent` ao trocar de modelo, sempre.
 */
const MODELO_PADRAO = "openai/gpt-oss-120b";

export const MODELO = process.env.GROQ_MODEL?.trim() || MODELO_PADRAO;

/**
 * O que o Impetus entendeu da mensagem.
 *
 * `intent` reaproveita `CommandName` do `protocol` de proposito: a camada de
 * interpretacao e o contrato dos agentes falam o mesmo vocabulario. Acrescentar
 * um comando novo ao protocolo passa a exigir ensina-lo aqui, e o TypeScript
 * cobra isso — em vez de a interpretacao silenciosamente nunca reconhece-lo.
 *
 * `unknown` e o caso em que nenhum protocolo se aplica.
 *
 * `alvo` e o que a frase menciona como objeto da acao (projeto, pasta, arquivo,
 * maquina). Vem `null` quando a pessoa nao especificou — o que e informacao util,
 * nao erro: e o que vai permitir perguntar "qual projeto?" nas fatias seguintes.
 */
export type Intencao = {
  intent: CommandName | "unknown";
  alvo: string | null;
};

/** Todos os valores aceitos em `intent`, na ordem em que aparecem no prompt. */
const INTENCOES = ["status", "find", "gitStatus", "listFiles", "shareFile", "unknown"] as const;

/**
 * Schema da resposta. `strict: true` exige que TODA propriedade esteja em
 * `required` — por isso `alvo` e obrigatorio no schema, mas aceita `null`.
 */
const SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: INTENCOES,
      description: "O protocolo que melhor corresponde ao pedido da pessoa.",
    },
    alvo: {
      type: ["string", "null"],
      description:
        "Nome do projeto, pasta, arquivo ou maquina citado na frase. null se a pessoa nao especificou.",
    },
  },
  required: ["intent", "alvo"],
  additionalProperties: false,
} as const;

/**
 * O prompt e a peca central deste modulo.
 *
 * Principio de construcao: **enunciar a regra de cada protocolo antes dos
 * exemplos**, e deixar explicito que os exemplos ilustram, nao delimitam. Modelos
 * pequenos tendem a tratar lista de exemplos como lista de permissao — se o
 * prompt so mostra frases, uma formulacao nova vira "unknown". A regra semantica
 * e o que permite generalizar.
 *
 * Foi exatamente esse o bug do primeiro prompt desta fatia: exemplos so falavam
 * "maquinas", e "Tem algum usuario ativo?" caia em unknown.
 */
const SYSTEM = `Voce e a camada de interpretacao do Impetus, um assistente que ajuda uma equipe a operar as maquinas de trabalho dela pelo WhatsApp.

Sua unica tarefa: ler a mensagem e dizer a qual protocolo ela corresponde, e qual e o alvo mencionado. Voce nao responde a pessoa e nao executa nada. Devolva apenas o JSON pedido.

## Como decidir

Pergunte-se: "o que a pessoa quer que aconteca?" — e escolha o protocolo cuja FINALIDADE corresponde. As palavras exatas nao importam; a intencao importa.

As pessoas escrevem informalmente, com erro de digitacao, sem acento, com giria, em frase incompleta ou sem pontuacao. Isso e normal e nao deve levar a "unknown". Interprete como um colega de trabalho interpretaria.

## Os protocolos

### status
A pessoa quer saber quais maquinas estao disponiveis, se alguma esta no ar, ou ha quanto tempo estao ligadas.
Vocabulario que costuma aparecer: conectado, ligado, online, ativo, disponivel, no ar, de pe, rodando, acordado, funcionando, presente.
Para se referir as maquinas, a pessoa pode dizer qualquer coisa: maquina, PC, computador, notebook, usuario, pessoa, gente, alguem, agente, equipamento, ou o nome da maquina (ex: PC-Daniel).
Exemplos (ILUSTRATIVOS, nao exaustivos):
- "status"
- "quais maquinas estao online?"
- "quem ta ligado agora"
- "Tem algum usuario ativo?"
- "o PC do Daniel ta no ar?"
- "ta todo mundo conectado?"
- "ha quanto tempo o PC-Guilherme ta ligado"
- "e ai, tem alguem ai?"

### find
A pessoa quer LOCALIZAR uma pasta ou projeto — descobrir onde esta, ou se existe.
Vocabulario: achar, encontrar, localizar, procurar, buscar, cade, onde esta, tem o projeto, existe.
Exemplos (ILUSTRATIVOS):
- "onde esta o projeto Flora?"
- "acha a pasta do site da DMG"
- "cade o Tendresse"
- "voce tem o projeto X ai?"
- "procura por impetus"
- "em qual maquina ta o projeto Y"

### gitStatus
A pessoa quer o ESTADO DE UM REPOSITORIO git: branch atual, o que foi alterado, o que falta commitar, quando foi a ultima mudanca.
Vocabulario: branch, commit, commitado, alterado, modificado, mudanca, pendente, repositorio, repo, git, ultima alteracao, staged.
Exemplos (ILUSTRATIVOS):
- "qual a branch do projeto Flora?"
- "tem coisa nao commitada no site?"
- "quando foi o ultimo commit do Tendresse"
- "o que mudou no repo do Impetus"
- "status do git do projeto X"
- "tem alteracao pendente ai?"

### listFiles
A pessoa quer VER O CONTEUDO de uma pasta ou projeto — quais arquivos tem dentro.
Vocabulario: listar, lista, mostra, quais arquivos, o que tem dentro, conteudo, ls, dir.
Exemplos (ILUSTRATIVOS):
- "lista os arquivos do projeto Flora"
- "o que tem dentro da pasta do site?"
- "quais arquivos tem no Tendresse"
- "me mostra o conteudo da pasta X"

### shareFile
A pessoa quer RECEBER algo — que o Impetus mande um arquivo ou pasta de volta pelo WhatsApp.
Vocabulario: manda, envia, me passa, compartilha, quero o arquivo, zipa, compacta, baixa, me ve o arquivo.
IMPORTANTE: pedido de zipar/compactar entra AQUI — a finalidade de compactar, neste contexto, e receber o material.
Exemplos (ILUSTRATIVOS):
- "me manda o relatorio.pdf"
- "zipa o projeto Flora e manda"
- "compacta a pasta do site"
- "quero a pasta de arquivos do projeto X"
- "me passa aquele documento"

### unknown
Nenhum dos protocolos acima corresponde. Isso inclui: conversa fiada, saudacao, pergunta geral fora do dominio, mensagem sem sentido, e pedidos de acoes que o Impetus nao cobre (criar repositorio, apagar arquivo, instalar programa, mandar email).
Exemplos (ILUSTRATIVOS):
- "bom dia"
- "que horas sao?"
- "cria um repositorio novo"
- "apaga a pasta temp"
- "asdkjhasd"
- "obrigado!"

## O alvo

Em \`alvo\`, coloque o nome do projeto, pasta, arquivo ou maquina que a frase menciona — do jeito que a pessoa escreveu, sem corrigir nem completar.
Se a frase nao menciona nenhum, use null.
Exemplos:
- "zipa o projeto Flora" -> alvo: "Flora"
- "qual a branch do site da DMG?" -> alvo: "site da DMG"
- "quem ta online?" -> alvo: null
- "me manda o relatorio.pdf" -> alvo: "relatorio.pdf"
- "o PC do Daniel ta no ar?" -> alvo: "PC do Daniel"

## Regra final

Os exemplos acima ensinam o PADRAO de cada protocolo — eles nao sao uma lista de frases permitidas. Uma formulacao que voce nunca viu NAO e motivo para "unknown".

So use "unknown" quando a finalidade do pedido realmente nao corresponder a nenhum protocolo. Se a pessoa quer algo que um dos cinco protocolos faria, escolha esse protocolo — mesmo que ela tenha pedido de um jeito inesperado, incompleto ou com erro de escrita.

Quando dois protocolos parecerem possiveis, escolha pelo RESULTADO que a pessoa espera receber:
- quer saber ONDE esta -> find
- quer saber O QUE TEM DENTRO -> listFiles
- quer saber O ESTADO DO GIT -> gitStatus
- quer RECEBER o material -> shareFile`;

let client: OpenAI | null = null;

function obterCliente(): OpenAI {
  if (client) return client;

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY nao definida — veja o .env.example e o INSTALACAO.md",
    );
  }

  client = new OpenAI({ apiKey, baseURL: BASE_URL });
  return client;
}

/**
 * Erros do provedor que valem retry: sao intermitentes, nao determinísticos.
 *
 * `json_validate_failed` (HTTP 400, "Failed to validate JSON") e um erro do modo
 * estrito do Groq que aparece de vez em quando na MESMA requisicao que funciona
 * na tentativa seguinte — confirmado medindo 5x a mesma frase (5/5 num schema,
 * 4/5 no outro). Nao e incompatibilidade de schema; e ruido do constrained
 * decoding. Repetir resolve.
 *
 * Erro de credencial (401), modelo inexistente (404) e limite de uso (429) NAO
 * entram aqui: sao deterministicos ou de cota, e repetir so atrasa o diagnostico
 * ou queima requisicao.
 */
function ehErroTransitorio(err: unknown): boolean {
  if (!(err instanceof OpenAI.APIError)) return false;
  if (err.status !== 400) return false;
  const marca = `${err.code ?? ""} ${err.message ?? ""}`.toLowerCase();
  return marca.includes("json_validate_failed") || marca.includes("failed to validate json");
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Faz a chamada ao modelo, repetindo em falhas intermitentes.
 * Devolve o conteudo bruto, ou `null` se todas as tentativas vierem vazias.
 *
 * Repete em dois casos: resposta vazia e o 400 transitorio do Groq (acima).
 * Qualquer outro erro sobe na hora.
 */
async function pedirClassificacao(texto: string, tentativas: number): Promise<string | null> {
  for (let i = 1; i <= tentativas; i++) {
    try {
      const response = await obterCliente().chat.completions.create({
        model: MODELO,
        max_tokens: 256,
        // Classificacao determinista: queremos a mesma frase caindo sempre na
        // mesma intencao, nao variedade.
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: { name: "intencao", strict: true, schema: SCHEMA },
        },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: texto },
        ],
      });

      const conteudo = response.choices[0]?.message?.content;
      if (conteudo) return conteudo;

      if (i < tentativas) {
        console.warn(`[intent] resposta vazia do modelo (tentativa ${i}/${tentativas}) — repetindo`);
      }
    } catch (err) {
      // So o 400 transitorio e reciclado; o resto (401/404/429/rede) sobe.
      if (!ehErroTransitorio(err) || i >= tentativas) throw err;
      console.warn(`[intent] 400 transitorio do modelo (tentativa ${i}/${tentativas}) — repetindo`);
      await espera(400);
    }
  }
  return null;
}

/**
 * Pergunta ao modelo qual e a intencao por tras do texto.
 *
 * Lanca excecao se a chamada falhar. Isso e deliberado: uma falha de rede, de
 * credencial ou de limite de uso nao e a mesma coisa que "nao entendi o pedido",
 * e responder "Ainda nao sei fazer isso" nesse caso esconderia um problema de
 * infraestrutura atras de uma mensagem de produto.
 */
export async function interpretarIntencao(texto: string): Promise<Intencao> {
  // Falhas intermitentes (resposta vazia, 400 transitorio do Groq) sao ruido de
  // provedor, nao erro de logica nem de credencial: tentar de novo resolve. Sem
  // isso, a pessoa recebe "Deu erro aqui do meu lado" numa mensagem perfeitamente
  // valida e nao entende por que. 3 tentativas cobrem os dois tipos com folga.
  const conteudo = await pedirClassificacao(texto, 3);

  if (!conteudo) {
    throw new Error(`modelo ${MODELO} devolveu resposta vazia mesmo apos retry`);
  }

  let parsed: Intencao;
  try {
    parsed = JSON.parse(conteudo) as Intencao;
  } catch {
    throw new Error(
      `modelo ${MODELO} devolveu algo que nao e JSON valido: ${conteudo.slice(0, 120)}`,
    );
  }

  // Se o modelo nao respeitou o schema, isso e ERRO — nao "unknown".
  //
  // Esta guarda ja existiu devolvendo `unknown` silenciosamente, e foi um erro
  // de design: no OpenRouter, quando o `gpt-oss-20b` passou a ignorar o schema
  // inteiro (devolvia `{"status":"unknown"}`, com a chave errada), a guarda
  // converteu "o modelo esta quebrado" em "toda mensagem e desconhecida". O
  // sintoma virou "a interpretacao esta fraca" e a causa real ficou escondida.
  //
  // No Groq o modo estrito garante o schema, entao esta guarda nao deveria
  // disparar — mas se disparar, falha alto: o log mostra o modelo e o conteudo
  // cru, em vez de esconder.
  if (!INTENCOES.includes(parsed?.intent as (typeof INTENCOES)[number])) {
    throw new Error(
      `modelo ${MODELO} nao respeitou o schema — "intent" deveria ser um de ` +
        `${INTENCOES.join("|")}, veio ${conteudo.slice(0, 120)}. ` +
        `Confirme que GROQ_MODEL suporta saida estruturada em modo estrito.`,
    );
  }

  // `alvo` ausente nao e violacao grave o bastante para derrubar a mensagem:
  // normalizar para null mantem o fluxo, e o campo e opcional por natureza.
  return { intent: parsed.intent, alvo: parsed.alvo ?? null };
}
