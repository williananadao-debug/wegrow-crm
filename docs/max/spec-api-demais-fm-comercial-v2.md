# API Demais FM Comercial — Contrato v2

**Novidade nesta versão:** dois endpoints novos — `/redes-sociais` e `/aniversarios`.
Os quatro endpoints da v1 (`/audiencia`, `/site/mensal`, `/app/downloads`, `/monetizacao`) **não mudaram** — nenhuma alteração de campo, formato ou comportamento. Nada precisa ser refeito do lado do CRM.

**Base URL:** `https://mfgvbwobkflgwgjeyxlj.supabase.co/functions/v1/api`
**Autenticação:** idêntica à v1 — header `X-API-Key`.

⚠️ **Confidencial:** `/aniversarios` traz dados de classe interna, incluindo receita e nomes de anunciantes. Ver seção 3 antes de exibir em tela.

---

## 1. Convenções (inalteradas da v1)

| Convenção | Regra |
|---|---|
| Períodos | `"YYYY-MM"` |
| Valores monetários | **String decimal com ponto** (`"12161.50"`) + campo `moeda` (`"BRL"`) |
| Contagens | `number` inteiro |
| Campos ausentes | Sempre presentes na resposta, com valor `null` — nunca omitidos, nunca convertidos em `0` |
| `tipo_dado` | `"medido"` ou `"estimado"` |
| Erros | Mesmo envelope da v1 (`401` / `404` / `422` / `500`) |

---

## 2. `GET /redes-sociais`

Instagram e Facebook, **desagregados por emissora** e com **totais da rede já calculados**. Atende de uma vez os dois pedidos (total somado e quebra por emissora).

**Query params (todos opcionais):** `ano` (4 dígitos), `mes` (1–12), `plataforma`, `emissora`.
Sem params, retorna toda a série disponível (jan–jul/2026 na data desta spec).

### 2.1 Bloco `dados` — uma linha por período × plataforma × emissora

| Campo | Tipo | Null? | Descrição |
|---|---|---|---|
| `periodo` | string | não | `"YYYY-MM"` |
| `emissora` | string | não | `"107.9"`, `"104.7"`, `"101.1"` ou `"REDE"` |
| `escopo` | string | não | `"emissora"` ou `"rede"` (ver 2.3) |
| `plataforma` | string | não | `"Instagram"`, `"Facebook"` ou `"Instagram Demais News"` |
| `visualizacoes` | number (int) | **sim** | |
| `interacoes` | number (int) | **sim** | |
| `visitas` | number (int) | **sim** | |
| `seguidores` | number (int) | **sim** | ⚠️ ver 2.4 |
| `tipo_dado` | string | não | `"medido"` |

### 2.2 Bloco `totais_rede` — soma das 3 emissoras, por período × plataforma

| Campo | Tipo | Null? | Descrição |
|---|---|---|---|
| `periodo` | string | não | |
| `plataforma` | string | não | |
| `visualizacoes` | number (int) | **sim** | Null se todas as parcelas forem null |
| `interacoes` | number (int) | **sim** | |
| `visitas` | number (int) | **sim** | |
| `emissoras_somadas` | number (int) | não | Quantas emissoras entraram na soma (esperado: 3) |

**Não existe `seguidores` em `totais_rede`** — ver 2.4.

### 2.3 Regra de escopo (importante para não somar em dobro)

- `escopo: "emissora"` → registros das três emissoras. **São esses, e só esses, que entram em `totais_rede`.**
- `escopo: "rede"` → perfil próprio de nível rede (**Instagram Demais News**, disponível a partir de jun/2026). Vem em `dados` para consulta, mas está **excluído de `totais_rede`** de propósito, para não inflar o total da rede.

Se você quiser um "total geral incluindo Demais News", some no seu lado — mas recomendamos exibir separado, porque a série do Demais News começa em jun/2026 e quebraria a comparação com os meses anteriores.

### 2.4 Aviso sobre `seguidores`

