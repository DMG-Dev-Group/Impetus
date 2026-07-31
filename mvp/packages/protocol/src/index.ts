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
 * `status`, `find`, `listFiles` e `shareFile` tem implementacao (e payload
 * proprio, abaixo). `gitStatus` continua PLACEHOLDER DE FATIA FUTURA: so o
 * nome esta reservado em `CommandName`, sem payload nem handler — nem no
 * cerebro, nem no agente.
 *
 * - `gitStatus` — branch atual, arquivos alterados, ultima modificacao
 *
 * Quando for implementado, ganha seu proprio par de interfaces
 * `XRequestPayload`/`XResponsePayload`, como os demais abaixo — e entra
 * nas unioes `CmdRequestPayload`/`CmdResponsePayload` no fim do arquivo.
 */
export type CommandName = "status" | "find" | "gitStatus" | "listFiles" | "shareFile";

export interface StatusRequestPayload {
  command: "status";
}

export interface StatusResult {
  nick: string;
  uptimeSeconds: number;
}

export interface StatusResponsePayload {
  command: "status";
  ok: boolean;
  result?: StatusResult;
  error?: string;
}

/**
 * Um projeto/pasta OU arquivo solto encontrado no indice local de um agente.
 *
 * O indice escaneia o primeiro nivel de cada raiz configurada — a maioria das
 * entradas sao pastas de projeto, mas um arquivo solto ali do lado (ex.: um
 * `.rar` na mesma pasta onde ficam os projetos) tambem conta como candidato.
 * `kind` existe para o cerebro formatar a resposta direito: um arquivo nao tem
 * "e/nao e repositorio git" — isso so faz sentido para pasta.
 */
export interface FindMatch {
  /** Nome da pasta ou arquivo, como aparece no disco (com extensao, se for arquivo). */
  name: string;
  /** Caminho completo no disco DO AGENTE que respondeu — so faz sentido junto do nick de quem respondeu. */
  path: string;
  /** "folder" para pasta de projeto, "file" para arquivo solto na raiz indexada. */
  kind: "folder" | "file";
  /** Se e uma pasta com repositorio git (existe uma subpasta `.git`). Sempre `false` para arquivo. */
  isGitRepo: boolean;
  /** Data da ultima modificacao (mtime), em ISO 8601. */
  lastModified: string;
}

export interface FindRequestPayload {
  command: "find";
  /** Termo de busca — o "alvo" que a interpretacao de linguagem natural extraiu da frase. */
  query: string;
}

export interface FindResponsePayload {
  command: "find";
  ok: boolean;
  /** Pastas candidatas encontradas no indice deste agente. Vazio se nada bateu. */
  matches: FindMatch[];
  error?: string;
}

/**
 * Uma entrada (pasta ou arquivo) dentro do conteudo listado de uma pasta —
 * sempre um nivel, o mesmo criterio "raso" usado pelo indice de `find`.
 */
export interface FileEntry {
  name: string;
  isDirectory: boolean;
  /** Bytes; ausente para pasta (nao soma recursivamente o conteudo dela). */
  sizeBytes?: number;
  /** Data da ultima modificacao (mtime), em ISO 8601. */
  lastModified: string;
}

export interface ListFilesRequestPayload {
  command: "listFiles";
  /** Caminho absoluto, no disco do agente, ja resolvido (por busca previa). */
  path: string;
}

export interface ListFilesResponsePayload {
  command: "listFiles";
  ok: boolean;
  entries: FileEntry[];
  error?: string;
}

export interface ShareFileRequestPayload {
  command: "shareFile";
  /** Caminho absoluto — arquivo OU pasta. Pasta e zipada antes de enviar. */
  path: string;
}

export interface ShareFileResponsePayload {
  command: "shareFile";
  ok: boolean;
  /** Nome final do arquivo enviado (pasta vira "<nome>.zip"). */
  fileName?: string;
  /** Conteudo do arquivo, em base64. */
  contentBase64?: string;
  mimeType?: string;
  error?: string;
}

export type CmdRequestPayload =
  | StatusRequestPayload
  | FindRequestPayload
  | ListFilesRequestPayload
  | ShareFileRequestPayload;
export type CmdResponsePayload =
  | StatusResponsePayload
  | FindResponsePayload
  | ListFilesResponsePayload
  | ShareFileResponsePayload;

/** Identificador reservado do cerebro central no campo `from`/`to` do envelope. */
export const BRAIN_ID = "brain";
