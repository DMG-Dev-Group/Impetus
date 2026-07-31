import { existsSync, readdirSync, statSync, type Dirent } from "node:fs";
import { join } from "node:path";
import type { FindMatch } from "@impetus/protocol";

/**
 * Indice leve do que este agente reconhece: pastas de projeto E arquivos
 * soltos, ambos so no PRIMEIRO NIVEL de cada raiz configurada.
 *
 * Cada subpasta e tratada como "um projeto". Nao caminha recursivamente para
 * dentro de cada projeto (isso evitaria custo de escanear coisas como
 * `node_modules`, e nao e o que a busca precisa: encontrar ONDE o projeto esta,
 * nao o que tem dentro dele — isso e o `listFiles`, de uma fatia futura).
 * Arquivos soltos no mesmo nivel (ex.: um `.rar` do lado das pastas de
 * projeto) tambem entram — sao a mesma coisa do ponto de vista de "o que tem
 * aqui", so que com `kind: "file"` em vez de `"folder"`.
 *
 * Atualizado por refresh periodico simples (`setInterval`), nao por um
 * observador de sistema de arquivos — o `DESCRITIVO_MVP.md` permite qualquer um
 * dos dois, e um watcher traria dependencia e complexidade cross-platform sem
 * necessidade clara nesta fatia (simplicidade sobre sofisticacao aparente).
 */

const INTERVALO_REFRESH_MS = 5 * 60_000;

export class FileIndex {
  private pastas: FindMatch[] = [];
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(private readonly raizes: string[]) {}

  /** Escaneia todas as raizes agora e sobe o refresh periodico. */
  start(): void {
    this.construir();
    this.refreshTimer = setInterval(() => this.construir(), INTERVALO_REFRESH_MS);
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Busca aproximada por nome de pasta. Normaliza (minusculo, sem acento) e
   * compara por substring nos dois sentidos — simples de proposito: e um
   * indice leve, nao um motor de busca. Ordena por relevancia (match mais
   * especifico primeiro) e limita o total de resultados.
   */
  search(query: string, limite = 5): FindMatch[] {
    const alvo = normalizar(query);
    if (!alvo) return [];

    return this.pastas
      .map((pasta) => ({ pasta, pontos: pontuar(normalizar(pasta.name), alvo) }))
      .filter((p) => p.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, limite)
      .map((p) => p.pasta);
  }

  private construir(): void {
    const encontradas: FindMatch[] = [];

    for (const raiz of this.raizes) {
      let entradas: Dirent[];
      try {
        entradas = readdirSync(raiz, { withFileTypes: true });
      } catch (err) {
        console.warn(`[index] nao consegui ler "${raiz}": ${err instanceof Error ? err.message : err}`);
        continue;
      }

      for (const entrada of entradas) {
        if (entrada.name.startsWith(".")) continue; // oculto nao e "projeto" nem candidato
        if (!entrada.isDirectory() && !entrada.isFile()) continue; // symlink/socket/etc — ignora

        const caminho = join(raiz, entrada.name);
        let mtime: Date;
        try {
          mtime = statSync(caminho).mtime;
        } catch {
          continue; // sumiu entre o readdir e o stat — ignora, o proximo refresh corrige
        }

        const kind: "folder" | "file" = entrada.isDirectory() ? "folder" : "file";

        encontradas.push({
          name: entrada.name,
          path: caminho,
          kind,
          // "e repositorio git" so faz sentido para pasta; arquivo e sempre false.
          isGitRepo: kind === "folder" && existsSync(join(caminho, ".git")),
          lastModified: mtime.toISOString(),
        });
      }
    }

    this.pastas = encontradas;
    console.log(`[index] ${encontradas.length} pasta(s) indexada(s) em ${this.raizes.length} raiz(es)`);
  }
}

// Faixa Unicode das marcas diacriticas combinantes (acentos) que a forma NFD
// separa da letra base: U+0300 a U+036F. Comparada por CODIGO NUMERICO, nao por
// caractere literal ou regex no fonte — assim nao ha combining character solto
// no arquivo, que ficaria fragil a como o editor/encoding lida com ele.
const INICIO_MARCAS_DIACRITICAS = 0x0300;
const FIM_MARCAS_DIACRITICAS = 0x036f;

// Espaco, underscore, hifen e ponto sao tratados como o MESMO separador — ou
// seja, removidos da comparacao. Sem isso, "dmg saas" (do jeito que se fala)
// nao batia com a pasta "DMG_SaaS" (do jeito que se nomeia pasta no disco), e
// ninguem fala "dmg underscore saas" numa frase natural. Achado verificando o
// indice contra a pasta real do usuario, nao em teoria.
const SEPARADORES = /[ _.-]+/g;

function normalizar(s: string): string {
  let semAcentos = "";
  for (const caractere of s.normalize("NFD")) {
    const codigo = caractere.codePointAt(0) ?? 0;
    if (codigo >= INICIO_MARCAS_DIACRITICAS && codigo <= FIM_MARCAS_DIACRITICAS) continue;
    semAcentos += caractere;
  }
  return semAcentos.toLowerCase().trim().replace(SEPARADORES, "");
}

/**
 * Pontuacao simples: match exato > comeca com > nome contem a query.
 *
 * NAO existe mais um ramo para "query contem o nome" (o inverso). Ele existia
 * antes e foi removido depois de causar um falso positivo real: buscar
 * "DMG_SaaS.rar" normaliza para "dmgsaasrar" (o ponto da extensao vira
 * separador removido), e isso "cola" o sufixo da extensao no nome da pasta
 * "DMG_SaaS" (-> "dmgsaas") de um jeito que o antigo ramo aceitava como match
 * fraco — trazendo a PASTA quando a pessoa queria o ARQUIVO. Combinado com
 * indexar arquivos soltos (ver `construir`), o arquivo agora bate exato na sua
 * propria busca, e a pasta nao entra mais em nenhum ramo — o comportamento
 * certo sem precisar de caso especial pra extensao.
 */
function pontuar(nomeNormalizado: string, queryNormalizada: string): number {
  if (nomeNormalizado === queryNormalizada) return 100;
  if (nomeNormalizado.startsWith(queryNormalizada)) return 75;
  if (nomeNormalizado.includes(queryNormalizada)) return 50;
  return 0;
}
