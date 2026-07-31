import "dotenv/config";
import { AgentClient } from "./wsClient";

function envObrigatoria(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    console.error(`[config] variavel de ambiente ${nome} nao definida. Veja o .env.example.`);
    process.exit(1);
  }
  return valor;
}

/**
 * `AGENT_INDEX_ROOTS` e opcional: agente sem ela sobe normalmente, so nao
 * encontra nada em `find`. Por isso nao passa por `envObrigatoria`.
 */
function lerRaizesDoIndice(): string[] {
  const bruto = process.env.AGENT_INDEX_ROOTS?.trim();
  if (!bruto) return [];
  return bruto
    .split(",")
    .map((raiz) => raiz.trim())
    .filter(Boolean);
}

function main(): void {
  const brainUrl = envObrigatoria("WS_BRAIN_URL");
  const nick = envObrigatoria("AGENT_NICK");
  const secret = envObrigatoria("PAIRING_SECRET");
  const indexRoots = lerRaizesDoIndice();

  console.log(`[agent] iniciando como "${nick}"`);

  const client = new AgentClient({
    brainUrl,
    nick,
    secret,
    indexRoots,
    onRegistrationRejected: (motivo) => {
      console.error(
        `[agent] encerrando: o cerebro recusou o pareamento (${motivo}).` +
          " Confira se PAIRING_SECRET e igual nos dois lados.",
      );
      client.close();
      process.exit(1);
    },
  });

  client.connect();

  const encerrar = (sinal: string) => {
    console.log(`\n[agent] recebido ${sinal}, encerrando...`);
    client.close();
    process.exit(0);
  };
  process.on("SIGINT", () => encerrar("SIGINT"));
  process.on("SIGTERM", () => encerrar("SIGTERM"));
}

main();
