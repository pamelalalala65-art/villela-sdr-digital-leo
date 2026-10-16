# API CRM Comercial dos Closers

## Escopo fixo

A API retorna exclusivamente reuniões dos códigos oficiais:

- `PROJURIS_2` — PROJURIS 2.0 — ID atual no banco: `1`
- `TRAFEGO_PAGO` — TRÁFEGO PAGO — ID atual no banco: `1860003`

O código `CONCILIE` — ID atual `2` — é explicitamente excluído. O filtro é aplicado no servidor usando `meetings.sectorId` e os IDs resolvidos pela tabela `sectors`, a partir dos códigos oficiais. O cliente não pode escolher ou substituir o setor por parâmetro.

## Autenticação

Configure a secret de servidor `CRM_COMERCIAL_API_KEY` com a chave usada pelo CRM. Nunca coloque essa chave no navegador, no repositório ou na URL.

```http
Authorization: Bearer SUA_CHAVE_DO_CRM
```

Base URL:

```text
https://villelasdr-7hhhsqg7.manus.space/api/external/v1/crm-comercial
```

## Listar reuniões

```http
GET /meetings?page=1&pageSize=100
```

Filtros opcionais:

- `from=YYYY-MM-DD` e `to=YYYY-MM-DD`: período pela data do agendamento;
- `updatedSince=2026-10-13T00:00:00.000Z`: retorna registros criados ou alterados desde esse instante;
- `sdrId=123`;
- `status=AGENDADA|REALIZADA|NO_SHOW|CANCELADA`.

Exemplo:

```bash
curl 'https://villelasdr-7hhhsqg7.manus.space/api/external/v1/crm-comercial/meetings?page=1&pageSize=100' \
  -H 'Authorization: Bearer SUA_CHAVE_DO_CRM'
```

A resposta informa `total`, `page`, `pageSize`, `nextPage`, os códigos permitidos e, em cada reunião, `sectorId`, `sectorCode` e `sectorName`, preservando a origem do registro.

## Sincronização incremental

1. Faça uma carga inicial usando paginação (`pageSize` máximo: `1000`) e armazene o maior `updatedAt` recebido.
2. Nas próximas consultas, envie `updatedSince=<maior_updatedAt>`.
3. Processe todas as páginas até `nextPage` ser `null`.
4. Use `id` como chave de atualização no CRM, pois uma reunião pode retornar novamente quando for alterada.
5. Para evitar perda por registros com o mesmo timestamp, o CRM pode repetir a última janela de sincronização e fazer upsert por `id`.

## Verificação de setores

```http
GET /sectors
```

Esse endpoint retorna os IDs e códigos permitidos resolvidos diretamente do banco. A API não possui endpoint de importação ou atualização que inclua `CONCILIE`.

## Segurança do filtro

- O filtro não depende do navegador nem do CRM.
- Não existe parâmetro `sector`, `sectorId` ou `setor` para ampliar o escopo.
- Se um registro tiver setor `CONCILIE`, ele não satisfaz o `inArray` server-side e não é retornado.
- O endpoint existente `/api/external/v1/concilie` permanece separado e não é usado pelo CRM Comercial.
