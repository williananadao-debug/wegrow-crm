"use client";
import { useState, useEffect, useRef } from 'react';
import {
  Users, Search, Plus, Trash2,
  Phone, FileText, X, History, CheckCircle2, XCircle,
  Loader2, ChevronDown, Building2, User, Upload, Hash, MapPin, Mail, Zap, ShieldAlert, AlertTriangle,
  FolderSearch, Image as ImageIcon, Box, Wrench, Download
} from 'lucide-react';
import { SkeletonRow } from '@/components/Skeleton';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type Cliente = {
  id: number; nome_empresa: string; telefone: string; email?: string; cnpj?: string;
  inscricao_estadual?: string; cep?: string; endereco?: string; numero?: string;
  estado?: string; cidade?: string; bairro?: string; status: 'ativo' | 'inativo';
  status_risco?: string; limite_credito?: number; score_interno?: number; observacao_risco?: string;
  segmento?: string; user_id?: string; empresa_id?: string; created_at: string;
};

const SEGMENTOS_GRUPOS: { grupo: string; itens: string[] }[] = [
  {
    grupo: 'Indústria',
    itens: [
      'Indústria Têxtil / Confecção', 'Indústria Metalúrgica / Metal-Mecânica',
      'Indústria Madeireira / Moveleira', 'Indústria Alimentícia',
      'Indústria Química / Plásticos', 'Indústria de Papel e Celulose',
      'Construção Civil / Materiais de Construção',
    ],
  },
  {
    grupo: 'Comércio / Varejo',
    itens: [
      'Supermercado / Mercado', 'Farmácia / Drogaria', 'Loja de Roupas / Vestuário',
      'Loja de Móveis e Decoração', 'Papelaria / Livraria', 'Petshop',
      'Concessionária / Loja de Veículos', 'Autopeças',
    ],
  },
  {
    grupo: 'Alimentação',
    itens: ['Restaurante / Lanchonete', 'Bar / Casa Noturna', 'Padaria / Confeitaria'],
  },
  {
    grupo: 'Saúde',
    itens: ['Clínica Médica / Odontológica', 'Hospital / Laboratório', 'Academia / Estética / Bem-estar'],
  },
  {
    grupo: 'Serviços Profissionais',
    itens: [
      'Contabilidade', 'Advocacia / Jurídico', 'Consultoria',
      'Tecnologia / Software', 'Marketing / Publicidade', 'Educação / Escola / Curso',
    ],
  },
  {
    grupo: 'Automotivo',
    itens: ['Oficina Mecânica / Auto Center'],
  },
  {
    grupo: 'Agro',
    itens: ['Agropecuária / Agronegócio', 'Cooperativa Agrícola'],
  },
  {
    grupo: 'Mídia',
    itens: ['Rádio / TV / Mídia'],
  },
  {
    grupo: 'Transporte',
    itens: ['Transportadora / Logística'],
  },
  {
    grupo: 'Institucional',
    itens: ['Órgão Público / Associação / Sindicato'],
  },
];

const SEGMENTOS = SEGMENTOS_GRUPOS.flatMap(g => g.itens).concat('Outro');

type Unit = { id: string; nome: string; cidade: string; estado?: string; };
type Vendedor = { id: string; nome: string; };
type VendaHistorico = { id: number; created_at: string; valor_total: number; status: string; etapa: number; itens: any[]; notas: any[]; unidade?: string; user_id?: string; };

type NexusCategoria = 'foto' | 'documento' | 'layout3d' | 'manutencao';
type NexusArquivo = {
  id: number; client_id: number; categoria: NexusCategoria; titulo: string; tags: string[];
  arquivo_url: string; arquivo_path: string; responsavel_nome?: string | null; user_id?: string | null; created_at: string;
};

const NEXUS_CATS: { key: 'todos' | NexusCategoria; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'foto', label: 'Fotos' },
  { key: 'documento', label: 'Documentos' },
  { key: 'layout3d', label: 'Layouts 3D' },
  { key: 'manutencao', label: 'Manutenções' },
];
const NEXUS_CAT_LABEL: Record<NexusCategoria, string> = { foto: 'Foto', documento: 'Documento', layout3d: 'Layout 3D', manutencao: 'Manutenção' };
const NEXUS_CAT_BG: Record<NexusCategoria, string> = {
  foto: 'bg-sky-500/10 text-sky-400',
  documento: 'bg-amber-500/10 text-amber-400',
  layout3d: 'bg-indigo-500/10 text-indigo-400',
  manutencao: 'bg-orange-500/10 text-orange-400',
};

function NexusIcon({ categoria, size = 20 }: { categoria: NexusCategoria; size?: number }) {
  if (categoria === 'foto') return <ImageIcon size={size} />;
  if (categoria === 'documento') return <FileText size={size} />;
  if (categoria === 'layout3d') return <Box size={size} />;
  return <Wrench size={size} />;
}

const ITEMS_PER_PAGE = 20;
const formatId = (id: number, prefix: string) => `${prefix}-${String(id).padStart(4, '0')}`;

// SEMÁFORO DE RISCO
function SemaforoRisco({ status }: { status?: string }) {
    if (status === 'aprovado') return <span className="bg-green-500/20 text-green-400 border border-green-500/50 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-[0_0_15px_rgba(34,197,94,0.2)]">🟢 Crédito Aprovado</span>;
    if (status === 'risco_moderado') return <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">🟡 Risco Moderado</span>;
    if (status === 'reprovado') return <span className="bg-red-500/20 text-red-400 border border-red-500/50 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">🔴 Risco Alto (Apenas à vista)</span>;
    return <span className="bg-slate-500/20 text-slate-400 border border-slate-500/50 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">⚪ Em Análise</span>;
}

