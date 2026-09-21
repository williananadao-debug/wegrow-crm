// Validação dos pacotes que a API /api/opec entrega pra OPEC (gabarito de contrato de mídia).
// Roda sobre o MESMO dado que a OPEC recebe (montarPacotesOpec) e devolve, por contrato,
// o que está errado (bloqueia a integração) ou merece atenção (aviso).

export type Nivel = 'erro' | 'aviso';
export type Problema = { nivel: Nivel; campo: string; mensagem: string };
export type ResultadoContrato = {
  numero_contrato: string | null; id_job: number | null; cliente: string; unidade: string; status: string;
  problemas: Problema[];
};
export type ResumoValidacao = {
  total: number; comErro: number; comAviso: number; ok: number;
  porProblema: { nivel: Nivel; mensagem: string; quantidade: number }[];
};

const ROOT = ['data_consulta', 'numero_contrato', 'cliente', 'cnpj_cliente', 'inscricao_estadual_cliente', 'endereco_cliente', 'cidade_cliente', 'uf_cliente',
  'setor', 'subsetor', 'segmento', 'agencia', 'cnpj_agencia', 'num_pi', 'data_pi', 'vendedor', 'cpf_vendedor', 'data_contrato', 'data_inicio', 'data_fim',
  'valor_total', 'faturamento_bruto', 'envio_fatura_agencia', 'observacao_proposta', 'observacao_contrato', 'itens', 'distribuicao', 'faturas'];
const ITEM = ['iditem', 'mercado_id', 'mercado_codigo', 'mercado_cnpj', 'mercado_descricao', 'codigo', 'programa', 'tempo', 'tempo_original', 'horario_inicial', 'horario_final', 'quantidade', 'valor_total'];

const num = (v: any) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const soDigitos = (v: any) => String(v ?? '').replace(/\D/g, '');

