import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import archiver from "archiver";
import ignoreFactory from "ignore";

type Ignore = ReturnType<typeof ignoreFactory>;

/**
 * Prepara um arquivo (ou pasta, zipada) para envio pelo WhatsApp.
 *
 * Se `caminhoAbsoluto` for um ARQUIVO, le e devolve o conteudo direto. Se for
 * uma PASTA, zipa antes — essa e a regra pedida: "se eu pedir por uma pasta em
 * vez de um arquivo, ele deve zipar e enviar o zip". A pasta zipada respeita o
 * `.gitignore` dela mesma (biblioteca `ignore`), reaproveitando a decisao que o
 * proprio time ja tomou no `00_DECISOES.md` — em vez de uma lista fixa de
 * exclusao, que ia divergir do que cada projeto realmente ignora.
 *
 * Ha um teto de tamanho (configuravel via `AGENT_MAX_FILE_MB`, default 20MB) —
 * existe pra ficar bem abaixo do limite de 100MB por mensagem do `ws`
 * (o conteudo vai em base64, que infla ~33%: 20MB vira ~27MB, com folga).
 * Para pasta, o teto e checado ANTES de zipar (soma do tamanho dos arquivos que
 * entrariam, ja descontando o `.gitignore`) — assim nunca precisamos abortar um
 * stream de compressao no meio, so recusar de forma previsivel e simples.
 */

// Lido a cada chamada (nao congelado numa constante de modulo) para que testes
// possam ajustar `AGENT_MAX_FILE_MB` em tempo de execucao sem precisar de um
// processo novo — e para refletir o `.env` atual, nao o de quando o processo subiu.
function tamanhoMaximoBytes(): number {
  return Number(process.env.AGENT_MAX_FILE_MB ?? 20) * 1024 * 1024;
}

export interface ArquivoParaEnviar {
  fileName: string;
  contentBase64: string;
  mimeType: string;
}

export async function prepararEnvio(caminhoAbsoluto: string): Promise<ArquivoParaEnviar> {
  const stats = statSync(caminhoAbsoluto);
  if (stats.isDirectory()) {
    return zipar(caminhoAbsoluto);
  }
  return arquivoUnico(caminhoAbsoluto, stats.size);
}

function arquivoUnico(caminhoAbsoluto: string, tamanho: number): ArquivoParaEnviar {
  const limite = tamanhoMaximoBytes();
  if (tamanho > limite) {
    throw new Error(`arquivo tem ${formatarMB(tamanho)}, acima do limite de ${formatarMB(limite)}`);
  }
  const conteudo = readFileSync(caminhoAbsoluto);
  return {
    fileName: basename(caminhoAbsoluto),
    contentBase64: conteudo.toString("base64"),
    mimeType: adivinharMimeType(caminhoAbsoluto),
  };
}

function montarIgnore(caminhoAbsoluto: string): Ignore {
  const ig = ignoreFactory();
  const gitignorePath = join(caminhoAbsoluto, ".gitignore");
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, "utf8"));
  }
  // Mesmo sem .gitignore proprio, estes dois nunca fazem sentido dentro do zip.
  ig.add(["node_modules", ".git"]);
  return ig;
}

/** Caminho relativo (a raiz zipada) usando "/" sempre — sintaxe do .gitignore e sempre "/", mesmo no Windows. */
function caminhoRelativoParaIgnore(prefixo: string, nome: string): string {
  return prefixo ? `${prefixo}/${nome}` : nome;
}

/**
 * Soma o tamanho do que entraria no zip (ja descontando o `.gitignore`),
 * lancando assim que passar do teto — sem precisar terminar de percorrer uma
 * arvore muito grande so pra descobrir que ela nao cabe.
 */
function verificarTamanho(caminhoAbsoluto: string, ig: Ignore, acumuladoAntes: number, prefixo = ""): number {
  const limite = tamanhoMaximoBytes();
  let acumulado = acumuladoAntes;
  const entradas = readdirSync(caminhoAbsoluto, { withFileTypes: true });

  for (const entrada of entradas) {
    const relativo = caminhoRelativoParaIgnore(prefixo, entrada.name);
    if (ig.ignores(relativo)) continue;

    const caminhoFilho = join(caminhoAbsoluto, entrada.name);
    if (entrada.isDirectory()) {
      acumulado = verificarTamanho(caminhoFilho, ig, acumulado, relativo);
    } else if (entrada.isFile()) {
      acumulado += statSync(caminhoFilho).size;
    }

    if (acumulado > limite) {
      throw new Error(`pasta passa de ${formatarMB(limite)} sem compactar — grande demais pra enviar`);
    }
  }

  return acumulado;
}

async function zipar(caminhoAbsoluto: string): Promise<ArquivoParaEnviar> {
  const nomeBase = basename(caminhoAbsoluto);
  const ig = montarIgnore(caminhoAbsoluto);

  // Checagem previa: se o CONTEUDO (sem compactar) ja estoura o teto, nem
  // tenta zipar. O zip compactado tende a ser menor, entao isso recusa alguns
  // casos que talvez coubessem depois de comprimidos — troca deliberada:
  // simplicidade e previsibilidade em vez de abortar um stream no meio.
  verificarTamanho(caminhoAbsoluto, ig, 0);

  const archive = archiver("zip", { zlib: { level: 9 } });
  const pedacos: Buffer[] = [];
  archive.on("data", (pedaco: Buffer) => pedacos.push(pedaco));

  const erroPromise = new Promise<never>((_resolve, reject) => {
    archive.on("error", (err) => reject(err));
  });

  archive.directory(caminhoAbsoluto, false, (entry) => {
    const normalizado = entry.name.replace(/\\/g, "/");
    return ig.ignores(normalizado) ? false : entry;
  });

  await Promise.race([archive.finalize(), erroPromise]);

  return {
    fileName: `${nomeBase}.zip`,
    contentBase64: Buffer.concat(pedacos).toString("base64"),
    mimeType: "application/zip",
  };
}

function formatarMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const MIME_POR_EXTENSAO: Record<string, string> = {
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".xml": "application/xml",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

function adivinharMimeType(caminhoAbsoluto: string): string {
  const ponto = caminhoAbsoluto.lastIndexOf(".");
  const ext = ponto === -1 ? "" : caminhoAbsoluto.slice(ponto).toLowerCase();
  return MIME_POR_EXTENSAO[ext] ?? "application/octet-stream";
}
