# Plano de implementação — TRÁFEGO PAGO

## Objetivo

Evoluir o VILLELA SDR existente com um terceiro setor chamado `TRAFEGO_PAGO`/`TRÁFEGO PAGO`, mantendo CONCILIE e PROJURIS 2.0 sem alteração de comportamento. O setor terá o mesmo shell autenticado, o mesmo isolamento por `sectorId`, formulário de reuniões compatível com o modal atual e campos estruturados de aquisição/qualificação.

## Arquitetura e responsabilidades

- `drizzle/schema.ts`: adicionar o código do setor e colunas nullable/default nas reuniões para origem, campanha, UTM, entrada do lead e qualificação. Registros antigos continuarão válidos.
- `server/db.ts`: incluir o setor em `SECTOR_OPTIONS`, preservando `ensureSectors`, `userSectors` e consultas por escopo. Nenhuma consulta existente de CONCILIE ou PROJURIS receberá dados de outro setor porque o filtro `meetings.sectorId` permanece obrigatório.
- `server/routers.ts`: ampliar o contrato de criação/edição com os campos estruturados; derivar o setor exclusivamente do contexto autorizado; aceitar os campos de tráfego somente quando o setor ativo for TRÁFEGO PAGO e limpar/rejeitar tentativas indevidas no backend.
- `client/src/App.tsx`: identificar `isTrafegoPago` pelo setor ativo; preservar campos, validações e Google Meet atuais; renderizar somente para esse setor as seções `ORIGEM DO LEAD — TRÁFEGO PAGO` e `QUALIFICAÇÃO COMERCIAL`, com campos condicionais e rascunho persistente.
- `client/public/manus-routes.json`: manter as rotas de página existentes; o novo setor é um contexto de dados, não uma nova rota.
- Migração Drizzle aditiva: gerar/aplicar uma nova migration sem recriar tabelas nem alterar registros antigos.

## Dados estruturados

Campos nullable para compatibilidade: `leadChannel`, `leadChannelOther`, `adPlatform`, `campaignName`, `campaignId`, `adSetName`, `adSetId`, `adName`, `adId`, `contactOrigin`, `contactOriginOther`, `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`, `leadEntryDate`, `qualificationStatus` (default `NAO_AVALIADO`), `disqualificationReason`, `disqualificationOther`. O serviço de interesse reutiliza o campo `service` atual.

## Regras de negócio

- O setor é determinado pelo `ctx.sectorId`; não existe campo de setor editável no modal.
- Apenas usuários que já possuem o setor ativo podem criar/editar suas reuniões conforme as regras atuais de cargo e escopo.
- O frontend não exibirá campos de tráfego para CONCILIE ou PROJURIS.
- `Outro` nos campos de canal/origem/plataforma mostra o respectivo complemento; status `NÃO QUALIFICADO` mostra motivo e complemento quando `Outro` for escolhido.
- Origem e plataforma terão `Não identificado`/`Não se aplica` quando apropriado; IDs e UTMs permanecem opcionais e sem valores inventados.
- Google Calendar/Meet, histórico, edição, remarcação, exportações e filtros existentes continuarão operando sobre a mesma reunião, incluindo os novos campos quando o registro for reaberto.

## Design e entrega

A interface seguirá o dashboard dark corporativo atual: painéis escuros, bordas discretas, acentos azul/âmbar, labels em maiúsculas, grid responsivo e microcopy objetiva. A seção de aquisição será um painel interno visualmente destacado, sem criar um formulário paralelo ou uma nova aplicação. A aplicação continua sendo SPA React/Vite com API Express/tRPC e banco MySQL; não há necessidade de mudar deployment, rotas públicas ou cache.
