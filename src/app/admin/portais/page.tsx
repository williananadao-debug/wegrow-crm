"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Plus, Edit2, Trash2, ExternalLink, Copy, CheckCircle2,
  Globe, Loader2, X, Save, ChevronDown, ChevronUp
} from 'lucide-react';

type TipoCadastro = { nome: string; desc: string; valor: number };
type Portal = {
  id: string;
  slug: string;
  nome_portal: string;
  descricao: string | null;
  cor_primaria: string;
  logo_texto: string;
  tipos_cadastro: TipoCadastro[];
  segmentos: string[];
  ativo: boolean;
  whatsapp: string | null;
  alert_email: string | null;
  texto_boas_vindas: string | null;
};

const EMPTY: Omit<Portal, 'id'> = {
  slug: '', nome_portal: '', descricao: '', cor_primaria: '#22C55E', logo_texto: 'W',
  tipos_cadastro: [{ nome: 'Padrão', desc: '', valor: 0 }],
  segmentos: [], ativo: true, whatsapp: '', alert_email: '', texto_boas_vindas: '',
};

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://www.wegrow.app.br';

export default function PortaisAdmin() {
  const { perfil } = useAuth();
  const [portais, setPortais] = useState<Portal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Portal | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [tiposRaw, setTiposRaw] = useState('');
  const [segRaw, setSegRaw] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);

  if (perfil?.cargo !== 'diretor') return (
    <div className="flex items-center justify-center h-64">
      <p className="text-slate-500 font-bold">Acesso restrito a diretores.</p>
    </div>
  );

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase.from('empresa_portais').select('*').order('created_at', { ascending: false });
    setPortais((data || []) as Portal[]);
    setLoading(false);
  }

  function abrirNovo() {
    setEditando(null);
    setForm(EMPTY);
    setTiposRaw(JSON.stringify([{ nome: 'Padrão', desc: '', valor: 0 }], null, 2));
    setSegRaw('');
    setModal(true);
  }

  function abrirEdicao(p: Portal) {
    setEditando(p);
    setForm({ ...p });
    setTiposRaw(JSON.stringify(p.tipos_cadastro, null, 2));
    setSegRaw((p.segmentos || []).join('\n'));
    setModal(true);
  }

  async function salvar() {
    setSaving(true);
    let tipos: TipoCadastro[] = [];
    let segs: string[] = [];
    try { tipos = JSON.parse(tiposRaw); } catch { alert('JSON de tipos inválido.'); setSaving(false); return; }
    segs = segRaw.split('\n').map(s => s.trim()).filter(Boolean);

    const payload = { ...form, tipos_cadastro: tipos, segmentos: segs };

    if (editando) {
      const { error } = await supabase.from('empresa_portais').update(payload).eq('id', editando.id);
      if (error) { alert('Erro ao salvar: ' + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('empresa_portais').insert([payload]);
      if (error) { alert('Erro ao criar: ' + error.message); setSaving(false); return; }
    }
    setSaving(false);
    setModal(false);
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este portal?')) return;
    await supabase.from('empresa_portais').delete().eq('id', id);
    carregar();
  }

  function copiar(slug: string) {
    navigator.clipboard.writeText(`${BASE_URL}/p/${slug}`);
    setCopiado(slug);
    setTimeout(() => setCopiado(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">Portais Públicos</h1>
          <p className="text-slate-500 text-sm mt-1">Crie portais de cadastro para qualquer tipo de cliente ou segmento.</p>
        </div>
        <button onClick={abrirNovo} className="flex items-center gap-2 bg-[#22C55E] hover:bg-[#16a34a] text-[#0B1120] px-5 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest transition-all">
          <Plus size={16} /> Novo Portal
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={28} className="animate-spin text-slate-600" /></div>
      ) : portais.length === 0 ? (
        <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-12 text-center">
          <Globe size={40} className="text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 text-sm font-bold">Nenhum portal criado ainda.</p>
          <p className="text-slate-600 text-xs mt-1">Crie o primeiro portal e compartilhe o link com seus clientes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {portais.map(p => (
            <div key={p.id} className="bg-[#0F172A] border border-white/5 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[#0B1120] text-sm flex-shrink-0" style={{ background: p.cor_primaria }}>
                  {p.logo_texto}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-black text-white uppercase tracking-wide">{p.nome_portal}</h3>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${p.ativo ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">/p/{p.slug}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => copiar(p.slug)} className="p-2 text-slate-500 hover:text-white transition-colors" title="Copiar link">
                    {copiado === p.slug ? <CheckCircle2 size={16} className="text-[#22C55E]" /> : <Copy size={16} />}
                  </button>
                  <a href={`/p/${p.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-500 hover:text-white transition-colors" title="Abrir portal">
                    <ExternalLink size={16} />
                  </a>
                  <button onClick={() => abrirEdicao(p)} className="p-2 text-slate-500 hover:text-white transition-colors"><Edit2 size={16} /></button>
                  <button onClick={() => excluir(p.id)} className="p-2 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                  <button onClick={() => setExpandido(expandido === p.id ? null : p.id)} className="p-2 text-slate-500 hover:text-white transition-colors">
                    {expandido === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>
              {expandido === p.id && (
                <div className="px-5 pb-5 border-t border-white/5 pt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div><p className="text-slate-500 uppercase tracking-widest text-[9px] mb-0.5">Tipos de cadastro</p><p className="text-white font-bold">{p.tipos_cadastro.map(t => t.nome).join(', ')}</p></div>
                  <div><p className="text-slate-500 uppercase tracking-widest text-[9px] mb-0.5">Segmentos</p><p className="text-white font-bold">{p.segmentos?.length ? p.segmentos.length + ' opções' : '—'}</p></div>
                  <div><p className="text-slate-500 uppercase tracking-widest text-[9px] mb-0.5">Alerta por e-mail</p><p className="text-white font-bold">{p.alert_email || '—'}</p></div>
                  <div><p className="text-slate-500 uppercase tracking-widest text-[9px] mb-0.5">Link público</p><p className="text-[#22C55E] font-mono break-all">/p/{p.slug}</p></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-2xl my-8 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-black text-white uppercase italic">{editando ? 'Editar Portal' : 'Novo Portal'}</h2>
              <button onClick={() => setModal(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Nome do Portal *</label>
                  <input required placeholder="Portal do Associado" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600" value={form.nome_portal} onChange={e => setForm(f => ({ ...f, nome_portal: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Slug (URL) *</label>
                  <input required placeholder="cdl-taio" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600 font-mono" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} />
                  {form.slug && <p className="text-[10px] text-slate-600 mt-1 font-mono">/p/{form.slug}</p>}
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Descrição / tagline</label>
                <input placeholder="Câmara de Dirigentes Lojistas do Alto Vale" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600" value={form.descricao || ''} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Cor primária</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-none" value={form.cor_primaria} onChange={e => setForm(f => ({ ...f, cor_primaria: e.target.value }))} />
                    <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none font-mono" value={form.cor_primaria} onChange={e => setForm(f => ({ ...f, cor_primaria: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Logo (texto curto)</label>
                  <input maxLength={4} placeholder="CDL" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600 font-black uppercase text-center text-lg" value={form.logo_texto} onChange={e => setForm(f => ({ ...f, logo_texto: e.target.value.toUpperCase() }))} />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Preview</label>
                  <div className="w-full h-10 rounded-xl flex items-center justify-center font-black text-[#0B1120] text-lg" style={{ background: form.cor_primaria }}>{form.logo_texto || 'W'}</div>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">
                  Tipos de Cadastro (JSON) — [{'{'}nome, desc, valor{'}'}]
                </label>
                <textarea
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono outline-none focus:border-[#22C55E] transition-colors min-h-[120px] resize-none"
                  value={tiposRaw} onChange={e => setTiposRaw(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Segmentos (um por linha — deixe vazio para não mostrar)</label>
                <textarea
                  placeholder={'Varejo / Comércio Geral\nAlimentação e Bebidas\nModa e Vestuário'}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#22C55E] transition-colors min-h-[80px] resize-none placeholder:text-slate-600"
                  value={segRaw} onChange={e => setSegRaw(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">E-mail de alerta (novos leads)</label>
                  <input type="email" placeholder="gestor@empresa.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600" value={form.alert_email || ''} onChange={e => setForm(f => ({ ...f, alert_email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">WhatsApp de contato</label>
                  <input type="tel" placeholder="(47) 99999-9999" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600" value={form.whatsapp || ''} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Mensagem de boas-vindas (tela de sucesso)</label>
                <input placeholder="Nossa equipe entrará em contato em breve para dar continuidade ao seu cadastro." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600" value={form.texto_boas_vindas || ''} onChange={e => setForm(f => ({ ...f, texto_boas_vindas: e.target.value }))} />
              </div>

              <div className="flex items-center gap-3">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Portal ativo</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
                  className={`w-10 h-5 rounded-full transition-all ${form.ativo ? 'bg-[#22C55E]' : 'bg-slate-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-all mx-0.5 ${form.ativo ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-white/5">
              <button onClick={() => setModal(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold uppercase text-xs tracking-widest transition-colors">
                Cancelar
              </button>
              <button onClick={salvar} disabled={saving || !form.slug || !form.nome_portal} className="flex-1 bg-[#22C55E] hover:bg-[#16a34a] disabled:opacity-50 text-[#0B1120] py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Salvando...' : 'Salvar Portal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
