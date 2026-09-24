"use client";
import { useState, useRef, useEffect } from 'react';
import { Loader2, Camera, ScanLine, X, CheckCircle2, Trash2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ServicoConfig, formatId } from '@/app/pulse/shared';
import { acharServicoParecido } from '@/lib/matchProduto';
import { gerarSkuAutomatico } from '@/lib/gerarSkuAutomatico';
import { uploadArquivoNotaFiscal, base64ParaBlob } from '@/lib/notaFiscalArquivo';

type ItemNota = {
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  servicoId: number | 'novo' | 'ignorar';
};

type PedidoOpcao = { id: number; empresa: string; valor_total: number };

// Saída por motivo "venda" precisa estar amarrada a um pedido de verdade (mesmo lead_id
// que a baixa automática de Nova Venda usa) — sem isso, dava pra "vender" estoque por
// aqui sem nenhum registro de venda por trás. Os outros motivos não têm venda associada,
// então continuam livres.
const MOTIVOS_SAIDA: { value: string; label: string }[] = [
  { value: 'venda', label: 'Venda' },
  { value: 'perda', label: 'Perda/quebra' },
  { value: 'devolucao_fornecedor', label: 'Devolução ao fornecedor' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'uso_interno', label: 'Uso interno' },
];

export default function NotaFiscalModal({
  aberto, onFechar, servicos, empresaId, userId, onConcluido, tipo = 'entrada', temCRM = false,
}: {
  aberto: boolean;
  onFechar: () => void;
  servicos: ServicoConfig[];
  empresaId?: string;
  userId?: string;
  onConcluido: (resumo: { fornecedor: string; valorTotal: number; itens: number }) => void;
  tipo?: 'entrada' | 'saida';
  // Empresa com CRM ativo: venda pode ter nascido no funil (tipo != 'Pulse') — busca de
  // pedido pra saída não pode filtrar só por tipo='Pulse' nesse caso.
  temCRM?: boolean;
}) {
  const isSaida = tipo === 'saida';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<'foto' | 'lendo' | 'revisao'>('foto');
  const [imagem, setImagem] = useState<string | null>(null);
  const [fornecedor, setFornecedor] = useState('');
  const [cnpjFornecedor, setCnpjFornecedor] = useState('');
  const [numero, setNumero] = useState('');
  const [serie, setSerie] = useState('');
  const [chaveAcesso, setChaveAcesso] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [valorTotal, setValorTotal] = useState('');
  const [dataVencimento, setDataVencimento] = useState(() => new Date().toISOString().substring(0, 10));
  const [itens, setItens] = useState<ItemNota[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [motivoSaida, setMotivoSaida] = useState('venda');
  const [pedidoQuery, setPedidoQuery] = useState('');
  const [pedidoResultados, setPedidoResultados] = useState<PedidoOpcao[]>([]);
  const [pedidoSelecionado, setPedidoSelecionado] = useState<PedidoOpcao | null>(null);
  const [buscandoPedido, setBuscandoPedido] = useState(false);
  const debouncePedidoRef = useRef<NodeJS.Timeout | null>(null);

  const reset = () => {
    setEtapa('foto'); setImagem(null); setFornecedor(''); setCnpjFornecedor('');
    setNumero(''); setSerie(''); setChaveAcesso(''); setDataEmissao(''); setValorTotal('');
    setDataVencimento(new Date().toISOString().substring(0, 10));
    setItens([]); setErro(null);
    setMotivoSaida('venda'); setPedidoQuery(''); setPedidoResultados([]); setPedidoSelecionado(null);
  };

  useEffect(() => {
    if (!isSaida || motivoSaida !== 'venda' || pedidoSelecionado) { setPedidoResultados([]); return; }
    if (debouncePedidoRef.current) clearTimeout(debouncePedidoRef.current);
    if (pedidoQuery.trim().length < 2) { setPedidoResultados([]); return; }
    setBuscandoPedido(true);
    debouncePedidoRef.current = setTimeout(async () => {
      const q = pedidoQuery.trim();
      // Aceita o código da OS em qualquer formato ("49", "LD-0049", "LD 49") — sem isso,
      // digitar o prefixo "LD-" quebrava a detecção de número e virava busca por nome de
      // empresa (nunca encontrava nada, mesmo com o pedido existindo).
      const soDigitos = q.replace(/^ld[\s-]*/i, '').replace(/\D/g, '');
      // Sem CRM, toda venda tem tipo 'Pulse' (Nova Venda) — filtra por isso pra nunca
      // trazer lead de OUTRO módulo/produto. Com CRM ativo, a venda pode ter nascido no
      // funil (tipo 'Direto' e outros) — sem essa distinção, o pedido de uma empresa
      // CRM+Pulse nunca aparecia aqui (buscava só tipo='Pulse', que essas vendas não têm).
      let query = supabase.from('leads').select('id, empresa, valor_total')
        .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(10);
      if (!temCRM) query = query.eq('tipo', 'Pulse');
      query = soDigitos && /^(ld[\s-]*)?\d+$/i.test(q) ? query.eq('id', Number(soDigitos)) : query.ilike('empresa', `%${q}%`);
      const { data } = await query;
      setPedidoResultados((data as PedidoOpcao[]) || []);
      setBuscandoPedido(false);
    }, 350);
  }, [pedidoQuery, motivoSaida, isSaida, pedidoSelecionado, empresaId, temCRM]);

  const fechar = () => { if (!salvando) { reset(); onFechar(); } };

  const selecionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagem(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const lerNota = async () => {
    if (!imagem) return;
    setEtapa('lendo'); setErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/pulse/ler-nota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ imagemBase64: imagem, tipo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao ler a nota.');

      // Saída não pode "criar produto novo" — não dá pra dar saída de algo que não existe
      // no catálogo. Sem casamento por nome, cai em 'ignorar' em vez de 'novo'.
      const itensLidos: ItemNota[] = (json.itens || []).map((i: any) => ({
        descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario,
        servicoId: acharServicoParecido(i.descricao, servicos) ?? (isSaida ? 'ignorar' : 'novo'),
      }));
      const totalCalculado = itensLidos.reduce((acc, i) => acc + i.quantidade * i.valor_unitario, 0);

      setFornecedor(json.fornecedor || '');
      setCnpjFornecedor(json.cnpjFornecedor || '');
      setNumero(json.numero || '');
      setSerie(json.serie || '');
      setChaveAcesso(json.chaveAcesso || '');
      setDataEmissao(json.dataEmissao || '');
      setValorTotal(String(json.valor_total ?? (totalCalculado || '')));
      setItens(itensLidos);
      setEtapa('revisao');
    } catch (err: any) {
      setErro(err?.message || 'Erro ao ler a nota.');
      setEtapa('foto');
    }
  };

  const atualizarItem = (index: number, patch: Partial<ItemNota>) => {
    setItens(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };

  const removerItem = (index: number) => setItens(prev => prev.filter((_, i) => i !== index));

  const confirmar = async () => {
    if (itens.length === 0) return setErro(isSaida ? 'Nenhum item pra dar saída.' : 'Nenhum item pra dar entrada.');
    if (!valorTotal || Number(valorTotal) <= 0) return setErro('Informe o valor total da nota.');
    if (!dataVencimento) return setErro('Informe a data de vencimento.');
    if (isSaida && motivoSaida === 'venda' && !pedidoSelecionado) return setErro('Saída por venda precisa estar vinculada a um pedido — busque e selecione um.');
    setSalvando(true); setErro(null);
    try {
      // Saída nunca cria produto novo (não existe "vender algo que não está cadastrado") —
      // filtrado aqui de novo por segurança, mesmo já sem a opção na UI.
      const itensValidos = itens.filter(i => i.servicoId !== 'ignorar' && !(isSaida && i.servicoId === 'novo'));
      let ultimoMovimentoId: number | null = null;

      for (const item of itensValidos) {
        let servicoId: number;
        let ehSobEncomenda = false;
        if (item.servicoId === 'novo') {
          const nomeUpper = item.descricao.toLocaleUpperCase('pt-BR');
          const { data: criado, error: erroCriar } = await supabase.from('servicos').insert([{
            // unidade aqui é FILIAL/unidade de negócio, não unidade de medida — '' =
            // "Geral", visível pra empresa inteira (evita produto invisível em Nova
            // Venda pra quem não tem filial chamada literalmente "un").
            nome: nomeUpper, preco: item.valor_unitario, tipo: 'Nota Fiscal', unidade: '',
            estoque: item.quantidade, empresa_id: empresaId, sku: gerarSkuAutomatico(nomeUpper),
          }]).select('id').single();
          if (erroCriar || !criado) throw new Error(erroCriar?.message || 'Erro ao criar produto novo.');
          servicoId = criado.id;
          // Produto novo criado por essa NF sempre nasce com estoque numérico (linha acima)
          // — nunca é sob encomenda, então ehSobEncomenda continua false aqui.
        } else if (typeof item.servicoId === 'number') {
          servicoId = item.servicoId;
          const atual = servicos.find(s => s.id === item.servicoId);
          // Produto sob encomenda (estoque null/undefined, ex: trailer fabricado por venda —
          // nunca tem unidade "em estoque" de verdade) não tem estoque físico pra dar
          // entrada/saída. Sem essa checagem, o "|| 0" abaixo tratava null como zero e
          // GRAVAVA estoque=0 no produto — transformando ele em "produto de estoque" com 0
          // unidades, disparando alerta de estoque mínimo numa venda sob encomenda normal.
          ehSobEncomenda = atual?.estoque === null || atual?.estoque === undefined;
          if (!ehSobEncomenda) {
            const novoEstoque = isSaida
              ? Math.max(0, (atual?.estoque || 0) - item.quantidade)
              : (atual?.estoque || 0) + item.quantidade;
            await supabase.from('servicos').update({ estoque: novoEstoque }).eq('id', item.servicoId);
          }
        } else {
          continue;
        }

        if (!ehSobEncomenda) {
          const { data: movimento } = await supabase.from('estoque_movimentacoes').insert([{
            empresa_id: empresaId, servico_id: servicoId,
            quantidade: isSaida ? -item.quantidade : item.quantidade,
            valor_unitario: item.valor_unitario,
            fornecedor: fornecedor || null, cnpj_participante: cnpjFornecedor || null,
            nf_numero: numero || null, nf_serie: serie || null, nf_chave_acesso: chaveAcesso || null,
            user_id: userId, tipo: isSaida ? 'saida_nf' : 'entrada_nf', motivo: isSaida ? motivoSaida : 'compra',
            lead_id: isSaida && motivoSaida === 'venda' ? pedidoSelecionado?.id ?? null : null,
          }]).select('id').single();
          if (movimento) ultimoMovimentoId = movimento.id;
        }
      }

      const { error: erroLancamento } = await supabase.from('lancamentos').insert([{
        titulo: fornecedor
          ? `Nota Fiscal - ${isSaida ? 'Venda para' : ''} ${fornecedor}`.trim()
          : `Nota Fiscal - ${isSaida ? 'Saída de estoque' : 'Entrada de estoque'}`,
        valor: Number(valorTotal), tipo: isSaida ? 'entrada' : 'saida', categoria: isSaida ? 'Vendas' : 'Fornecedor', status: 'pendente',
        data_vencimento: dataVencimento, user_id: userId, empresa_id: empresaId,
        nf_numero: numero || null, nf_serie: serie || null, nf_chave_acesso: chaveAcesso || null,
        nf_data_emissao: dataEmissao || null, nf_fornecedor_cnpj: cnpjFornecedor || null,
      }]);
      if (erroLancamento) throw new Error(erroLancamento.message);

      // Sobe a própria foto lida — sem isso o botão "Abrir NF" no Kardex não tinha nada
      // pra abrir, só os dados extraídos por IA.
      const danfeUrl = imagem && empresaId ? await uploadArquivoNotaFiscal(empresaId, base64ParaBlob(imagem), 'jpg') : null;

      // Registro fiscal da nota em si (número/série/chave) — hoje é só o que a pessoa
      // digitou/leu por foto (origem 'manual'); quando entrar um provedor de verdade
      // (Focus NFe), essas mesmas linhas passam a ter origem/status vindos da API.
      await supabase.from('fiscal_notas').insert([{
        empresa_id: empresaId, tipo, numero: numero || null, serie: serie || null,
        chave_acesso: chaveAcesso || null, cnpj_participante: cnpjFornecedor || null,
        nome_participante: fornecedor || null, valor_total: Number(valorTotal),
        status: 'autorizada', origem: 'manual', data_emissao: dataEmissao || null,
        estoque_movimentacao_id: ultimoMovimentoId, danfe_url: danfeUrl,
      }]);

      onConcluido({ fornecedor, valorTotal: Number(valorTotal), itens: itensValidos.length });
      reset();
      onFechar();
    } catch (err: any) {
      setErro(err?.message || `Erro ao confirmar ${isSaida ? 'saída' : 'entrada'}.`);
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={fechar}>
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-black text-white uppercase italic text-lg">{isSaida ? 'Saída por Nota Fiscal' : 'Entrada por Nota Fiscal'}</h3>
            <p className="text-slate-500 text-xs font-bold">Foto da nota → IA lê os itens → você confirma</p>
          </div>
          <button onClick={fechar} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        {etapa === 'foto' && (
          <div className="space-y-4">
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={selecionarFoto} className="hidden" />
            {imagem ? (
              <div className="space-y-3">
                <img src={imagem} alt="Nota fiscal" className="w-full max-h-80 object-contain rounded-2xl border border-white/10 bg-black/30" />
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 py-3 rounded-xl text-xs font-black uppercase">Trocar foto</button>
                  <button onClick={lerNota} className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2">
                    <ScanLine size={14} /> Ler Nota com IA
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-white/10 hover:border-purple-500/40 rounded-2xl py-14 flex flex-col items-center gap-3 text-slate-400 hover:text-purple-400 transition-colors">
                <Camera size={32} />
                <span className="text-xs font-black uppercase tracking-widest">Tirar foto ou escolher da galeria</span>
              </button>
            )}
            {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{erro}</div>}
          </div>
        )}

        {etapa === 'lendo' && (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-purple-400" />
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Lendo a nota...</p>
          </div>
        )}

        {etapa === 'revisao' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">{isSaida ? 'Cliente' : 'Fornecedor'}</label>
                <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">{isSaida ? 'CNPJ/CPF do cliente' : 'CNPJ do fornecedor'}</label>
                <input value={cnpjFornecedor} onChange={e => setCnpjFornecedor(e.target.value)} placeholder="Só números" className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
            </div>

            {isSaida && (
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Motivo da saída</label>
                <select
                  value={motivoSaida}
                  onChange={e => { setMotivoSaida(e.target.value); setPedidoSelecionado(null); setPedidoQuery(''); }}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500"
                >
                  {MOTIVOS_SAIDA.map(m => <option key={m.value} value={m.value} className="bg-[#0B1120]">{m.label}</option>)}
                </select>
                {motivoSaida === 'venda' && (
                  <div className="mt-2">
                    {pedidoSelecionado ? (
                      <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/30 rounded-xl px-3 py-2.5">
                        <p className="text-white text-xs font-bold truncate">{formatId(pedidoSelecionado.id)} · {pedidoSelecionado.empresa}</p>
                        <button onClick={() => setPedidoSelecionado(null)} className="text-slate-400 hover:text-white p-1 shrink-0"><X size={14} /></button>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-purple-500">
                          <Search size={13} className="text-slate-500 flex-shrink-0" />
                          <input value={pedidoQuery} onChange={e => setPedidoQuery(e.target.value)} placeholder="Busque o pedido por cliente ou nº da OS..." className="flex-1 bg-transparent outline-none text-white text-xs" />
                          {buscandoPedido && <Loader2 size={13} className="animate-spin text-slate-500" />}
                        </div>
                        {pedidoQuery.trim().length >= 2 && (
                          <div className="absolute z-20 mt-1 w-full bg-[#0B1120] border border-white/10 rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-2xl">
                            {pedidoResultados.map(p => (
                              <button key={p.id} onClick={() => { setPedidoSelecionado(p); setPedidoQuery(''); }} className="w-full text-left px-4 py-2.5 hover:bg-white/5 border-b border-white/5 last:border-0">
                                <p className="text-white text-sm font-bold">{formatId(p.id)} · {p.empresa}</p>
                                <p className="text-slate-500 text-xs">R$ {p.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              </button>
                            ))}
                            {!buscandoPedido && pedidoResultados.length === 0 && (
                              <p className="text-slate-500 text-xs font-bold p-3">Nenhum pedido encontrado com esse termo.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-slate-600 text-[9px] font-bold mt-1">Saída por venda precisa vir de um pedido já existente (feito em Nova Venda) — sem isso o estoque baixa sem nenhuma venda registrada por trás.</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Número</label>
                <input value={numero} onChange={e => setNumero(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Série</label>
                <input value={serie} onChange={e => setSerie(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Emissão</label>
                <input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Chave de acesso (44 dígitos)</label>
              <input value={chaveAcesso} onChange={e => setChaveAcesso(e.target.value.replace(/\D/g, ''))} maxLength={44} placeholder="Deixe em branco se não conseguir conferir" className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-xs font-mono tracking-tight outline-none focus:border-purple-500" />
              {chaveAcesso && chaveAcesso.length !== 44 && <p className="text-amber-400 text-[10px] font-bold mt-1">{chaveAcesso.length}/44 dígitos — confira, pode estar incompleta</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">{isSaida ? 'Vencimento (Contas a Receber)' : 'Vencimento (Contas a Pagar)'}</label>
                <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Valor total da nota</label>
                <input type="number" step="0.01" value={valorTotal} onChange={e => setValorTotal(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Itens lidos ({itens.length})</p>
              {itens.length === 0 && <p className="text-slate-500 text-xs font-bold p-3">Nenhum item identificado.</p>}
              {itens.map((item, i) => (
                <div key={i} className="bg-black/30 border border-white/5 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white font-bold text-sm truncate">{item.descricao}</p>
                    <button onClick={() => removerItem(i)} className="text-slate-500 hover:text-red-400 p-1 flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" step="1" min="0" value={item.quantidade} onChange={e => atualizarItem(i, { quantidade: Number(e.target.value) })} placeholder="Qtd" className="bg-black/40 border border-white/10 rounded-lg py-2 px-2.5 text-white text-xs outline-none focus:border-purple-500" />
                    <input type="number" step="0.01" min="0" value={item.valor_unitario} onChange={e => atualizarItem(i, { valor_unitario: Number(e.target.value) })} placeholder="Valor unit." className="bg-black/40 border border-white/10 rounded-lg py-2 px-2.5 text-white text-xs outline-none focus:border-purple-500" />
                  </div>
                  <select
                    value={String(item.servicoId)}
                    onChange={e => atualizarItem(i, { servicoId: e.target.value === 'novo' || e.target.value === 'ignorar' ? e.target.value as any : Number(e.target.value) })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-2.5 text-white text-xs outline-none focus:border-purple-500"
                  >
                    {!isSaida && <option value="novo" className="bg-[#0B1120]">+ Criar novo produto "{item.descricao}"</option>}
                    <option value="ignorar" className="bg-[#0B1120]">Ignorar este item (não mexe no estoque)</option>
                    {servicos.map(s => (
                      <option key={s.id} value={s.id} className="bg-[#0B1120]">{isSaida ? `Baixar do estoque de: ${s.nome} (${s.estoque ?? 0} disp.)` : `Somar no estoque de: ${s.nome}`}</option>
                    ))}
                  </select>
                  {isSaida && typeof item.servicoId === 'number' && (() => {
                    const s = servicos.find(sv => sv.id === item.servicoId);
                    return s && item.quantidade > (s.estoque ?? 0)
                      ? <p className="text-amber-400 text-[10px] font-bold">Quantidade maior que o disponível ({s.estoque ?? 0}) — estoque vai ficar zerado, não negativo.</p>
                      : null;
                  })()}
                </div>
              ))}
            </div>

            {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{erro}</div>}

            <button onClick={confirmar} disabled={salvando} className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] font-black uppercase text-xs tracking-widest py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {salvando ? 'Confirmando...' : isSaida ? 'Confirmar saída e lançar receita' : 'Confirmar entrada e lançar despesa'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
