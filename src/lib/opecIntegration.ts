// src/lib/opecIntegration.ts

// 1. DICIONÁRIO DE EMISSORAS (Automação da Unidade para a OPEC)
const CONFIG_EMISSORAS: Record<string, any> = {
  "DEMAIS FM 104,7": {
    mercado_id: "1", // Ajuste para o ID real da OPEC
    mercado_codigo: "DM-1047", // Ajuste para a sigla real
    mercado_descricao: "DEMAIS FM 104,7 TAIÓ",
    mercado_cnpj: "75.835.629/0001-50"
  },
  "DEMAIS FM 107,9": {
    mercado_id: "2",
    mercado_codigo: "DM-1079",
    mercado_descricao: "DEMAIS FM 107,9 PRES. GETÚLIO",
    mercado_cnpj: "75.835.629/0003-12"
  },
  "DEMAIS FM 101,1": {
    mercado_id: "3",
    mercado_codigo: "DM-1011",
    mercado_descricao: "DEMAIS FM 101,1 ITAIÓPOLIS",
    mercado_cnpj: "75.789.966/0001-59"
  }
};

// 2. MOTOR PRINCIPAL: GERA O GABARITO JSON EXATO DA OPEC
export const gerarJsonOpec = (lead: any, clienteFull: any, vendedorLogado: any, configEmissoras?: Record<string, any>) => {
  const emissorasAtivas = (configEmissoras && Object.keys(configEmissoras).length > 0) ? configEmissoras : CONFIG_EMISSORAS;
  // Puxa a emissora baseada na unidade do Lead (com fallback de segurança)
  const emissoraBase = emissorasAtivas[lead.unidade] || Object.values(emissorasAtivas)[0] || {};
  // config_opec da unidade pode existir com campos em branco (validação 21/09/2026: todos os
  // itens saíam com mercado_* vazio e fatura sem CNPJ). CNPJ e descrição não mudam, então cai
  // no dicionário fixo campo a campo. mercado_id/mercado_codigo NÃO são preenchidos por
  // fallback (os do dicionário são provisórios) — precisam estar corretos em /settings.
  const emissoraFixa = CONFIG_EMISSORAS[lead.unidade] || {};
  const emissora = {
    ...emissoraBase,
    mercado_cnpj: emissoraBase.mercado_cnpj || emissoraFixa.mercado_cnpj || '',
    mercado_descricao: emissoraBase.mercado_descricao || emissoraFixa.mercado_descricao || '',
  };
  
  // Trata os itens vendidos (se vierem como string do banco, transforma em array)
  let itensContrato = [];
  try {
      itensContrato = typeof lead.itens === 'string' ? JSON.parse(lead.itens) : (lead.itens || []);
  } catch (e) { 
      itensContrato = []; 
  }

  // Arrays que vão popular o JSON
  const itensFormatados: any[] = [];
  const distribuicaoMapeada: any[] = [];
  const faturasFormatadas: any[] = [];

  // --- MOTOR DE DISTRIBUIÇÃO DIÁRIA E ITENS ---
  itensContrato.forEach((item: any, index: number) => {
      const idItemGerado = `ITEM_${lead.id}_${index + 1}`;
      const valorItemTotal = (item.quantidade || 0) * (item.precoUnitario || 0);

      // Tratamento da Duração (Ex: transforma 30" em "spot 30")
      let tempoLimpo = String(item.tempo || '30"').replace('"', '').trim();
      let tempoFinal = tempoLimpo.toLowerCase() === 'flash' ? 'flash' : `spot ${tempoLimpo}`;

      // Bloco 2: A Mídia Contratada (ITENS)
      itensFormatados.push({
          iditem: idItemGerado,
          mercado_id: emissora.mercado_id,
          mercado_codigo: emissora.mercado_codigo,
          mercado_cnpj: emissora.mercado_cnpj,
          mercado_descricao: emissora.mercado_descricao,
          codigo: String(item.servico || 'SPOT INDETERMINADO').toUpperCase(),
          programa: String(item.programa || 'ROTATIVO COMERCIAL').toUpperCase(),
          tempo: tempoFinal,
          tempo_original: tempoFinal,
          horario_inicial: `${item.horario_inicial || '06:00'}:00`,
          horario_final: `${item.horario_final || '20:00'}:00`,
          quantidade: String(item.quantidade || 1),
          valor_total: valorItemTotal.toFixed(2).replace('.', ',')
      });

      // Lógica de Distribuição Linear por Mês (Bloco 3)
      if (lead.contrato_inicio && lead.contrato_fim) {
          const inicio = new Date(lead.contrato_inicio + 'T00:00:00');
          const fim = new Date(lead.contrato_fim + 'T00:00:00');
          const diasTotaisDoContrato = Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          // Agrupa os dias por mês/ano do calendário
          let dataAtual = new Date(inicio);
          let mesesMapa: any = {};

          while (dataAtual <= fim) {
              const compKey = `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}-01`;
              if (!mesesMapa[compKey]) mesesMapa[compKey] = { diasUteis: [] };
              mesesMapa[compKey].diasUteis.push(dataAtual.getDate());
              dataAtual.setDate(dataAtual.getDate() + 1);
          }

          const mesesKeys = Object.keys(mesesMapa);
          const totalSpots = Number(item.quantidade || 1);
          // Fatia de cada mês pelo ACUMULADO (arredonda o total corrido, não mês a mês): antes o
          // erro de arredondamento de todos os meses caía inteiro no último mês, que já é parcial.
          let diasAcumulados = 0;
          let spotsAlocadosAteAqui = 0;
          mesesKeys.forEach((mesKey) => {
              const diasNoMesContrato = mesesMapa[mesKey].diasUteis;
              const [ano, mes] = mesKey.split('-');
              const diasTotaisDesteMesCalendario = new Date(Number(ano), Number(mes), 0).getDate();

              diasAcumulados += diasNoMesContrato.length;
              const alvoAcumulado = Math.round((diasAcumulados / diasTotaisDoContrato) * totalSpots);
              const spotsDesteMes = alvoAcumulado - spotsAlocadosAteAqui;
              spotsAlocadosAteAqui = alvoAcumulado;

              // Preenche a matriz de dias com ZEROS
              const arrayDiario = Array(diasTotaisDesteMesCalendario).fill(0);

              // Espalha uniformemente pelos dias do contrato no mês. Com mais spots que dias,
              // reparte também (ex: 38 spots em 19 dias = 2 por dia) — antes punha 1 por dia e
              // despejava todo o resto no primeiro dia (ex: "20,1,1,1...", validação 07/10/2026).
              if (spotsDesteMes > 0 && diasNoMesContrato.length > 0) {
                  for (let k = 0; k < spotsDesteMes; k++) {
                      const idx = Math.floor((k * diasNoMesContrato.length) / spotsDesteMes);
                      arrayDiario[diasNoMesContrato[idx] - 1] += 1;
                  }
              }

              distribuicaoMapeada.push({
                  iditem: idItemGerado,
                  competencia: mesKey,
                  tempo: tempoFinal,
                  tempo_original: tempoFinal,
                  total_dias: diasTotaisDesteMesCalendario.toString(),
                  quantidades: arrayDiario.join(','),
                  tipo: "MIDIAAVULSA"
              });
          });
      }
  });

  // --- MOTOR FINANCEIRO (Bloco 4 - Faturas) ---
  const qtdParcelas = Number(lead.parcelas) || 1;
  const valorTotalBruto = Number(lead.valor_total) || 0;
  const valorParcela = valorTotalBruto / qtdParcelas;
  
  let vencimentoBase = new Date(lead.vencimento || lead.contrato_inicio || new Date());

  for (let i = 1; i <= qtdParcelas; i++) {
      faturasFormatadas.push({
          cnpj_faturamento: emissora.mercado_cnpj,
          vencimento: vencimentoBase.toISOString().split('T')[0],
          valor: valorParcela.toFixed(2),
          parcela: `${i}/${qtdParcelas}`
      });
      // Pula 1 mês para a próxima parcela
      vencimentoBase.setMonth(vencimentoBase.getMonth() + 1);
  }

  // ==========================================
  // MONTAGEM FINAL DO JSON (BLOCO 1 + ARRAYS)
  // ==========================================
  const payloadFinal = [{
      data_consulta: new Date().toISOString().replace('T', ' ').substring(0, 19),
      numero_contrato: String(lead.id),
      
      // Dados do Cliente
      cliente: clienteFull?.nome_empresa || lead.empresa || "CLIENTE NÃO INFORMADO",
      cnpj_cliente: clienteFull?.cnpj || lead.cnpj || "",
      inscricao_estadual_cliente: clienteFull?.inscricao_estadual || "ISENTO",
      endereco_cliente: clienteFull?.endereco || "",
      cidade_cliente: clienteFull?.cidade || lead.cidade || "",
      uf_cliente: clienteFull?.estado || "SC",
      
      // Segmentação Padrão
      setor: "Comércio/Serviços",
      subsetor: "Geral",
      segmento: "Geral",
      
      // Dados da Agência
      agencia: lead.tipo === 'Agência' ? (clienteFull?.nome_empresa || lead.empresa) : null,
      cnpj_agencia: lead.tipo === 'Agência' ? (clienteFull?.cnpj || lead.cnpj) : null,
      num_pi: lead.num_pi || "",
      data_pi: "0000-00-00",
      
      // Equipe Comercial
      vendedor: lead.vendedor_nome || vendedorLogado?.nome || "Vendedor Não Informado",
      cpf_vendedor: vendedorLogado?.cpf || "000.000.000-00", 
      
      // Prazos e Valores
      data_contrato: (lead.created_at || new Date().toISOString()).split('T')[0],
      data_inicio: lead.contrato_inicio || "",
      data_fim: lead.contrato_fim || "",
      valor_total: valorTotalBruto.toString(),
      faturamento_bruto: "S",
      envio_fatura_agencia: lead.tipo === 'Agência' ? "S" : "N",
      
      // Observações
      observacao_proposta: lead.descricao || "Venda gerada via CRM WeGrow.",
      observacao_contrato: "Documento exportado automaticamente.",
      
      // Acoplando os Arrays
      itens: itensFormatados,
      distribuicao: distribuicaoMapeada,
      faturas: faturasFormatadas
  }];

  return payloadFinal;
};

// 3. FUNÇÃO UTILITÁRIA PARA BAIXAR O JSON (TESTE / HOMOLOGAÇÃO)
export const downloadJsonOpec = (lead: any, clienteFull: any, vendedorLogado: any) => {
    try {
        const data = gerarJsonOpec(lead, clienteFull, vendedorLogado);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        
        const downloadNode = document.createElement('a');
        downloadNode.setAttribute("href", dataStr);
        downloadNode.setAttribute("download", `OPEC_LEAD_${lead.id}_${lead.empresa.replace(/[^a-z0-9]/gi, '_')}.json`);
        document.body.appendChild(downloadNode);
        
        downloadNode.click();
        downloadNode.remove();
        
        return true;
    } catch (error) {
        console.error("Erro ao gerar JSON:", error);
        alert("Ocorreu um erro ao montar os dados da OPEC. Verifique as datas do contrato.");
        return false;
    }
};