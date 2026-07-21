import path from "node:path";
import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
  isJidUser,
  isLidUser,
  jidDecode,
  useMultiFileAuthState,
  type WAMessageKey,
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
 * Reduz um numero a uma forma unica e comparavel.
 *
 * Celulares brasileiros existem em duas formas que representam a MESMA linha:
 * com e sem o "9" extra depois do DDD. O que a pessoa digita no `.env` e o que
 * o WhatsApp entrega no `senderPn` nem sempre coincidem — visto na pratica:
 *
 *   .env      5598981908366   (55 + 98 + 9 + 81908366  = 13 digitos)
 *   senderPn   559881908366   (55 + 98 +     81908366  = 12 digitos)
 *
 * Sao a mesma pessoa. Para comparar, os dois lados sao reduzidos a forma curta
 * (sem o 9 extra), que e a unica das duas que existe para toda linha BR.
 *
 * Numeros de outros paises passam intactos: a regra so se aplica a `55` com 13
 * digitos, onde o 9 apos o DDD e inequivocamente o digito extra de celular.
 */
export function canonicalizarNumero(bruto: string): string {
  const digitos = bruto.replace(/\D/g, "");

  if (digitos.length === 13 && digitos.startsWith("55") && digitos[4] === "9") {
    // Remove so o 9 da posicao 4, preservando pais (55) e DDD.
    return digitos.slice(0, 4) + digitos.slice(5);
  }

  return digitos;
}

/**
 * Descobre o numero de telefone de quem mandou a mensagem.
 *
 * O WhatsApp migrou as conversas 1:1 para um identificador interno (`@lid`), que
 * NAO e o numero: `122183615541479@lid` nao tem relacao visivel com a linha. Nesse
 * formato, o numero real vem separado, no campo `senderPn` da chave.
 *
 * Retorna `null` quando nao ha numero confiavel a extrair (grupo, transmissao,
 * newsletter, ou `@lid` sem `senderPn`). Quem chama trata `null` como "ignorar".
 */
export function extrairNumeroRemetente(key: WAMessageKey): string | null {
  const remoteJid = key.remoteJid;
  if (!remoteJid) return null;

  // Grupos ficam de fora nesta fatia (remetente e conversa sao coisas distintas).
  if (isJidGroup(remoteJid)) return null;

  // Em conversa `@lid` o proprio remoteJid nao carrega o numero — o `senderPn` sim.
  const jidComNumero = isLidUser(remoteJid) ? key.senderPn : remoteJid;

  // Descarta o que nao for conversa com uma pessoa (status@broadcast, newsletter,
  // ou um `@lid` que veio sem `senderPn` e portanto nao da para identificar).
  if (!jidComNumero || !isJidUser(jidComNumero)) return null;

  return jidDecode(jidComNumero)?.user ?? null;
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

  // Os autorizados sao canonicalizados uma vez, na subida: assim tanto faz se a
  // pessoa digitou o numero com ou sem o 9 extra no `.env`.
  const autorizados = new Set(options.allowedNumbers.map(canonicalizarNumero));

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

      // Grupos, transmissoes e `@lid` sem numero identificavel devolvem null.
      const numero = extrairNumeroRemetente(msg.key);
      if (!numero) continue;

      if (!autorizados.has(canonicalizarNumero(numero))) {
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