export default function CustomersPage() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [contratosVencendo, setContratosVencendo] = useState<{ id: number; empresa: string; contrato_fim: string; client_id: number | null }[]>([]);
  const [alertaExpandido, setAlertaExpandido] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [busca, setBusca] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('ativo');
  const [riscoFilter, setRiscoFilter] = useState<'todos' | 'aprovado' | 'risco_moderado' | 'reprovado' | 'em_analise'>('todos');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'dados' | 'unidades' | 'historico' | 'nexus'>('dados');
  
  const [historicoVendas, setHistoricoVendas] = useState<VendaHistorico[]>([]);
  const [unidades, setUnidades] = useState<Unit[]>([]);
  const [newUnit, setNewUnit] = useState({ nome: '', cidade: '', estado: '' });

  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [tipoPessoa, setTipoPessoa] = useState<'juridica' | 'fisica'>('juridica');
  const [formData, setFormData] = useState({
    nome_empresa: '', telefone: '', email: '', cnpj: '',
    inscricao_estadual: '', cep: '', endereco: '', numero: '',
    cidade: '', bairro: '', estado: '', status: 'ativo', user_id: '',
    status_risco: 'em_analise', limite_credito: 0, score_interno: 0, observacao_risco: '',
    segmento: ''
  });
  const [segmentoCustom, setSegmentoCustom] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [duplicadosModal, setDuplicadosModal] = useState(false);
  const [duplicados, setDuplicados] = useState<Cliente[][]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const cnpjIndexRef = useRef<Map<string, { id: number; nome_empresa: string; status: string }>>(new Map());
  const [cnpjDuplicado, setCnpjDuplicado] = useState<{ id: number; nome_empresa: string; status: string } | null>(null);
  const [verificandoCnpjExistente, setVerificandoCnpjExistente] = useState(false);

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const isDirector = perfil?.cargo === 'diretor';
  const isCDL = Boolean(empresa?.modulos?.cdl);

  useEffect(() => {
    async function fetchSellers() {
      if (!perfil?.empresa_id) return;
      const { data } = await supabase.from('profiles').select('id, nome').eq('empresa_id', perfil.empresa_id);
      if (data) setVendedores(data as any);
    }
    async function fetchContratosVencendo() {
      if (!perfil?.empresa_id) return;
      const hoje = new Date();
      const em60dias = new Date(hoje); em60dias.setDate(hoje.getDate() + 60);
      const { data } = await supabase.from('leads')
        .select('id, empresa, contrato_fim, client_id')
        .eq('empresa_id', perfil.empresa_id)
        .eq('status', 'ganho')
        .gte('contrato_fim', hoje.toISOString().split('T')[0])
        .lte('contrato_fim', em60dias.toISOString().split('T')[0])
        .order('contrato_fim', { ascending: true })
        .limit(20);
      if (data) setContratosVencendo(data as any);
    }
    async function fetchCnpjIndex() {
      if (!perfil?.empresa_id) return;
      setVerificandoCnpjExistente(true);
      let all: { id: number; nome_empresa: string; cnpj: string | null; status: string }[] = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data } = await supabase.from('clientes')
          .select('id, nome_empresa, cnpj, status')
          .eq('empresa_id', perfil.empresa_id)
          .range(from, from + step - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data as any);
        if (data.length < step) break;
        from += step;
      }
      const map = new Map<string, { id: number; nome_empresa: string; status: string }>();
      all.forEach(c => {
        const digits = (c.cnpj || '').replace(/\D/g, '');
        if ((digits.length === 14 || digits.length === 11) && !map.has(digits)) map.set(digits, { id: c.id, nome_empresa: c.nome_empresa, status: c.status });
      });
      cnpjIndexRef.current = map;
      setVerificandoCnpjExistente(false);
    }
    if (perfil) { fetchSellers(); fetchContratosVencendo(); fetchCnpjIndex(); }
  }, [perfil]);

  useEffect(() => { if (user && perfil) resetAndFetch(); }, [user, perfil, statusFilter, riscoFilter]);

  useEffect(() => {
    if (!user) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => resetAndFetch(), 500);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [busca]);

  const resetAndFetch = () => { setPage(0); setHasMore(true); setClientes([]); fetchClientes(0, true); };

  const fetchClientes = async (pageIndex: number, isNewSearch = false) => {
    if (pageIndex === 0) setLoading(true); else setLoadingMore(true);
    try {
        const from = pageIndex * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;
        let query = supabase.from('clientes').select('*', { count: 'exact' }).order('nome_empresa', { ascending: true }).range(from, to);
        if (perfil?.empresa_id) query = query.eq('empresa_id', perfil.empresa_id);
        if (statusFilter !== 'todos') query = query.eq('status', statusFilter);
        if (riscoFilter !== 'todos') query = query.eq('status_risco', riscoFilter);
        if (busca.trim()) query = query.or(`nome_empresa.ilike.%${busca}%,cnpj.ilike.%${busca}%,cidade.ilike.%${busca}%,bairro.ilike.%${busca}%,email.ilike.%${busca}%`);

        const { data, count, error } = await query;
        if (error) throw error;
        if (data) {
            setClientes(prev => isNewSearch ? (data as any) : [...prev, ...(data as any)]);
            setTotalCount(count || 0);
            if (data.length < ITEMS_PER_PAGE) setHasMore(false);
        }
    } catch (error) { console.error(error); } finally { setLoading(false); setLoadingMore(false); }
  };

  const loadMore = () => { const nextPage = page + 1; setPage(nextPage); fetchClientes(nextPage, false); };

  const fetchHistorico = async (clientId: number) => {
    const { data } = await supabase.from('leads').select('id, created_at, valor_total, status, etapa, itens, notas, unidade, user_id').eq('client_id', clientId).order('created_at', { ascending: false });
    if (data) setHistoricoVendas(data as any);
  };

  const fetchUnidades = async (clientId: number) => {
    const { data } = await supabase.from('units').select('*').eq('customer_id', clientId);
    if (data) setUnidades(data);
  };

  // --- Nexus: memória pesquisável de arquivos por cliente ---
  const [nexusItens, setNexusItens] = useState<NexusArquivo[]>([]);
  const [nexusQuery, setNexusQuery] = useState('');
  const [nexusCat, setNexusCat] = useState<'todos' | NexusCategoria>('todos');
  const [nexusFormOpen, setNexusFormOpen] = useState(false);
  const [nexusCategoria, setNexusCategoria] = useState<NexusCategoria>('foto');
  const [nexusTitulo, setNexusTitulo] = useState('');
  const [nexusTagsInput, setNexusTagsInput] = useState('');
  const [nexusFile, setNexusFile] = useState<File | null>(null);
  const [nexusUploading, setNexusUploading] = useState(false);
  const [nexusError, setNexusError] = useState('');
  const [nexusDetalhe, setNexusDetalhe] = useState<NexusArquivo | null>(null);

  const fetchNexus = async (clientId: number) => {
    const { data } = await supabase.from('nexus_arquivos').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    if (data) setNexusItens(data as any);
  };

  const resetNexusForm = () => {
    setNexusFormOpen(false); setNexusCategoria('foto'); setNexusTitulo(''); setNexusTagsInput('');
    setNexusFile(null); setNexusError(''); setNexusQuery(''); setNexusCat('todos');
  };

  const nexusItensFiltrados = nexusItens.filter(item => {
    if (nexusCat !== 'todos' && item.categoria !== nexusCat) return false;
    if (!nexusQuery.trim()) return true;
    const q = nexusQuery.trim().toLowerCase();
    const hay = (item.titulo + ' ' + item.tags.join(' ')).toLowerCase();
    return hay.includes(q);
  });

  const handleUploadNexus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nexusFile || !nexusTitulo.trim() || !editingId || !perfil?.empresa_id) return;
    setNexusUploading(true);
    setNexusError('');
    try {
      const ext = nexusFile.name.split('.').pop() || 'bin';
      const path = `${perfil.empresa_id}/${editingId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('nexus').upload(path, nexusFile, { upsert: false, contentType: nexusFile.type || undefined });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('nexus').getPublicUrl(path);
      const tags = nexusTagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const payload = {
        empresa_id: perfil.empresa_id,
        client_id: editingId,
        categoria: nexusCategoria,
        titulo: nexusTitulo.trim(),
        tags,
        arquivo_url: urlData.publicUrl,
        arquivo_path: path,
        responsavel_nome: perfil?.nome || null,
        user_id: user?.id,
      };
      const { data, error } = await supabase.from('nexus_arquivos').insert([payload]).select();
      if (error) throw error;
      if (data) setNexusItens(prev => [data[0] as NexusArquivo, ...prev]);
      setNexusTitulo(''); setNexusTagsInput(''); setNexusFile(null); setNexusFormOpen(false);
    } catch (err: any) {
      setNexusError(err?.message || 'Erro ao enviar arquivo.');
    } finally {
      setNexusUploading(false);
    }
  };

  const handleDeleteNexus = async (item: NexusArquivo) => {
    if (!confirm(`Excluir "${item.titulo}"? Essa ação não pode ser desfeita.`)) return;
    await supabase.storage.from('nexus').remove([item.arquivo_path]);
    const { error } = await supabase.from('nexus_arquivos').delete().eq('id', item.id);
    if (!error) {
      setNexusItens(prev => prev.filter(i => i.id !== item.id));
      setNexusDetalhe(null);
    }
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (tipoPessoa === 'fisica') {
      let v = e.target.value.replace(/\D/g, '').substring(0, 11);
      let masked = v;
      if (v.length > 9) masked = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
      else if (v.length > 6) masked = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
      else if (v.length > 3) masked = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
      setFormData({ ...formData, cnpj: masked });

      if (v.length === 11) {
        const match = cnpjIndexRef.current.get(v);
        setCnpjDuplicado(match && match.id !== editingId ? match : null);
      } else {
        setCnpjDuplicado(null);
      }
      return;
    }

    let v = e.target.value.replace(/\D/g, '').substring(0, 14);
    let masked = v;
    if (v.length > 12) masked = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) masked = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
    else if (v.length > 5) masked = v.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 2) masked = v.replace(/(\d{2})(\d{1,3})/, '$1.$2');
    setFormData({ ...formData, cnpj: masked });

    if (v.length === 14) {
      const match = cnpjIndexRef.current.get(v);
      setCnpjDuplicado(match && match.id !== editingId ? match : null);
    } else {
      setCnpjDuplicado(null);
    }
  };

  const trocarTipoPessoa = (tipo: 'juridica' | 'fisica') => {
    setTipoPessoa(tipo);
    setFormData(prev => ({ ...prev, cnpj: '' }));
    setCnpjDuplicado(null);
  };

  const abrirClienteExistente = async (id: number, reativar: boolean) => {
    const { data } = await supabase.from('clientes').select('*').eq('id', id).single();
    if (!data) return;
    handleOpenModal(data as any);
    if (reativar) setFormData(prev => ({ ...prev, status: 'ativo' }));
    setCnpjDuplicado(null);
  };

  const validarCNPJ = (cnpj: string) => {
    const s = cnpj.replace(/\D/g, '');
    if (s.length !== 14 || /^(\d)\1+$/.test(s)) return false;
    const calc = (x: string, len: number) => {
      let sum = 0, pos = len - 7;
      for (let i = len; i >= 1; i--) { sum += parseInt(x[len - i]) * pos--; if (pos < 2) pos = 9; }
      const r = sum % 11 < 2 ? 0 : 11 - (sum % 11);
      return r === parseInt(x[len]);
    };
    return calc(s, 12) && calc(s, 13);
  };

  const validarCPF = (cpf: string) => {
    const s = cpf.replace(/\D/g, '');
    if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
    const calc = (len: number) => {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += parseInt(s[i]) * (len + 1 - i);
      const r = (sum * 10) % 11;
      return (r === 10 ? 0 : r) === parseInt(s[len]);
    };
    return calc(9) && calc(10);
  };

  // MOTOR DE ANÁLISE DE RISCO
  const avaliarRisco = (capitalStr: any, dataInicioStr: any) => {
      try {
          const capital = parseFloat(capitalStr) || 0;
          const anoAbertura = parseInt(String(dataInicioStr).substring(0, 4)) || new Date().getFullYear();
          const idadeAnos = new Date().getFullYear() - anoAbertura;
          
          let status = 'em_analise';
          let limite = 0;

          if (idadeAnos >= 2 && capital >= 50000) {
              status = 'aprovado';
              limite = capital * 0.10;
          } else if (idadeAnos < 1 || capital < 10000) {
              status = 'reprovado';
              limite = 0;
          } else {
              status = 'risco_moderado';
              limite = capital * 0.05;
          }

          return {
              status_risco: status,
              limite_credito: limite,
              score_interno: idadeAnos * 10,
              observacao_risco: `Capital: R$ ${capital.toLocaleString('pt-BR')} | Idade: ${idadeAnos} anos.`
          };
      } catch (e) {
          return { status_risco: 'em_analise', limite_credito: 0, score_interno: 0, observacao_risco: 'Falha ao analisar dados públicos.' };
      }
  };

  const fetchWithTimeout = async (url: string, ms = 6000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try { return await fetch(url, { signal: controller.signal }); }
    finally { clearTimeout(id); }
  };

  // MOTOR HÍBRIDO (Plano A + Plano B)
  const buscarDadosCNPJ = async () => {
    const cnpj = formData.cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) return alert("⚠️ Digite os 14 números do CNPJ.");

    setIsSearchingCnpj(true);
    try {
        const res1 = await fetchWithTimeout(`https://publica.cnpj.ws/cnpj/${cnpj}`);
        
        if (res1.ok) {
            const data = await res1.json();
            const est = data.estabelecimento;
            const inscricao = est.inscricoes_estaduais && est.inscricoes_estaduais.length > 0 ? est.inscricoes_estaduais[0].inscricao_estadual : "ISENTO";
            const ruaFormatada = `${est.tipo_logradouro || ''} ${est.logradouro || ''}`.trim();

            const analise = avaliarRisco(data.capital_social, est.data_inicio_atividade);

            // 👇 CORREÇÃO AQUI: Usando formData em vez de prev 👇
            const nomeFantasiaLimpo = est.nome_fantasia ? String(est.nome_fantasia).trim() : '';
            const razaoSocialLimpa = data.razao_social ? String(data.razao_social).trim() : '';
            const nomeFinal = nomeFantasiaLimpo || razaoSocialLimpa || formData.nome_empresa;

            setFormData(prev => ({
                ...prev,
                nome_empresa: nomeFinal,
                cep: est.cep || prev.cep || "",
                endereco: ruaFormatada || prev.endereco || "",
                numero: est.numero || prev.numero || "",
                bairro: est.bairro || prev.bairro || "",
                cidade: est.cidade?.nome || prev.cidade || "",
                estado: est.estado?.sigla || prev.estado || "",
                inscricao_estadual: inscricao,
                ...analise 
            }));

            if (!est.logradouro && !est.cep) {
                alert("ℹ️ A Receita ocultou o endereço desta empresa (comum em MEI devido à LGPD). Preencha manualmente.");
            }
            setIsSearchingCnpj(false);
            return;
        }

        const res2 = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        
        if (res2.ok) {
            const data2 = await res2.json();
            const analise = avaliarRisco(data2.capital_social, data2.data_inicio_atividade);

            // 👇 CORREÇÃO AQUI: Usando formData em vez de prev 👇
            const nomeFantasiaLimpo2 = data2.nome_fantasia ? String(data2.nome_fantasia).trim() : '';
            const razaoSocialLimpa2 = data2.razao_social ? String(data2.razao_social).trim() : '';
            const nomeFinal2 = nomeFantasiaLimpo2 || razaoSocialLimpa2 || formData.nome_empresa;

            setFormData(prev => ({
                ...prev,
                nome_empresa: nomeFinal2,
                cep: data2.cep || prev.cep || "",
                endereco: data2.logradouro || prev.endereco || "",
                numero: data2.numero || prev.numero || "",
                bairro: data2.bairro || prev.bairro || "",
                cidade: data2.municipio || prev.cidade || "",
                estado: data2.uf || prev.estado || "",
                ...analise 
            }));

            console.warn("Plano B ativado (BrasilAPI). Inscrição Estadual precisará ser manual.");

            if (!data2.logradouro && !data2.cep) {
                alert("ℹ️ A Receita ocultou o endereço desta empresa (comum em MEI devido à LGPD). Preencha manualmente.");
            }
            setIsSearchingCnpj(false);
            return; 
        }

        throw new Error("CNPJ não encontrado nas bases da Receita Federal. Verifique o número digitado.");

    } catch (err: any) {
        alert("Não foi possível buscar os dados do CNPJ. Tente novamente ou preencha manualmente.");
    } finally {
        setIsSearchingCnpj(false);
    }
  };

  const handleOpenModal = (cliente?: Cliente) => {
    setCnpjDuplicado(null);
    if (cliente) {
      setEditingId(cliente.id);
      setTipoPessoa((cliente.cnpj || '').replace(/\D/g, '').length === 11 ? 'fisica' : 'juridica');
      setFormData({
        nome_empresa: cliente.nome_empresa, telefone: cliente.telefone || '', email: cliente.email || '',
        cnpj: cliente.cnpj || '', inscricao_estadual: cliente.inscricao_estadual || '', cep: cliente.cep || '',
        endereco: cliente.endereco || '', numero: cliente.numero || '', cidade: cliente.cidade || '',
        bairro: cliente.bairro || '', estado: cliente.estado || '', status: cliente.status || 'ativo' as any,
        user_id: cliente.user_id || '',
        status_risco: cliente.status_risco || 'em_analise', limite_credito: cliente.limite_credito || 0,
        score_interno: cliente.score_interno || 0, observacao_risco: cliente.observacao_risco || '',
        segmento: cliente.segmento && !SEGMENTOS.includes(cliente.segmento) ? 'Outro' : (cliente.segmento || '')
      });
      setSegmentoCustom(cliente.segmento && !SEGMENTOS.includes(cliente.segmento) ? cliente.segmento : '');
      setTags((cliente as any).tags || []);
      fetchHistorico(cliente.id); fetchUnidades(cliente.id); fetchNexus(cliente.id); resetNexusForm(); setActiveTab('dados');
    } else {
      setEditingId(null);
      setTipoPessoa('juridica');
      setFormData({
        nome_empresa: '', telefone: '', email: '', cnpj: '', inscricao_estadual: '', cep: '', endereco: '', numero: '',
        cidade: '', bairro: '', estado: '', status: 'ativo', user_id: isDirector ? '' : (user?.id || ''),
        status_risco: 'em_analise', limite_credito: 0, score_interno: 0, observacao_risco: '', segmento: ''
      });
      setSegmentoCustom('');
      setTags([]);
      setHistoricoVendas([]); setUnidades([]); setNexusItens([]); resetNexusForm(); setActiveTab('dados');
    }
    setIsModalOpen(true);
  };

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome_empresa) return alert("Nome é obrigatório");
    if (formData.segmento === 'Outro' && !segmentoCustom.trim()) return alert("Informe qual é o segmento");
    const cnpjDigits = formData.cnpj?.replace(/\D/g, '') || '';
    const docLen = tipoPessoa === 'fisica' ? 11 : 14;
    const docNome = tipoPessoa === 'fisica' ? 'CPF' : 'CNPJ';
    if (cnpjDigits.length > 0 && cnpjDigits.length < docLen) return alert(`${docNome} incompleto. Verifique o número digitado.`);
    if (cnpjDigits.length === docLen) {
      const valido = tipoPessoa === 'fisica' ? validarCPF(formData.cnpj || '') : validarCNPJ(formData.cnpj || '');
      if (!valido) return alert(`${docNome} inválido. Verifique os dígitos verificadores.`);
    }
    if (!editingId && cnpjDigits.length === docLen) {
      const existente = cnpjIndexRef.current.get(cnpjDigits);
      if (existente) return alert(`Esse ${docNome} já está cadastrado para "${existente.nome_empresa}". Abra o cadastro existente em vez de criar um novo.`);
    }

    const payload = {
      ...formData,
      segmento: formData.segmento === 'Outro' ? segmentoCustom.trim() : formData.segmento,
      empresa_id: perfil?.empresa_id, tags
    };
    
    if (!editingId && !payload.user_id) {
        payload.user_id = user?.id;
    } else if (payload.user_id === "") {
        payload.user_id = null as any; 
    }

    try {
      if (editingId) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', editingId);
        if (error) throw error;
        if (cnpjDigits.length === docLen) cnpjIndexRef.current.set(cnpjDigits, { id: editingId, nome_empresa: formData.nome_empresa, status: formData.status });
        resetAndFetch();
      } else {
        const { data, error } = await supabase.from('clientes').insert([payload]).select();
        if (error) throw error;
        if (data) {
            setEditingId(data[0].id);
            if (cnpjDigits.length === docLen) cnpjIndexRef.current.set(cnpjDigits, { id: data[0].id, nome_empresa: formData.nome_empresa, status: formData.status });
            resetAndFetch();
            alert(isCDL ? "Associado salvo com sucesso!" : "Cliente salvo com sucesso!");
        }
      }
      if (editingId) setIsModalOpen(false);
    } catch (error: any) { alert("Erro ao salvar. Verifique os dados e tente novamente."); }
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !newUnit.nome) return;
    const { data, error } = await supabase.from('units').insert([{ customer_id: editingId, nome: newUnit.nome, cidade: newUnit.cidade, estado: newUnit.estado }]).select();
    if (!error && data) { setUnidades(prev => [...prev, data[0]]); setNewUnit({ nome: '', cidade: '', estado: '' }); }
  };

  const handleDeleteUnit = async (unitId: string) => {
      if(!confirm("Remover esta unidade?")) return;
      const { error } = await supabase.from('units').delete().eq('id', unitId);
      if(!error) setUnidades(prev => prev.filter(u => u.id !== unitId));
  };

  const handleDeleteCliente = async (id: number) => {
    if (!isDirector) return;
    if (!confirm(isCDL ? "Excluir associado e todo seu histórico?" : "Excluir cliente e todo seu histórico?")) return;
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (!error) {
      for (const [cnpj, c] of cnpjIndexRef.current) { if (c.id === id) { cnpjIndexRef.current.delete(cnpj); break; } }
      resetAndFetch();
      setIsModalOpen(false);
    }
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      }).filter(r => r.nome_empresa || r.nome || r['nome empresa']);
      setCsvPreview(rows.slice(0, 200));
      setCsvModalOpen(true);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleCsvImport = async () => {
    if (!perfil?.empresa_id || csvPreview.length === 0) return;
    setCsvImporting(true);
    const payload = csvPreview.map(r => ({
      nome_empresa: r.nome_empresa || r.nome || r['nome empresa'] || '',
      telefone: r.telefone || r.fone || '',
      email: r.email || '',
      cnpj: r.cnpj || '',
      cidade: r.cidade || '',
      estado: r.estado || '',
      status: 'ativo',
      status_risco: 'em_analise',
      empresa_id: perfil.empresa_id,
    })).filter(r => r.nome_empresa);
    const chunkSize = 50;
    for (let i = 0; i < payload.length; i += chunkSize) {
      await supabase.from('clientes').insert(payload.slice(i, i + chunkSize));
    }
    setCsvImporting(false);
    setCsvModalOpen(false);
    resetAndFetch();
  };

  const buscarDuplicados = async () => {
    if (!perfil?.empresa_id) return;
    const { data } = await supabase
      .from('clientes')
      .select('id, nome_empresa, cnpj, cidade, created_at')
      .eq('empresa_id', perfil.empresa_id)
      .not('cnpj', 'is', null)
      .neq('cnpj', '');
    if (!data) return;
    const grupos: Record<string, any[]> = {};
    data.forEach(c => {
      const cnpjLimpo = c.cnpj.replace(/\D/g, '');
      if (cnpjLimpo.length < 11) return;
      if (!grupos[cnpjLimpo]) grupos[cnpjLimpo] = [];
      grupos[cnpjLimpo].push(c);
    });
    const duplicadosEncontrados = Object.values(grupos).filter(g => g.length > 1);
    setDuplicados(duplicadosEncontrados);
    setDuplicadosModal(true);
  };

  const mesclarClientes = async (manter: number, remover: number) => {
    if (!confirm('Mesclar clientes? O histórico do duplicado será movido para o principal.')) return;
    await supabase.from('leads').update({ client_id: manter }).eq('client_id', remover);
    await supabase.from('clientes').delete().eq('id', remover);
    setDuplicados(prev => prev.map(grupo => grupo.filter((c: any) => c.id !== remover)).filter(g => g.length > 1));
    resetAndFetch();
  };

  return (
    <div className="h-full flex flex-col pb-4 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6 px-2">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">{isCDL ? 'Quadro de Associados' : 'Carteira de Clientes'}</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{totalCount} {isCDL ? 'Associados encontrados' : 'Empresas encontradas'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
            <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
            <button onClick={() => csvInputRef.current?.click()} className="bg-white/5 border border-white/10 text-slate-300 px-4 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                <Upload size={16} /> Importar CSV
            </button>
            {isDirector && (
              <button onClick={buscarDuplicados} className="bg-orange-500/10 border border-orange-500/30 text-orange-400 px-4 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-orange-500/20 transition-all flex items-center gap-2">
                  <Hash size={16} /> Duplicados
              </button>
            )}
            <button onClick={() => handleOpenModal()} className="bg-[#22C55E] text-[#0F172A] px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 shadow-[0_10px_30px_rgba(34,197,94,0.2)]">
                <Plus size={18} strokeWidth={3} /> {isCDL ? 'Novo Associado' : 'Novo Cliente'}
            </button>
        </div>
      </div>

      {/* ALERTA DE RENOVAÇÃO */}
      {contratosVencendo.length > 0 && (() => {
        const criticos = contratosVencendo.filter(c => Math.ceil((new Date(c.contrato_fim + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000) <= 15);
        const atencao  = contratosVencendo.filter(c => { const d = Math.ceil((new Date(c.contrato_fim + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000); return d > 15 && d <= 30; });
        const proximos = contratosVencendo.filter(c => Math.ceil((new Date(c.contrato_fim + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000) > 30);
        return (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl mb-4 overflow-hidden">
            <button onClick={() => setAlertaExpandido(v => !v)} className="w-full flex items-center gap-3 p-3 hover:bg-amber-500/5 transition-colors text-left">
              <AlertTriangle className="text-amber-400 flex-shrink-0" size={15} />
              <span className="text-amber-400 font-black text-[11px] uppercase tracking-widest flex-1">
                {contratosVencendo.length} contrato{contratosVencendo.length > 1 ? 's' : ''} vencendo em 90 dias
              </span>
              <div className="flex items-center gap-3 mr-2">
                {criticos.length > 0 && <span className="text-[10px] font-black text-red-400 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-lg">🔴 {criticos.length} crítico{criticos.length > 1 ? 's' : ''}</span>}
                {atencao.length  > 0 && <span className="text-[10px] font-black text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-lg">🟡 {atencao.length} atenção</span>}
                {proximos.length > 0 && <span className="text-[10px] font-black text-slate-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg">⚪ {proximos.length} próximo{proximos.length > 1 ? 's' : ''}</span>}
              </div>
              <ChevronDown size={14} className={`text-amber-400 transition-transform flex-shrink-0 ${alertaExpandido ? 'rotate-180' : ''}`} />
            </button>
            {alertaExpandido && (
              <div className="border-t border-amber-500/20 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-amber-500/20">
                {[
                  { label: '🔴 Crítico (≤ 15 dias)', items: criticos, text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
                  { label: '🟡 Atenção (16–30 dias)', items: atencao,  text: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/30' },
                  { label: '⚪ Próximos (31–90 dias)', items: proximos, text: 'text-slate-400', bg: 'bg-white/5 border-white/10' },
                ].map(grupo => (
                  <div key={grupo.label} className="p-3">
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${grupo.text}`}>{grupo.label}</p>
                    {grupo.items.length === 0
                      ? <p className="text-[10px] text-slate-600 italic">Nenhum</p>
                      : <div className="flex flex-wrap gap-1.5">
                          {grupo.items.map(c => {
                            const dias = Math.ceil((new Date(c.contrato_fim + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000);
                            return <span key={c.id} className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${grupo.bg} ${grupo.text}`}>{c.empresa} — {dias}d</span>;
                          })}
                        </div>
                    }
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* BARRA DE FILTROS */}
      <div className="bg-[#0B1120] border border-white/10 p-4 rounded-[24px] mb-6 flex flex-col md:flex-row gap-4 items-center shadow-xl">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input 
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white text-sm focus:border-[#22C55E] outline-none placeholder:text-slate-600 transition-all"
            placeholder="Buscar por nome, CNPJ, Cidade..."
            value={busca} onChange={e => setBusca(e.target.value)}
          />
        </div>
        <div className="flex gap-2 bg-white/5 p-1 rounded-xl">
            <button onClick={() => setStatusFilter('ativo')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${statusFilter === 'ativo' ? 'bg-[#22C55E] text-[#0F172A]' : 'text-slate-500 hover:text-white'}`}>Ativos</button>
            <button onClick={() => setStatusFilter('inativo')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${statusFilter === 'inativo' ? 'bg-red-500 text-white' : 'text-slate-500 hover:text-white'}`}>Inativos</button>
            <button onClick={() => setStatusFilter('todos')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${statusFilter === 'todos' ? 'bg-white text-black' : 'text-slate-500 hover:text-white'}`}>Todos</button>
        </div>
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
            <button onClick={() => setRiscoFilter('todos')} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${riscoFilter === 'todos' ? 'bg-white/20 text-white' : 'text-slate-500 hover:text-white'}`}>Risco</button>
            <button onClick={() => setRiscoFilter('aprovado')} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${riscoFilter === 'aprovado' ? 'bg-green-500 text-white' : 'text-slate-500 hover:text-green-400'}`}>🟢</button>
            <button onClick={() => setRiscoFilter('risco_moderado')} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${riscoFilter === 'risco_moderado' ? 'bg-yellow-500 text-white' : 'text-slate-500 hover:text-yellow-400'}`}>🟡</button>
            <button onClick={() => setRiscoFilter('reprovado')} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${riscoFilter === 'reprovado' ? 'bg-red-500 text-white' : 'text-slate-500 hover:text-red-400'}`}>🔴</button>
        </div>
      </div>

      {/* LISTA DE CLIENTES */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 pb-10">
        {loading && clientes.length === 0 ? (
            <div className="space-y-1 pt-2">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
        ) : (
            <>
                {clientes.map(cliente => (
                <div key={cliente.id} onClick={() => handleOpenModal(cliente)} className="cursor-pointer bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between hover:border-white/10 hover:bg-white/[0.04] transition-all group relative overflow-hidden">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${cliente.status === 'ativo' ? 'bg-[#22C55E]' : 'bg-red-500'}`}></div>
                    <div className="flex items-center gap-5 pl-3">
                        <div className="w-12 h-12 bg-blue-600/10 text-blue-400 rounded-2xl flex items-center justify-center font-black text-xl uppercase shadow-inner flex-shrink-0">
                            {cliente.nome_empresa.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-white font-black text-sm uppercase tracking-wide flex items-center gap-2">
                                {cliente.nome_empresa}
                                <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded tracking-widest flex items-center gap-0.5">
                                    <Hash size={10}/> {formatId(cliente.id, 'CL')}
                                </span>
                                {cliente.status_risco && cliente.status_risco !== 'em_analise' && (
                                     <span title="Status de Crédito" className="text-[10px]">
                                        {cliente.status_risco === 'aprovado' ? '🟢' : cliente.status_risco === 'reprovado' ? '🔴' : '🟡'}
                                     </span>
                                )}
                            </h3>
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-bold uppercase mt-1.5">
                                {(cliente.cidade || cliente.bairro) && (
                                    <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                                        <MapPin size={10}/> {[cliente.cidade, cliente.bairro].filter(Boolean).join(' - ')}
                                    </span>
                                )}
                                {cliente.telefone && <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><Phone size={10}/> {cliente.telefone}</span>}
                                {cliente.cnpj && <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><FileText size={10}/> {cliente.cnpj}</span>}
                                {cliente.user_id && (
                                    <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                                        <User size={10}/> {vendedores.find(v => v.id === cliente.user_id)?.nome || 'Vendedor'}
                                    </span>
                                )}
                            </div>
                            {((cliente as any).tags || []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {((cliente as any).tags as string[]).slice(0, 4).map((t: string) => (
                                        <span key={t} className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[9px] font-bold">{t}</span>
                                    ))}
                                    {((cliente as any).tags as string[]).length > 4 && (
                                        <span className="text-slate-600 text-[9px] font-bold">+{((cliente as any).tags as string[]).length - 4}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                ))}
                
                <div className="py-4 text-center">
                    {loadingMore ? (
                        <div className="flex items-center justify-center gap-2 text-slate-500 text-xs font-bold uppercase"><Loader2 className="animate-spin" size={16}/></div>
                    ) : hasMore && clientes.length > 0 ? (
                        <button onClick={loadMore} className="bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 mx-auto">
                            <ChevronDown size={14}/> Carregar Mais
                        </button>
                    ) : null}
                </div>
            </>
        )}
      </div>

      {/* MODAL PRINCIPAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          
          {/* AQUI ESTÁ A MÁGICA DO SCROLL GLOBAL */}
          <div className="bg-[#0B1120] border border-white/10 p-8 rounded-[40px] w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col">
            
            {/* CABEÇALHO FLUIDO (ROLA JUNTO COM A TELA) */}
            <div className="flex justify-between items-start gap-4 mb-6">
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-white flex flex-wrap items-center gap-2">
                    {editingId ? (isCDL ? 'Gerenciar Associado' : 'Gerenciar Cliente') : 'Novo Cadastro'}
                    {editingId && <span className="text-purple-400 bg-purple-500/10 px-2 py-1 rounded-lg text-sm not-italic tracking-widest">#{formatId(editingId, 'CL')}</span>}
                </h2>
                
                {/* O Semáforo e o 'X' agora moram lado a lado e nunca sobrepõem nada */}
                <div className="flex items-center gap-3 flex-shrink-0">
                    <SemaforoRisco status={formData.status_risco} />
                    {editingId && (
                        <button
                            type="button"
                            onClick={() => handleDeleteCliente(editingId)}
                            title={isCDL ? 'Excluir associado' : 'Excluir cliente'}
                            className="text-red-500/70 hover:text-white bg-red-500/10 hover:bg-red-500 rounded-full p-2 transition-all flex-shrink-0"
                        >
                            <Trash2 size={18}/>
                        </button>
                    )}
                    <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2 transition-all flex-shrink-0">
                        <X size={18}/>
                    </button>
                </div>
            </div>

            <div className="flex gap-2 mb-6 border-b border-white/10 overflow-x-auto flex-shrink-0">
               <button onClick={() => setActiveTab('dados')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'dados' ? 'border-[#22C55E] text-[#22C55E]' : 'border-transparent text-slate-500 hover:text-white'}`}>Dados Cadastrais</button>
               {editingId && (
                   <>
                   <button onClick={() => setActiveTab('unidades')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'unidades' ? 'border-purple-500 text-purple-500' : 'border-transparent text-slate-500 hover:text-white'}`}><Building2 size={14}/> Filiais ({unidades.length})</button>
                   <button onClick={() => setActiveTab('historico')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'historico' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 hover:text-white'}`}><History size={14}/> Histórico</button>
                   <button onClick={() => setActiveTab('nexus')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'nexus' ? 'border-indigo-400 text-indigo-400' : 'border-transparent text-slate-500 hover:text-white'}`}><FolderSearch size={14}/> Nexus {nexusItens.length > 0 ? `(${nexusItens.length})` : ''}</button>
                   </>
               )}
            </div>

            {/* O corpo agora flui com o scroll do modal */}
            <div className="flex-1 pb-2">
                
                {activeTab === 'dados' && (
                <form onSubmit={handleSaveCliente} className="space-y-6">
                    
                    {/* BUSCA CNPJ CLEAN COM CAIXA DE RISCO */}
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <h3 className="text-[10px] font-black uppercase text-blue-400 flex items-center gap-2"><Zap size={14} /> Busca Inteligente</h3>
                            <div className="flex bg-[#0B1120] border border-white/10 rounded-xl p-1 gap-1">
                                <button type="button" onClick={() => trocarTipoPessoa('juridica')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${tipoPessoa === 'juridica' ? 'bg-[#22C55E] text-[#0F172A]' : 'text-slate-500 hover:text-white'}`}>
                                    Pessoa Jurídica
                                </button>
                                <button type="button" onClick={() => trocarTipoPessoa('fisica')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${tipoPessoa === 'fisica' ? 'bg-[#22C55E] text-[#0F172A]' : 'text-slate-500 hover:text-white'}`}>
                                    Pessoa Física
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                            <div className="flex-1">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">{tipoPessoa === 'fisica' ? 'CPF' : 'CNPJ'}</label>
                                <div className="relative">
                                    <input
                                        className="w-full bg-[#0B1120] border border-white/10 rounded-xl pl-4 pr-12 py-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-all"
                                        value={formData.cnpj}
                                        onChange={handleCnpjChange}
                                        placeholder={tipoPessoa === 'fisica' ? '000.000.000-00' : '00.000.000/0000-00'}
                                    />
                                    {tipoPessoa === 'juridica' && (
                                        <button
                                            type="button"
                                            onClick={buscarDadosCNPJ}
                                            disabled={isSearchingCnpj}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 p-2 rounded-lg transition-all flex items-center justify-center"
                                            title="Buscar Dados"
                                        >
                                            {isSearchingCnpj ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                        </button>
                                    )}
                                </div>
                                {verificandoCnpjExistente && <p className="text-[9px] text-slate-600 font-bold uppercase mt-1 ml-2">Carregando base para checagem de duplicados...</p>}
                            </div>

                            {/* CAIXA DE ALERTA DE RISCO */}
                            {tipoPessoa === 'fisica' ? (
                                <p className="text-[10px] text-slate-500 font-bold ml-2">Pessoa física não tem busca automática de dados nem análise de risco por CNPJ.</p>
                            ) : formData.status_risco !== 'em_analise' ? (
                                <div className="bg-[#0B1120] border border-white/5 p-3 rounded-xl flex items-center gap-3">
                                    <ShieldAlert size={20} className={formData.status_risco === 'aprovado' ? 'text-green-500' : formData.status_risco === 'reprovado' ? 'text-red-500' : 'text-yellow-500'}/>
                                    <div>
                                        <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Limite Sugerido</p>
                                        <p className="text-white text-sm font-black">R$ {formData.limite_credito.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Inscrição Estadual</label>
                                    <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.inscricao_estadual} onChange={e => setFormData({...formData, inscricao_estadual: e.target.value})} placeholder="ISENTO ou número" />
                                </div>
                            )}
                        </div>

                        {cnpjDuplicado && (
                            <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border ${cnpjDuplicado.status === 'inativo' ? 'bg-orange-500/10 border-orange-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                <p className={`text-xs font-bold ${cnpjDuplicado.status === 'inativo' ? 'text-orange-300' : 'text-red-300'}`}>
                                    ⚠️ Esse {tipoPessoa === 'fisica' ? 'CPF' : 'CNPJ'} já está cadastrado para <strong>{cnpjDuplicado.nome_empresa}</strong>
                                    {cnpjDuplicado.status === 'inativo' ? ' (inativo).' : ' (ativo).'}
                                </p>
                                <div className="flex gap-2 flex-shrink-0">
                                    {cnpjDuplicado.status === 'inativo' && (
                                        <button type="button" onClick={() => abrirClienteExistente(cnpjDuplicado.id, true)} className="bg-orange-500 hover:bg-orange-400 text-[#0B1120] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors">
                                            Reativar este cliente
                                        </button>
                                    )}
                                    <button type="button" onClick={() => abrirClienteExistente(cnpjDuplicado.id, false)} className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors">
                                        Abrir cadastro existente
                                    </button>
                                </div>
                            </div>
                        )}

                        {formData.status_risco !== 'em_analise' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Inscrição Estadual</label>
                                    <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.inscricao_estadual} onChange={e => setFormData({...formData, inscricao_estadual: e.target.value})} placeholder="ISENTO ou número" />
                                </div>
                                {formData.observacao_risco && (
                                    <p className="text-[10px] text-slate-500 font-mono mt-4">🔍 {formData.observacao_risco}</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* DADOS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Razão Social / Nome *</label>
                            <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] uppercase" value={formData.nome_empresa} onChange={e => setFormData({...formData, nome_empresa: e.target.value})} required />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Telefone</label>
                            <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">E-mail</label>
                            <input type="email" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                        </div>
                    </div>

                    {/* ENDEREÇO */}
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-4">
                        <h3 className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2"><MapPin size={14}/> Endereço</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">CEP</label>
                                <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.cep} onChange={e => setFormData({...formData, cep: e.target.value})} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Rua/Av</label>
                                <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] uppercase" value={formData.endereco} onChange={e => setFormData({...formData, endereco: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Número</label>
                                <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] uppercase" value={formData.numero} onChange={e => setFormData({...formData, numero: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Bairro</label>
                                <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] uppercase" value={formData.bairro} onChange={e => setFormData({...formData, bairro: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Cidade / UF</label>
                                <div className="flex gap-2">
                                    <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] uppercase" value={formData.cidade} onChange={e => setFormData({...formData, cidade: e.target.value})} />
                                    <input className="w-16 bg-[#0B1120] border border-white/10 rounded-xl px-2 py-3 text-white text-sm font-bold outline-none text-center focus:border-[#22C55E] uppercase" value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})} maxLength={2} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Status</label>
                        <select className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                            <option value="ativo" className="bg-[#0B1120]">Ativo</option>
                            <option value="inativo" className="bg-[#0B1120]">Inativo</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Segmento</label>
                        <select className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.segmento} onChange={e => setFormData({...formData, segmento: e.target.value})}>
                            <option value="" className="bg-[#0B1120]">Selecione o segmento</option>
                            {SEGMENTOS_GRUPOS.map(g => (
                                <optgroup key={g.grupo} label={g.grupo} className="bg-[#0B1120]">
                                    {g.itens.map(s => <option key={s} value={s} className="bg-[#0B1120]">{s}</option>)}
                                </optgroup>
                            ))}
                            <option value="Outro" className="bg-[#0B1120]">Outro</option>
                        </select>
                        {formData.segmento === 'Outro' && (
                            <input
                                className="w-full mt-2 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"
                                placeholder="Qual segmento?"
                                value={segmentoCustom}
                                onChange={e => setSegmentoCustom(e.target.value)}
                            />
                        )}
                    </div>

                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                        <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Tags</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {tags.map(t => (
                                <span key={t} className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1">
                                    {t}
                                    <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-red-400 ml-1"><X size={10}/></button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Ex: sazonalidade alta, pagador pontual..."
                                className="flex-1 bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-500"
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => {
                                    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                                        e.preventDefault();
                                        const nova = tagInput.trim().replace(/,$/, '');
                                        if (nova && !tags.includes(nova)) setTags([...tags, nova]);
                                        setTagInput('');
                                    }
                                }}
                            />
                            <button type="button" onClick={() => { if (tagInput.trim() && !tags.includes(tagInput.trim())) { setTags([...tags, tagInput.trim()]); setTagInput(''); } }} className="bg-blue-600 text-white px-3 rounded-xl text-xs font-bold">+</button>
                        </div>
                    </div>

                    <button type="submit" disabled={!editingId && !!cnpjDuplicado} className="w-full bg-[#22C55E] text-[#0F172A] py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 transition-all shadow-lg mt-4">
                        {!editingId && cnpjDuplicado ? 'Resolva o CNPJ duplicado acima' : (editingId ? 'Salvar Alterações' : (isCDL ? 'Cadastrar Associado' : 'Criar Cliente'))}
                    </button>
                </form>
                )}

                {/* UNIDADES E HISTÓRICO */}
                {activeTab === 'unidades' && (
                    <div className="space-y-6">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                            <form onSubmit={handleSaveUnit} className="flex flex-col md:flex-row gap-3">
                                <input className="flex-1 bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-purple-500" placeholder="Nova Filial (Nome)" value={newUnit.nome} onChange={e => setNewUnit({...newUnit, nome: e.target.value})} required/>
                                <input className="w-32 bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-purple-500" placeholder="Cidade" value={newUnit.cidade} onChange={e => setNewUnit({...newUnit, cidade: e.target.value})}/>
                                <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase hover:bg-purple-500 transition-colors">Add</button>
                            </form>
                        </div>
                        <div className="space-y-2">
                            {unidades.map(unit => (
                                <div key={unit.id} className="flex justify-between items-center bg-white/[0.02] p-3 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center"><Building2 size={16}/></div>
                                        <div>
                                            <div className="text-white text-sm font-bold">{unit.nome}</div>
                                            <div className="text-slate-500 text-[10px] uppercase">{unit.cidade || 'Sem local'}</div>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteUnit(unit.id)} className="text-slate-600 hover:text-red-500 p-2"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'historico' && (
                <div className="space-y-3 pb-2">
                    {historicoVendas.length > 0 && (
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="bg-[#22C55E]/10 border border-[#22C55E]/20 p-3 rounded-xl text-center">
                                <p className="text-[10px] font-black text-[#22C55E] uppercase">Ganhos</p>
                                <p className="text-lg font-black text-white">{historicoVendas.filter(v => v.status === 'ganho').length}</p>
                            </div>
                            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-center">
                                <p className="text-[10px] font-black text-red-400 uppercase">Perdidos</p>
                                <p className="text-lg font-black text-white">{historicoVendas.filter(v => v.status === 'perdido').length}</p>
                            </div>
                            <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl text-center">
                                <p className="text-[10px] font-black text-blue-400 uppercase">Faturado</p>
                                <p className="text-sm font-black text-white">R$ {historicoVendas.filter(v => v.status === 'ganho').reduce((s, v) => s + (v.valor_total || 0), 0).toLocaleString('pt-BR', {minimumFractionDigits: 0})}</p>
                            </div>
                        </div>
                    )}
                    {historicoVendas.map(venda => {
                        const isGanho = venda.status === 'ganho';
                        const isPerdido = venda.status === 'perdido';
                        const borderColor = isGanho ? 'border-l-[#22C55E]' : isPerdido ? 'border-l-red-500' : 'border-l-blue-500';
                        const statusBg = isGanho ? 'bg-[#22C55E]/20 text-[#22C55E]' : isPerdido ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400';
                        const notas = Array.isArray(venda.notas) ? venda.notas : [];
                        return (
                        <div key={venda.id} className={`bg-white/[0.02] p-4 rounded-xl border border-white/5 border-l-2 ${borderColor}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${statusBg}`}>{venda.status}</span>
                                    {venda.unidade && <span className="text-[9px] bg-white/5 text-slate-400 px-2 py-0.5 rounded uppercase">{venda.unidade}</span>}
                                    <span className="text-[9px] text-slate-600 font-mono">{formatId(venda.id, 'LD')}</span>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-white">R$ {(venda.valor_total || 0).toLocaleString('pt-BR')}</p>
                                    <p className="text-[9px] text-slate-500">{new Date(venda.created_at).toLocaleDateString('pt-BR')}</p>
                                </div>
                            </div>
                            {Array.isArray(venda.itens) && venda.itens.length > 0 && (
                                <div className="space-y-0.5 border-l border-white/10 pl-2 mb-2">
                                    {venda.itens.slice(0, 3).map((item: any, i: number) => (
                                        <p key={i} className="text-[9px] text-slate-400 font-bold uppercase truncate">{item.quantidade}x {item.servico}</p>
                                    ))}
                                    {venda.itens.length > 3 && <p className="text-[9px] text-slate-600 italic">+{venda.itens.length - 3} itens...</p>}
                                </div>
                            )}
                            {notas.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                                    {notas.slice(0, 2).map((n: any, i: number) => (
                                        <p key={i} className="text-[9px] text-slate-500 flex items-start gap-1">
                                            <span className="text-slate-700 flex-shrink-0">•</span> {n.texto}
                                        </p>
                                    ))}
                                    {notas.length > 2 && <p className="text-[9px] text-slate-600 italic">+{notas.length - 2} notas...</p>}
                                </div>
                            )}
                        </div>
                        );
                    })}
                    {historicoVendas.length === 0 && (
                         <div className="text-center py-10 opacity-50"><History size={32} className="mx-auto mb-2 text-slate-600"/><p className="text-xs font-bold text-slate-500 uppercase">Sem histórico.</p></div>
                    )}
                </div>
                )}

                {activeTab === 'nexus' && (
                <div className="space-y-4 pb-2">
                    <p className="text-[11px] text-slate-500 leading-relaxed">Fotos, documentos, layouts e manutenções deste cliente — pesquisável, pra quem não vive de pipeline consultar depois.</p>

                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-indigo-400 transition-all">
                            <Search size={14} className="text-slate-500 flex-shrink-0"/>
                            <input
                                value={nexusQuery}
                                onChange={e => setNexusQuery(e.target.value)}
                                placeholder="Buscar por equipamento, peça, tag..."
                                className="flex-1 bg-transparent outline-none text-white text-xs"
                            />
                        </div>
                        <button type="button" onClick={() => setNexusFormOpen(v => !v)} className="bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 flex-shrink-0">
                            <Plus size={14}/> Adicionar
                        </button>
                    </div>

                    <div className="flex gap-1.5 flex-wrap">
                        {NEXUS_CATS.map(c => (
                            <button key={c.key} type="button" onClick={() => setNexusCat(c.key)} className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${nexusCat === c.key ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300' : 'bg-white/[0.02] border-white/10 text-slate-500 hover:text-white'}`}>
                                {c.label}
                            </button>
                        ))}
                    </div>

                    {nexusFormOpen && (
                        <form onSubmit={handleUploadNexus} className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Categoria</label>
                                    <select value={nexusCategoria} onChange={e => setNexusCategoria(e.target.value as NexusCategoria)} className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-indigo-400">
                                        <option value="foto">Foto</option>
                                        <option value="documento">Documento</option>
                                        <option value="layout3d">Layout 3D</option>
                                        <option value="manutencao">Manutenção</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Arquivo</label>
                                    <input type="file" onChange={e => setNexusFile(e.target.files?.[0] || null)} required className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-2 py-2 text-slate-400 text-[10px] outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Título</label>
                                <input value={nexusTitulo} onChange={e => setNexusTitulo(e.target.value)} required placeholder="Ex: Filtro de Mangas — vista frontal" className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-indigo-400" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Tags (separadas por vírgula)</label>
                                <input value={nexusTagsInput} onChange={e => setNexusTagsInput(e.target.value)} placeholder="filtro de mangas, exaustão" className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-indigo-400" />
                            </div>
                            {nexusError && <p className="text-[10px] text-red-400 font-bold">{nexusError}</p>}
                            <button type="submit" disabled={nexusUploading} className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-black uppercase text-[10px] py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all">
                                {nexusUploading ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>} {nexusUploading ? 'Enviando...' : 'Salvar no Nexus'}
                            </button>
                        </form>
                    )}

                    {nexusItensFiltrados.length === 0 ? (
                        <div className="text-center py-10 opacity-50">
                            <FolderSearch size={32} className="mx-auto mb-2 text-slate-600"/>
                            <p className="text-xs font-bold text-slate-500 uppercase">{nexusItens.length === 0 ? 'Nada no Nexus ainda.' : 'Nada encontrado.'}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {nexusItensFiltrados.map(item => (
                                <button key={item.id} type="button" onClick={() => setNexusDetalhe(item)} className="bg-white/[0.02] border border-white/5 hover:border-white/20 rounded-xl overflow-hidden text-left transition-all">
                                    <div className={`h-16 flex items-center justify-center ${NEXUS_CAT_BG[item.categoria]}`}>
                                        <NexusIcon categoria={item.categoria} size={22} />
                                    </div>
                                    <div className="p-2">
                                        <p className="text-[10px] font-bold text-white truncate">{item.titulo}</p>
                                        <p className="text-[8px] text-slate-500 mt-0.5">{new Date(item.created_at).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALHE NEXUS */}
      {nexusDetalhe && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1001] flex items-center justify-center p-4" onClick={() => setNexusDetalhe(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={`h-32 flex items-center justify-center relative ${NEXUS_CAT_BG[nexusDetalhe.categoria]}`}>
              <NexusIcon categoria={nexusDetalhe.categoria} size={36} />
              <button onClick={() => setNexusDetalhe(null)} className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5"><X size={14}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400">{NEXUS_CAT_LABEL[nexusDetalhe.categoria]}</p>
                <p className="text-white font-black text-sm mt-0.5">{nexusDetalhe.titulo}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 rounded-lg p-2">
                  <p className="text-[8px] font-black uppercase text-slate-500">Adicionado em</p>
                  <p className="text-[11px] text-slate-300 font-bold">{new Date(nexusDetalhe.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2">
                  <p className="text-[8px] font-black uppercase text-slate-500">Responsável</p>
                  <p className="text-[11px] text-slate-300 font-bold truncate">{nexusDetalhe.responsavel_nome || '—'}</p>
                </div>
              </div>
              {nexusDetalhe.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {nexusDetalhe.tags.map((t, i) => <span key={i} className="text-[9px] font-bold bg-white/5 text-slate-400 px-2 py-1 rounded-md">{t}</span>)}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <a href={nexusDetalhe.arquivo_url} target="_blank" rel="noopener noreferrer" className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-black uppercase text-[10px] py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all">
                  <Download size={13}/> Abrir arquivo
                </a>
                {(isDirector || nexusDetalhe.user_id === user?.id) && (
                  <button onClick={() => handleDeleteNexus(nexusDetalhe)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 rounded-xl transition-all">
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CSV PREVIEW */}
      {csvModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-white/10 rounded-[32px] w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-6 border-b border-white/10 flex-shrink-0">
              <div>
                <h2 className="text-lg font-black uppercase italic tracking-tighter text-white">Importar CSV</h2>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-0.5">{csvPreview.length} registros detectados</p>
              </div>
              <button onClick={() => setCsvModalOpen(false)} className="text-slate-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2 transition-all"><X size={18}/></button>
            </div>
            <div className="overflow-auto custom-scrollbar flex-1 p-4">
              <table className="w-full text-[10px] font-bold uppercase">
                <thead>
                  <tr className="text-slate-500 border-b border-white/5">
                    <th className="text-left py-2 px-3">#</th>
                    <th className="text-left py-2 px-3">Nome</th>
                    <th className="text-left py-2 px-3">Telefone</th>
                    <th className="text-left py-2 px-3">CNPJ/CPF</th>
                    <th className="text-left py-2 px-3">Cidade</th>
                    <th className="text-left py-2 px-3">E-mail</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((r, i) => (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="py-2 px-3 text-slate-600">{i + 1}</td>
                      <td className="py-2 px-3 text-white">{r.nome_empresa || r.nome || r['nome empresa'] || '—'}</td>
                      <td className="py-2 px-3 text-slate-400">{r.telefone || r.fone || '—'}</td>
                      <td className="py-2 px-3 text-slate-400">{r.cnpj || '—'}</td>
                      <td className="py-2 px-3 text-slate-400">{r.cidade || '—'}</td>
                      <td className="py-2 px-3 text-slate-400">{r.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 p-6 border-t border-white/10 flex-shrink-0">
              <button onClick={() => setCsvModalOpen(false)} className="flex-1 bg-white/5 text-slate-400 hover:text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">Cancelar</button>
              <button onClick={handleCsvImport} disabled={csvImporting} className="flex-1 bg-[#22C55E] text-[#0F172A] py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {csvImporting ? <><Loader2 size={14} className="animate-spin"/> Importando...</> : `Confirmar — ${csvPreview.length} clientes`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DUPLICADOS */}
      {duplicadosModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-white/10 rounded-[32px] w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-6 border-b border-white/10 flex-shrink-0">
              <div>
                <h2 className="text-lg font-black uppercase italic tracking-tighter text-white">Clientes Duplicados</h2>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-0.5">{duplicados.length} grupo{duplicados.length !== 1 ? 's' : ''} com CNPJ duplicado</p>
              </div>
              <button onClick={() => setDuplicadosModal(false)} className="text-slate-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2 transition-all"><X size={18}/></button>
            </div>
            <div className="overflow-auto custom-scrollbar flex-1 p-4 space-y-4">
              {duplicados.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500"/>
                  <p className="text-xs font-bold text-slate-500 uppercase">Nenhum duplicado encontrado</p>
                </div>
              ) : duplicados.map((grupo, gi) => (
                <div key={gi} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase text-slate-600 mb-3">CNPJ: {grupo[0].cnpj}</p>
                  <div className="space-y-2">
                    {grupo.map((c: any, ci: number) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 bg-white/[0.02] p-3 rounded-xl">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 bg-blue-600/10 text-blue-400 rounded-xl flex items-center justify-center font-black text-sm uppercase flex-shrink-0">
                            {c.nome_empresa?.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white text-xs font-black uppercase truncate">{c.nome_empresa}</p>
                            <p className="text-slate-500 text-[9px] uppercase">{c.cidade || '—'} · {new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {ci > 0 && (
                            <button
                              onClick={() => mesclarClientes(grupo[0].id, c.id)}
                              className="bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all"
                            >
                              Mesclar no #{grupo[0].id}
                            </button>
                          )}
                          {ci === 0 && <span className="text-[9px] font-black text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-xl uppercase">Principal</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-white/10 flex-shrink-0">
              <button onClick={() => setDuplicadosModal(false)} className="w-full bg-white/5 text-slate-400 hover:text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}