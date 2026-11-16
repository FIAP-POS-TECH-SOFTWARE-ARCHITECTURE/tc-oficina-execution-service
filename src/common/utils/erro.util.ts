export const mensagemDeErro = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro));
