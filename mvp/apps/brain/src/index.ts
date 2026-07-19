import "dotenv/config";
import { formatarRespostaStatus } from "./format";
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
      const comando = texto.trim().toLowerCase();

      // Fatia 1: um unico comando fixo. Interpretacao de linguagem natural e Fatia 2.
      if (comando !== "status") {
        console.log(`[brain] comando desconhecido ignorado: "${texto}"`);
        return;
      }

      if (registry.connectedNicks().length === 0) {
        await responder("Nenhuma máquina conectada no momento.");
        return;
      }

      const resultados = await registry.requestStatusFromAll();
      await responder(formatarRespostaStatus(resultados));
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
