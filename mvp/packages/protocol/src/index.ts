/**
 * Contrato compartilhado entre o cerebro central (`brain`) e os agentes locais (`agent`).
 *
 * Este pacote nao conhece nem o brain nem o agent: ele define apenas o formato das
 * mensagens que os dois trocam. Trocar o transporte (hoje WebSocket) no futuro nao
 * deveria exigir mudar nada aqui.
 *
 * Fatia 1 — apenas o suficiente para provar o transporte ponta a ponta.
 */

export type MessageType =
  | "register" // agente -> cerebro, ao conectar
  | "registered" // cerebro -> agente, confirma registro
  | "heartbeat" // agente -> cerebro, periodico
  | "heartbeat_ack" // cerebro -> agente
  | "cmd.request" // cerebro -> agente, pede execucao
  | "cmd.response" // agente -> cerebro, devolve resultado
  /**
   * PLACEHOLDER DE FATIA FUTURA — reservado, sem nenhum fluxo implementado.
   *
   * Vai carregar o pedido de confirmacao antes de acoes de risco (ver o modelo
   * de confirmacao por classe de acao no `DESCRITIVO_MVP.md`). Hoje nenhum lado
   * envia nem trata este tipo; ele existe aqui so para que o contrato ja preveja
   * o passo, em vez de precisar mudar a forma do protocolo depois.
   */
  | "cmd.confirm";

export interface Envelope<T = unknown> {
  v: 1;
  type: MessageType;
  id: string; // uuid, usado para casar request/response
  from: string; // "brain" ou o nick do agente
  to: string;
  ts: number; // Date.now()
  payload: T;
}

export interface RegisterPayload {
  nick: string; // ex: "PC-Daniel"
  secret: string; // token de pareamento
}

export interface RegisteredPayload {
  ok: boolean;
  reason?: string; // presente quando ok = false
}

/**
 * Comandos que um agente local pode receber.
 *
 * Apenas `status` tem implementacao. Os demais sao PLACEHOLDERS DE FATIA FUTURA:
 * estao no contrato para reservar o nome e o formato, e **nenhum deles tem
 * handler** — nem no cerebro, nem no agente. Um agente que receba um destes hoje
 * responde `ok: false` com "comando desconhecido".
 *
 * - `find`      — localizar pasta/projeto pelo nome
 * - `gitStatus` — branch atual, arquivos alterados, ultima modificacao
 * - `listFiles` — listar conteudo de uma pasta/projeto
 * - `shareFile` — enviar um arquivo de volta pelo WhatsApp
 *
 * Quando cada um for implementado, `CmdResponsePayload.result` provavelmente
 * deixa de ser um tipo unico e vira uma uniao discriminada por `command`.
 */
export type CommandName = "status" | "find" | "gitStatus" | "listFiles" | "shareFile";

export interface CmdRequestPayload {
  command: CommandName; // apenas "status" e executavel nesta fatia
}

export interface CmdResponsePayload {
  command: CommandName;
  ok: boolean;
  /** Formato do `status`. Os comandos futuros vao precisar do seu proprio formato. */
  result?: {
    nick: string;
    uptimeSeconds: number;
  };
  error?: string;
}

/** Identificador reservado do cerebro central no campo `from`/`to` do envelope. */
export const BRAIN_ID = "brain";
