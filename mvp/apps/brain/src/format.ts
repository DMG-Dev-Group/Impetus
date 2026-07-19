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
