# API de Integração OPEC — WeGrow CRM

Documentação para o time da **OPEC** consumir os dados de contratos/produção do WeGrow CRM.

## Visão geral

- **Endpoint:** `GET /api/opec`
- **Base URL (produção):** `https://wegrow-crm.vercel.app`
- **URL completa:** `https://wegrow-crm.vercel.app/api/opec`
- **Método:** somente `GET`
- **Formato de resposta:** JSON (array de objetos, mesmo quando há apenas 1 resultado)

## Autenticação

A API usa um **Bearer token** fixo, enviado no header `Authorization`:

```
Authorization: Bearer <TOKEN_INTEGRACAO_OPEC>
```

- O token é um segredo compartilhado (não é por usuário/empresa) — o mesmo token vale para todas as emissoras que usam essa integração.
- Se o header estiver ausente, errado, ou usar prefixo diferente de `Bearer `, a API responde:
  ```json
  { "erro": "Acesso Negado. Token inválido." }
  ```
  com status `401`.
- **O token deve ser solicitado ao WeGrow** (não é público). Ele fica configurado como variável de ambiente `TOKEN_INTEGRACAO_OPEC` no projeto.

## Parâmetros (query string)

| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| `codigo_emissora` | **Sim** | UUID da empresa (tenant) no CRM. Sem ele a API recusa a requisição. Identifica de qual emissora/cliente WeGrow os dados devem vir. |
| `id` | Não | ID de um job de produção específico. Se enviado, ignora os demais filtros de data/status. |
| `numero_contrato` | Não | ID do lead/contrato. Se enviado, retorna **todos os jobs** vinculados àquele contrato (tem prioridade sobre `id`, `status`, `data_inicial`, `data_final`). Aceita apenas dígitos (a API limpa caracteres não numéricos). |
| `status` | Não | Filtra jobs pelo estágio (`stage`). **Padrão: `entregue`**. Só é aplicado quando `id` e `numero_contrato` não são enviados. |
| `data_inicial` | Não | Filtra jobs criados a partir dessa data (`created_at >=`). Formato `YYYY-MM-DD`. Só é aplicado no modo de filtro por status. |
| `data_final` | Não | Filtra jobs criados até essa data (inclusive, até 23:59:59). Formato `YYYY-MM-DD`. Só é aplicado no modo de filtro por status. |

### Ordem de precedência dos filtros

1. Se `numero_contrato` for enviado → busca por contrato (ignora `id`, `status`, datas).
2. Senão, se `id` for enviado → busca o job exato por ID.
3. Senão → filtra por `status` (padrão `entregue`) + intervalo de datas, se informado.

O resultado é sempre limitado a **100 registros**, ordenados do mais recente para o mais antigo.

### Onde conseguir o `codigo_emissora`

É o `id` (UUID) da empresa na tabela `empresas` do CRM — equivalente ao `empresa_id` do tenant. Precisa ser solicitado ao administrador WeGrow da conta (não fica visível diretamente na tela para o parceiro externo).

**Rádio Demais FM:**
```
codigo_emissora = 11111111-1111-1111-1111-111111111111
```

## Exemplo de requisição

```bash
curl -G "https://wegrow-crm.vercel.app/api/opec" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  --data-urlencode "codigo_emissora=11111111-1111-1111-1111-111111111111" \
  --data-urlencode "status=entregue" \
  --data-urlencode "data_inicial=2026-07-01" \
  --data-urlencode "data_final=2026-07-16"
```

Buscando um contrato específico:

```bash
curl -G "https://wegrow-crm.vercel.app/api/opec" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  --data-urlencode "codigo_emissora=11111111-1111-1111-1111-111111111111" \
  --data-urlencode "numero_contrato=182"
```

> Os exemplos acima já usam o `codigo_emissora` real da rádio **Demais FM**.

## Estrutura da resposta

Resposta: **array** de objetos. Cada objeto representa um pacote de dados de um job de produção, no formato esperado pela OPEC, com estes blocos:

