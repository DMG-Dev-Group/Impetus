import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FileEntry } from "@impetus/protocol";

/**
 * Lista o conteudo de uma pasta — um so nivel, mesmo criterio "raso" do
 * `FileIndex` (ver fileIndex.ts): nao entra recursivamente em subpastas.
 *
 * `caminhoAbsoluto` ja vem resolvido (por uma busca previa via `find`) — esta
 * funcao so le o que esta la, sem nenhuma logica de busca/match.
 */
export function listarConteudo(caminhoAbsoluto: string): FileEntry[] {
  const entradas = readdirSync(caminhoAbsoluto, { withFileTypes: true });

  return entradas
    .filter((entrada) => !entrada.name.startsWith(".")) // oculto nao aparece, mesmo criterio do indice
    .map((entrada) => {
      const caminho = join(caminhoAbsoluto, entrada.name);
      const stats = statSync(caminho);
      const isDirectory = entrada.isDirectory();
      return {
        name: entrada.name,
        isDirectory,
        sizeBytes: isDirectory ? undefined : stats.size,
        lastModified: stats.mtime.toISOString(),
      };
    });
}