Dois pontos:
1. **Não somamos seguidores entre emissoras** e recomendamos que o CRM também não faça — a mesma pessoa pode seguir dois ou três perfis, então a soma superestima o público único. Use seguidores sempre por emissora.
2. Historicamente o campo **está preenchido só em parte dos meses** — nos demais vem `null`. Trate `null` como "sem dado", não como zero.

### 2.5 Exemplo de resposta (`?ano=2026&mes=7` — valores reais de julho/2026)

```json
{
  "dados": [
    { "periodo": "2026-07", "emissora": "101.1", "escopo": "emissora", "plataforma": "Facebook", "visualizacoes": 7200000, "interacoes": 61600, "visitas": 36500, "seguidores": 56800, "tipo_dado": "medido" },
    { "periodo": "2026-07", "emissora": "104.7", "escopo": "emissora", "plataforma": "Facebook", "visualizacoes": 2600000, "interacoes": 38300, "visitas": 10700, "seguidores": 13500, "tipo_dado": "medido" },
    { "periodo": "2026-07", "emissora": "107.9", "escopo": "emissora", "plataforma": "Facebook", "visualizacoes": 4600000, "interacoes": 57300, "visitas": 15800, "seguidores": 69200, "tipo_dado": "medido" },
    { "periodo": "2026-07", "emissora": "101.1", "escopo": "emissora", "plataforma": "Instagram", "visualizacoes": 2800000, "interacoes": 54700, "visitas": 7300, "seguidores": 20600, "tipo_dado": "medido" },
    { "periodo": "2026-07", "emissora": "104.7", "escopo": "emissora", "plataforma": "Instagram", "visualizacoes": 1900000, "interacoes": 47400, "visitas": 4300, "seguidores": 32900, "tipo_dado": "medido" },
    { "periodo": "2026-07", "emissora": "107.9", "escopo": "emissora", "plataforma": "Instagram", "visualizacoes": 2400000, "interacoes": 55700, "visitas": 6400, "seguidores": 26300, "tipo_dado": "medido" },
    { "periodo": "2026-07", "emissora": "REDE", "escopo": "rede", "plataforma": "Instagram Demais News", "visualizacoes": 2300000, "interacoes": 47600, "visitas": null, "seguidores": 4200, "tipo_dado": "medido" }
  ],
  "totais_rede": [
    { "periodo": "2026-07", "plataforma": "Facebook",  "visualizacoes": 14400000, "interacoes": 157200, "visitas": 63000, "emissoras_somadas": 3 },
    { "periodo": "2026-07", "plataforma": "Instagram", "visualizacoes": 7100000,  "interacoes": 157800, "visitas": 18000, "emissoras_somadas": 3 }
  ]
}
```

---

## 3. `GET /aniversarios` 🔒 interno

Calendário de aniversários de município por emissora, com status comercial e receita.

**Query params (todos opcionais):** `ano`, `mes` (1–12), `emissora`, `status`.

🔒 **Restrição de uso:** o campo `detalhe` contém **nome de anunciante e valor contratado** (prefeituras e empresas locais). Esse dado é interno da Rede Demais FM e **não pode ser exibido a clientes, anunciantes ou terceiros** — vale para `detalhe` e para os campos de receita. Uso restrito à operação comercial interna.

| Campo | Tipo | Null? | Descrição |
|---|---|---|---|
| `periodo` | string | não | `"YYYY-MM"` |
| `ano` | number (int) | não | |
| `mes` | number (int) | não | 1–12 |
| `emissora` | string | não | `"107.9"`, `"104.7"` ou `"101.1"` |
| `cidade` | string | não | Município |
| `status` | string | não | Ver 3.1 |
| `receita_liquida` | **string** | **sim** | Decimal com ponto. `"0.00"` = confirmado sem receita; `null` = **sem dado registrado** (não é zero) |
| `receita_bruta` | **string** | **sim** | Normalmente `null` — a operação registra apenas líquido |
| `moeda` | string | não | `"BRL"` |
| `detalhe` | string | **sim** | Texto livre: anunciantes, valores, contrapartidas 🔒 |

