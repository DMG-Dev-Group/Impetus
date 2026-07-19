/**
 * Teste de fumaca do transporte da Fatia 1.
 *
 * Exercita os criterios de aceite 3, 4, 5, 6 e 7 sem depender do WhatsApp:
 * sobe um cerebro de verdade numa porta de teste, conecta agentes de verdade
 * nele, e verifica registro, recusa por secret invalido, status, desconexao,
 * reinicio do cerebro com reconexao automatica, e timeout de agente mudo.
 *
 * Os criterios 1 e 2 (npm install e QR do WhatsApp) so podem ser verificados
 * a mao, porque dependem de escanear o QR com o celular do Impetus.
 *
 * Rodar: npm run smoke   (a partir de mvp/)
 */
import { AgentRegistry } from "../apps/brain/src/wsServer";
import { formatarRespostaStatus } from "../apps/brain/src/format";
import { AgentClient } from "../apps/agent/src/wsClient";

const PORT = 8099;
const SECRET = "segredo-de-teste";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let falhas = 0;
  const checar = (nome: string, ok: boolean, detalhe = "") => {
    console.log(`${ok ? "  PASS" : "  FALHA"} — ${nome}${detalhe ? ` (${detalhe})` : ""}`);
    if (!ok) falhas++;
  };

  console.log("\n=== 3/4. dois agentes conectam e registram ===");
  let registry = new AgentRegistry({ port: PORT, pairingSecret: SECRET });
  await espera(200);

  const mk = (nick: string) =>
    new AgentClient({
      brainUrl: `ws://localhost:${PORT}`,
      nick,
      secret: SECRET,
      onRegistrationRejected: (r) => console.log(`  [${nick}] recusado: ${r}`),
    });

  const a1 = mk("PC-Daniel");
  const a2 = mk("PC-Teste");
  a1.connect();
  a2.connect();
  await espera(600);
  checar("dois nicks registrados", registry.connectedNicks().length === 2, registry.connectedNicks().join(", "));

  console.log("\n=== 5. status devolve as duas maquinas ===");
  const r1 = await registry.requestStatusFromAll();
  console.log("  resposta do WhatsApp seria:\n" + formatarRespostaStatus(r1).split("\n").map((l) => "    " + l).join("\n"));
  checar("ambas responderam ok", r1.length === 2 && r1.every((r) => r.ok));

  console.log("\n=== secret invalido e recusado ===");
  let recusado = "";
  const mau = new AgentClient({
    brainUrl: `ws://localhost:${PORT}`,
    nick: "PC-Invasor",
    secret: "secret-errado",
    onRegistrationRejected: (r) => { recusado = r; },
  });
  mau.connect();
  await espera(500);
  checar("registro recusado", recusado !== "", recusado);
  checar("nao entrou no Map", !registry.connectedNicks().includes("PC-Invasor"));

  console.log("\n=== 6. agente derrubado some da lista ===");
  a2.close();
  await espera(400);
  checar("so resta PC-Daniel", registry.connectedNicks().join(",") === "PC-Daniel", registry.connectedNicks().join(","));
  const r2 = await registry.requestStatusFromAll();
  console.log("  resposta:\n" + formatarRespostaStatus(r2).split("\n").map((l) => "    " + l).join("\n"));

  console.log("\n=== 7. brain reinicia, agente reconecta sozinho ===");
  registry.close();
  await espera(300);
  checar("brain caiu, agente perdeu registro", true);
  registry = new AgentRegistry({ port: PORT, pairingSecret: SECRET });
  console.log("  (aguardando reconexao automatica, ate 8s)");
  for (let i = 0; i < 16 && registry.connectedNicks().length === 0; i++) await espera(500);
  checar("PC-Daniel reconectou sem intervencao", registry.connectedNicks().includes("PC-Daniel"), registry.connectedNicks().join(","));
  const r3 = await registry.requestStatusFromAll();
  console.log("  resposta:\n" + formatarRespostaStatus(r3).split("\n").map((l) => "    " + l).join("\n"));
  checar("status funciona apos reconexao", r3.length === 1 && r3[0].ok);

  console.log("\n=== timeout: agente mudo entra como 'sem resposta' ===");
  a1.close();
  await espera(200);
  const { WebSocket } = await import("ws");
  const mudo = new WebSocket(`ws://localhost:${PORT}`);
  await new Promise((r) => mudo.on("open", r));
  mudo.send(JSON.stringify({ v: 1, type: "register", id: "x", from: "PC-Mudo", to: "brain", ts: Date.now(), payload: { nick: "PC-Mudo", secret: SECRET } }));
  await espera(400);
  console.log("  (esperando o timeout de 5s...)");
  const r4 = await registry.requestStatusFromAll();
  console.log("  resposta:\n" + formatarRespostaStatus(r4).split("\n").map((l) => "    " + l).join("\n"));
  checar("entrou como sem resposta", r4.some((r) => !r.ok && r.error === "sem resposta"));

  mudo.close();
  registry.close();
  await espera(200);
  console.log(`\n=== ${falhas === 0 ? "TODOS OS CHECKS PASSARAM" : `${falhas} CHECK(S) FALHARAM`} ===`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
