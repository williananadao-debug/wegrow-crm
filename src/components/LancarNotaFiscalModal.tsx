"use client";
import { useState, useRef, useEffect } from 'react';
import { Loader2, Camera, FileUp, FileCode2, PenLine, X, CheckCircle2, Trash2, ArrowLeft, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ServicoConfig } from '@/app/pulse/shared';
import { acharServicoParecido } from '@/lib/matchProduto';
import { extrairCabecalhoXmlNfe, extrairItensXmlNfe } from '@/lib/nfeXmlParser';
import { uploadArquivoNotaFiscal } from '@/lib/notaFiscalArquivo';

type ItemNota = {
  chave: string; // id local, só pra key do React e remover linha — nunca vai pro banco
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  servicoId: number | 'novo' | 'ignorar';
};

const novaChave = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));

type Metodo = 'foto' | 'pdf' | 'xml' | 'manual';

const METODOS: { id: Metodo; label: string; icone: typeof Camera; desc: string }[] = [
  { id: 'foto', label: 'Foto', icone: Camera, desc: 'Tira foto ou escolhe da galeria — a IA lê' },
  { id: 'pdf', label: 'PDF', icone: FileUp, desc: 'DANFE em PDF — a IA lê a 1ª página' },
  { id: 'xml', label: 'XML', icone: FileCode2, desc: 'XML da NF-e — leitura exata, sem IA' },
  { id: 'manual', label: 'Manual', icone: PenLine, desc: 'Digita tudo do zero' },
];