export function validarPacote(r: any): ResultadoContrato {
  const problemas: Problema[] = [];
  const erro = (campo: string, mensagem: string) => problemas.push({ nivel: 'erro', campo, mensagem });
  const aviso = (campo: string, mensagem: string) => problemas.push({ nivel: 'aviso', campo, mensagem });

  const base: ResultadoContrato = {
    numero_contrato: r?.numero_contrato ?? null,
    id_job: r?.producao?.id_job ?? null,
    cliente: typeof r?.cliente === 'object' ? (r.cliente?.nome_fantasia || '—') : (r?.cliente || '—'),
    unidade: r?.veiculacao?.tabela_unidade || '—',
    status: r?.producao?.status || '—',
    problemas,
  };

  // Job sem contrato: não há gabarito nenhum pra conferir
  if (r?.dados_incompletos || r?.numero_contrato == null) {
    erro('contrato', r?.aviso ? `${r.aviso} A OPEC recebe o pacote sem nenhum campo do gabarito.` : 'Job sem contrato (lead) vinculado — a OPEC recebe o pacote sem nenhum campo do gabarito.');
    return base;
  }

  for (const k of ROOT) if (!(k in r)) erro(k, `Campo "${k}" ausente no pacote.`);
  if (r.cliente && typeof r.cliente === 'object') aviso('cliente', 'Na raiz, "cliente" vai como objeto (o gabarito legado pede texto) — confirmar com a OPEC como consomem.');

  // Cliente
  const cnpj = soDigitos(r.cnpj_cliente);
  if (!cnpj) erro('cnpj_cliente', 'CNPJ/CPF do cliente vazio.');
  else if (cnpj.length !== 11 && cnpj.length !== 14) erro('cnpj_cliente', `CNPJ/CPF com ${cnpj.length} dígitos (esperado 11 ou 14).`);
  if (!r.endereco_cliente) aviso('endereco_cliente', 'Endereço do cliente vazio.');
  if (!r.cidade_cliente) aviso('cidade_cliente', 'Cidade do cliente vazia (UF sai como SC por padrão).');
  if (r.inscricao_estadual_cliente === 'ISENTO') aviso('inscricao_estadual_cliente', 'Inscrição estadual não cadastrada — vai como "ISENTO" por padrão.');

  // Contrato
  if (!r.data_inicio || !r.data_fim) erro('data_inicio/data_fim', 'Datas de início/fim do contrato vazias — os itens saem sem distribuição de spots.');
  if (r.cpf_vendedor === '000.000.000-00') aviso('cpf_vendedor', 'CPF do vendedor não cadastrado — vai o placeholder 000.000.000-00.');
  if (!r.vendedor || /n[aã]o informado/i.test(r.vendedor)) aviso('vendedor', 'Vendedor não informado.');
  if (!r.num_pi) aviso('num_pi', 'Número do PI vazio (só é obrigatório se for venda por agência).');
  if (r.agencia && !r.cnpj_agencia) erro('cnpj_agencia', 'Venda por agência sem CNPJ da agência.');
  if (r.veiculacao?.tabela_unidade === 'Não informada' || r.veiculacao?.tabela_unidade === '—') erro('unidade', 'Unidade/tabela da emissora não informada no contrato.');

  // Itens
  const itens: any[] = Array.isArray(r.itens) ? r.itens : [];
  if (itens.length === 0) erro('itens', 'Contrato sem itens de mídia.');
  let somaItens = 0;
  for (const it of itens) {
    for (const k of ITEM) {
      if (it[k] === undefined || it[k] === null || it[k] === '') {
        const campo = k.startsWith('mercado_') ? 'mercado' : k;
        const msg = k.startsWith('mercado_')
          ? 'Emissora sem configuração OPEC (mercado_id/código/CNPJ/descrição em branco) — preencher em Configurações → Unidades.'
          : `Item sem "${k}".`;
        if (!problemas.some(p => p.campo === campo && p.mensagem === msg)) erro(campo, msg);
      }
    }
    if (String(it.codigo || '').toUpperCase() === 'SPOT INDETERMINADO') aviso('itens', 'Item sem nome de serviço ("SPOT INDETERMINADO").');
    somaItens += num(it.valor_total) ?? 0;
  }

  // Valor: itens são brutos, valor_total do contrato é líquido de desconto
  const valor = num(r.valor_total);
  if (valor !== null && itens.length > 0 && Math.abs(somaItens - valor) > 0.05) {
    const desc = Number(r?.comercial?.desconto_aplicado) || 0;
    if (desc > 0 && Math.abs(somaItens - desc - valor) <= 0.05) aviso('valor_total', `Valor do contrato (R$ ${valor}) é líquido do desconto de R$ ${desc}; os itens somam bruto (R$ ${somaItens.toFixed(2)}).`);
    else erro('valor_total', `Valor do contrato (R$ ${valor}) ≠ soma dos itens (R$ ${somaItens.toFixed(2)}) e não é explicado por desconto.`);
  }

  // Distribuição de spots
  const dist: any[] = Array.isArray(r.distribuicao) ? r.distribuicao : [];
  if (itens.length > 0 && dist.length === 0 && r.data_inicio && r.data_fim) erro('distribuicao', 'Itens sem distribuição mensal de spots.');
  const porItem: Record<string, number> = {};
  for (const d of dist) {
    const qs = String(d.quantidades ?? '').split(',').filter(x => x !== '').map(Number);
    if (qs.length !== Number(d.total_dias)) erro('distribuicao', `Competência ${d.competencia}: ${qs.length} dias na matriz ≠ total_dias ${d.total_dias}.`);
    porItem[d.iditem] = (porItem[d.iditem] || 0) + qs.reduce((a, b) => a + b, 0);
  }
  if (dist.length > 0) {
    for (const it of itens) {
      const q = Number(it.quantidade) || 0;
      if ((porItem[it.iditem] || 0) !== q) erro('distribuicao', `Item ${it.iditem}: distribuição soma ${porItem[it.iditem] || 0} spots, contrato tem ${q}.`);
    }
  }

  // Faturas
  const fat: any[] = Array.isArray(r.faturas) ? r.faturas : [];
  if (fat.length === 0) erro('faturas', 'Contrato sem faturas.');
  else {
    const somaFat = fat.reduce((a, f) => a + (num(f.valor) ?? 0), 0);
    if (valor !== null && Math.abs(somaFat - valor) > 0.05) erro('faturas', `Faturas somam R$ ${somaFat.toFixed(2)} ≠ valor do contrato R$ ${valor}.`);
    if (fat.some(f => !/^\d{4}-\d{2}-\d{2}$/.test(String(f.vencimento || '')))) erro('faturas', 'Fatura com vencimento inválido.');
    if (fat.some(f => !f.cnpj_faturamento)) erro('faturas', 'Fatura sem CNPJ de faturamento (emissora sem configuração OPEC).');
  }
  return base;
}

export function validarPacotes(pacotes: any[]): { resumo: ResumoValidacao; contratos: ResultadoContrato[] } {
  const contratos = pacotes.map(validarPacote);
  const cont = new Map<string, { nivel: Nivel; mensagem: string; quantidade: number }>();
  for (const c of contratos) {
    for (const p of c.problemas) {
      // agrupa mensagens com números/datas variáveis pela "forma" da mensagem
      const chave = `${p.nivel}|${p.campo}|${p.mensagem.replace(/[\d.,]+/g, '#')}`;
      const atual = cont.get(chave);
      if (atual) atual.quantidade++; else cont.set(chave, { nivel: p.nivel, mensagem: p.mensagem, quantidade: 1 });
    }
  }
  const comErro = contratos.filter(c => c.problemas.some(p => p.nivel === 'erro')).length;
  const comAviso = contratos.filter(c => !c.problemas.some(p => p.nivel === 'erro') && c.problemas.some(p => p.nivel === 'aviso')).length;
  return {
    resumo: {
      total: contratos.length, comErro, comAviso, ok: contratos.length - comErro - comAviso,
      porProblema: [...cont.values()].sort((a, b) => (a.nivel === b.nivel ? b.quantidade - a.quantidade : a.nivel === 'erro' ? -1 : 1)),
    },
    contratos,
  };
}
