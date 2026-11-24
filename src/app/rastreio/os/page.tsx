"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wrench, Loader2, Plus, X, CheckSquare, Square, Camera, FileText, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRastreioAccess, fmtDataHora, fmtMoeda } from '../shared';

type Item = { item: string; ok: boolean };
type Foto = { nome: string; path: string };
type OS = {
  id: number; tipo: string; cliente_id: string | null; veiculo_id: string | null; tecnico: string | null; agendada_para: string | null; endereco: string | null;
  status: string; checklist: Item[]; fotos: Foto[]; observacao: string | null; valor: number | null; criado_por: string | null; concluida_em: string | null; created_at: string;
};
const TIPOS: Record<string, string> = { instalacao: 'Instalação', manutencao: 'Manutenção', retirada: 'Retirada', troca: 'Troca de aparelho', vistoria: 'Vistoria' };
const STATUS: Record<string, { t: string; c: string }> = {
  agendada: { t: 'Agendada', c: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
  em_andamento: { t: 'Em andamento', c: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  concluida: { t: 'Concluída', c: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  cancelada: { t: 'Cancelada', c: 'text-slate-400 border-white/10' },
};
const CHECKLIST: Record<string, string[]> = {
  instalacao: ['Veículo vistoriado (avarias anotadas)', 'Rastreador fixado e escondido', 'Alimentação ligada (positivo/negativo)', 'Pós-chave ligado (ignição)', 'Relé de bloqueio instalado e testado', 'Posição chegou no sistema', 'Cliente orientado e app instalado'],
  manutencao: ['Defeito confirmado', 'Conexões revisadas', 'Rastreador comunicando', 'Bloqueio testado'],
  retirada: ['Rastreador retirado', 'Chip retirado', 'Fiação recomposta', 'Equipamento devolvido ao estoque'],
  troca: ['Aparelho antigo retirado', 'Aparelho novo instalado', 'IMEI novo atualizado no cadastro', 'Posição chegou no sistema'],
  vistoria: ['Rastreador no lugar', 'Sem sinais de violação', 'Comunicação ok'],
};
const BUCKET = 'contratos-assinados';

// Ordens de serviço do instalador: agenda do técnico, checklist e fotos da instalação/manutenção.
export default function OSPage() {
  const { authLoading, perfil, temRastreio } = useRastreioAccess();
  const empresaId = perfil?.empresa_id as string | undefined;
  const [lista, setLista] = useState<OS[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome: string; endereco: string | null; cidade: string | null }[]>([]);
  const [veics, setVeics] = useState<{ id: string; placa: string; cliente_id: string | null }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('abertas');
  const [form, setForm] = useState<Partial<OS> | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const [{ data: os }, { data: cs }, { data: vs }] = await Promise.all([
      supabase.from('rastreio_os').select('*').order('agendada_para', { ascending: true, nullsFirst: false }).limit(2000),
      supabase.from('rastreio_clientes').select('id, nome, endereco, cidade').neq('status', 'cancelado').order('nome').limit(5000),
      supabase.from('rastreio_veiculos').select('id, placa, cliente_id').order('placa').limit(5000),
    ]);
    setLista((os as OS[]) || []); setClientes(cs || []); setVeics(vs || []); setCarregando(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(carregar); }, [carregar]);

  const nomeCli = useMemo(() => Object.fromEntries(clientes.map(c => [c.id, c.nome])), [clientes]);
  const placa = useMemo(() => Object.fromEntries(veics.map(v => [v.id, v.placa])), [veics]);
  const filtradas = lista.filter(o => filtro === 'todas' || (filtro === 'abertas' ? ['agendada', 'em_andamento'].includes(o.status) : o.status === filtro));
  const hoje = new Date().toLocaleDateString('en-CA');
  const deHoje = lista.filter(o => o.agendada_para && new Date(o.agendada_para).toLocaleDateString('en-CA') === hoje && o.status !== 'cancelada').length;

  const novaOS = () => setForm({ tipo: 'instalacao', status: 'agendada', checklist: CHECKLIST.instalacao.map(item => ({ item, ok: false })), fotos: [], tecnico: perfil?.nome as string || '' });

  const salvar = async () => {
    if (!form || !empresaId) return;
    setErro('');
    const linha = {
      empresa_id: empresaId, tipo: form.tipo, cliente_id: form.cliente_id || null, veiculo_id: form.veiculo_id || null, tecnico: form.tecnico || null,
      agendada_para: form.agendada_para || null, endereco: form.endereco || null, status: form.status, checklist: form.checklist || [], fotos: form.fotos || [],
      observacao: form.observacao || null, valor: form.valor != null && String(form.valor) !== '' ? Number(String(form.valor).replace(',', '.')) : null,
      concluida_em: form.status === 'concluida' ? (form.concluida_em || new Date().toISOString()) : null,
      ...(form.id ? {} : { criado_por: perfil?.nome || null }),
    };
    if (!linha.cliente_id) { setErro('Escolha o cliente.'); return; }
    const { error } = form.id ? await supabase.from('rastreio_os').update(linha).eq('id', form.id) : await supabase.from('rastreio_os').insert(linha);
    if (error) { setErro(error.message); return; }
    setForm(null); carregar();
  };

  const enviarFotos = async (files: File[]) => {
    if (!form?.id || !files.length) { setErro('Salve a OS antes de anexar fotos.'); return; }
    setEnviando(true);
    try {
      const novas: Foto[] = [];
      for (const f of files) {
        const path = `rastreio-os/${form.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${f.name.split('.').pop() || 'jpg'}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'image/jpeg' });
        if (error) throw error;
        novas.push({ nome: f.name, path });
      }
      const fotos = [...(form.fotos || []), ...novas];
      await supabase.from('rastreio_os').update({ fotos }).eq('id', form.id);
      setForm({ ...form, fotos });
    } catch (e) { setErro((e as Error).message); } finally { setEnviando(false); }
  };
  const abrirFoto = async (path: string) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  if (authLoading || carregando) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temRastreio) return <div className="p-8 text-slate-400 text-sm">O módulo Rastreio não está ativo pra sua empresa.</div>;
  const inp = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400 [color-scheme:dark]';

  return (
    <div className="md:p-8 pb-20 text-white">
      <header className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-sky-400 flex items-center gap-2"><Wrench className="w-6 h-6 md:w-8 md:h-8" /> Ordens de serviço</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">{deHoje} para hoje</p>
        </div>
        <button onClick={novaOS} className="inline-flex items-center gap-2 bg-sky-400 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase w-fit"><Plus size={14} /> Nova OS</button>
      </header>
      <div className="flex gap-2 mb-3 flex-wrap">
        {[['abertas', 'Abertas'], ['concluida', 'Concluídas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']].map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1.5 rounded-full border text-[11px] font-black uppercase ${filtro === k ? 'border-sky-400 text-sky-300 bg-sky-500/10' : 'border-white/10 text-slate-400'}`}>{t}</button>
        ))}
      </div>
      <div className="space-y-2">
        {filtradas.length === 0 && <p className="text-sm text-slate-500 p-8 text-center bg-[#0F172A] border border-white/10 rounded-2xl">Nenhuma OS aqui.</p>}
        {filtradas.map(o => {
          const feitos = (o.checklist || []).filter(i => i.ok).length;
          return (
            <button key={o.id} onClick={() => { setForm(o); setErro(''); }} className="w-full text-left bg-[#0F172A] border border-white/10 hover:border-white/20 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-black">#{o.id} · {TIPOS[o.tipo]} · {o.cliente_id ? nomeCli[o.cliente_id] || '—' : '—'}{o.veiculo_id ? ` · ${placa[o.veiculo_id] || ''}` : ''}</p>
                <p className="text-xs text-slate-400">{o.agendada_para ? fmtDataHora(o.agendada_para) : 'sem data'}{o.tecnico ? ` · ${o.tecnico}` : ''}{o.endereco ? ` · ${o.endereco}` : ''}</p>
              </div>
              <span className="text-[11px] text-slate-400">{feitos}/{(o.checklist || []).length} itens{(o.fotos || []).length ? ` · ${(o.fotos || []).length} foto(s)` : ''}</span>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border w-fit ${STATUS[o.status]?.c}`}>{STATUS[o.status]?.t}</span>
            </button>
          );
        })}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setForm(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between"><h2 className="text-lg font-black uppercase">{form.id ? `OS #${form.id}` : 'Nova OS'}</h2><button onClick={() => setForm(null)}><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-2">
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value, checklist: form.id ? form.checklist : (CHECKLIST[e.target.value] || []).map(item => ({ item, ok: false })) })} className={inp}>
                {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inp}>{Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.t}</option>)}</select>
              <select value={form.cliente_id || ''} onChange={e => { const c = clientes.find(x => x.id === e.target.value); setForm({ ...form, cliente_id: e.target.value || null, veiculo_id: null, endereco: form.endereco || [c?.endereco, c?.cidade].filter(Boolean).join(' - ') || null }); }} className={`${inp} col-span-2`}>
                <option value="">Cliente</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <select value={form.veiculo_id || ''} onChange={e => setForm({ ...form, veiculo_id: e.target.value || null })} className={inp}>
                <option value="">Veículo (opcional)</option>{veics.filter(v => !form.cliente_id || v.cliente_id === form.cliente_id).map(v => <option key={v.id} value={v.id}>{v.placa}</option>)}
              </select>
              <input type="datetime-local" value={form.agendada_para ? new Date(new Date(form.agendada_para).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={e => setForm({ ...form, agendada_para: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inp} />
              <input value={form.tecnico || ''} onChange={e => setForm({ ...form, tecnico: e.target.value })} placeholder="Técnico" className={inp} />
              <input value={form.valor != null ? String(form.valor) : ''} onChange={e => setForm({ ...form, valor: e.target.value as unknown as number })} placeholder="Valor (R$)" inputMode="decimal" className={inp} />
              <div className="col-span-2 relative"><MapPin size={14} className="absolute left-3 top-3 text-slate-500" /><input value={form.endereco || ''} onChange={e => setForm({ ...form, endereco: e.target.value })} placeholder="Endereço do atendimento" className={`${inp} pl-9`} /></div>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">Checklist</p>
              {(form.checklist || []).map((it, i) => (
                <button key={i} type="button" onClick={() => setForm({ ...form, checklist: (form.checklist || []).map((x, j) => (j === i ? { ...x, ok: !x.ok } : x)) })} className="w-full flex items-center gap-2 py-1.5 text-sm text-left">
                  {it.ok ? <CheckSquare size={16} className="text-emerald-400 shrink-0" /> : <Square size={16} className="text-slate-500 shrink-0" />}<span className={it.ok ? 'text-slate-300' : ''}>{it.item}</span>
                </button>
              ))}
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">Fotos</p>
              <div className="flex flex-wrap gap-2 mb-2">{(form.fotos || []).map(f => <button key={f.path} onClick={() => abrirFoto(f.path)} className="text-xs text-sky-300 inline-flex items-center gap-1"><FileText size={12} /> {f.nome}</button>)}</div>
              <label className={`inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-xl text-[11px] font-black uppercase cursor-pointer ${!form.id ? 'opacity-50' : ''}`}>
                {enviando ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />} {form.id ? 'Tirar/anexar fotos' : 'Salve para anexar fotos'}
                <input type="file" accept="image/*" capture="environment" multiple disabled={!form.id || enviando} className="hidden" onChange={e => enviarFotos(Array.from(e.target.files || []))} />
              </label>
            </div>
            <textarea value={form.observacao || ''} onChange={e => setForm({ ...form, observacao: e.target.value })} rows={2} placeholder="Observações" className={inp} />
            {form.valor != null && Number(form.valor) > 0 && <p className="text-xs text-slate-400">Valor: {fmtMoeda(Number(String(form.valor).replace(',', '.')))} (cobre em Financeiro → Avulsa)</p>}
            {erro && <p className="text-sm text-red-300">{erro}</p>}
            <button onClick={salvar} className="w-full bg-sky-400 text-[#0B1120] rounded-xl py-3 font-black text-xs uppercase">Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}
