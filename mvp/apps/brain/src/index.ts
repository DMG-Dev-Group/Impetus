import "dotenv/config";
import type { CommandName, FindMatch } from "@impetus/protocol";
import {
  formatarListaArquivos,
  formatarListaDisambiguacao,
  formatarMatchUnico,
  formatarRespostaStatus,
} from "./format";
import { interpretarIntencao } from "./intent";
import { type AcaoAlvo, PendingQuestions, resolverEscolha } from "./pendingQuestions";
import { AgentRegistry } from "./wsServer";
import { type EnviarArquivo, startWhatsApp } from "./whatsapp";

/** Le uma variavel de ambiente obrigatoria, falhando cedo e com mensagem clara. */
function envObrigatoria(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    console.error(`[config] variavel de ambiente ${nome} nao definida. Veja o .env.example.`);
    process.exit(1);
  }
  return valor;
}

/**
 * Como o Impetus descreve, em portugues, o que entendeu de um protocolo que
 * ainda nao tem implementacao.
 *
 * O `Record` e tipado por `CommandName` menos os ja implementados (`status`,
 * `find`, `listFiles`, `shareFile`): se um comando novo entrar no protocolo,
 * o TypeScript exige uma frase para ele aqui, em vez de deixar a pessoa
 * receber uma resposta vazia.
 */
const PENDENTES: Record<Exclude<CommandName, "status" | "find" | "listFiles" | "shareFile">, string> = {
  gitStatus: "ver o estado do git de um projeto",
};

function descreverPendente(
  intent: Exclude<CommandName, "status" | "find" | "listFiles" | "shareFile">,
  alvo: string | null,
): string {
  const acao = PENDENTES[intent];
  const complemento = alvo ? ` — "${alvo}"` : "";
  return (
    `Entendi: você quer ${acao}${complemento}.\n\n` +
    "Isso ainda não está pronto — vem numa próxima etapa do Impetus."
  );
}

/** As mensagens de "qual alvo?" quando o comando veio sem um. */
const PERGUNTA_ALVO: Record<AcaoAlvo, string> = {
  find: "Qual projeto ou pasta você quer localizar?",
  listFiles: "Qual pasta você quer listar?",
  shareFile: "Qual arquivo ou pasta você quer receber?",
};

