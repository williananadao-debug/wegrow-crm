"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Loader2, Scale, Search, Briefcase } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import AdvocaciaTopNav from '../AdvocaciaTopNav';
import DocumentosPanel from '../DocumentosPanel';
import { Cliente, validarCNPJ, validarCPF, STATUS_PROCESSO_LABELS, STATUS_PROCESSO_CORES, TIPO_HONORARIO_LABELS, AdvocaciaProcesso, fmtData } from '../shared';

type TipoPessoa = 'fisica' | 'juridica';

const vazio = { nome_empresa: '', telefone: '', email: '', cidade: '', endereco: '' };

export default function AdvocaciaClientesPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const nomeEmpresa = empresa?.nome;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [processos, setProcessos] = useState<AdvocaciaProcesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoa>('juridica');
  const [documento, setDocumento] = useState('');
  const [form, setForm] = useState(vazio);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const [clienteAberto, setClienteAberto] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [{ data: clientesData }, { data: procData }] = await Promise.all([
      supabase.from('clientes').select('id, nome_empresa, nome_fantasia, telefone, email, cnpj, status, cidade, endereco, created_at').eq('empresa_id', perfil.empresa_id).order('nome_empresa', { ascending: true }),
      supabase.from('advocacia_processos').select('*').eq('empresa_id', perfil.empresa_id),
    ]);
    setClientes((clientesData as Cliente[]) || []);
    setProcessos((procData as AdvocaciaProcesso[]) || []);
    setLoading(false);
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const clientesFiltrados = useMemo(() => {
    if (!busca.trim()) return clientes;
    const b = busca.toLowerCase();
    return clientes.filter(c => c.nome_empresa?.toLowerCase().includes(b) || c.cnpj?.includes(b) || c.telefone?.includes(b));
  }, [clientes, busca]);

  const processosDoCliente = (clientId: number) => processos.filter(p => p.client_id === clientId);

  const maskDocumento = (v: string) => {
    const digits = v.replace(/\D/g, '');
    if (tipoPessoa === 'fisica') {
      const d = digits.substring(0, 11);
      if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
      if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
      if (d.length > 3) return d.replace(/(\d{3})(\d{1,3})/, '$1.$2');
      return d;
    }
    const d = digits.substring(0, 14);
    if (d.length > 12) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
    if (d.length > 8) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
    if (d.length > 5) return d.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
    if (d.length > 2) return d.replace(/(\d{2})(\d{1,3})/, '$1.$2');
    return d;
  };

  const abrirNovo = () => { setEditando(null); setForm(vazio); setTipoPessoa('juridica'); setDocumento(''); setErro(''); setModalAberto(true); };
  const abrirEdicao = (c: Cliente) => {
    setEditando(c);
    setForm({ nome_empresa: c.nome_empresa, telefone: c.telefone || '', email: c.email || '', cidade: c.cidade || '', endereco: c.endereco || '' });
    const digitos = (c.cnpj || '').replace(/\D/g, '');
    setTipoPessoa(digitos.length === 11 ? 'fisica' : 'juridica');
    setDocumento(c.cnpj || '');
    setErro('');
    setModalAberto(true);
  };

  const salvar = async () => {
    if (!form.nome_empresa.trim() || !perfil?.empresa_id) return;
    const digitos = documento.replace(/\D/g, '');
    const tamanhoEsperado = tipoPessoa === 'fisica' ? 11 : 14;
    if (digitos.length > 0 && digitos.length !== tamanhoEsperado) {
      setErro(`${tipoPessoa === 'fisica' ? 'CPF' : 'CNPJ'} incompleto.`);
      return;
    }
    if (digitos.length === tamanhoEsperado) {
      const valido = tipoPessoa === 'fisica' ? validarCPF(documento) : validarCNPJ(documento);
      if (!valido) { setErro(`${tipoPessoa === 'fisica' ? 'CPF' : 'CNPJ'} inválido.`); return; }
    }
    setErro('');
    setSalvando(true);
    const payload = {
      nome_empresa: form.nome_empresa.trim(),
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      cnpj: documento || null,
      cidade: form.cidade.trim() || null,
      endereco: form.endereco.trim() || null,
    };
    if (editando) {
      await supabase.from('clientes').update(payload).eq('id', editando.id);
    } else {
      await supabase.from('clientes').insert([{ ...payload, empresa_id: perfil.empresa_id, status: 'ativo' }]);
    }
    setSalvando(false);
    setModalAberto(false);
    carregar();
  };

  return (
    <div>
      <AdvocaciaTopNav nomeEmpresa={nomeEmpresa} />
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-[22px] font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-advocacia-serif)' }}>Cadastro de cliente</h1>
            <p className="text-[13px] text-[#6b6862] mt-1">Pessoa física ou jurídica, processos vinculados e documentos.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9a958a]" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente..."
                className="border border-[#e5e0d5] rounded-lg pl-8 pr-3 py-2 text-[13px] w-56 focus:outline-none focus:border-[#d9861c]" />
            </div>
            <button onClick={abrirNovo} className="flex items-center gap-2 bg-[#241c14] hover:bg-[#3a2c1c] text-white px-4 py-2.5 rounded-lg text-[14px] font-semibold transition-all">
              <Plus size={16} /> Novo cliente
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-[#d9861c]" /></div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <Scale size={28} className="text-[#d9861c] mx-auto mb-3" />
            <p className="text-[#6b6862] text-[13px] font-semibold">Nenhum cliente cadastrado ainda — eles aparecem aqui automaticamente quando um processo fecha, ou cadastre um direto.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {clientesFiltrados.map(c => {
              const procs = processosDoCliente(c.id);
              const aberto = clienteAberto === c.id;
              return (
                <div key={c.id} className="bg-white border border-[#e5e0d5] rounded-2xl overflow-hidden">
                  <button onClick={() => setClienteAberto(aberto ? null : c.id)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#faf7f2] transition-colors">
                    <div>
                      <p className="text-[14px] font-bold text-[#241c14]">{c.nome_empresa}</p>
                      <p className="text-[12px] text-[#9a958a] mt-0.5">{c.cnpj || 'Sem documento'} {c.telefone ? `· ${c.telefone}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold text-[#6b6862] flex items-center gap-1"><Briefcase size={11} /> {procs.length} processo(s)</span>
                      <button onClick={(e) => { e.stopPropagation(); abrirEdicao(c); }} className="text-[11px] font-semibold text-[#d9861c] hover:underline">Editar</button>
                    </div>
                  </button>

                  {aberto && (
                    <div className="border-t border-[#e5e0d5] px-5 py-4 space-y-4">
                      {procs.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold uppercase text-[#9a958a] mb-2">Processos</p>
                          <div className="space-y-1.5">
                            {procs.map(p => (
                              <div key={p.id} className="flex items-center justify-between text-[13px] bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2">
                                <span className="text-[#241c14]">{p.area_juridica} · {TIPO_HONORARIO_LABELS[p.tipo_honorario]}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_PROCESSO_CORES[p.status]}`}>{STATUS_PROCESSO_LABELS[p.status]}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <DocumentosPanel clientId={c.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalAberto(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold text-[#241c14] flex items-center gap-2"><Scale size={16} className="text-[#d9861c]" /> {editando ? 'Editar cliente' : 'Novo cliente'}</h2>
              <button onClick={() => setModalAberto(false)} className="text-[#9a958a] hover:text-[#241c14]"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['juridica', 'fisica'] as TipoPessoa[]).map(t => (
                  <button key={t} type="button" onClick={() => { setTipoPessoa(t); setDocumento(''); setErro(''); }}
                    className={`flex-1 py-2 rounded-lg text-[12px] font-semibold border transition-all ${tipoPessoa === t ? 'bg-[#fdf0d4] border-[#d9861c] text-[#d9861c]' : 'border-[#e5e0d5] text-[#6b6862]'}`}>
                    {t === 'juridica' ? 'Pessoa jurídica' : 'Pessoa física'}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-[#9a958a]">{tipoPessoa === 'fisica' ? 'Nome completo' : 'Razão social'}</label>
                <input value={form.nome_empresa} onChange={e => setForm(f => ({ ...f, nome_empresa: e.target.value }))}
                  className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-[#9a958a]">{tipoPessoa === 'fisica' ? 'CPF' : 'CNPJ'}</label>
                <input value={documento} onChange={e => setDocumento(maskDocumento(e.target.value))}
                  className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" placeholder={tipoPessoa === 'fisica' ? '000.000.000-00' : '00.000.000/0000-00'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#9a958a]">Telefone</label>
                  <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                    className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#9a958a]">E-mail</label>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#9a958a]">Cidade</label>
                  <input value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
                    className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#9a958a]">Endereço</label>
                  <input value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                    className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" />
                </div>
              </div>
              {erro && <p className="text-[12px] text-[#d63f3f] font-semibold">{erro}</p>}
            </div>
            <button onClick={salvar} disabled={salvando || !form.nome_empresa.trim()}
              className="w-full mt-5 bg-[#d9861c] hover:bg-[#c47818] disabled:opacity-50 text-white py-2.5 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : editando ? 'Salvar alterações' : 'Criar cliente'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
