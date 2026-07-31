/**
 * Teste de fumaca do protocolo `find` — indice local, busca aproximada,
 * agregacao entre agentes, disambiguacao e a pergunta pendente que resolve ela.
 *
 * Sobe um cerebro e um agente reais, com um indice apontado para pastas
 * temporarias criadas so para este teste (nao depende do disco do
 * desenvolvedor nem do WhatsApp).
 *
 * Rodar: npm run smoke:find   (a partir de mvp/)
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FindMatch } from "@impetus/protocol";
import { AgentClient } from "../apps/agent/src/wsClient";
import { formatarListaDisambiguacao, formatarMatchUnico } from "../apps/brain/src/format";
import { PendingQuestions, resolverEscolha } from "../apps/brain/src/pendingQuestions";
import { AgentRegistry } from "../apps/brain/src/wsServer";

const PORT = 8097;
const SECRET = "segredo-de-teste-find";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

let falhas = 0;
function checar(nome: string, ok: boolean, detalhe = ""): void {
  console.log(`${ok ? "  PASS" : "  FALHA"} — ${nome}${detalhe ? ` (${detalhe})` : ""}`);
  if (!ok) falhas++;
}

/** Monta uma pasta de projeto falsa dentro da raiz de teste. */
function criarProjeto(raiz: string, nome: string, comGit: boolean): void {
  const caminho = path.join(raiz, nome);
  mkdirSync(caminho, { recursive: true });
  if (comGit) mkdirSync(path.join(caminho, ".git"));
}

/** Monta um arquivo solto (nao pasta) dentro da raiz de teste. */
function criarArquivo(raiz: string, nome: string): void {
  writeFileSync(path.join(raiz, nome), "conteudo de teste");
}

