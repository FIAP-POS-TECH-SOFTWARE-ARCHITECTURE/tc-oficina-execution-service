# language: pt
Funcionalidade: Filas de diagnóstico e reparo do mecânico
  Para que cada OS seja diagnosticada e reparada uma única vez, na ordem de chegada
  Como mecânico da oficina
  Quero pegar a próxima ordem da fila, registrar o diagnóstico e concluir ou declarar inviável o reparo

  Contexto:
    Dado o catálogo do OS com o serviço "Troca de óleo" e o insumo "Óleo 5W30"

  Cenário: Mecânico pega a próxima ordem de diagnóstico por ordem de chegada
    Dado 2 ordens de diagnóstico na fila
    Quando o mecânico "ana" pede a próxima ordem de "DIAGNOSTICO"
    Então recebe a ordem mais antiga em andamento
    E o evento "DiagnosticoIniciado" é publicado para o mecânico "ana"
    E a fila de "DIAGNOSTICO" fica com 1 ordem

  Cenário: Diagnóstico com itens do catálogo conclui a ordem
    Dado uma ordem de diagnóstico em andamento com o mecânico "ana"
    Quando o mecânico "ana" registra o diagnóstico com 1 "Troca de óleo" e 4 "Óleo 5W30"
    Então a resposta é 200
    E o evento "DiagnosticoConcluido" é publicado com 2 itens

  Cenário: Diagnóstico com item fora do catálogo é recusado
    Dado uma ordem de diagnóstico em andamento com o mecânico "ana"
    Quando o mecânico "ana" registra o diagnóstico com um serviço inexistente
    Então a resposta é 422
    E nenhum evento "DiagnosticoConcluido" é publicado

  Cenário: Mecânico declara que não há reparo possível
    Dado uma ordem de diagnóstico em andamento com o mecânico "ana"
    Quando o mecânico "ana" rejeita o diagnóstico com o motivo "Motor fundido, sem reparo viável"
    Então a resposta é 200
    E o evento "DiagnosticoRejeitado" é publicado

  Cenário: Reparo concluído
    Dado uma ordem de reparo em andamento com o mecânico "bruno"
    Quando o mecânico "bruno" conclui o reparo
    Então a resposta é 200
    E todos os itens de serviço da ordem ficam concluídos
    E o evento "ReparoConcluido" é publicado

  Cenário: Reparo inviável dispara a compensação do fluxo
    Dado uma ordem de reparo em andamento com o mecânico "bruno"
    Quando o mecânico "bruno" declara o reparo inviável com o motivo "Peça fora de linha"
    Então a resposta é 200
    E o evento "ReparoInviavel" é publicado

  Cenário: Dois mecânicos pedem a próxima ordem ao mesmo tempo
    Dado 1 ordem de diagnóstico na fila
    Quando os mecânicos "ana" e "bruno" pedem a próxima ordem de "DIAGNOSTICO" ao mesmo tempo
    Então exatamente um recebe a ordem e o outro recebe 404
    E o evento "DiagnosticoIniciado" é publicado

  Cenário: Ordem cancelada pelo fluxo da OS não aceita ações
    Dado uma ordem de reparo em andamento com o mecânico "bruno"
    E o orquestrador cancela a execução da OS
    Quando o mecânico "bruno" conclui o reparo
    Então a resposta é 422
    E nenhum evento "ReparoConcluido" é publicado

  Cenário: Outro mecânico não pode agir na ordem
    Dado uma ordem de reparo em andamento com o mecânico "bruno"
    Quando o mecânico "ana" conclui o reparo
    Então a resposta é 403
