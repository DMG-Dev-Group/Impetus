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
import { FileIndex } from "./fileIndex";
import { listarConteudo } from "./listFiles";
import { prepararEnvio } from "./shareFile";

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
  /**
   * Pastas raiz onde o indice de projetos (`find`) procura. Cada subpasta
   * imediata de cada raiz vira um "projeto" candidato. Vazio = agente nao
   * encontra nada em `find`, mas `status` continua funcionando normalmente.
   */
  indexRoots: string[];
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
  private readonly fileIndex: FileIndex;
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
    this.fileIndex = new FileIndex(options.indexRoots);
    if (options.indexRoots.length === 0) {
      console.log("[agent] AGENT_INDEX_ROOTS vazio — find nao vai encontrar nada neste agente");
    }
    // O indice nao depende de estar conectado ao cerebro: comeca a escanear
    // desde ja, para ja ter dados prontos quando o primeiro `find` chegar.
    this.fileIndex.start();
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
    if (payload.command === "status") {
      this.responderStatus(id);
      return;
    }

    if (payload.command === "find") {
      this.responderFind(id, payload.query);
      return;
    }

    if (payload.command === "listFiles") {
      void this.responderListFiles(id, payload.path);
      return;
    }

    if (payload.command === "shareFile") {
      void this.responderShareFile(id, payload.path);
      return;
    }

    // O tipo de `payload` hoje so cobre os 4 comandos acima, entao este ramo
    // nao e alcancavel com o protocolo atual. Fica como rede de seguranca caso
    // um cerebro de outra versao mande um comando que este agente ainda nao
    // conhece — falha de forma legivel em vez de nao responder nada.
    const comandoDesconhecido = (payload as { command: string }).command;
    console.warn(`[agent] comando desconhecido: ${comandoDesconhecido}`);
    this.enviar({
      id,
      type: "cmd.response",
      payload: {
        command: comandoDesconhecido,
        ok: false,
        error: `comando desconhecido: ${comandoDesconhecido}`,
      } as unknown as CmdResponsePayload,
    });
  }

  private responderStatus(id: string): void {
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

  private responderFind(id: string, query: string): void {
    const matches = this.fileIndex.search(query);
    console.log(`[agent] respondendo cmd.request find "${query}" — ${matches.length} match(es)`);
    this.enviar({
      id,
      type: "cmd.response",
      payload: { command: "find", ok: true, matches } satisfies CmdResponsePayload,
    });
  }

  private async responderListFiles(id: string, caminho: string): Promise<void> {
    console.log(`[agent] respondendo cmd.request listFiles "${caminho}"`);
    try {
      const entries = listarConteudo(caminho);
      this.enviar({
        id,
        type: "cmd.response",
        payload: { command: "listFiles", ok: true, entries } satisfies CmdResponsePayload,
      });
    } catch (err) {
      this.enviar({
        id,
        type: "cmd.response",
        payload: {
          command: "listFiles",
          ok: false,
          entries: [],
          error: mensagemDeErro(err),
        } satisfies CmdResponsePayload,
      });
    }
  }

  private async responderShareFile(id: string, caminho: string): Promise<void> {
    console.log(`[agent] respondendo cmd.request shareFile "${caminho}"`);
    try {
      const arquivo = await prepararEnvio(caminho);
      this.enviar({
        id,
        type: "cmd.response",
        payload: { command: "shareFile", ok: true, ...arquivo } satisfies CmdResponsePayload,
      });
    } catch (err) {
      this.enviar({
        id,
        type: "cmd.response",
        payload: {
          command: "shareFile",
          ok: false,
          error: mensagemDeErro(err),
        } satisfies CmdResponsePayload,
      });
    }
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
    this.fileIndex.stop();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
  }
}

function mensagemDeErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
