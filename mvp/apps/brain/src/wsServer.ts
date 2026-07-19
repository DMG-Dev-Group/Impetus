import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import {
  BRAIN_ID,
  type CmdRequestPayload,
  type CmdResponsePayload,
  type Envelope,
  type RegisterPayload,
  type RegisteredPayload,
} from "@impetus/protocol";

/** Resultado consolidado do `status` de uma maquina, ja pronto para virar texto. */
export type StatusResult =
  | { nick: string; ok: true; uptimeSeconds: number }
  | { nick: string; ok: false; error: string };

interface PendingRequest {
  resolve: (payload: CmdResponsePayload) => void;
  timer: NodeJS.Timeout;
}

export interface AgentRegistryOptions {
  port: number;
  pairingSecret: string;
  /** Quanto tempo esperar a resposta de cada agente antes de desistir. */
  commandTimeoutMs?: number;
}

/**
 * Servidor WebSocket + registro em memoria dos agentes conectados.
 *
 * Nao ha persistencia: se o cerebro reiniciar, o Map se perde e os agentes se
 * re-registram sozinhos ao reconectar. Para o que esta fatia precisa provar,
 * um Map em memoria basta (principio: simplicidade sobre sofisticacao aparente).
 */
/** De quanto em quanto tempo o cerebro checa se cada agente continua vivo. */
const INTERVALO_PING_MS = 30_000;

export class AgentRegistry {
  private readonly wss: WebSocketServer;
  private readonly pairingSecret: string;
  private readonly commandTimeoutMs: number;
  private readonly pingTimer: NodeJS.Timeout;

  /** nick -> socket registrado (apenas agentes que passaram na validacao do secret). */
  private readonly agents = new Map<string, WebSocket>();
  /** id do envelope -> quem esta esperando a resposta. */
  private readonly pending = new Map<string, PendingRequest>();
  /** sockets que responderam ao ultimo ping — detecta conexao meio-aberta. */
  private readonly vivos = new WeakSet<WebSocket>();

  constructor(options: AgentRegistryOptions) {
    this.pairingSecret = options.pairingSecret;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 5_000;

    this.wss = new WebSocketServer({ port: options.port });
    this.wss.on("listening", () => {
      console.log(`[ws] escutando agentes na porta ${options.port}`);
    });
    this.wss.on("connection", (socket) => this.handleConnection(socket));

    // Uma maquina que entra em sleep nao fecha a conexao de forma limpa: o socket
    // fica meio-aberto e o agente continuaria no Map para sempre. O ping/pong
    // periodico e o que faz esse caso virar uma desconexao de verdade.
    this.pingTimer = setInterval(() => this.checarVivos(), INTERVALO_PING_MS);
  }

  private checarVivos(): void {
    for (const socket of this.wss.clients) {
      if (!this.vivos.has(socket)) {
        console.warn("[ws] agente nao respondeu ao ping — derrubando conexao");
        socket.terminate();
        continue;
      }
      this.vivos.delete(socket);
      socket.ping();
    }
  }

  /** Nicks das maquinas registradas agora. */
  connectedNicks(): string[] {
    return [...this.agents.keys()];
  }

  private handleConnection(socket: WebSocket): void {
    // Enquanto nao houver um `register` valido, o socket nao tem nick.
    let nick: string | null = null;
    console.log("[ws] nova conexao (ainda nao registrada)");

    this.vivos.add(socket);
    socket.on("pong", () => this.vivos.add(socket));

    socket.on("message", (raw) => {
      let envelope: Envelope;
      try {
        envelope = JSON.parse(raw.toString()) as Envelope;
      } catch {
        console.warn("[ws] mensagem ignorada: JSON invalido");
        return;
      }

      switch (envelope.type) {
        case "register": {
          const payload = envelope.payload as RegisterPayload;
          const registered = this.handleRegister(socket, payload);
          if (registered) {
            nick = payload.nick;
          }
          break;
        }

        case "heartbeat": {
          if (!nick) {
            console.warn("[ws] heartbeat de conexao nao registrada — ignorado");
            return;
          }
          this.send(socket, {
            type: "heartbeat_ack",
            to: nick,
            payload: {},
          });
          break;
        }

        case "cmd.response": {
          if (!nick) {
            console.warn("[ws] cmd.response de conexao nao registrada — ignorado");
            return;
          }
          this.resolvePending(envelope.id, envelope.payload as CmdResponsePayload);
          break;
        }

        default:
          console.warn(`[ws] tipo de mensagem inesperado do agente: ${envelope.type}`);
      }
    });

    socket.on("close", () => {
      if (!nick) {
        console.log("[ws] conexao nao registrada encerrada");
        return;
      }
      // So remove se o socket no Map ainda for este. Se o mesmo nick reconectou
      // antes deste `close` chegar, o Map ja aponta para a conexao nova e nao
      // deve ser limpo aqui.
      if (this.agents.get(nick) === socket) {
        this.agents.delete(nick);
        console.log(`[ws] agente desconectado: ${nick}`);
      }
    });

    socket.on("error", (err) => {
      console.error(`[ws] erro no socket${nick ? ` de ${nick}` : ""}: ${err.message}`);
    });
  }

