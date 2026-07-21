/**
 * Banco de frases para medir a qualidade da classificacao de intencao.
 *
 * Rodar: npm run bench:intent   (a partir de mvp/)
 *
 * Precisa de GROQ_API_KEY no .env do brain — faz chamadas reais, uma por caso,
 * com pausa entre elas para nao estourar o limite do tier gratuito.
 *
 * ┌─ REGRA DESTE ARQUIVO ────────────────────────────────────────────────────┐
 * │ As frases aqui NAO podem repetir os exemplos do prompt do `intent.ts`.   │
 * │                                                                          │
 * │ O objetivo nao e verificar se o modelo decorou os exemplos — e verificar │
 * │ se ele GENERALIZA a regra para formulacoes que nunca viu. Por isso as    │
 * │ frases abaixo usam giria, erro de digitacao, falta de acento e ordem     │
 * │ invertida de proposito. Ao acrescentar casos, mantenha essa regra: uma   │
 * │ frase copiada do prompt mede memoria, nao compreensao.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Use ao trocar de modelo ou mexer no prompt. Foi ele que revelou, no OpenRouter,
 * que o `gpt-oss-20b` ignorava o schema inteiro — algo que o teste manual pelo
 * WhatsApp fazia parecer apenas "classificacao fraca".
 *
 * Sobrescreva o modelo sem editar o .env:
 *   GROQ_MODEL="openai/gpt-oss-20b" npm run bench:intent
 */
import * as dotenv from "dotenv";
import * as path from "node:path";

const BRAIN = path.resolve(__dirname, "..", "apps", "brain");
dotenv.config({ path: path.join(BRAIN, ".env") });

type Esperado = "status" | "find" | "gitStatus" | "listFiles" | "shareFile" | "unknown";

/** [frase, intencao esperada, trecho esperado no alvo (opcional)] */
const CASOS: [string, Esperado, string?][] = [
  // --- status: nenhuma destas esta no prompt ---
  ["as maquina tao de pe?", "status"],
  ["tem pc ligado ai", "status"],
  ["o notebook do guilherme responde?", "status", "guilherme"],
  ["quem apareceu pra trabalhar hoje", "status"],

  // --- find ---
  ["onde foi parar a pasta do tendresse", "find", "tendresse"],
  ["sabe me dizer se tem o repositorio da flora ai", "find", "flora"],
  ["localiza ai o diretorio do dmg saas", "find", "dmg saas"],
  ["em que lugar ta salvo o site", "find", "site"],

  // --- gitStatus ---
  ["tem algo pra subir no flora?", "gitStatus", "flora"],
  ["em que branch ta o site", "gitStatus", "site"],
  ["ja commitaram tudo no impetus?", "gitStatus", "impetus"],
  ["me fala das mudanca do repo tendresse", "gitStatus", "tendresse"],

  // --- listFiles ---
  ["quais sao os arquivo da pasta flora", "listFiles", "flora"],
  ["da um ls no projeto impetus", "listFiles", "impetus"],
  ["quero ver oq tem dentro do tendresse", "listFiles", "tendresse"],
  ["abre a pasta do site e me diz o que tem", "listFiles", "site"],

  // --- shareFile ---
  ["consegue me mandar o contrato.docx", "shareFile", "contrato.docx"],
  ["compacta ai o dmg saas pra mim", "shareFile", "dmg saas"],
  ["preciso que voce me envie a pasta do flora", "shareFile", "flora"],
  ["manda o zip do site", "shareFile", "site"],

  // --- unknown ---
  ["e ai beleza", "unknown"],
  ["faz um cafe", "unknown"],
  ["qual a capital da franca", "unknown"],
  ["deleta tudo", "unknown"],
];

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { interpretarIntencao, MODELO } = await import(
    "file:///" + BRAIN.replace(/\\/g, "/") + "/src/intent.ts"
  );
  console.log(`modelo: ${MODELO}\ncasos: ${CASOS.length}\n`);

  let acertos = 0;
  let alvosOk = 0;
  let alvosTestados = 0;
  const erros: string[] = [];

  for (const [frase, esperado, alvoEsperado] of CASOS) {
    let obtido = "ERRO";
    let alvo: string | null = null;
    try {
      const r = await interpretarIntencao(frase);
      obtido = r.intent;
      alvo = r.alvo;
    } catch (e) {
      obtido = `ERRO(${e instanceof Error ? e.message.slice(0, 45) : e})`;
    }

    const ok = obtido === esperado;
    if (ok) acertos++;
    else erros.push(`"${frase}" -> ${obtido} (esperado ${esperado})`);

    let notaAlvo = "";
    if (alvoEsperado) {
      alvosTestados++;
      const alvoOk = (alvo ?? "").toLowerCase().includes(alvoEsperado.toLowerCase());
      if (alvoOk) alvosOk++;
      notaAlvo = alvoOk ? `  alvo:"${alvo}"` : `  ALVO-FALHOU:"${alvo}" (queria conter "${alvoEsperado}")`;
    } else if (alvo) {
      notaAlvo = `  alvo:"${alvo}"`;
    }

    console.log(
      `${ok ? "OK  " : "FALHA"} | ${esperado.padEnd(10)} | "${frase}"${ok ? "" : `  => ${obtido}`}${notaAlvo}`,
    );
    await espera(1200);
  }

  console.log(`\n=== intencao: ${acertos}/${CASOS.length} (${Math.round((acertos / CASOS.length) * 100)}%) ===`);
  if (alvosTestados) {
    console.log(`=== alvo: ${alvosOk}/${alvosTestados} (${Math.round((alvosOk / alvosTestados) * 100)}%) ===`);
  }
  if (erros.length) {
    console.log("\nFalhas de intencao:");
    erros.forEach((e) => console.log("  - " + e));
  }
}

main();