async function main() {
  // --- 1. Pastas de teste ---------------------------------------------------
  const raiz = mkdtempSync(path.join(tmpdir(), "impetus-find-"));
  criarProjeto(raiz, "FloraBeauty", true);
  criarProjeto(raiz, "Flora-Docs", false);
  criarProjeto(raiz, "Tendresse", true);
  criarProjeto(raiz, "PastaQualquer", false);
  // Reproduz o bug real: pasta de projeto com um ARQUIVO solto de nome
  // parecido do lado (ex.: um .rar de backup ao lado da pasta do projeto).
  criarProjeto(raiz, "DMG_SaaS", false);
  criarArquivo(raiz, "DMG_SaaS.rar");
  console.log(`raiz de teste: ${raiz}`);

  // --- 2. Cerebro + agente reais, indice apontado pra raiz de teste --------
  console.log("\n=== subindo cerebro + agente com indice de teste ===");
  const registry = new AgentRegistry({ port: PORT, pairingSecret: SECRET });
  await espera(200);

  const agent = new AgentClient({
    brainUrl: `ws://localhost:${PORT}`,
    nick: "PC-Find",
    secret: SECRET,
    indexRoots: [raiz],
    onRegistrationRejected: (r) => console.log(`  [PC-Find] recusado: ${r}`),
  });
  agent.connect();
  await espera(600);
  checar("agente registrado", registry.connectedNicks().includes("PC-Find"));

  // --- 3. Busca com um so candidato ----------------------------------------
  console.log("\n=== find \"tendresse\" — um so candidato ===");
  const rUnico = await registry.requestFindFromAll("tendresse");
  const matchesUnico = rUnico.flatMap((r) => (r.ok ? r.matches : []));
  checar("achou exatamente 1", matchesUnico.length === 1, String(matchesUnico.length));
  checar("nome bate", matchesUnico[0]?.name === "Tendresse", matchesUnico[0]?.name);
  checar("isGitRepo=true (tem .git)", matchesUnico[0]?.isGitRepo === true);
  checar("kind='folder'", matchesUnico[0]?.kind === "folder", matchesUnico[0]?.kind);

  // --- 3-B. Regressao: arquivo solto com nome parecido de uma pasta --------
  // Reproduz o bug relatado em uso real: um arquivo "DMG_SaaS.rar" ao lado da
  // pasta "DMG_SaaS" nao pode ser confundido com a pasta quando a pessoa
  // busca pelo nome COM a extensao.
  console.log("\n=== find \"DMG_SaaS.rar\" — deve achar o ARQUIVO, nao a pasta ===");
  const rArquivo = await registry.requestFindFromAll("DMG_SaaS.rar");
  const matchesArquivo = rArquivo.flatMap((r) => (r.ok ? r.matches : []));
  checar("achou exatamente 1", matchesArquivo.length === 1, String(matchesArquivo.length));
  checar("e o ARQUIVO, nao a pasta", matchesArquivo[0]?.name === "DMG_SaaS.rar", matchesArquivo[0]?.name);
  checar("kind='file'", matchesArquivo[0]?.kind === "file", matchesArquivo[0]?.kind);
  checar("isGitRepo=false (arquivo nunca e repo)", matchesArquivo[0]?.isGitRepo === false);

  console.log("\n=== find \"DMG_SaaS\" (sem extensao) — pasta E arquivo sao candidatos ===");
  const rAmbos = await registry.requestFindFromAll("DMG_SaaS");
  const matchesAmbos = rAmbos.flatMap((r) => (r.ok ? r.matches : []));
  checar("achou os 2 (pasta + arquivo)", matchesAmbos.length === 2, String(matchesAmbos.length));
  checar(
    "a pasta esta entre os candidatos",
    matchesAmbos.some((m) => m.name === "DMG_SaaS" && m.kind === "folder"),
  );
  checar(
    "o arquivo esta entre os candidatos",
    matchesAmbos.some((m) => m.name === "DMG_SaaS.rar" && m.kind === "file"),
  );

  // --- 4. Busca com varios candidatos (disambiguacao) ----------------------
  console.log("\n=== find \"flora\" — varios candidatos ===");
  const rVarios = await registry.requestFindFromAll("flora");
  const matchesVarios = rVarios.flatMap((r) => (r.ok ? r.matches : []));
  checar("achou 2 candidatos", matchesVarios.length === 2, String(matchesVarios.length));
  checar(
    "FloraBeauty esta entre os candidatos",
    matchesVarios.some((m) => m.name === "FloraBeauty"),
  );
  checar(
    "Flora-Docs esta entre os candidatos",
    matchesVarios.some((m) => m.name === "Flora-Docs"),
  );
  checar("PastaQualquer NAO aparece", !matchesVarios.some((m) => m.name === "PastaQualquer"));

  // --- 5. Busca sem nenhum candidato ----------------------------------------
  console.log("\n=== find \"xyz-nao-existe\" — nenhum candidato ===");
  const rNenhum = await registry.requestFindFromAll("xyz-nao-existe");
  const matchesNenhum = rNenhum.flatMap((r) => (r.ok ? r.matches : []));
  checar("nao achou nada", matchesNenhum.length === 0, String(matchesNenhum.length));

  // --- 6. Formatacao (funcoes puras, sem rede) ------------------------------
  console.log("\n=== formatacao das respostas ===");
  const candidatos = matchesVarios.map((match) => ({ nick: "PC-Find", match }));
  const textoUnico = formatarMatchUnico({ nick: "PC-Find", match: matchesUnico[0] as FindMatch });
  checar("resposta de match unico cita o nome", textoUnico.includes("Tendresse"));
  checar("resposta de match unico cita 'repositório git'", textoUnico.includes("é um repositório git"));

  const textoLista = formatarListaDisambiguacao("flora", candidatos);
  checar("lista de disambiguacao numera 1.", textoLista.includes("1."));
  checar("lista de disambiguacao numera 2.", textoLista.includes("2."));
  checar("lista cita os dois nomes", textoLista.includes("FloraBeauty") && textoLista.includes("Flora-Docs"));

  // --- 7. resolverEscolha — resolucao deterministica da disambiguacao ------
  console.log("\n=== resolverEscolha ===");
  checar("responde '1' -> primeiro candidato", resolverEscolha("1", candidatos)?.match.name === candidatos[0].match.name);
  checar("responde '2' -> segundo candidato", resolverEscolha("2", candidatos)?.match.name === candidatos[1].match.name);
  checar(
    "responde pelo nome (case-insensitive) -> candidato certo",
    resolverEscolha("florabeauty", candidatos)?.match.name === "FloraBeauty",
  );
  checar("responde algo sem relacao -> null", resolverEscolha("nao tem nada a ver", candidatos) === null);
  checar("responde '99' (fora do intervalo) -> null", resolverEscolha("99", candidatos) === null);

  // --- 8. PendingQuestions — definir/consumir e expiracao ------------------
  console.log("\n=== PendingQuestions: ciclo normal ===");
  const perguntas = new PendingQuestions();
  perguntas.definir("5598900000000", { kind: "target", acao: "find", askedAt: Date.now() });
  const lida = perguntas.consumir("5598900000000");
  checar("pergunta pendente e lida", lida?.kind === "target" && lida.acao === "find");
  checar("consumir novamente devolve null (foi consumida)", perguntas.consumir("5598900000000") === null);

  console.log("\n=== PendingQuestions: expiracao por TTL ===");
  const perguntasComTtlCurto = new PendingQuestions(50); // 50ms so para este teste
  perguntasComTtlCurto.definir("5598911111111", { kind: "target", acao: "find", askedAt: Date.now() });
  await espera(120);
  checar(
    "pergunta expirada e tratada como se nao existisse",
    perguntasComTtlCurto.consumir("5598911111111") === null,
  );

  // --- limpeza ---------------------------------------------------------------
  agent.close();
  registry.close();
  rmSync(raiz, { recursive: true, force: true });
  await espera(200);

  console.log(`\n=== ${falhas === 0 ? "TODOS OS CHECKS PASSARAM" : `${falhas} CHECK(S) FALHARAM`} ===`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
