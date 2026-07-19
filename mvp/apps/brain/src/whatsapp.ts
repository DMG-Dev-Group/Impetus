import path from "node:path";
import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

/**
 * Chamado quando chega uma mensagem de texto de um numero autorizado.
 * `responder` manda o texto de volta para a mesma conversa.
 */
export type CommandHandler = (texto: string, responder: (resposta: string) => Promise<void>) => Promise<void>;

export interface WhatsAppOptions {
  /** Numeros autorizados, so digitos, formato internacional sem "+". */
  allowedNumbers: string[];
  /** Onde guardar as credenciais da sessao, para nao pedir QR toda vez. */
  authDir?: string;
  onCommand: CommandHandler;
}

/**
 * Conecta ao WhatsApp via Baileys e entrega ao `onCommand` apenas as mensagens
 * de texto vindas de numeros autorizados.
 *
 * Mensagens de numeros nao autorizados sao descartadas em silencio — de proposito,
 * para nao confirmar a existencia do bot para quem nao deveria saber dele.
 */
export async function startWhatsApp(options: WhatsAppOptions): Promise<WASocket> {
  const authDir = options.authDir ?? path.resolve(process.cwd(), "auth_info");
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const autorizados = new Set(options.allowedNumbers);

  const socket = makeWASocket({
    version,
    auth: state,
    // O log do Baileys e barulhento demais para o console desta fatia; o que
    // interessa (conexao, QR, comandos) e logado explicitamente abaixo.
    logger: pino({ level: "silent" }),
    markOnlineOnConnect: false,
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n[whatsapp] escaneie o QR abaixo com o WhatsApp do numero do Impetus:");
      console.log("[whatsapp] (WhatsApp > Aparelhos conectados > Conectar aparelho)\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("[whatsapp] conectado ao WhatsApp");
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const deslogado = statusCode === DisconnectReason.loggedOut;

      if (deslogado) {
        console.error(
          `[whatsapp] sessao encerrada pelo WhatsApp (logout). Apague a pasta "${authDir}" e escaneie o QR de novo.`,
        );
        return;
      }

      console.warn(`[whatsapp] conexao caiu (codigo ${statusCode ?? "desconhecido"}) — reconectando...`);
      void startWhatsApp(options);
    }
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    // "notify" = mensagem nova chegando agora. Outros tipos sao sincronizacao de
    // historico, que nao deve ser reprocessada como se fosse comando novo.
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid) continue;

      // Fatia 1 trata apenas conversas diretas. Grupos ficam de fora.
      if (!remoteJid.endsWith("@s.whatsapp.net")) continue;

      const numero = remoteJid.split("@")[0];
      if (!autorizados.has(numero)) {
        // Silencio deliberado: nem responde, nem loga o conteudo.
        continue;
      }

      const texto = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
      if (!texto) continue;

      console.log(`[whatsapp] comando recebido de ${numero}: "${texto}"`);

      const responder = async (resposta: string): Promise<void> => {
        await socket.sendMessage(remoteJid, { text: resposta });
      };

      try {
        await options.onCommand(texto, responder);
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        console.error(`[whatsapp] falha ao tratar comando: ${motivo}`);
        await responder("Deu erro aqui do meu lado ao processar isso.").catch(() => undefined);
      }
    }
  });

  return socket;
}
