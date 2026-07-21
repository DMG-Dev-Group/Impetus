import "dotenv/config";
import type { CommandName } from "@impetus/protocol";
import { formatarRespostaStatus } from "./format";
import { interpretarIntencao } from "./intent";
import { AgentRegistry } from "./wsServer";
import { startWhatsApp } from "./whatsapp";

/** Le uma variavel de ambiente obrigatoria, falhando cedo e com mensagem clara. */
function envObrigatoria(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    console.error(`[config] variavel de ambiente ${nome} nao definida. Veja o .env.example.`);
    process.exit(1);
  }
  return valor;
}

/**
 * Como o Impetus descreve, em portugues, o que entendeu de cada protocolo que
 * ainda nao tem implementacao.
 *
 * O `Record` e tipado por `CommandName` menos `"status"`: se um comando novo
 * entrar no protocolo, o TypeScript exige uma frase para ele aqui, em vez de
 * deixar a pessoa receber uma resposta vazia.
 */
const PENDENTES: Record<Exclude<CommandName, "status">, string> = {
  find: "localizar um projeto ou pasta",
  gitStatus: "ver o estado do git de um projeto",
  listFiles: "listar o conteúdo de uma pasta",
  shareFile: "enviar um arquivo ou pasta",
};

function descreverPendente(intent: Exclude<CommandName, "status">, alvo: string | null): string {
  const acao = PENDENTES[intent];
  const complemento = alvo ? ` — "${alvo}"` : "";
  return (
    `Entendi: você quer ${acao}${complemento}.\n\n` +
    "Isso ainda não está pronto — vem numa próxima etapa do Impetus."
  );
}

async function main(): Promise<void> {
  const wsPort = Number(process.env.WS_PORT ?? 8080);
  const pairingSecret = envObrigatoria("PAIRING_SECRET");
  const allowedNumbers = envObrigatoria("WHATSAPP_ALLOWED_NUMBERS")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  if (Number.isNaN(wsPort)) {
    console.error("[config] WS_PORT precisa ser um numero.");
    process.exit(1);
  }

  console.log(`[config] ${allowedNumbers.length} numero(s) autorizado(s) a mandar comandos`);

  const registry = new AgentRegistry({ port: wsPort, pairingSecret });

  await startWhatsApp({
    allowedNumbers,
    onCommand: async (texto, responder) => {
      // Fatia 2: qualquer frase e interpretada. Se a API falhar, a excecao sobe
      // e o handler do WhatsApp responde com erro — de proposito, para nao
      // confundir "falha de infraestrutura" com "nao sei fazer isso".
      const intencao = await interpretarIntencao(texto);
      console.log(
        `[brain] intencao interpretada: ${intencao.intent}` +
          (intencao.alvo ? ` | alvo: "${intencao.alvo}"` : ""),
      );

      if (intencao.intent === "status") {
        if (registry.connectedNicks().length === 0) {
          await responder("Nenhuma máquina conectada no momento.");
          return;
        }
        const resultados = await registry.requestStatusFromAll();
        await responder(formatarRespostaStatus(resultados));
        return;
      }

      if (intencao.intent === "unknown") {
        await responder("Ainda não sei fazer isso.");
        return;
      }

      // Protocolo reconhecido, mas ainda sem implementacao (fatias futuras).
      // Dizer o que foi entendido vale mais que um "nao sei" generico: a pessoa
      // descobre que o pedido faz sentido e que falta a acao, nao a compreensao.
      await responder(descreverPendente(intencao.intent, intencao.alvo));
    },
  });

  const encerrar = (sinal: string) => {
    console.log(`\n[brain] recebido ${sinal}, encerrando...`);
    registry.close();
    process.exit(0);
  };
  process.on("SIGINT", () => encerrar("SIGINT"));
  process.on("SIGTERM", () => encerrar("SIGTERM"));
}

main().catch((err) => {
  console.error("[brain] falha fatal na inicializacao:", err);
  process.exit(1);
});