// Lança uma nota fiscal em /pulse/fiscal por qualquer um dos 4 caminhos de entrada —
// unifica num só modal o que antes só existia como "foto" (NotaFiscalModal, em
// /pulse/estoque). Sempre termina no mesmo passo de revisão antes de confirmar: mesmo
// vindo de IA (foto/PDF) ou de leitura exata (XML), humano confere antes de mexer em
// estoque — casamento automático de produto é só sugestão, nunca é definitivo sozinho.
export default function LancarNotaFiscalModal({
  aberto, onFechar, servicos, empresaId, userId, onConcluido,
}: {
  aberto: boolean;
  onFechar: () => void;
  servicos: ServicoConfig[];
  empresaId?: string;
  userId?: string;
  onConcluido: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<'escolha' | 'preparando' | 'lendo' | 'revisao'>('escolha');
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada');

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

  // Guarda o arquivo original (foto/PDF/XML) selecionado — usado só pra IA/parser ler na
  // hora, mas também sobe pro Storage no confirmar() final, pra dar ao botão "Abrir NF"
  // (no Kardex do Estoque) algo de verdade pra abrir. Método 'manual' nunca tem arquivo.
  const [arquivoOriginal, setArquivoOriginal] = useState<File | null>(null);

  // Histórico de descrições já digitadas — sugestão via <datalist> nativo enquanto
  // digita, pra não reinventar "Chapa de Aço 2mm" de um jeito diferente toda hora.
  const [historicoDescricoes, setHistoricoDescricoes] = useState<string[]>([]);

  useEffect(() => {
    if (!aberto || !empresaId) return;
    (async () => {
      const { data: notasRecentes } = await supabase.from('fiscal_notas').select('id')
        .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(300);
      const notaIds = (notasRecentes || []).map(n => n.id);
      if (notaIds.length === 0) return;
      const { data: itensHistorico } = await supabase.from('fiscal_notas_itens')
        .select('descricao').in('nota_id', notaIds).limit(1000);
      const doHistorico = (itensHistorico || []).map(i => i.descricao);
      const doCatalogo = servicos.map(s => s.nome);
      setHistoricoDescricoes(Array.from(new Set([...doHistorico, ...doCatalogo])).sort());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, empresaId]);

  const reset = () => {
    setEtapa('escolha'); setMetodo(null); setTipo('entrada');
    setFornecedor(''); setCnpjFornecedor(''); setNumero(''); setSerie('');
    setChaveAcesso(''); setDataEmissao(''); setValorTotal('');
    setDataVencimento(new Date().toISOString().substring(0, 10));
    setItens([]); setErro(null); setArquivoOriginal(null);
  };

  const fechar = () => { if (!salvando) { reset(); onFechar(); } };

  const casarItens = (itensLidos: { descricao: string; quantidade: number; valor_unitario: number }[]): ItemNota[] =>
    itensLidos.map(i => ({
      chave: novaChave(), descricao: i.descricao, quantidade: i.quantidade, valorUnitario: i.valor_unitario,
      servicoId: acharServicoParecido(i.descricao, servicos) ?? (tipo === 'saida' ? 'ignorar' : 'novo'),
    }));

  const lerComIA = async (imagemBase64: string) => {
    setEtapa('lendo'); setErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/pulse/ler-nota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ imagemBase64, tipo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao ler a nota.');

      const itensLidos = casarItens(json.itens || []);
      const totalCalculado = itensLidos.reduce((acc, i) => acc + i.quantidade * i.valorUnitario, 0);
      setFornecedor(json.fornecedor || ''); setCnpjFornecedor(json.cnpjFornecedor || '');
      setNumero(json.numero || ''); setSerie(json.serie || ''); setChaveAcesso(json.chaveAcesso || '');
      setDataEmissao(json.dataEmissao || ''); setValorTotal(String(json.valor_total ?? (totalCalculado || '')));
      setItens(itensLidos);
      setEtapa('revisao');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao ler a nota.');
      setEtapa('escolha');
    }
  };

  const selecionarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !metodo) return;
    setErro(null);
    setArquivoOriginal(file);

    if (metodo === 'foto') {
      const reader = new FileReader();
      reader.onload = () => lerComIA(reader.result as string);
      reader.readAsDataURL(file);
      return;
    }

    if (metodo === 'pdf') {
      setEtapa('preparando');
      try {
        const { renderizarPrimeiraPaginaPdf } = await import('@/lib/pdfParaImagem');
        const imagem = await renderizarPrimeiraPaginaPdf(file);
        await lerComIA(imagem);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Erro ao processar o PDF.');
        setEtapa('escolha');
      }
      return;
    }

    if (metodo === 'xml') {
      try {
        const texto = await file.text();
        const cabecalho = extrairCabecalhoXmlNfe(texto);
        const itensXml = extrairItensXmlNfe(texto);
        if (!cabecalho.chaveAcesso && itensXml.length === 0) {
          throw new Error('Esse arquivo não parece ser um XML de NF-e válido.');
        }
        // Saída = nós emitimos, quem interessa é o destinatário; entrada = fornecedor
        // emitiu, quem interessa é o emitente. Mesma regra da leitura por IA.
        const nomeParticipante = tipo === 'saida' ? cabecalho.nomeDestinatario : cabecalho.nomeEmitente;
        const cnpjParticipante = tipo === 'saida' ? cabecalho.cnpjDestinatario : cabecalho.cnpjEmitente;
        setFornecedor(nomeParticipante || ''); setCnpjFornecedor(cnpjParticipante || '');
        setNumero(cabecalho.numero || ''); setSerie(cabecalho.serie || '');
        setChaveAcesso(cabecalho.chaveAcesso || ''); setDataEmissao(cabecalho.dataEmissao || '');
        setValorTotal(cabecalho.valorTotal != null ? String(cabecalho.valorTotal) : '');
        setItens(casarItens(itensXml.map(i => ({ descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario }))));
        setEtapa('revisao');
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Erro ao ler o XML.');
        setEtapa('escolha');
      }
    }
  };

  const escolherMetodo = (m: Metodo) => {
    setMetodo(m); setErro(null);
    if (m === 'manual') { setItens([]); setArquivoOriginal(null); setEtapa('revisao'); return; }
    fileInputRef.current?.click();
  };

  const adicionarItem = () => setItens(prev => [...prev, { chave: novaChave(), descricao: '', quantidade: 1, valorUnitario: 0, servicoId: 'novo' }]);
  const atualizarItem = (chave: string, patch: Partial<ItemNota>) => {
    setItens(prev => prev.map(it => {
      if (it.chave !== chave) return it;
      const atualizado = { ...it, ...patch };
      if (patch.descricao !== undefined) atualizado.servicoId = acharServicoParecido(patch.descricao, servicos) ?? (tipo === 'saida' ? 'ignorar' : 'novo');
      return atualizado;
    }));
  };
  const removerItem = (chave: string) => setItens(prev => prev.filter(it => it.chave !== chave));

  const confirmar = async () => {
    const validos = itens.filter(i => i.descricao.trim() && i.quantidade > 0);
    if (validos.length === 0) return setErro('Adicione pelo menos um item com descrição e quantidade.');
    if (!valorTotal || Number(valorTotal) <= 0) return setErro('Informe o valor total da nota.');
    if (!dataVencimento) return setErro('Informe a data de vencimento.');
    if (!empresaId) return setErro('Empresa não identificada.');
    setSalvando(true); setErro(null);
    try {
      // Sobe o arquivo original (foto/PDF vira danfe_url, XML vira xml_url) — sem isso o
      // botão "Abrir NF" no Kardex do Estoque não tinha nada de verdade pra abrir, só os
      // dados que a IA/parser extraiu.
      let danfeUrl: string | null = null;
      let xmlUrl: string | null = null;
      if (arquivoOriginal && (metodo === 'foto' || metodo === 'pdf')) {
        danfeUrl = await uploadArquivoNotaFiscal(empresaId, arquivoOriginal, metodo === 'pdf' ? 'pdf' : 'jpg');
      } else if (arquivoOriginal && metodo === 'xml') {
        xmlUrl = await uploadArquivoNotaFiscal(empresaId, arquivoOriginal, 'xml');
      }

      const { data: notaCriada, error: erroNota } = await supabase.from('fiscal_notas').insert([{
        empresa_id: empresaId, tipo, numero: numero || null, serie: serie || null,
        chave_acesso: chaveAcesso || null, cnpj_participante: cnpjFornecedor || null,
        nome_participante: fornecedor || null, valor_total: Number(valorTotal),
        status: 'autorizada', origem: 'manual', data_emissao: dataEmissao || null,
        itens_status: 'processado', danfe_url: danfeUrl, xml_url: xmlUrl,
      }]).select('id').single();
      if (erroNota || !notaCriada) throw new Error(erroNota?.message || 'Erro ao criar a nota.');

      const itensValidos = validos.filter(i => i.servicoId !== 'ignorar' && !(tipo === 'saida' && i.servicoId === 'novo'));

      for (const item of itensValidos) {
        let servicoId: number;
        if (item.servicoId === 'novo') {
          const { data: criado, error: erroCriar } = await supabase.from('servicos').insert([{
            // unidade aqui é FILIAL/unidade de negócio (ver Configurações → Produtos), não
            // unidade de medida — '' = "Geral", visível pra empresa inteira. 'un' quebrava
            // o produto: ficava invisível em Nova Venda pra quem não tivesse uma filial
            // chamada literalmente "un".
            nome: item.descricao, preco: item.valorUnitario, tipo: 'Nota Fiscal', unidade: '',
            estoque: item.quantidade, empresa_id: empresaId,
          }]).select('id').single();
          if (erroCriar || !criado) throw new Error(erroCriar?.message || `Erro ao criar produto "${item.descricao}".`);
          servicoId = criado.id;
        } else {
          servicoId = item.servicoId as number;
          const atual = servicos.find(s => s.id === servicoId);
          const novoEstoque = tipo === 'saida'
            ? Math.max(0, (atual?.estoque || 0) - item.quantidade)
            : (atual?.estoque || 0) + item.quantidade;
          await supabase.from('servicos').update({ estoque: novoEstoque }).eq('id', servicoId);
        }

        const { data: movimento } = await supabase.from('estoque_movimentacoes').insert([{
          empresa_id: empresaId, servico_id: servicoId, quantidade: tipo === 'saida' ? -item.quantidade : item.quantidade,
          valor_unitario: item.valorUnitario, user_id: userId,
          tipo: tipo === 'saida' ? 'saida_nf' : 'entrada_nf', motivo: tipo === 'saida' ? 'venda' : 'compra',
          nf_numero: numero || null, nf_serie: serie || null, nf_chave_acesso: chaveAcesso || null,
          fornecedor: fornecedor || null, cnpj_participante: cnpjFornecedor || null,
        }]).select('id').single();

        await supabase.from('fiscal_notas_itens').insert([{
          nota_id: notaCriada.id, descricao: item.descricao, quantidade: item.quantidade,
          valor_unitario: item.valorUnitario, servico_id: servicoId, status: 'confirmado',
          estoque_movimentacao_id: movimento?.id ?? null,
        }]);
      }

      if (tipo === 'entrada') {
        const dataBase = dataEmissao ? new Date(dataEmissao) : new Date();
        const { data: lancamento } = await supabase.from('lancamentos').insert([{
          titulo: `Nota Fiscal - ${fornecedor || 'Fornecedor'}`, valor: Number(valorTotal),
          tipo: 'saida', categoria: 'Fornecedor', status: 'pendente', data_vencimento: dataVencimento,
          user_id: userId, empresa_id: empresaId,
          nf_numero: numero || null, nf_serie: serie || null, nf_chave_acesso: chaveAcesso || null,
          nf_data_emissao: dataEmissao || null, nf_fornecedor_cnpj: cnpjFornecedor || null,
        }]).select('id').single();
        if (lancamento) await supabase.from('fiscal_notas').update({ lancamento_id: lancamento.id }).eq('id', notaCriada.id);
        void dataBase; // só documentando a intenção — data_vencimento vem do campo que a pessoa preencheu, não estimado
      }

      onConcluido();
      reset();
      onFechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao confirmar a nota.');
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={fechar}>
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <input ref={fileInputRef} type="file" accept={metodo === 'xml' ? '.xml,text/xml' : metodo === 'pdf' ? 'application/pdf' : 'image/*'} capture={metodo === 'foto' ? 'environment' : undefined} className="hidden" onChange={selecionarArquivo} />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {etapa === 'revisao' && metodo && (
              <button onClick={() => { setEtapa('escolha'); setErro(null); }} className="text-slate-500 hover:text-white p-1"><ArrowLeft size={16} /></button>
            )}
            <div>
              <h3 className="font-black text-white uppercase italic text-lg">Lançar Nota Fiscal</h3>
              <p className="text-slate-500 text-xs font-bold">{etapa === 'escolha' ? 'Escolha como vai lançar' : 'Foto/PDF/XML → você confirma'}</p>
            </div>
          </div>
          <button onClick={fechar} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        {etapa === 'escolha' && (
          <div className="space-y-4">
            <div className="flex gap-1 bg-black/30 border border-white/10 rounded-xl p-1">
              <button onClick={() => setTipo('entrada')} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase transition-all ${tipo === 'entrada' ? 'bg-purple-500 text-white' : 'text-slate-400 hover:text-white'}`}>Entrada (compra)</button>
              <button onClick={() => setTipo('saida')} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase transition-all ${tipo === 'saida' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}>Saída (venda)</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {METODOS.map(m => (
                <button key={m.id} onClick={() => escolherMetodo(m.id)} className="text-left bg-white/[0.02] hover:bg-white/[0.06] border border-white/10 hover:border-white/20 rounded-2xl p-4 transition-all">
                  <m.icone size={20} className="text-slate-400 mb-2" />
                  <p className="text-white font-bold text-sm">{m.label}</p>
                  <p className="text-slate-500 text-[10px] mt-0.5 leading-snug">{m.desc}</p>
                </button>
              ))}
            </div>
            {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{erro}</div>}
          </div>
        )}

        {etapa === 'preparando' && (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-purple-400" />
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Convertendo o PDF...</p>
          </div>
        )}

        {etapa === 'lendo' && (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-purple-400" />
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Lendo a nota com IA...</p>
          </div>
        )}

        {etapa === 'revisao' && (
          <div className="space-y-4">
            <datalist id="historico-itens-nota">
              {historicoDescricoes.map(d => <option key={d} value={d} />)}
            </datalist>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">{tipo === 'saida' ? 'Cliente' : 'Fornecedor'}</label>
                <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">CNPJ/CPF</label>
                <input value={cnpjFornecedor} onChange={e => setCnpjFornecedor(e.target.value)} placeholder="Só números" className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
            </div>
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
              <input value={chaveAcesso} onChange={e => setChaveAcesso(e.target.value.replace(/\D/g, ''))} maxLength={44} placeholder="Deixe em branco se não tiver" className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-xs font-mono tracking-tight outline-none focus:border-purple-500" />
              {chaveAcesso && chaveAcesso.length !== 44 && <p className="text-amber-400 text-[10px] font-bold mt-1">{chaveAcesso.length}/44 dígitos — confira, pode estar incompleta</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Valor total</label>
                <input type="number" step="0.01" value={valorTotal} onChange={e => setValorTotal(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
              </div>
              {tipo === 'entrada' && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Vencimento</label>
                  <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-purple-500" />
                </div>
              )}
            </div>

            <div className="border-t border-white/5 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Itens</label>
                <button onClick={adicionarItem} className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-purple-300 hover:text-purple-200"><Plus size={12} /> Adicionar item</button>
              </div>
              {itens.length === 0 && <p className="text-slate-600 text-xs text-center py-4">Nenhum item ainda — clica em &quot;Adicionar item&quot;.</p>}
              {itens.map(item => (
                <div key={item.chave} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={item.descricao} onChange={e => atualizarItem(item.chave, { descricao: e.target.value })}
                      list="historico-itens-nota" placeholder="Descrição do produto"
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-purple-500"
                    />
                    <button onClick={() => removerItem(item.chave)} className="text-slate-500 hover:text-red-400 p-1 shrink-0"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min="0" step="any" value={item.quantidade || ''} onChange={e => atualizarItem(item.chave, { quantidade: Number(e.target.value) || 0 })} placeholder="Quantidade" className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-purple-500" />
                    <input type="number" min="0" step="0.01" value={item.valorUnitario || ''} onChange={e => atualizarItem(item.chave, { valorUnitario: Number(e.target.value) || 0 })} placeholder="Valor unitário (R$)" className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-purple-500" />
                  </div>
                  {item.descricao.trim() && (
                    <select
                      value={String(item.servicoId)}
                      onChange={e => atualizarItem(item.chave, { servicoId: e.target.value === 'novo' || e.target.value === 'ignorar' ? e.target.value : Number(e.target.value) })}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-purple-500"
                    >
                      {tipo === 'entrada' && <option value="novo" className="bg-[#0B1120]">+ Criar produto novo com esse nome</option>}
                      <option value="ignorar" className="bg-[#0B1120]">Ignorar (não afeta estoque)</option>
                      {servicos.map(s => <option key={s.id} value={s.id} className="bg-[#0B1120]">{s.nome}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>

            {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{erro}</div>}

            <button onClick={confirmar} disabled={salvando} className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white py-3 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {salvando ? 'Salvando...' : `Confirmar ${tipo === 'entrada' ? 'entrada' : 'saída'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