```jsonc
[
  {
    // Campos no nível raiz (gabarito OPEC) — vindos de gerarJsonOpec()
    "data_consulta": "2026-07-16 14:32:10",
    "numero_contrato": "182",
    "cliente": "Nome Fantasia Ltda",
    "cnpj_cliente": "00.000.000/0001-00",
    "inscricao_estadual_cliente": "ISENTO",
    "endereco_cliente": "...",
    "cidade_cliente": "...",
    "uf_cliente": "SC",
    "setor": "Comércio/Serviços",
    "subsetor": "Geral",
    "segmento": "Geral",
    "agencia": null,
    "cnpj_agencia": null,
    "num_pi": "...",
    "data_pi": "0000-00-00",
    "vendedor": "...",
    "cpf_vendedor": "000.000.000-00",
    "data_contrato": "2026-06-01",
    "data_inicio": "2026-06-10",
    "data_fim": "2026-07-10",
    "valor_total": "1500",
    "faturamento_bruto": "S",
    "envio_fatura_agencia": "N",
    "observacao_proposta": "...",
    "observacao_contrato": "Documento exportado automaticamente.",

    // Itens contratados (mídia)
    "itens": [
      {
        "iditem": "ITEM_182_1",
        "mercado_id": "1",
        "mercado_codigo": "DM-1047",
        "mercado_cnpj": "75.835.629/0001-50",
        "mercado_descricao": "DEMAIS FM 104,7 TAIÓ",
        "codigo": "SPOT",
        "programa": "ROTATIVO COMERCIAL",
        "tempo": "spot 30",
        "tempo_original": "spot 30",
        "horario_inicial": "06:00:00",
        "horario_final": "20:00:00",
        "quantidade": "30",
        "valor_total": "1500,00"
      }
    ],

    // Distribuição diária dos spots, por mês (competência)
    "distribuicao": [
      {
        "iditem": "ITEM_182_1",
        "competencia": "2026-06-01",
        "tempo": "spot 30",
        "tempo_original": "spot 30",
        "total_dias": "30",
        "quantidades": "1,0,1,0,1,...",
        "tipo": "MIDIAAVULSA"
      }
    ],

    // Faturas/parcelas
    "faturas": [
      { "cnpj_faturamento": "75.835.629/0001-50", "vencimento": "2026-07-01", "valor": "1500.00", "parcela": "1/1" }
    ],

    // Metadados de origem (identifica de onde veio o dado)
    "origem": {
      "codigo_emissora": "6f1a2b3c-1111-2222-3333-444455556666",
      "sistema_gerador": "WeGrow CRM",
      "ambiente": "producao"
    },

    // Dados do job de produção no CRM
    "producao": {
      "id_job": 456,
      "titulo_referencia": "...",
      "status": "entregue",
      "prioridade": "...",
      "deadline_producao": "2026-06-05",
      "data_criacao_job": "2026-06-01T12:00:00Z",
      "data_liberacao_opec": "2026-07-16T17:30:00.000Z",
      "arquivo_audio_url": "https://.../audio.mp3",
      "roteiro_locucao": "texto do briefing/roteiro"
    },

    // Dados de veiculação
    "veiculacao": {
      "num_pi": "...",
      "data_inicio": "2026-06-10",
      "data_fim": "2026-07-10",
      "hora_inicio": "06:00",
      "hora_fim": "20:00",
      "tabela_unidade": "DEMAIS FM 104,7",
      "itens_midia": [ /* itens crus cadastrados no lead */ ]
    },

    // Dados comerciais do contrato
    "comercial": {
      "id_lead": 182,
      "codigo_contrato": "LD-0182",
      "vendedor": "...",
      "valor_total": 1500,
      "desconto_aplicado": 0,
      "parcelas": 1,
      "primeiro_vencimento": "2026-07-01"
    },

    // Dados do cliente/anunciante
    "cliente": {
      "id_cliente": 55,
      "nome_fantasia": "...",
      "razao_social": "...",
      "cnpj": "00.000.000/0001-00",
      "telefone_whatsapp": "...",
      "cidade": "...",
      "agencia": null
    }
  }
]
```

