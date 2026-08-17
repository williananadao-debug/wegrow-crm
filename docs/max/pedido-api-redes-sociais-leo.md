# Pedido: endpoint de redes sociais na API Demais FM Comercial

## Contexto

A WeGrow consome hoje 4 endpoints da API Demais FM Comercial (spec
`spec-api-demais-fm-comercial-v1`): `/audiencia`, `/site/mensal`, `/app/downloads` e
`/monetizacao`. Esses 4 substituíram campos que antes eram digitados manualmente pela
rádio — funcionou bem.

Sobrou um dado que ainda é manual: **redes sociais da rede (Instagram + Facebook somados
das três emissoras — 107.9, 104.7, 101.1)**. Hoje alguém da WeGrow olha o painel do Leo
todo mês e digita o número à mão em Configurações. Esse painel já tem o dado pronto — só
falta expor via API, no mesmo padrão dos outros 4.

## O que precisamos

Um novo endpoint, sugerido `GET /redes-sociais`, mesmo esquema de autenticação
(`X-API-Key`) e formato dos demais. Payload sugerido, espelhando o formato de
`/monetizacao`:

```json
{
  "classe": "publico",
  "dados": [
    {
      "periodo": "2026-08",
      "visualizacoes": 21500000,
      "interacoes": 315000,
      "visitas_perfil": 81000,
      "fonte": "meta_business_suite"
    }
  ]
}
```

Ou, se for mais simples do lado de vocês, um formato "só o mês atual" também serve:

```json
{
  "periodo": "2026-08",
  "visualizacoes": 21500000,
  "interacoes": 315000,
  "visitas_perfil": 81000,
  "atualizado_em": "2026-08-17T10:00:00Z"
}
```

Os três campos (`visualizacoes`, `interacoes`, `visitas_perfil`) são exatamente os que já
aparecem digitados manualmente hoje em Configurações → "Redes sociais (rede)" — a soma de
Instagram + Facebook das três emissoras que já existe no painel de vocês.

## Do nosso lado

Já deixamos o cliente pronto pra consumir (`src/lib/demais-fm-api.ts`,
`buscarRedesSociais()`) e a rota `/api/midia/demais-fm/redes-sociais` no ar — hoje ela
retorna 501 porque o endpoint de vocês ainda não existe, e nesse caso o app cai
automaticamente pro valor manual (sem quebrar nada pra quem usa). No dia que
`DEMAIS_FM_API_BASE_URL/redes-sociais` responder, é só confirmar o formato exato do JSON
com vocês e ajustar o tipo `DemaisFmRedesSociaisResposta` se precisar — sem retrabalho
maior que isso.
