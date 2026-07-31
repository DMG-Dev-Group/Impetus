/**
 * Teste de fumaca de `listFiles` e `shareFile` — listagem rasa de pasta,
 * envio de arquivo unico (round-trip byte-identico), e zip de pasta
 * respeitando o `.gitignore` dela (node_modules excluido de verdade, nao so
 * "parece que exclui" — o zip resultante e efetivamente aberto e conferido).
 *
 * Sobe um cerebro e um agente reais, com pastas temporarias criadas so para
 * este teste (nao depende do disco do desenvolvedor nem do WhatsApp).
 *
 * Rodar: npm run smoke:files   (a partir de mvp/)
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { AgentClient } from "../apps/agent/src/wsClient";
import { formatarListaArquivos } from "../apps/brain/src/format";
import { AgentRegistry } from "../apps/brain/src/wsServer";

const PORT = 8098;
const SECRET = "segredo-de-teste-files";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

let falhas = 0;
function checar(nome: string, ok: boolean, detalhe = ""): void {
  console.log(`${ok ? "  PASS" : "  FALHA"} — ${nome}${detalhe ? ` (${detalhe})` : ""}`);
  if (!ok) falhas++;
}

async function main() {
  // --- 1. Pasta de projeto de teste -----------------------------------------
  const raiz = mkdtempSync(path.join(tmpdir(), "impetus-files-"));
  const projeto = path.join(raiz, "MeuProjeto");
  mkdirSync(projeto, { recursive: true });
  mkdirSync(path.join(projeto, "src"));
  mkdirSync(path.join(projeto, "node_modules", "alguma-lib"), { recursive: true });

  writeFileSync(path.join(projeto, "README.md"), "# Meu Projeto\nConteudo de teste.");
  writeFileSync(path.join(projeto, "src", "index.ts"), "console.log('oi');");
  writeFileSync(path.join(projeto, "node_modules", "alguma-lib", "lib.js"), "module.exports = {};");
  writeFileSync(path.join(projeto, ".gitignore"), "node_modules\n");

  // Arquivo solto (fora da pasta de projeto) para testar envio de ARQUIVO UNICO.
  const conteudoRelatorio = "conteudo binario de teste, ".repeat(50);
  writeFileSync(path.join(raiz, "relatorio.pdf"), conteudoRelatorio);

  console.log(`raiz de teste: ${raiz}`);

  // --- 2. Cerebro + agente reais ---------------------------------------------
  console.log("\n=== subindo cerebro + agente ===");
  const registry = new AgentRegistry({ port: PORT, pairingSecret: SECRET });
  await espera(200);

  const agent = new AgentClient({
    brainUrl: `ws://localhost:${PORT}`,
    nick: "PC-Files",
    secret: SECRET,
    indexRoots: [raiz],
    onRegistrationRejected: (r) => console.log(`  [PC-Files] recusado: ${r}`),
  });
  agent.connect();
  await espera(600);
  checar("agente registrado", registry.connectedNicks().includes("PC-Files"));

  // --- 3. listFiles — listagem rasa --------------------------------------------
  console.log("\n=== listFiles: MeuProjeto ===");
  const resultadoLista = await registry.requestListFiles("PC-Files", projeto);
  checar("ok=true", resultadoLista.ok, JSON.stringify(resultadoLista));
  if (resultadoLista.ok) {
    const { entries } = resultadoLista;
    checar("3 entradas no primeiro nivel", entries.length === 3, String(entries.length));
    checar(
      "src/ aparece como pasta",
      entries.some((e) => e.name === "src" && e.isDirectory),
    );
    checar(
      "node_modules/ aparece como pasta (listFiles NAO filtra .gitignore, so zip filtra)",
      entries.some((e) => e.name === "node_modules" && e.isDirectory),
    );
    const readme = entries.find((e) => e.name === "README.md");
    checar("README.md aparece como arquivo", readme?.isDirectory === false);
    checar("README.md tem tamanho em bytes", typeof readme?.sizeBytes === "number" && readme.sizeBytes > 0);

    const texto = formatarListaArquivos({ nick: "PC-Files", match: { name: "MeuProjeto", path: projeto, kind: "folder", isGitRepo: false, lastModified: new Date().toISOString() } }, entries);
    checar("formatacao cita src/", texto.includes("src/"));
    checar("formatacao cita README.md com tamanho", /README\.md \(\d/.test(texto));
  }

  console.log("\n=== listFiles: pasta vazia ===");
  const pastaVazia = path.join(raiz, "Vazia");
  mkdirSync(pastaVazia);
  const resultadoVazio = await registry.requestListFiles("PC-Files", pastaVazia);
  checar("ok=true", resultadoVazio.ok);
  if (resultadoVazio.ok) checar("0 entradas", resultadoVazio.entries.length === 0);

  console.log("\n=== listFiles: agente que nao existe mais ===");
  const resultadoSemAgente = await registry.requestListFiles("PC-Fantasma", projeto);
  checar("ok=false", resultadoSemAgente.ok === false);

  // --- 4. shareFile — arquivo unico: round-trip byte-identico -----------------
  console.log("\n=== shareFile: arquivo unico (relatorio.pdf) ===");
  const resultadoArquivo = await registry.requestShareFile("PC-Files", path.join(raiz, "relatorio.pdf"));
  checar("ok=true", resultadoArquivo.ok, JSON.stringify(resultadoArquivo).slice(0, 200));
  if (resultadoArquivo.ok) {
    checar("fileName correto", resultadoArquivo.fileName === "relatorio.pdf", resultadoArquivo.fileName);
    checar("mimeType correto (.pdf)", resultadoArquivo.mimeType === "application/pdf", resultadoArquivo.mimeType);
    const decodificado = Buffer.from(resultadoArquivo.contentBase64, "base64").toString("utf8");
    checar("conteudo byte-identico ao original", decodificado === conteudoRelatorio);
  }

  // --- 5. shareFile — pasta: deve virar zip, excluindo node_modules -----------
  console.log("\n=== shareFile: pasta (MeuProjeto) — deve zipar ===");
  const resultadoPasta = await registry.requestShareFile("PC-Files", projeto);
  checar("ok=true", resultadoPasta.ok, JSON.stringify(resultadoPasta).slice(0, 200));
  if (resultadoPasta.ok) {
    checar("fileName vira MeuProjeto.zip", resultadoPasta.fileName === "MeuProjeto.zip", resultadoPasta.fileName);
    checar("mimeType application/zip", resultadoPasta.mimeType === "application/zip", resultadoPasta.mimeType);

    const zipBuffer = Buffer.from(resultadoPasta.contentBase64, "base64");
    checar("comeca com assinatura de zip (PK)", zipBuffer.slice(0, 2).toString("ascii") === "PK");

    // Abre o zip DE VERDADE e confere o conteudo — nao so o tamanho/assinatura.
    const zip = new AdmZip(zipBuffer);
    const nomes = zip.getEntries().map((e) => e.entryName.replace(/\\/g, "/"));
    console.log(`  entradas no zip: ${nomes.join(", ")}`);

    checar("README.md esta no zip", nomes.includes("README.md"));
    checar("src/index.ts esta no zip", nomes.includes("src/index.ts"));
    checar(
      "NADA de node_modules esta no zip",
      !nomes.some((n) => n.startsWith("node_modules")),
    );
    checar(
      ".gitignore o proprio esta no zip (nao ha regra que o exclua a si mesmo)",
      nomes.includes(".gitignore"),
    );

    const readmeEntry = zip.getEntries().find((e) => e.entryName.replace(/\\/g, "/") === "README.md");
    checar(
      "conteudo do README.md dentro do zip bate com o original",
      readmeEntry?.getData().toString("utf8") === "# Meu Projeto\nConteudo de teste.",
    );
  }

  // --- 6. shareFile — teto de tamanho ------------------------------------------
  console.log("\n=== shareFile: arquivo acima do teto (AGENT_MAX_FILE_MB) ===");
  const raizGrande = mkdtempSync(path.join(tmpdir(), "impetus-files-grande-"));
  const arquivoGrande = path.join(raizGrande, "grande.bin");
  // 1MB de conteudo, com teto configurado bem abaixo (env var so para este bloco).
  writeFileSync(arquivoGrande, Buffer.alloc(1024 * 1024, 1));
  process.env.AGENT_MAX_FILE_MB = "0.5";

  const agentLimitado = new AgentClient({
    brainUrl: `ws://localhost:${PORT}`,
    nick: "PC-Limitado",
    secret: SECRET,
    indexRoots: [],
    onRegistrationRejected: (r) => console.log(`  [PC-Limitado] recusado: ${r}`),
  });
  agentLimitado.connect();
  await espera(600);

  const resultadoGrande = await registry.requestShareFile("PC-Limitado", arquivoGrande);
  checar("ok=false (passou do teto)", resultadoGrande.ok === false, JSON.stringify(resultadoGrande));

  agentLimitado.close();
  delete process.env.AGENT_MAX_FILE_MB;
  rmSync(raizGrande, { recursive: true, force: true });

  // --- limpeza ---------------------------------------------------------------
  agent.close();
  registry.close();
  rmSync(raiz, { recursive: true, force: true });
  await espera(200);

  console.log(`\n=== ${falhas === 0 ? "TODOS OS CHECKS PASSARAM" : `${falhas} CHECK(S) FALHARAM`} ===`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
