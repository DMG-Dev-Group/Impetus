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
  | "cmd.response"; // agente -> cerebro, devolve resultado

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

export interface CmdRequestPayload {
  command: "status"; // unico comando desta fatia
}

export interface CmdResponsePayload {
  command: "status";
  ok: boolean;
  result?: {
    nick: string;
    uptimeSeconds: number;
  };
  error?: string;
}

/** Identificador reservado do cerebro central no campo `from`/`to` do envelope. */
export const BRAIN_ID = "brain";
