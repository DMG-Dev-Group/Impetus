import type { FindMatch } from "@impetus/protocol";

/**
 * Estado minimo de "ha uma pergunta pendente" por numero de telefone.
 *
 * Isto NAO e o contexto de conversa completo (resolver "aquele projeto" varias
 * mensagens depois) — e a fatia mais estreita que o `find` precisa: quando o
 * Impetus pergunta algo, a PROXIMA mensagem da mesma pessoa deveria responder
 * aquilo, em vez de passar pela interpretacao de intencao de novo. Contexto de
 * conversa geral, se vier, generaliza esta mesma peca — nao duplica.
 *
 * Guardado em memoria, sem persistencia — mesmo principio do `AgentRegistry`:
 * se o cerebro reiniciar, a pergunta pendente se perde e a pessoa so precisa
 * perguntar de novo. TTL curto evita que uma resposta MUITO atrasada (a pessoa
 * sumiu e voltou dias depois) seja tratada como resposta a uma pergunta que
 * ninguem mais lembra ter feito.
 *
 * `kind`/`acao` generalizados (antes era so `find_target`/`find_disambiguation`,
 * especificos do `find`): `listFiles` e `shareFile` precisam exatamente do
 * mesmo fluxo de resolver um alvo por busca e desambiguar entre candidatos —
 * so muda o que se faz DEPOIS de resolvido. Duplicar isso por comando teria
 * sido a mesma logica reescrita tres vezes.
 */

const TTL_PADRAO_MS = 5 * 60_000;

/** As 3 acoes que passam pelo mesmo fluxo de "resolver um alvo, depois agir". */
export type AcaoAlvo = "find" | "listFiles" | "shareFile";

export type PendingQuestion =
  /** Comando sem alvo: a proxima mensagem, crua, vira a query de busca. */
  | { kind: "target"; acao: AcaoAlvo; askedAt: number }
  /** Mais de um candidato: a proxima mensagem escolhe um deles. */
  | {
      kind: "disambiguation";
      acao: AcaoAlvo;
      candidatos: Array<{ nick: string; match: FindMatch }>;
      askedAt: number;
    };

/**
 * Registro em memoria de perguntas pendentes, uma por numero de telefone.
 * So faz sentido uma pergunta pendente por vez nesta fatia: o WhatsApp aqui e
 * sempre conversa 1:1, nunca grupo.
 */
export class PendingQuestions {
  private readonly pendentes = new Map<string, PendingQuestion>();
  private readonly ttlMs: number;

  /** `ttlMs` e injetavel so para teste (ver scripts/smoke-find.ts) — em produção usa o padrao de 5 min. */
  constructor(ttlMs: number = TTL_PADRAO_MS) {
    this.ttlMs = ttlMs;
  }

  definir(numero: string, pergunta: PendingQuestion): void {
    this.pendentes.set(numero, pergunta);
  }

  /**
   * Le e remove a pergunta pendente de um numero, se houver. Remove mesmo
   * quando expirada, para nao acumular lixo no Map — uma pergunta expirada e
   * tratada como se nao existisse.
   */
  consumir(numero: string): PendingQuestion | null {
    const pendente = this.pendentes.get(numero);
    if (!pendente) return null;

    this.pendentes.delete(numero);

    if (Date.now() - pendente.askedAt > this.ttlMs) {
      console.log(`[pendente] pergunta expirada para ${numero} — tratando como se nao houvesse`);
      return null;
    }

    return pendente;
  }
}

/**
 * Resolve a resposta de uma disambiguacao: numero da lista (1-based) ou nome
 * do projeto/nick da maquina por substring, case-insensitive.
 *
 * Deterministico de proposito — nao vale chamar o classificador de novo so
 * para decidir "qual das opcoes a pessoa escolheu".
 */
export function resolverEscolha(
  texto: string,
  candidatos: Array<{ nick: string; match: FindMatch }>,
): { nick: string; match: FindMatch } | null {
  const bruto = texto.trim();

  if (/^\d+$/.test(bruto)) {
    const indice = Number.parseInt(bruto, 10);
    if (indice >= 1 && indice <= candidatos.length) {
      return candidatos[indice - 1];
    }
  }

  const alvo = bruto.toLowerCase();
  if (!alvo) return null;

  return (
    candidatos.find(
      (c) => c.match.name.toLowerCase().includes(alvo) || c.nick.toLowerCase().includes(alvo),
    ) ?? null
  );
}
