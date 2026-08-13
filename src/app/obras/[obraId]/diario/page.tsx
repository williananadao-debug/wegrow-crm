"use client";
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, HardHat, ArrowLeft, Plus, BookOpen, Camera, X, Users, Cloud } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useObrasAccess } from '../../useObrasAccess';
import { Obra, ObraDiarioEntrada, FotoAnexo, fmtData } from '../../shared';

export default function DiarioObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const { authLoading, perfil, user, temObras } = useObrasAccess();

  const [obra, setObra] = useState<Obra | null>(null);
  const [entradas, setEntradas] = useState<ObraDiarioEntrada[]>([]);
  const [loading, setLoading] = useState(true);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [efetivo, setEfetivo] = useState('');
  const [clima, setClima] = useState('');
  const [ocorrencias, setOcorrencias] = useState('');
  const [fotosSelecionadas, setFotosSelecionadas] = useState<File[]>([]);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    if (!perfil?.empresa_id || !obraId) return;
    setLoading(true);
    const [obraRes, entradasRes] = await Promise.all([
      supabase.from('obras').select('*').eq('id', obraId).eq('empresa_id', perfil.empresa_id).single(),
      supabase.from('obra_diario_entradas').select('*').eq('obra_id', obraId).order('data', { ascending: false }),
    ]);
    setObra(obraRes.data as Obra);
    setEntradas((entradasRes.data as ObraDiarioEntrada[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id, obraId]);

  const salvar = async () => {
    if (!perfil?.empresa_id) return;
    setSalvando(true);
    setEnviandoFotos(true);

    // Upload das fotos primeiro — mesmo padrão de nexus_arquivos (bucket público,
    // path prefixado por empresa_id pra RLS de storage.objects funcionar).
    const fotos: FotoAnexo[] = [];
    for (const file of fotosSelecionadas) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${perfil.empresa_id}/${obraId}/diario/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('obras-arquivos').upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('obras-arquivos').getPublicUrl(path);
        fotos.push({ url: urlData.publicUrl, path, nome: file.name });
      }
    }
    setEnviandoFotos(false);

    await supabase.from('obra_diario_entradas').insert([{
      empresa_id: perfil.empresa_id,
      obra_id: Number(obraId),
      data,
      efetivo: efetivo ? Number(efetivo) : null,
      clima: clima.trim() || null,
      ocorrencias: ocorrencias.trim() || null,
      fotos,
      criado_por: user?.id || null,
    }]);

    setData(new Date().toISOString().slice(0, 10)); setEfetivo(''); setClima(''); setOcorrencias(''); setFotosSelecionadas([]);
    setMostrarForm(false);
    setSalvando(false);
    carregar();
  };

  if (authLoading || loading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temObras) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <HardHat size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Obras não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <Link href={`/obras/${obraId}`} className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest mb-6">
        <ArrowLeft size={14} /> Voltar pra {obra?.nome || 'obra'}
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-orange-500 flex items-center gap-3"><BookOpen size={28} /> Diário de Obra</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">RDO — registro diário de efetivo, clima e ocorrências</p>
        </div>
        <button onClick={() => setMostrarForm(v => !v)} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
          <Plus size={14} /> Novo Lançamento
        </button>
      </div>

      {mostrarForm && (
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Data *</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Efetivo (pessoas)</label>
              <input type="number" min={0} value={efetivo} onChange={e => setEfetivo(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Clima</label>
              <input value={clima} onChange={e => setClima(e.target.value)} placeholder="Ex: Ensolarado, chuva à tarde..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Ocorrências</label>
            <textarea value={ocorrencias} onChange={e => setOcorrencias(e.target.value)} rows={3} placeholder="Ex: chegada de material, atraso de fornecedor, acidente..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 resize-none" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Fotos</label>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => setFotosSelecionadas(prev => [...prev, ...Array.from(e.target.files || [])])} />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 bg-white/5 border border-white/10 hover:border-orange-500/40 text-slate-300 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
              <Camera size={14} /> Anexar Fotos
            </button>
            {fotosSelecionadas.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {fotosSelecionadas.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-300">
                    {f.name}
                    <button onClick={() => setFotosSelecionadas(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-red-400"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={salvar} disabled={salvando}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {enviandoFotos ? 'Enviando fotos...' : salvando ? 'Salvando...' : 'Salvar Lançamento'}
          </button>
        </div>
      )}

      {entradas.length === 0 ? (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <BookOpen size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">Nenhum lançamento no diário ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entradas.map(entrada => (
            <div key={entrada.id} className="bg-[#0F172A] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="font-black text-sm text-white">{fmtData(entrada.data)}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase">
                  {entrada.efetivo !== null && <span className="flex items-center gap-1"><Users size={12} /> {entrada.efetivo} pessoas</span>}
                  {entrada.clima && <span className="flex items-center gap-1"><Cloud size={12} /> {entrada.clima}</span>}
                </div>
              </div>
              {entrada.ocorrencias && <p className="text-xs text-slate-300 font-semibold mb-3">{entrada.ocorrencias}</p>}
              {entrada.fotos?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {entrada.fotos.map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-lg overflow-hidden border border-white/10 hover:border-orange-500/50 transition-all">
                      <img src={f.url} alt={f.nome} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