  /** Valida o secret e coloca o agente no registro. Retorna se o registro foi aceito. */
  private handleRegister(socket: WebSocket, payload: RegisterPayload): boolean {
    const nick = payload?.nick?.trim();

    if (!nick) {
      console.warn("[ws] register recusado: nick vazio");
      this.send(socket, {
        type: "registered",
        to: "?",
        payload: { ok: false, reason: "nick ausente ou vazio" } satisfies RegisteredPayload,
      });
      socket.close();
      return false;
    }

    if (payload.secret !== this.pairingSecret) {
      console.warn(`[ws] register recusado: secret invalido (nick informado: ${nick})`);
      this.send(socket, {
        type: "registered",
        to: nick,
        payload: { ok: false, reason: "secret de pareamento invalido" } satisfies RegisteredPayload,
      });
      socket.close();
      return false;
    }

    // Mesmo nick reconectando (ex.: maquina saiu de sleep antes de o `close`
    // anterior ser percebido): a conexao nova vence, a antiga e derrubada.
    const anterior = this.agents.get(nick);
    if (anterior && anterior !== socket) {
      console.log(`[ws] ${nick} reconectou — derrubando a conexao anterior`);
      anterior.close();
    }

    this.agents.set(nick, socket);
    this.send(socket, {
      type: "registered",
      to: nick,
      payload: { ok: true } satisfies RegisteredPayload,
    });
    console.log(`[ws] agente registrado: ${nick} (total conectados: ${this.agents.size})`);
    return true;
  }

  /**
   * Pergunta `status` para todas as maquinas conectadas em paralelo.
   * Cada agente tem sua propria janela de timeout — uma maquina lenta nao
   * atrasa a resposta das outras alem do limite.
   */
  async requestStatusFromAll(): Promise<StatusResult[]> {
    const alvos = [...this.agents.entries()];
    return Promise.all(alvos.map(([nick, socket]) => this.requestStatus(nick, socket)));
  }

  private requestStatus(nick: string, socket: WebSocket): Promise<StatusResult> {
    return new Promise<StatusResult>((resolve) => {
      const id = randomUUID();

      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ nick, ok: false, error: "sem resposta" });
      }, this.commandTimeoutMs);

      this.pending.set(id, {
        timer,
        resolve: (payload) => {
          if (payload.ok && payload.result) {
            resolve({ nick, ok: true, uptimeSeconds: payload.result.uptimeSeconds });
          } else {
            resolve({ nick, ok: false, error: payload.error ?? "erro desconhecido" });
          }
        },
      });

      const enviado = this.send(socket, {
        id,
        type: "cmd.request",
        to: nick,
        payload: { command: "status" } satisfies CmdRequestPayload,
      });

      if (!enviado) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ nick, ok: false, error: "conexao indisponivel" });
      }
    });
  }

  private resolvePending(id: string, payload: CmdResponsePayload): void {
    const aguardando = this.pending.get(id);
    if (!aguardando) {
      // Resposta chegou depois do timeout, ou com um id que ninguem pediu.
      console.warn(`[ws] cmd.response sem request correspondente (id ${id})`);
      return;
    }
    clearTimeout(aguardando.timer);
    this.pending.delete(id);
    aguardando.resolve(payload);
  }

  /** Serializa e envia um envelope. Retorna false se o socket nao estava aberto. */
  private send(
    socket: WebSocket,
    parts: Pick<Envelope, "type" | "to" | "payload"> & { id?: string },
  ): boolean {
    if (socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    const envelope: Envelope = {
      v: 1,
      type: parts.type,
      id: parts.id ?? randomUUID(),
      from: BRAIN_ID,
      to: parts.to,
      ts: Date.now(),
      payload: parts.payload,
    };
    socket.send(JSON.stringify(envelope));
    return true;
  }

  close(): void {
    clearInterval(this.pingTimer);
    for (const { timer } of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
    // `wss.close()` sozinho apenas para de aceitar conexoes novas — as abertas
    // continuariam penduradas, e o agente do outro lado nunca perceberia a queda.
    for (const socket of this.wss.clients) {
      socket.close();
    }
    this.agents.clear();
    this.wss.close();
  }
}
