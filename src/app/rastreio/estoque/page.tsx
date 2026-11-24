"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Loader2, Plus, X, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRastreioAccess, fmtMoeda } from '../shared';

type Equip = {
  id: number; tipo: 'rastreador' | 'chip'; modelo: string | null; imei: string | null; chip_numero: string | null; chip_operadora: string | null;
  iccid: string | null; custo_compra: number; custo_mensal: number; status: string; veiculo_id: string | null; observacao: string | null; created_at: string;
};
const STATUS: Record<string, { t: string; c: string }> = {
  estoque: { t: 'Em estoque', c: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
  instalado: { t: 'Instalado', c: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  defeito: { t: 'Com defeito', c: 'text-red-300 border-red-500/30 bg-red-500/10' },
  devolvido: { t: 'Devolvido', c: 'text-slate-400 border-white/10' },
  perdido: { t: 'Perdido', c: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
};
const VAZIO = { tipo: 'rastreador' as 'rastreador' | 'chip', modelo: 'GT06', imei: '', chip_numero: '', chip_operadora: '', iccid: '', custo_compra: '', custo_mensal: '', status: 'estoque', observacao: '' };

// Estoque de rastreadores e chips: o que está na prateleira, instalado (em qual placa), com defeito.
// Os instalados também aparecem a partir do cadastro dos veículos (IMEI/chip), sem digitar duas vezes.
export default function EstoquePage() {
  const { authLoading, perfil, temRastreio } = useRastreioAccess();
  const empresaId = perfil?.empresa_id as string | undefined;
  const [itens, setItens] = useState<Equip[]>([]);
  const [placas, setPlacas] = useState<Record<string, string>>({});
  const [veicsSemCadastro, setVeicsSemCadastro] = useState<{ id: string; placa: string; imei: string; modelo_rastreador: string | null; chip_numero: string | null; chip_operadora: string | null }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState<typeof VAZIO & { id?: number } | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const [{ data: eq }, { data: vs }] = await Promise.all([
      supabase.from('rastreio_equipamentos').select('*').order('created_at', { ascending: false }).limit(5000),
      supabase.from('rastreio_veiculos').select('id, placa, imei, modelo_rastreador, chip_numero, chip_operadora').eq('status', 'ativo').limit(5000),
    ]);
    const lista = (eq as Equip[]) || [];
    setItens(lista);
    setPlacas(Object.fromEntries((vs || []).map(v => [v.id, v.placa])));
    const imeis = new Set(lista.map(e => e.imei).filter(Boolean));
    setVeicsSemCadastro((vs || []).filter(v => v.imei && !imeis.has(v.imei)));
    setCarregando(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(carregar); }, [carregar]);

  // Puxa para o estoque os rastreadores que já estão instalados nos veículos
  const importarInstalados = async () => {
    if (!empresaId || !veicsSemCadastro.length) return;
    const linhas = veicsSemCadastro.map(v => ({
      empresa_id: empresaId, tipo: 'rastreador', modelo: v.modelo_rastreador || 'GT06', imei: v.imei, chip_numero: v.chip_numero, chip_operadora: v.chip_operadora,
      status: 'instalado', veiculo_id: v.id,
    }));
    const { error } = await supabase.from('rastreio_equipamentos').insert(linhas);
    if (error) setErro(error.message); else carregar();
  };

  const salvar = async () => {
    if (!form || !empresaId) return;
    setErro('');
    const linha = {
      empresa_id: empresaId, tipo: form.tipo, modelo: form.modelo.trim() || null, imei: form.imei.replace(/\D/g, '') || null,
      chip_numero: form.chip_numero.trim() || null, chip_operadora: form.chip_operadora.trim() || null, iccid: form.iccid.replace(/\D/g, '') || null,
      custo_compra: Number(String(form.custo_compra).replace(',', '.')) || 0, custo_mensal: Number(String(form.custo_mensal).replace(',', '.')) || 0,
      status: form.status, observacao: form.observacao.trim() || null,
    };
    if (form.tipo === 'rastreador' && !linha.imei) { setErro('Informe o IMEI do rastreador.'); return; }
    const { error } = form.id ? await supabase.from('rastreio_equipamentos').update(linha).eq('id', form.id) : await supabase.from('rastreio_equipamentos').insert(linha);
    if (error) { setErro(error.message.includes('duplicate') ? 'Já existe um item com esse IMEI/ICCID.' : error.message); return; }
    setForm(null); carregar();
  };
  const excluir = async (e: Equip) => {
    if (!confirm('Excluir este item do estoque?')) return;
    await supabase.from('rastreio_equipamentos').delete().eq('id', e.id); carregar();
  };

  const filtrados = useMemo(() => itens.filter(e => (!filtro || e.status === filtro) &&
    (!busca || [e.imei, e.iccid, e.chip_numero, e.modelo, e.veiculo_id ? placas[e.veiculo_id] : ''].some(x => String(x || '').toLowerCase().includes(busca.toLowerCase())))), [itens, filtro, busca, placas]);
  const k = useMemo(() => ({
    estoque: itens.filter(e => e.status === 'estoque' && e.tipo === 'rastreador').length,
    chips: itens.filter(e => e.status === 'estoque' && e.tipo === 'chip').length,
    instalados: itens.filter(e => e.status === 'instalado').length,
    defeito: itens.filter(e => e.status === 'defeito').length,
    custoChips: itens.filter(e => e.status === 'instalado' || e.tipo === 'chip').reduce((s, e) => s + Number(e.custo_mensal || 0), 0),
  }), [itens]);

  if (authLoading || carregando) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temRastreio) return <div className="p-8 text-slate-400 text-sm">O módulo Rastreio não está ativo pra sua empresa.</div>;
  const inp = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400';

  return (
    <div className="md:p-8 pb-20 text-white">
      <header className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-sky-400 flex items-center gap-2"><Boxes className="w-6 h-6 md:w-8 md:h-8" /> Estoque</h1>
        <div className="flex gap-2">
          {veicsSemCadastro.length > 0 && <button onClick={importarInstalados} className="bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl font-black text-xs uppercase">Puxar {veicsSemCadastro.length} instalado(s) dos veículos</button>}
          <button onClick={() => { setForm({ ...VAZIO }); setErro(''); }} className="inline-flex items-center gap-2 bg-sky-400 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase"><Plus size={14} /> Adicionar</button>
        </div>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[['Rastreadores em estoque', k.estoque, 'text-sky-300'], ['Chips em estoque', k.chips, 'text-sky-300'], ['Instalados', k.instalados, 'text-emerald-300'], ['Com defeito', k.defeito, k.defeito ? 'text-red-400' : 'text-white'], ['Custo mensal de chips', fmtMoeda(k.custoChips), 'text-white']].map(([l, v, c]) => (
          <div key={String(l)} className="bg-[#0F172A] border border-white/10 rounded-2xl p-4"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{l}</p><p className={`text-2xl font-black ${c}`}>{v}</p></div>
        ))}
      </div>
      <div className="flex flex-col md:flex-row gap-2 mb-3">
        <div className="relative flex-1"><Search size={14} className="absolute left-3 top-3 text-slate-500" /><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar IMEI, ICCID, chip, placa..." className={`${inp} pl-9`} /></div>
        <select value={filtro} onChange={e => setFiltro(e.target.value)} className={`${inp} md:w-48 [color-scheme:dark]`}><option value="">Todas as situações</option>{Object.entries(STATUS).map(([s, x]) => <option key={s} value={s}>{x.t}</option>)}</select>
      </div>
      <div className="bg-[#0F172A] border border-white/10 rounded-2xl overflow-x-auto">
        {filtrados.length === 0 ? <p className="text-sm text-slate-500 p-8 text-center">Nada no estoque ainda.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase text-slate-500 text-left"><th className="p-3">Item</th><th>IMEI / ICCID</th><th>Chip</th><th>Situação</th><th>Veículo</th><th className="text-right pr-3">Custo/mês</th><th></th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {filtrados.map(e => (
                <tr key={e.id} className="hover:bg-white/[0.03] cursor-pointer" onClick={() => setForm({ id: e.id, tipo: e.tipo, modelo: e.modelo || '', imei: e.imei || '', chip_numero: e.chip_numero || '', chip_operadora: e.chip_operadora || '', iccid: e.iccid || '', custo_compra: String(e.custo_compra || ''), custo_mensal: String(e.custo_mensal || ''), status: e.status, observacao: e.observacao || '' })}>
                  <td className="p-3 font-bold">{e.tipo === 'chip' ? 'Chip' : (e.modelo || 'Rastreador')}</td>
                  <td className="font-mono text-xs text-slate-300">{e.imei || e.iccid || '—'}</td>
                  <td className="text-slate-400 text-xs">{[e.chip_numero, e.chip_operadora].filter(Boolean).join(' · ') || '—'}</td>
                  <td><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${STATUS[e.status]?.c}`}>{STATUS[e.status]?.t || e.status}</span></td>
                  <td className="font-bold">{e.veiculo_id ? placas[e.veiculo_id] || '—' : '—'}</td>
                  <td className="text-right pr-3">{Number(e.custo_mensal) ? fmtMoeda(e.custo_mensal) : '—'}</td>
                  <td className="pr-3"><button onClick={ev => { ev.stopPropagation(); excluir(e); }} className="text-slate-600 hover:text-red-400"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setForm(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between"><h2 className="text-lg font-black uppercase">{form.id ? 'Editar item' : 'Adicionar ao estoque'}</h2><button onClick={() => setForm(null)}><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-2">
              {(['rastreador', 'chip'] as const).map(t => <button key={t} onClick={() => setForm({ ...form, tipo: t })} className={`py-2 rounded-xl border text-xs font-black uppercase ${form.tipo === t ? 'border-sky-400 text-sky-300 bg-sky-500/10' : 'border-white/10 text-slate-400'}`}>{t === 'chip' ? 'Chip avulso' : 'Rastreador'}</button>)}
            </div>
            {form.tipo === 'rastreador' && <div className="grid grid-cols-2 gap-2"><input value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} placeholder="Modelo (ex.: GT06)" className={inp} /><input value={form.imei} onChange={e => setForm({ ...form, imei: e.target.value.replace(/\D/g, '').slice(0, 17) })} placeholder="IMEI" inputMode="numeric" className={inp} /></div>}
            <div className="grid grid-cols-2 gap-2">
              <input value={form.chip_numero} onChange={e => setForm({ ...form, chip_numero: e.target.value })} placeholder="Número do chip" className={inp} />
              <input value={form.chip_operadora} onChange={e => setForm({ ...form, chip_operadora: e.target.value })} placeholder="Operadora" className={inp} />
              <input value={form.iccid} onChange={e => setForm({ ...form, iccid: e.target.value.replace(/\D/g, '').slice(0, 22) })} placeholder="ICCID do chip" inputMode="numeric" className={`${inp} col-span-2`} />
              <input value={form.custo_compra} onChange={e => setForm({ ...form, custo_compra: e.target.value })} placeholder="Custo de compra (R$)" inputMode="decimal" className={inp} />
              <input value={form.custo_mensal} onChange={e => setForm({ ...form, custo_mensal: e.target.value })} placeholder="Custo mensal do chip (R$)" inputMode="decimal" className={inp} />
            </div>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={`${inp} [color-scheme:dark]`}>{Object.entries(STATUS).map(([s, x]) => <option key={s} value={s}>{x.t}</option>)}</select>
            <textarea value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} rows={2} placeholder="Observação (ex.: lote, fornecedor, defeito)" className={inp} />
            {erro && <p className="text-sm text-red-300">{erro}</p>}
            <button onClick={salvar} className="w-full bg-sky-400 text-[#0B1120] rounded-xl py-3 font-black text-xs uppercase">Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}