> ⚠️ Note que o campo `cliente` aparece duas vezes no payload: uma vez como string simples no nível raiz (nome do cliente, compatível com o gabarito legado da OPEC) e outra vez como objeto detalhado dentro de `cliente` (bloco novo). Isso é intencional — o segundo `cliente` sobrescreve a chave no JSON (JS mantém apenas a última). Se for consumido em JS/TS, o array final tem `cliente` como **objeto**, não como string. Times consumindo em linguagens estritas (ex: parseando o JSON literal e comparando ordem de chaves) devem tratar a chave `cliente` como o objeto detalhado.

### Respostas possíveis

| Situação | Status | Corpo |
|---|---|---|
| Token ausente/inválido | 401 | `{ "erro": "Acesso Negado. Token inválido." }` |
| `codigo_emissora` ausente ou não é UUID válido | 400 | `{ "erro": "Parâmetro 'codigo_emissora' obrigatório e deve ser um UUID válido." }` |
| Nenhum job encontrado | 200 | `[]` |
| `numero_contrato` não existe | 200 | `[]` |
| Sucesso | 200 | Array de pacotes (ver acima) |
| Erro interno | 500 | `{ "erro": "Erro interno no servidor do CRM." }` |

## Aviso importante — mudança recente que quebra integrações antigas

Em 18/04/2026 (`codigo_emissora` obrigatório) a API deixou de aceitar chamadas sem esse parâmetro — antes ele era opcional. **Qualquer integração feita antes dessa data provavelmente está quebrada** e passou a receber `400 { "erro": "Parâmetro 'codigo_emissora' obrigatório..." }`. Se o time da OPEC (Demais FM) construiu a chamada antes disso, é essa a causa mais provável — basta adicionar `codigo_emissora=11111111-1111-1111-1111-111111111111` na query string.

Também em 25/03/2026 o token deixou de ser fixo no código (`WEGROW_OPEC_2026_MASTER_KEY`) e passou a vir da env var `TOKEN_INTEGRACAO_OPEC`. Se ainda estiverem usando o token antigo, o sintoma é `401` em vez de `400`.

## Checklist de troubleshooting (para o time que não está conseguindo acessar)

1. **Header `Authorization` correto?** Precisa ser exatamente `Bearer <token>` (com espaço, "Bearer" com B maiúsculo). Erros comuns: enviar só o token sem `Bearer `, ou usar `bearer` minúsculo em alguns clientes HTTP que normalizam — confirmar o valor exato enviado.
2. **Token certo?** O token de integração (`TOKEN_INTEGRACAO_OPEC`) precisa ser solicitado ao WeGrow — não é o mesmo token de login de usuário nem uma chave do Supabase.
3. **`codigo_emissora` informado e é um UUID válido?** Sem esse parâmetro a API sempre retorna 400, mesmo com token correto. Não é o nome da emissora — é o UUID da empresa.
4. **Método é `GET`?** A rota não aceita `POST`/outros métodos.
5. **URL base correta?** `https://wegrow-crm.vercel.app/api/opec` (confirmar se não estão usando um domínio de preview antigo/expirado do Vercel).
6. **Resultado veio vazio (`[]`)?** Verificar se `status` bate com o estágio real do job (padrão é `entregue`) e se o intervalo de datas cobre os jobs esperados.

## Configuração dependente (lado WeGrow)

Cada **unidade** (emissora) tem uma configuração `config_opec` (editável em `/settings` no CRM) com:
- `mercado_id`, `mercado_codigo`, `mercado_descricao`, `mercado_cnpj`

Se essa configuração não estiver preenchida para a unidade do job, a API cai em um dicionário de fallback fixo no código (`CONFIG_EMISSORAS` em `src/lib/opecIntegration.ts`), hoje com apenas emissoras "Demais FM" cadastradas. Isso pode gerar dados de `mercado_*` incorretos para emissoras não mapeadas — vale checar se a unidade em questão está configurada em `/settings`.
