# API Financeiro Villela — CONCILIE

## URL base

```text
https://villelasdr-7hhhsqg7.manus.space/api/external/v1/concilie
```

A API é exclusivamente de leitura e retorna somente registros cujo setor é `CONCILIE`. O setor não é um parâmetro da API.

## Autenticação

A chave é criada na aplicação em **Configurações → Integrações → API**, área exclusiva do MASTER. Ela é exibida integralmente uma única vez.

Envie a chave somente do backend do Sistema Financeiro:

```http
Authorization: Bearer vlc_SUA_CHAVE
```

Não coloque a chave no frontend, em JavaScript público, repositório ou URL.

## Endpoints

| Método | Endpoint | Uso |
|---|---|---|
| GET | `/sdrs` | SDRs vinculados ao CONCILIE |
| GET | `/meetings` | Reuniões paginadas |
| GET | `/metrics` | Totais, percentuais e métricas por SDR |
| GET | `/calendar` | Todas as reuniões do período |
| GET | `/companies` | Empresas únicas do CONCILIE |
| GET | `/dashboard` | Resumo para dashboard |

### Filtros

`/meetings` e `/metrics` aceitam:

```text
from=YYYY-MM-DD
to=YYYY-MM-DD
sdrId=123
status=AGENDADA|REALIZADA|NO_SHOW|CANCELADA|REMARCADA
page=1
pageSize=100
```

`/calendar`, `/companies` e `/dashboard` aceitam `from` e `to`.

Exemplo:

```bash
curl 'https://villelasdr-7hhhsqg7.manus.space/api/external/v1/concilie/meetings?from=2026-10-01&to=2026-10-31&page=1&pageSize=100' \
  -H 'Authorization: Bearer vlc_SUA_CHAVE'
```

## Isolamento

A API resolve internamente o setor pelo código `CONCILIE`. Ela rejeita parâmetros `sector`, `sectorId`, `setor` e `setorId`. Esses parâmetros nunca podem alterar o escopo.

Além disso:

- reuniões são filtradas por `meetings.sectorId` do CONCILIE;
- SDRs precisam estar vinculados ao CONCILIE em `user_sectors`;
- um `sdrId` pertencente somente ao PROJURIS não retorna reuniões;
- a API não utiliza a sessão OAuth do site;
- a API tRPC interna permanece separada.

## Status

Os valores são preservados exatamente como no banco:

```text
AGENDADA
REALIZADA
NO_SHOW
CANCELADA
REMARCADA
```

## Paginação

`/meetings` retorna:

```json
{
  "sector": "CONCILIE",
  "page": 1,
  "pageSize": 100,
  "total": 42,
  "items": []
}
```

Limites: `page` começa em 1; `pageSize` padrão 100 e máximo 1000. O calendário possui limite interno de 10.000 registros por período.

## Respostas e erros

- `200`: consulta realizada;
- `400`: parâmetro inválido ou tentativa de alterar o escopo;
- `401`: Bearer ausente, inválido ou revogado;
- `429`: limite de requisições excedido;
- `500`: erro interno.

A API aplica rate limit de 120 requisições por minuto por integração/IP.

## Métricas

`/metrics` retorna `totals`, `percentages` e `bySdr`. Os percentuais são calculados com os dados reais filtrados do CONCILIE.

## Revogação

No site, acesse **Configurações → Integrações → API** e clique em **Revogar API Key**. A chave passa a responder `401` imediatamente. Uma nova chave pode ser criada depois da revogação.

## Observação sobre remarcações

A reunião remarcada utiliza a nova data e horário principais do calendário. Os campos `newDate` e `newTime` são retornados quando persistidos. A data original somente será preenchida após uma futura expansão do contrato de histórico para a API; atualmente o histórico interno continua preservado no site.
