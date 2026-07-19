import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import {
  BRAIN_ID,
  type CmdRequestPayload,
  type CmdResponsePayload,
  type Envelope,
  type RegisterPayload,
  type RegisteredPayload,
} from "@impetus/protocol";

const INTERVALO_HEARTBEAT_MS = 30_000;
const INTERVALO_RECONEXAO_MS = 5_000;
/** De quanto em quanto tempo checar se o cerebro ainda deu sinal de vida. */
const INTERVALO_WATCHDOG_MS = 10_000;
/**
 * Silencio maximo tolerado do cerebro antes de considerar a conexao morta.
 * Folga de ~2,5x o heartbeat: um ack perdido nao derruba, um mudo de verdade sim.
 */
const SILENCIO_MAXIMO_MS = 75_000;

export interface AgentClientOptions {
  brainUrl: string;
  nick: string;
  secret: string;
  /**
   * Chamado quando o cerebro recusa o registro (secret errado, por exemplo).
   * Nao adianta reconectar nesse caso — quem chama decide como encerrar.
   */
  onRegistrationRejected: (reason: string) => void;
}

/**
 * Cliente WebSocket do agente local.
 *
 * A conexao e sempre de saida (agente -> cerebro), nunca o contrario: isso e o
 * que faz o agente funcionar atras de NAT/firewall domestico sem nenhuma
 * configuracao de rede. Se a conexao cair — rede, sleep da maquina, cerebro
 * reiniciado — ele tenta de novo a cada 5s, indefinidamente.
 */
export class AgentClient {
  private readonly options: AgentClientOptions;
  private socket: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private registrado = false;
  private encerrando = false;
  private tentativa = 0;
  /** Quando o cerebro deu sinal de vida pela ultima vez (mensagem ou ping). */
  private ultimoContato = 0;

  constructor(options: AgentClientOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.encerrando) return;

    this.tentativa += 1;
    console.log(`[agent] conectando em ${this.options.brainUrl} (tentativa ${this.tentativa})...`);

    const socket = new WebSocket(this.options.brainUrl);
    this.socket = socket;

    socket.on("open", () => {
      console.log("[agent] conexao aberta — enviando register");
      this.tentativa = 0;
      this.ultimoContato = Date.now();
      this.iniciarWatchdog();
      this.enviarRegister();
    });

    socket.on("message", (raw) => {
      this.ultimoContato = Date.now();
      this.tratarMensagem(raw.toString());
    });

    // O `ws` responde ao ping automaticamente, mas o evento serve para saber
    // que o cerebro continua do outro lado mesmo sem trafego de aplicacao.
    socket.on("ping", () => {
      this.ultimoContato = Date.now();
    });

    socket.on("close", () => {
      this.pararHeartbeat();
      this.pararWatchdog();
      this.registrado = false;
      if (this.encerrando) return;
      console.warn(`[agent] conexao encerrada — nova tentativa em ${INTERVALO_RECONEXAO_MS / 1000}s`);
      this.agendarReconexao();
    });

    socket.on("error", (err) => {
      // O evento `close` vem logo depois e cuida do reagendamento; aqui so
      // registramos o motivo, para o log nao ficar mudo sobre a causa.
      console.error(`[agent] erro de conexao: ${err.message}`);
    });
  }

  private agendarReconexao(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, INTERVALO_RECONEXAO_MS);
  }

  private tratarMensagem(raw: string): void {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw) as Envelope;
    } catch {
      console.warn("[agent] mensagem ignorada: JSON invalido");
      return;
    }

    switch (envelope.type) {
      case "registered": {
        const payload = envelope.payload as RegisteredPayload;
        if (!payload.ok) {
          const motivo = payload.reason ?? "motivo nao informado";
          console.error(`[agent] registro recusado pelo cerebro: ${motivo}`);
          this.encerrando = true;
          this.options.onRegistrationRejected(motivo);
          return;
        }
        this.registrado = true;
        console.log(`[agent] registrado como "${this.options.nick}"`);
        this.iniciarHeartbeat();
        break;
      }

      case "heartbeat_ack":
        // Nada a fazer: serve so para confirmar que o cerebro continua do outro lado.
        break;

      case "cmd.request": {
        const payload = envelope.payload as CmdRequestPayload;
        this.tratarComando(envelope.id, payload);
        break;
      }

      default:
        console.warn(`[agent] tipo de mensagem inesperado do cerebro: ${envelope.type}`);
    }
  }

  private tratarComando(id: string, payload: CmdRequestPayload): void {
    if (payload.command !== "status") {
      console.warn(`[agent] comando desconhecido: ${payload.command}`);
      this.enviar({
        id,
        type: "cmd.response",
        payload: {
          command: payload.command,
          ok: false,
          error: `comando desconhecido: ${payload.command}`,
        } satisfies CmdResponsePayload,
      });
      return;
    }

    console.log("[agent] respondendo cmd.request status");
    this.enviar({
      id,
      type: "cmd.response",
      payload: {
        command: "status",
        ok: true,
        result: {
          nick: this.options.nick,
          // Tempo desde que ESTE processo subiu — nao desde que a maquina ligou.
          uptimeSeconds: Math.floor(process.uptime()),
        },
      } satisfies CmdResponsePayload,
    });
  }

  private enviarRegister(): void {
    this.enviar({
      type: "register",
      payload: {
        nick: this.options.nick,
        secret: this.options.secret,
      } satisfies RegisterPayload,
    });
  }

  private iniciarHeartbeat(): void {
    this.pararHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.registrado) return;
      this.enviar({ type: "heartbeat", payload: {} });
    }, INTERVALO_HEARTBEAT_MS);
  }

  private pararHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Nem toda queda de conexao gera um evento `close`: quando a maquina suspende
   * ou a rede some sem aviso, o socket fica meio-aberto e o agente ficaria
   * parado achando que esta conectado. O watchdog transforma esse silencio em
   * uma desconexao explicita, que por sua vez dispara a reconexao.
   */
  private iniciarWatchdog(): void {
    this.pararWatchdog();
    this.watchdogTimer = setInterval(() => {
      const silencio = Date.now() - this.ultimoContato;
      if (silencio > SILENCIO_MAXIMO_MS) {
        console.warn(
          `[agent] cerebro sem dar sinal ha ${Math.round(silencio / 1000)}s — derrubando a conexao para reconectar`,
        );
        this.socket?.terminate();
      }
    }, INTERVALO_WATCHDOG_MS);
  }

  private pararWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private enviar(parts: Pick<Envelope, "type" | "payload"> & { id?: string }): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn(`[agent] nao foi possivel enviar ${parts.type}: conexao fechada`);
      return;
    }
    const envelope: Envelope = {
      v: 1,
      type: parts.type,
      id: parts.id ?? randomUUID(),
      from: this.options.nick,
      to: BRAIN_ID,
      ts: Date.now(),
      payload: parts.payload,
    };
    this.socket.send(JSON.stringify(envelope));
  }

  close(): void {
    this.encerrando = true;
    this.pararHeartbeat();
    this.pararWatchdog();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
  }
}
