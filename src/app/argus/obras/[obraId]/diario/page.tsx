"use client";
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowLeft, Plus, BookOpen, Camera, X, Users, Cloud } from 'lucide-react';
import ArgusTopNav from '../../../ArgusTopNav';
import { Obra, ObraDiarioEntrada, FotoAnexo, fmtData } from '@/app/obras/shared';

export default function ArgusDiarioObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const user = auth.user;

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
      empresa_id: perfil.empresa_id, obra_id: Number(obraId), data,
      efetivo: efetivo ? Number(efetivo) : null, clima: clima.trim() || null,
      ocorrencias: ocorrencias.trim() || null, fotos, criado_por: user?.id || null,
    }]);

    setData(new Date().toISOString().slice(0, 10)); setEfetivo(''); setClima(''); setOcorrencias(''); setFotosSelecionadas([]);
    setMostrarForm(false);
    setSalvando(false);
    carregar();
  };

  if (loading) return <div><ArgusTopNav nomeEmpresa={empresa?.nome} /><div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div></div>;

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <Link href={`/argus/obras/${obraId}`} className="inline-flex items-center gap-2 text-[#9a958a] hover:text-[#241c14] text-xs font-bold uppercase tracking-widest mb-6">
          <ArrowLeft size={14} /> Voltar pra {obra?.nome || 'obra'}
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#241c14] flex items-center gap-2" style={{ fontFamily: 'var(--font-argus-serif)' }}><BookOpen size={22} className="text-[#d9861c]" /> Diário de Obra</h1>
            <p className="text-[#9a958a] text-xs font-bold uppercase tracking-wide mt-1">RDO — registro diário de efetivo, clima e ocorrências</p>
          </div>
          <button onClick={() => setMostrarForm(v => !v)} className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
            <Plus size={14} /> Novo Lançamento
          </button>
        </div>

        {mostrarForm && (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5 mb-6 space-y-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Data *</label>
                <input type="date" value={data} onChange={e => setData(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Efetivo (pessoas)</label>
                <input type="number" min={0} value={efetivo} onChange={e => setEfetivo(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Clima</label>
                <input value={clima} onChange={e => setClima(e.target.value)} placeholder="Ex: Ensolarado, chuva à tarde..."
                  className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Ocorrências</label>
              <textarea value={ocorrencias} onChange={e => setOcorrencias(e.target.value)} rows={3} placeholder="Ex: chegada de material, atraso de fornecedor, acidente..."
                className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c] resize-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Fotos</label>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => setFotosSelecionadas(prev => [...prev, ...Array.from(e.target.files || [])])} />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 bg-[#faf7f2] border border-[#e5e0d5] hover:border-[#d9861c]/50 text-[#6b6862] px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
                <Camera size={14} /> Anexar Fotos
              </button>
              {fotosSelecionadas.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {fotosSelecionadas.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-[#6b6862]">
                      {f.name}
                      <button onClick={() => setFotosSelecionadas(prev => prev.filter((_, idx) => idx !== i))} className="text-[#9a958a] hover:text-[#d63f3f]"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={salvar} disabled={salvando}
              className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {enviandoFotos ? 'Enviando fotos...' : salvando ? 'Salvando...' : 'Salvar Lançamento'}
            </button>
          </div>
        )}

        {entradas.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <BookOpen size={28} className="text-[#d9d5c8] mx-auto mb-3" />
            <p className="text-[#6b6862] font-semibold text-sm">Nenhum lançamento no diário ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entradas.map(entrada => (
              <div key={entrada.id} className="bg-white border border-[#e5e0d5] rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-sm text-[#241c14]">{fmtData(entrada.data)}</p>
                  <div className="flex items-center gap-3 text-[10px] text-[#9a958a] font-bold uppercase">
                    {entrada.efetivo !== null && <span className="flex items-center gap-1"><Users size={12} /> {entrada.efetivo} pessoas</span>}
                    {entrada.clima && <span className="flex items-center gap-1"><Cloud size={12} /> {entrada.clima}</span>}
                  </div>
                </div>
                {entrada.ocorrencias && <p className="text-xs text-[#6b6862] font-semibold mb-3">{entrada.ocorrencias}</p>}
                {entrada.fotos?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {entrada.fotos.map((f, i) => (
                      <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-lg overflow-hidden border border-[#e5e0d5] hover:border-[#d9861c]/50 transition-all">
                        <img src={f.url} alt={f.nome} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