async function main(): Promise<void> {
  const wsPort = Number(process.env.WS_PORT ?? 8080);
  const pairingSecret = envObrigatoria("PAIRING_SECRET");
  const allowedNumbers = envObrigatoria("WHATSAPP_ALLOWED_NUMBERS")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  if (Number.isNaN(wsPort)) {
    console.error("[config] WS_PORT precisa ser um numero.");
    process.exit(1);
  }

  console.log(`[config] ${allowedNumbers.length} numero(s) autorizado(s) a mandar comandos`);

  const registry = new AgentRegistry({ port: wsPort, pairingSecret });
  const pendingQuestions = new PendingQuestions();

  /**
   * Executa a acao (`find`/`listFiles`/`shareFile`) sobre UM candidato ja
   * resolvido (nick + match conhecidos). `find` so formata o que ja foi
   * encontrado; `listFiles`/`shareFile` ainda precisam ir ate aquele agente
   * especifico buscar o conteudo.
   */
  async function executarAcao(
    acao: AcaoAlvo,
    candidato: { nick: string; match: FindMatch },
    responder: (resposta: string) => Promise<void>,
    enviarArquivo: EnviarArquivo,
  ): Promise<void> {
    if (acao === "find") {
      await responder(formatarMatchUnico(candidato));
      return;
    }

    if (acao === "listFiles") {
      if (candidato.match.kind === "file") {
        await responder(`"${candidato.match.name}" é um arquivo, não uma pasta — não tem conteúdo pra listar.`);
        return;
      }
      const resultado = await registry.requestListFiles(candidato.nick, candidato.match.path);
      if (!resultado.ok) {
        await responder(`Não consegui listar: ${resultado.error}`);
        return;
      }
      await responder(formatarListaArquivos(candidato, resultado.entries));
      return;
    }

    // acao === "shareFile" — funciona pra arquivo OU pasta: e o proprio agente
    // quem decide zipar ou nao, com base no que existe de verdade no disco dele.
    const resultado = await registry.requestShareFile(candidato.nick, candidato.match.path);
    if (!resultado.ok) {
      await responder(`Não consegui enviar: ${resultado.error}`);
      return;
    }
    await responder(`Mandando ${resultado.fileName}...`);
    await enviarArquivo({
      fileName: resultado.fileName,
      contentBase64: resultado.contentBase64,
      mimeType: resultado.mimeType,
    });
  }

  /**
   * Busca `query` em todas as maquinas conectadas e, de acordo com quantos
   * candidatos vieram (nenhum, um so, ou varios), executa `acao` direto ou
   * pergunta qual — guardando a pergunta pendente para a proxima mensagem
   * resolver. Compartilhado por `find`, `listFiles` e `shareFile`: os tres
   * precisam do mesmo "resolver alvo por busca" antes de agir de formas
   * diferentes.
   */
  async function resolverEExecutar(
    acao: AcaoAlvo,
    query: string,
    numero: string,
    responder: (resposta: string) => Promise<void>,
    enviarArquivo: EnviarArquivo,
  ): Promise<void> {
    if (registry.connectedNicks().length === 0) {
      await responder("Nenhuma máquina conectada no momento.");
      return;
    }

    const porAgente = await registry.requestFindFromAll(query);

    // So agrega os que acharam algo. Um agente com erro/timeout aqui nao e
    // informacao relevante pra quem perguntou "onde esta o projeto X" — diferente
    // do status, onde a maquina em si e o que foi pedido.
    const candidatos: Array<{ nick: string; match: FindMatch }> = [];
    for (const resultado of porAgente) {
      if (resultado.ok) {
        for (const match of resultado.matches) {
          candidatos.push({ nick: resultado.nick, match });
        }
      }
    }

    if (candidatos.length === 0) {
      await responder(`Não encontrei nada parecido com "${query}" em nenhuma máquina conectada.`);
      return;
    }

    if (candidatos.length === 1) {
      await executarAcao(acao, candidatos[0], responder, enviarArquivo);
      return;
    }

    pendingQuestions.definir(numero, {
      kind: "disambiguation",
      acao,
      candidatos,
      askedAt: Date.now(),
    });
    await responder(formatarListaDisambiguacao(query, candidatos));
  }

  await startWhatsApp({
    allowedNumbers,
    onCommand: async (texto, numero, responder, enviarArquivo) => {
      // Antes de classificar a mensagem, confere se ha uma pergunta pendente
      // deste numero — se houver, a mensagem provavelmente e a resposta a ela,
      // nao um pedido novo. Isto e contexto de conversa na sua forma mais
      // estreita: um slot por numero, nao um historico completo.
      const pendente = pendingQuestions.consumir(numero);

      if (pendente?.kind === "target") {
        // A pergunta anterior foi "qual alvo?" — a resposta crua E a query.
        await resolverEExecutar(pendente.acao, texto.trim(), numero, responder, enviarArquivo);
        return;
      }

      if (pendente?.kind === "disambiguation") {
        const escolhido = resolverEscolha(texto, pendente.candidatos);
        if (escolhido) {
          await executarAcao(pendente.acao, escolhido, responder, enviarArquivo);
          return;
        }
        // Resposta nao bateu com nenhum candidato: nao forca a interpretacao —
        // trata como mensagem nova e cai no fluxo normal abaixo.
      }

      // Fatia 2: qualquer frase e interpretada. Se a API falhar, a excecao sobe
      // e o handler do WhatsApp responde com erro — de proposito, para nao
      // confundir "falha de infraestrutura" com "nao sei fazer isso".
      const intencao = await interpretarIntencao(texto);
      console.log(
        `[brain] intencao interpretada: ${intencao.intent}` +
          (intencao.alvo ? ` | alvo: "${intencao.alvo}"` : ""),
      );

      if (intencao.intent === "status") {
        if (registry.connectedNicks().length === 0) {
          await responder("Nenhuma máquina conectada no momento.");
          return;
        }
        const resultados = await registry.requestStatusFromAll();
        await responder(formatarRespostaStatus(resultados));
        return;
      }

      if (intencao.intent === "find" || intencao.intent === "listFiles" || intencao.intent === "shareFile") {
        if (!intencao.alvo) {
          pendingQuestions.definir(numero, { kind: "target", acao: intencao.intent, askedAt: Date.now() });
          await responder(PERGUNTA_ALVO[intencao.intent]);
          return;
        }
        await resolverEExecutar(intencao.intent, intencao.alvo, numero, responder, enviarArquivo);
        return;
      }

      if (intencao.intent === "unknown") {
        await responder("Ainda não sei fazer isso.");
        return;
      }

      // Protocolo reconhecido, mas ainda sem implementacao (fatias futuras).
      // Dizer o que foi entendido vale mais que um "nao sei" generico: a pessoa
      // descobre que o pedido faz sentido e que falta a acao, nao a compreensao.
      await responder(descreverPendente(intencao.intent, intencao.alvo));
    },
  });

  const encerrar = (sinal: string) => {
    console.log(`\n[brain] recebido ${sinal}, encerrando...`);
    registry.close();
    process.exit(0);
  };
  process.on("SIGINT", () => encerrar("SIGINT"));
  process.on("SIGTERM", () => encerrar("SIGTERM"));
}

main().catch((err) => {
  console.error("[brain] falha fatal na inicializacao:", err);
  process.exit(1);
});
