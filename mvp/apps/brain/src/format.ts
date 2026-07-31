import type { FileEntry, FindMatch } from "@impetus/protocol";
import type { StatusResult } from "./wsServer";

/** Transforma segundos em algo legivel por humano, sem precisao falsa. */
export function formatarUptime(segundos: number): string {
  if (segundos < 60) return "menos de 1 min";

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  if (horas < 24) {
    return minutosRestantes === 0 ? `${horas}h` : `${horas}h ${minutosRestantes}min`;
  }

  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;
  return horasRestantes === 0 ? `${dias}d` : `${dias}d ${horasRestantes}h`;
}

/** Monta a resposta do WhatsApp: uma linha por maquina. */
export function formatarRespostaStatus(resultados: StatusResult[]): string {
  return resultados
    .map((r) =>
      r.ok ? `${r.nick} — online há ${formatarUptime(r.uptimeSeconds)}` : `${r.nick} — ${r.error}`,
    )
    .join("\n");
}

/** Uma pasta encontrada, junto do nick da maquina onde ela foi achada. */
export interface FindCandidato {
  nick: string;
  match: FindMatch;
}

/** Data ISO em formato legivel (so o dia — hora nao importa pra "ultima modificacao"). */
function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

/**
 * Resposta para quando a busca encontrou exatamente um candidato.
 *
 * "e/nao e repositorio git" so faz sentido pra pasta — pra arquivo solto
 * (`kind: "file"`, ex.: um `.rar` do lado dos projetos) essa linha nao
 * apareceria com sentido nenhum, entao e omitida.
 */
export function formatarMatchUnico(candidato: FindCandidato): string {
  const { nick, match } = candidato;
  const complemento =
    match.kind === "folder"
      ? (match.isGitRepo ? "é um repositório git" : "não é um repositório git") +
        `, última modificação em ${formatarData(match.lastModified)}.`
      : `última modificação em ${formatarData(match.lastModified)}.`;
  return `Achei: ${match.name} — ${nick}\n${match.path}\n${complemento}`;
}

/**
 * Resposta para quando a busca encontrou mais de um candidato — lista numerada,
 * pedindo pra pessoa escolher. O numero de cada linha e o que
 * `resolverEscolha` (em `pendingQuestions.ts`) aceita como resposta.
 */
export function formatarListaDisambiguacao(query: string, candidatos: FindCandidato[]): string {
  const linhas = candidatos.map((c, i) => `${i + 1}. ${c.match.name} — ${c.nick} (${c.match.path})`);
  return (
    `Achei mais de um projeto parecido com "${query}":\n\n` +
    linhas.join("\n") +
    "\n\nResponda com o número ou o nome, pra eu saber qual."
  );
}

/** Tamanho em bytes, formatado de forma legivel (B/KB/MB). */
function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Resposta de `listFiles` — pastas primeiro (marcadas com "/", convenção comum
 * de listagem), depois arquivos com tamanho, ambos em ordem alfabética.
 */
export function formatarListaArquivos(candidato: FindCandidato, entries: FileEntry[]): string {
  const cabecalho = `${candidato.match.name} — ${candidato.nick}:`;

  if (entries.length === 0) {
    return `${cabecalho}\n(pasta vazia)`;
  }

  const linhas = [...entries]
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
    .map((e) =>
      e.isDirectory ? `${e.name}/` : `${e.name}${e.sizeBytes !== undefined ? ` (${formatarTamanho(e.sizeBytes)})` : ""}`,
    );

  return `${cabecalho}\n\n${linhas.join("\n")}`;
}