### 3.1 Valores de `status`

| Valor | Significado |
|---|---|
| `vendido` | Pacote comercializado, com receita registrada |
| `nao_vendido` | Aniversário ocorreu, nada comercializado — **é a oportunidade perdida** |
| `vendido_sem_valor` | Houve veiculação, mas sem pacote de aniversário fechado ou sem valor registrado |
| `sem_registro` | Data futura já mapeada no calendário, ainda sem tratativa — **é a oportunidade em aberto** |

### 3.2 Observações de dado

- **Granularidade mensal:** `granularidade` vem sempre como `"mensal"`. Não existe dia exato do aniversário — não monte lembrete de data específica a partir daqui.
- **Receita líquida:** os valores já são líquidos (permutas e custos de prêmio deduzidos). Contrapartidas não monetárias (estande, permuta) aparecem descritas em `detalhe` com R$ 0.
- **Cobertura:** 2026 tem registros de janeiro a dezembro, exceto **agosto**, que não possui registros na base nesta data.
- `receita_liquida: null` ≠ `"0.00"`. O primeiro é ausência de registro; o segundo é zero confirmado.

### 3.3 Exemplo de resposta (valores reais)

```json
{
  "classe": "interno",
  "granularidade": "mensal",
  "dados": [
    {
      "periodo": "2026-06", "ano": 2026, "mes": 6,
      "emissora": "107.9", "cidade": "Presidente Getúlio",
      "status": "vendido",
      "receita_liquida": "12161.50", "receita_bruta": null, "moeda": "BRL",
      "detalhe": "Prefeitura Municipal R$ 9.000,00 + estande; YG Empreendimentos R$ 638,00; Bela Visione R$ 450,00; Ivo Motos R$ 478,50; Morangos Vitória R$ 478,50; Impacto Têxtil R$ 478,50; Dalila Têxtil R$ 638,00. O estande é contrapartida não monetizada"
    },
    {
      "periodo": "2026-06", "ano": 2026, "mes": 6,
      "emissora": "104.7", "cidade": "Witmarsum",
      "status": "nao_vendido",
      "receita_liquida": "0.00", "receita_bruta": null, "moeda": "BRL",
      "detalhe": "Não foi vendido"
    },
    {
      "periodo": "2026-10", "ano": 2026, "mes": 10,
      "emissora": "101.1", "cidade": "Itaiópolis",
      "status": "sem_registro",
      "receita_liquida": null, "receita_bruta": null, "moeda": "BRL",
      "detalhe": null
    }
  ]
}
```

---

## 4. Erros (inalterado)

```json
{ "erro": { "codigo": "INVALID_PARAMS", "mensagem": "Parâmetro 'mes' deve estar entre 1 e 12.", "http_status": 422 } }
```

| HTTP | `codigo` | Quando |
|---|---|---|
| 401 | `UNAUTHORIZED` | Key ausente/inválida |
| 404 | `NOT_FOUND` | Rota inexistente, ou filtro sem nenhum resultado |
| 422 | `INVALID_PARAMS` | `ano`/`mes` malformado ou fora de faixa |
| 500 | `INTERNAL_ERROR` | Falha interna |

---

## 5. Atualização

Mesma cadência dos outros endpoints: ingestão ~1× por mês, após aprovação interna. **Polling diário é suficiente** para os seis endpoints.

Exceção a observar: `/aniversarios` pode mudar fora do ciclo mensal quando uma venda é fechada — se o CRM usar os `sem_registro` como alerta de oportunidade, vale um polling um pouco mais frequente nesse endpoint.

## 6. Fora do escopo (candidatos a v3)

- YouTube (você já integra direto)
- Resultados de promoções (Dia dos Namorados, App Premiado, Clique de Amor)
- Perfil de público dos cadastros de promoção
- Pesquisa de preferência de formato publicitário
