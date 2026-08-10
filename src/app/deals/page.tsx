"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, X, Trash2, Radio, Zap, Mic2, MessageCircle, MapPin,
  Upload, Target, MapPinOff, User, Briefcase, Printer, Edit2,
  Sparkles, Crosshair, Calendar, CalendarDays, AlertTriangle,
  Building2, FileText, Hash, CheckCircle2, WifiOff, RefreshCcw,
  Info, Lock, Megaphone, Smartphone, Headphones, ArrowLeft, Package, Newspaper, Filter, Clock,
  Mail, Send, Loader2, PenLine, Link, ExternalLink, Wallet
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CDL } from '@/lib/cdl-config';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Toast } from '@/components/Toast';
import { localDb } from '@/lib/localDb'; 
import { syncOfflineDataToCloud } from '@/lib/syncService';
import { useUnidades } from '@/lib/useUnidades';
import dynamic from 'next/dynamic';

const KanbanBoard = dynamic(() => import('./KanbanBoard'), { ssr: false });
const AgendaCalendar = dynamic(() => import('./AgendaCalendar'), { ssr: false });

// --- TIPOS ---
type ItemVenda = { servico: string; quantidade: number; precoUnitario: number; tempo?: string; programa?: string; horario_inicial?: string; horario_final?: string; bonificacao?: boolean; };
type Historico = { id: number; texto: string; created_at: string; };
type Atividade = { id: number; tipo: 'etapa' | 'nota' | 'followup'; descricao: string; created_at: string; };
type ServicoConfig = { id: number; nome: string; preco: number; tipo?: string; unidade?: string; estoque?: number | null; };

type Lead = { 
  id: number; 
  empresa: string; 
  valor_total: number; 
  desconto?: number; 
  itens: ItemVenda[]; 
  etapa: number; 
  status: string; // 👈 BLINDAGEM DO TYPESCRIPT (agora aceita qualquer palavra)
  tipo: string;
  created_at: string; 
  telefone?: string;
  checkin?: string;         
  localizacao_url?: string; 
  foto_url?: string;
  user_id?: string;   
  empresa_id?: string;
  filial_id?: number;
  client_id?: number;
  contrato_inicio?: string; 
  contrato_fim?: string; 
  origem?: string;
  unidade?: string;
  cidade?: string;
  descricao?: string;
  vendedor_nome?: string;
  notas?: Historico[];
  followup_em?: string;
  status_aprovacao?: string | null;
  cnpj?: string;
  endereco?: string;
  inscricao_estadual?: string;
  parcelas?: string;
  vencimento?: string;
  vencimentos_datas?: string[];
  forma_pagamento?: string;
  criado_por?: string;
  atividades?: Atividade[];
  docuseal_submission_id?: string;
  docuseal_sign_url?: string;
  docuseal_assinado?: boolean;
  docuseal_consultor_sign_url?: string;
  docuseal_consultor_assinado?: boolean;
  docuseal_arquivos?: { nome: string; path: string }[];
  contrato_manual_url?: string;
  contrato_manual_em?: string;
  contrato_manual_arquivos?: { nome: string; path: string }[];
};

type ClienteOpcao = {
  id: number;
  nome_empresa: string;
  telefone: string; 
  cnpj?: string;
  inscricao_estadual?: string;
  email?: string;
  cidade?: string;
  endereco?: string;
  risco?: string;
};

const STAGES = {
  0: { title: 'Novo Lead', color: 'border-slate-500' },
  1: { title: 'Contato Feito', color: 'border-blue-500' },
  2: { title: 'Proposta', color: 'border-purple-500' },
  3: { title: 'Negociação', color: 'border-yellow-500' },
  4: { title: 'Ganhos', color: 'border-[#22C55E]' },
  5: { title: 'Perdidos', color: 'border-red-500' },
};

const CDL_STAGES = {
  0: { title: 'Novo Prospecto', color: 'border-slate-500' },
  1: { title: 'Contato Feito', color: 'border-blue-500' },
  2: { title: 'Proposta de Filiação', color: 'border-purple-500' },
  3: { title: 'Em Negociação', color: 'border-yellow-500' },
  4: { title: 'Filiados!', color: 'border-[#22C55E]' },
  5: { title: 'Desistiram', color: 'border-red-500' },
};

const formatId = (id: number, prefix: string) => {
    return `${prefix}-${String(id).padStart(4, '0')}`;
};

const getLocalYYYYMMDD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const formatarData = (dataIso: string) => {
    if (!dataIso) return '';
    const parts = dataIso.split('T')[0].split('-');
    if(parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return new Date(dataIso).toLocaleDateString('pt-BR');
};

const somarMeses = (dataIso: string, meses: number) => {
    const [y, m, d] = dataIso.split('-').map(Number);
    const dt = new Date(y, m - 1 + meses, d);
    if (dt.getDate() !== d) dt.setDate(0); // dia não existe no mês alvo (ex: 31) -> cai pro último dia do mês
    return getLocalYYYYMMDD(dt);
};

// Sugestão automática (1 vencimento por mês a partir do 1º) — ponto de partida editável,
// não é mais a única fonte de verdade (ver vencimentos_datas no lead).
const gerarVencimentosPadrao = (vencimento: string, parcelas: string | number): string[] => {
    if (!vencimento) return [];
    const qtd = Math.max(1, parseInt(String(parcelas), 10) || 1);
    return Array.from({ length: qtd }, (_, i) => somarMeses(vencimento, i));
};

const formatarVencimentosArray = (datas: string[]) => datas.map(formatarData).join(',&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;');

const FORMAS_PAGAMENTO: Record<string, string> = {
    boleto: 'Boleto',
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao: 'Cartão',
    transferencia: 'Transferência',
};

const UF_NOMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
const nomeEstadoExtenso = (uf?: string) => (uf ? (UF_NOMES[uf.toUpperCase()] || uf) : '');

const timbradoPorUnidade = (unidadeNome: string) => {
  const digitos = (unidadeNome || '').replace(/\D/g, '');
  if (digitos.startsWith('104')) return '/contratos/timbrado-1047.png';
  if (digitos.startsWith('107')) return '/contratos/timbrado-1079.png';
  if (digitos.startsWith('101')) return '/contratos/timbrado-1011.png';
  return '';
};

const maskCnpj = (v: string) => {
  const s = v.replace(/\D/g, '').substring(0, 14);
  if (s.length > 12) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (s.length > 8) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
  if (s.length > 5) return s.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
  if (s.length > 2) return s.replace(/(\d{2})(\d{1,3})/, '$1.$2');
  return s;
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

const rotuloDocumento = (doc: string) => (doc || '').replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ';

export default function DealsPage() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const router = useRouter();
  const { unidades } = useUnidades(perfil?.empresa_id);

  const LIMITE_DESCONTO_MAXIMO = 5;

  const isDirector = perfil?.cargo === 'diretor';
  const isGerente = perfil?.cargo === 'gerente';
  const isOpec = perfil?.cargo === 'opec';
  const isLideranca = isDirector || isGerente;
  const isCDL = Boolean(empresa?.modulos?.cdl);
  const ACTIVE_STAGES = isCDL ? CDL_STAGES : STAGES;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [usersEmailMap, setUsersEmailMap] = useState<Record<string, string>>({});
  const [clientesOpcoes, setClientesOpcoes] = useState<ClienteOpcao[]>([]);
  const [listaServicos, setListaServicos] = useState<ServicoConfig[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<number | null>(null);
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);

  const leadEmEdicao = leads.find(l => l.id === editingLeadId);
  const contratoJaAssinado = Boolean(leadEmEdicao?.docuseal_assinado || leadEmEdicao?.contrato_manual_url);
  const consultorAtualNome = (leadEmEdicao?.user_id && usersMap[leadEmEdicao.user_id]) || leadEmEdicao?.vendedor_nome || perfil?.nome || 'Consultor';
  const leadTravado = contratoJaAssinado && !isDirector;

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailLead, setEmailLead] = useState<Lead | null>(null);
  const [emailDestino, setEmailDestino] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<'idle' | 'ok' | 'error'>('idle');

  // Assinatura Digital — Docuseal
  const [showDocuseal, setShowDocuseal] = useState(false);
  const [docuSignerName, setDocuSignerName] = useState('');
  const [docuSignerEmail, setDocuSignerEmail] = useState('');
  const [docuSignerPhone, setDocuSignerPhone] = useState('');
  const [docuSending, setDocuSending] = useState(false);
  const [docuLink, setDocuLink] = useState<string | null>(null);
  const [docuConsultorLink, setDocuConsultorLink] = useState<string | null>(null);
  const [docuConsultorAssinou, setDocuConsultorAssinou] = useState(false);
  const [docuErro, setDocuErro] = useState('');

  // Upload manual do contrato já assinado (sem assinatura eletrônica)
  const [showUploadManual, setShowUploadManual] = useState(false);
  const [uploadManualEnviando, setUploadManualEnviando] = useState(false);
  const [uploadManualErro, setUploadManualErro] = useState('');

  // 👇 ESTADOS DO NOVO POP-UP DE PERDA (IA ANALYTICS) 👇
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [lostLeadId, setLostLeadId] = useState<number | null>(null);
  const [motivoPerda, setMotivoPerda] = useState('');
  
  const [novaEmpresa, setNovaEmpresa] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false); 
  const [novoTelefone, setNovoTelefone] = useState('');
  const [novaUnidade, setNovaUnidade] = useState(''); 
  const [novaCidade, setNovaCidade] = useState('');     
  const [novaDescricao, setNovaDescricao] = useState(''); 
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [tipoCliente, setTipoCliente] = useState<'Agência' | 'Anunciante'>('Anunciante');
  const [contratoInicio, setContratoInicio] = useState('');
  const [contratoFim, setContratoFim] = useState('');
  const [novoCnpj, setNovoCnpj] = useState('');
  const [novoEndereco, setNovoEndereco] = useState('');
  const [cnpjError, setCnpjError] = useState(false);
  const [novoIE, setNovoIE] = useState('');
  const [parcelas, setParcelas] = useState('1');
  const [vencimento, setVencimento] = useState('');
  const [vencimentosDatas, setVencimentosDatas] = useState<string[]>([]);
  const [formaPagamento, setFormaPagamento] = useState('');
  const [itensTemporarios, setItensTemporarios] = useState<ItemVenda[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [valorTotalOverride, setValorTotalOverride] = useState<number | null>(null);
  const [leadUserId, setLeadUserId] = useState<string>('');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [novaNota, setNovaNota] = useState('');
  const [followupEm, setFollowupEm] = useState('');
  const [atividades, setAtividades] = useState<Atividade[]>([]);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const [metasBase, setMetasBase] = useState<any[]>([]); 
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [dataInicio, setDataInicio] = useState(() => {
      const hoje = new Date();
      const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return getLocalYYYYMMDD(primeiroDia);
  });

  const [dataFim, setDataFim] = useState(() => {
      const hoje = new Date();
      const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      return getLocalYYYYMMDD(ultimoDia);
  });

  const dataInicioRef = useRef(dataInicio);
  const dataFimRef = useRef(dataFim);
  useEffect(() => { dataInicioRef.current = dataInicio; }, [dataInicio]);
  useEffect(() => { dataFimRef.current = dataFim; }, [dataFim]);

  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos');
  const [filtroUnidade, setFiltroUnidade] = useState<string>('todas');
  const [filtroAtrasados, setFiltroAtrasados] = useState(false);
  const [filtroSemAssinatura, setFiltroSemAssinatura] = useState(false);
  const [proximaAcaoModal, setProximaAcaoModal] = useState<{leadId: number; etapa: number; status: string} | null>(null);
  const [proximaAcaoDate, setProximaAcaoDate] = useState('');

  const [cdlFiliacaoModal, setCdlFiliacaoModal] = useState<{leadId: number} | null>(null);
  const [cdlModoFechamento, setCdlModoFechamento] = useState<'filiacao' | 'servico'>('filiacao');
  const [cdlTipoAssociacao, setCdlTipoAssociacao] = useState('Associado Simples');
  const [cdlValorAnuidade, setCdlValorAnuidade] = useState('');
  const [cdlDataInicio, setCdlDataInicio] = useState('');
  const [cdlDataFim, setCdlDataFim] = useState('');
  const [cdlBemVindoData, setCdlBemVindoData] = useState<{id: number; empresa: string; telefone: string | null} | null>(null);
  const [showAgenda, setShowAgenda] = useState(false);

  const [clientesRiscoMap, setClientesRiscoMap] = useState<Record<number, string>>({});
  const [clientesBuscando, setClientesBuscando] = useState(false);
  const clienteBuscaRef = useRef<NodeJS.Timeout | null>(null);

  const clientesMap = useMemo(() => {
      const map: Record<number, { risco?: string }> = {};
      Object.entries(clientesRiscoMap).forEach(([id, risco]) => { map[Number(id)] = { risco }; });
      return map;
  }, [clientesRiscoMap]);

  const buscarClientes = useCallback((q: string) => {
      if (clienteBuscaRef.current) clearTimeout(clienteBuscaRef.current);
      if (!q || q.length < 2) { setClientesOpcoes([]); return; }
      const empresaId = perfil?.empresa_id;
      clienteBuscaRef.current = setTimeout(async () => {
          setClientesBuscando(true);
          const digits = q.replace(/\D/g, '');
          const qCnpj = digits.length >= 2 ? maskCnpj(digits) : null;
          const orFilter = qCnpj
              ? `nome_empresa.ilike.%${q}%,cnpj.ilike.%${qCnpj}%`
              : `nome_empresa.ilike.%${q}%`;
          let query = supabase.from('clientes')
              .select('id, nome_empresa, telefone, cnpj, inscricao_estadual, email, cidade, endereco, status_risco')
              .eq('status', 'ativo')
              .or(orFilter)
              .order('nome_empresa', { ascending: true })
              .limit(20);
          if (empresaId) query = query.eq('empresa_id', empresaId);
          const { data, error } = await query;
          if (error) console.error('[buscarClientes]', error);
          setClientesOpcoes((data || []).map((c: any) => ({ ...c, risco: c.status_risco })));
          setClientesBuscando(false);
      }, 300);
  }, [perfil?.empresa_id]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const COLS = 'id, empresa, valor_total, desconto, itens, etapa, status, tipo, created_at, telefone, checkin, localizacao_url, foto_url, user_id, criado_por, empresa_id, filial_id, client_id, contrato_inicio, contrato_fim, origem, unidade, cidade, descricao, status_aprovacao, cnpj, endereco, inscricao_estadual, parcelas, vencimento, vencimentos_datas, forma_pagamento, vendedor_nome, num_pi, briefing, agencia, followup_em, notas, atividades, docuseal_submission_id, docuseal_sign_url, docuseal_assinado, docuseal_consultor_sign_url, docuseal_consultor_assinado, docuseal_arquivos, contrato_manual_url, contrato_manual_em, contrato_manual_arquivos';

    const buildQ = () => {
        let q = supabase.from('leads').select(COLS);
        if (perfil?.empresa_id) q = q.eq('empresa_id', perfil.empresa_id);
        if (!isDirector) {
            if (isOpec) q = q.or(`user_id.eq.${user?.id},criado_por.eq.${user?.id}`);
            else if (isGerente && perfil?.unidade) q = q.eq('unidade', perfil.unidade);
            else q = q.eq('user_id', user?.id);
        }
        return q;
    };

    const inicio = dataInicioRef.current + 'T00:00:00';
    const fim = dataFimRef.current + 'T23:59:59';
    const [openRes, closedRes] = await Promise.all([
        buildQ().lte('etapa', 3).order('created_at', { ascending: false }).limit(500),
        buildQ().gte('etapa', 4).gte('created_at', inicio).lte('created_at', fim).order('created_at', { ascending: false }).limit(200),
    ]);

    if (openRes.error) console.error('[fetchData] open leads:', openRes.error.message);
    if (closedRes.error) console.error('[fetchData] closed leads:', closedRes.error.message);

    const leadsData = (openRes.data || []).length + (closedRes.data || []).length > 0
        ? [...(openRes.data || []), ...(closedRes.data || [])]
        : null;
    let leadsBase: Lead[] = leadsData || [];

    if (!navigator.onLine && (!leadsData || leadsData.length === 0)) {
        leadsBase = await localDb.leads.toArray();
    }

    try {
        const filaPendente = await localDb.syncQueue.where('tabela').equals('leads').toArray();
        filaPendente.forEach(item => {
            if (item.operacao === 'INSERT') {
                if (!leadsBase.find(l => l.id === item.dados.id)) {
                    leadsBase.unshift(item.dados);
                }
            } else if (item.operacao === 'UPDATE') {
                leadsBase = leadsBase.map(l => l.id === item.dados.id ? { ...l, ...item.dados } : l);
            }
        });
    } catch (e) {}

    const leadsFiltrados = leadsBase.filter(l => l && l.id).filter(l => {
        if (isDirector) return true;
        if (!l.user_id) return false;
        return true;
    });

    if (navigator.onLine && leadsData) {
        setLeads(leadsFiltrados.filter(l => l.id < 1000000) as Lead[]); 
    } else {
        setLeads(leadsFiltrados as Lead[]);
    }

    let perfisQuery = supabase.from('profiles').select('id, nome, email').order('nome', { ascending: true });
    if (perfil?.empresa_id) perfisQuery = perfisQuery.eq('empresa_id', perfil.empresa_id);
    const { data: perfisData } = await perfisQuery;
    if (perfisData) {
        const mapa = perfisData.reduce((acc: any, p) => ({...acc, [p.id]: p.nome}), {});
        setUsersMap(mapa);
        const mapaEmail = perfisData.reduce((acc: any, p: any) => ({...acc, [p.id]: p.email}), {});
        setUsersEmailMap(mapaEmail);
    }

    try {
        const anoAtual = new Date().getFullYear();
        let metaQuery = supabase.from('metas').select('valor_objetivo, mes, ano')
            .eq('ano', anoAtual)
            .eq('tipo', 'faturamento')
            .is('produto', null)
            .is('unidade', null);
        if (perfil?.empresa_id) metaQuery = metaQuery.eq('empresa_id', perfil.empresa_id);

        if (isDirector) {
            metaQuery = metaQuery.is('user_id', null);
        } else {
            metaQuery = metaQuery.eq('user_id', user?.id);
        }

        const { data: metaData } = await metaQuery;
        if (metaData) {
            setMetasBase(metaData);
        }
    } catch (err) {}

    // Carrega só id + status_risco para os semáforos de risco nos cards (leve)
    if (perfil?.empresa_id) {
        const { data: riscoData } = await supabase
            .from('clientes')
            .select('id, status_risco')
            .eq('status', 'ativo')
            .eq('empresa_id', perfil.empresa_id);
        if (riscoData) {
            const rm: Record<number, string> = {};
            riscoData.forEach((c: any) => { rm[c.id] = c.status_risco || 'verde'; });
            setClientesRiscoMap(rm);
        }
    }

    const { data: servicosData } = await supabase.from('servicos').select('*').order('id', { ascending: true });
    if (servicosData && servicosData.length > 0) {
        setListaServicos(servicosData);
    } else {
        setListaServicos([
            { id: 1, nome: 'Blitz', preco: 1200, tipo: 'Blitz', unidade: '' }
        ]);
    }
    
    setLoading(false);
  }, [isDirector, isGerente, isOpec, perfil?.unidade, perfil?.empresa_id, user?.id]);

  useEffect(() => {
    if (!user) return;
    setIsOffline(!navigator.onLine);
    fetchData();

    const handleOnline = async () => {
        setIsOffline(false);
        setIsSyncing(true);
        setToastMessage("📶 Internet conectada! Subindo dados...");
        setShowToast(true);
        
        await syncOfflineDataToCloud();
        await fetchData();
        setIsSyncing(false);
    };

    const handleOffline = () => {
        setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync-completed', fetchData);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('sync-completed', fetchData);
    };
  }, [user, fetchData]);

  // Re-fetch closed leads when date range changes
  useEffect(() => {
    if (user) fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicio, dataFim]);

  const handleContratoInicio = useCallback((val: string) => {
      setContratoInicio(val);
      if (!vencimento && val) {
          const [year, month, day] = val.split('-');
          const start = new Date(Number(year), Number(month) - 1, Number(day));
          start.setMonth(start.getMonth() + 1);
          const newY = start.getFullYear();
          const newM = String(start.getMonth() + 1).padStart(2, '0');
          const newD = String(start.getDate()).padStart(2, '0');
          const novoVencimento = `${newY}-${newM}-${newD}`;

          setVencimento(novoVencimento);
          setVencimentosDatas(gerarVencimentosPadrao(novoVencimento, parcelas));
      }
  }, [vencimento, parcelas]);

  // Muda a 1ª parcela ou a quantidade -> reconstrói a sugestão automática de vencimentos.
  // Ajustes manuais feitos parcela a parcela (handleVencimentoParcela) só se perdem se
  // o usuário mexer de novo aqui, o que já invalida a agenda antiga mesmo.
  const handleVencimentoChange = useCallback((val: string) => {
      setVencimento(val);
      setVencimentosDatas(gerarVencimentosPadrao(val, parcelas));
  }, [parcelas]);

  const handleParcelasChange = useCallback((val: string) => {
      setParcelas(val);
      setVencimentosDatas(gerarVencimentosPadrao(vencimento, val));
  }, [vencimento]);

  const handleVencimentoParcela = useCallback((idx: number, val: string) => {
      setVencimentosDatas(prev => prev.map((d, i) => i === idx ? val : d));
  }, []);

  const criarJobDeProducao = useCallback(async (lead: Lead) => {
    const resumoItens = lead.itens.map(i => `${i.quantidade}x ${i.servico}`).join(', ');
    const briefingAutomatico = `VENDA APROVADA ✅ (Ref: LD-${String(lead.id).padStart(4, '0')})\n\nUnidade: ${lead.unidade || 'Não informada'}\nItens: ${resumoItens}\nValor Final: R$ ${lead.valor_total} (Desconto aplicado: R$ ${lead.desconto || 0})\n\nResumo da OPEC: ${lead.descricao || 'Sem briefing adicional.'}\n\n(Gerado automaticamente via CRM)`;

    let itensOpec = [];
    try {
        itensOpec = typeof lead.itens === 'string' ? JSON.parse(lead.itens as any) : lead.itens;
    } catch(e) {
        itensOpec = [];
    }

    const nomeDoVendedor = lead.user_id && usersMap[lead.user_id] ? usersMap[lead.user_id] : (perfil?.nome || 'Vendedor Não Identificado');

    await supabase.from('jobs').insert([{
        titulo: `Gravação: ${lead.empresa}`,
        briefing: briefingAutomatico,
        client_id: lead.client_id,
        user_id: lead.user_id || user?.id,
        empresa_id: perfil?.empresa_id,
        stage: 'aguardando_assinatura', // fica oculto da produção até o contrato ser assinado (docuseal/upload manual)
        prioridade: 'media',
        deadline: lead.contrato_inicio ? new Date(new Date(lead.contrato_inicio).getTime() - 24 * 60 * 60 * 1000).toISOString() : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        cliente: lead.empresa,
        agencia: lead.tipo === 'Agência' ? lead.empresa : null,
        data_inicio: lead.contrato_inicio || null,
        data_fim: lead.contrato_fim || null,
        itens_opec: itensOpec,
        vendedor_nome: nomeDoVendedor,
        unidade: lead.unidade
    }]);
  }, [user?.id, perfil?.empresa_id, perfil?.nome, usersMap]);

  const gerarCobrancaFinanceira = useCallback(async (lead: Lead) => {
      await supabase.from('lancamentos').insert([{
          titulo: `VENDA: ${lead.empresa} (${lead.unidade || 'Geral'}) - OS: ${formatId(lead.id, 'LD')}`,
          valor: lead.valor_total,
          tipo: 'entrada',
          categoria: 'vendas',
          status: 'pendente',
          data_vencimento: lead.vencimento ? lead.vencimento : new Date().toISOString().split('T')[0],
          user_id: user?.id,
          empresa_id: perfil?.empresa_id 
      }]);
  }, [user?.id, perfil?.empresa_id]);

  const fazerCheckin = useCallback((id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    if (!navigator.geolocation) {
      setToastMessage("⚠️ Seu navegador não suporta GPS.");
      setShowToast(true);
      return;
    }

    setToastMessage("🛰️ Puxando GPS do satélite...");
    setShowToast(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const mapsUrl = `https://maps.google.com/?q=$${pos.coords.latitude},${pos.coords.longitude}`;
        const now = new Date();
        const msg = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')} às ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        
        try {
            const { error } = await supabase.from('leads').update({ checkin: msg, localizacao_url: mapsUrl }).eq('id', id);
            if (error) throw error;
            
            setLeads(prev => prev.map(l => l.id === id ? { ...l, checkin: msg, localizacao_url: mapsUrl } : l));
            setToastMessage("📍 Check-in cravado com sucesso!");
            setShowToast(true);
        } catch (error: any) {
            if (error.message === 'Failed to fetch' || !navigator.onLine) {
                await localDb.syncQueue.add({
                    operacao: 'UPDATE', tabela: 'leads', dados: { id, checkin: msg, localizacao_url: mapsUrl }, data_criacao: new Date().toISOString()
                });
                setLeads(prev => prev.map(l => l.id === id ? { ...l, checkin: msg, localizacao_url: mapsUrl } : l));
                setToastMessage("📍 Check-in Salvo Offline!");
                setShowToast(true);
            }
        }
      },
      (err) => {
        setToastMessage("Falha no GPS ❌");
        setShowToast(true);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

  const mudarEtapa = useCallback(async (id: number, novaEtapa: number, novoStatus: string, pedirProximaAcao = false) => {
    if (pedirProximaAcao && novoStatus === 'aberto' && novaEtapa < 4) {
      setProximaAcaoModal({ leadId: id, etapa: novaEtapa, status: novoStatus });
      setProximaAcaoDate('');
      return;
    }
    const lead = leads.find(l => l.id === id);
    if (novoStatus === 'ganho' || novaEtapa === 4) {
        if (lead?.status_aprovacao === 'pendente') return alert("⚠️ NEGÓCIO BLOQUEADO: Aguardando aprovação.");
        if (lead?.status_aprovacao === 'recusado') return alert("❌ O desconto foi RECUSADO. Ajuste antes de dar o Ganho.");
    }
    
    if (lead && lead.etapa === 0 && novaEtapa > 0 && !lead.checkin) {
      fazerCheckin(id);
    }

    if (isCDL && (novoStatus === 'ganho' || novaEtapa === 4)) {
        const d = new Date();
        setCdlDataInicio(d.toISOString().substring(0, 10));
        const d2 = new Date(d); d2.setFullYear(d2.getFullYear() + 1);
        setCdlDataFim(d2.toISOString().substring(0, 10));
        setCdlValorAnuidade('');
        setCdlTipoAssociacao('Associado Simples');
        setCdlModoFechamento('filiacao');
        setCdlFiliacaoModal({ leadId: id });
        return;
    }

    if (novoStatus === 'perdido' || novaEtapa === 5) {
        setLostLeadId(id);
        setIsLostModalOpen(true);
        return;
    }

    let etapaFinal = novaEtapa;
    if (novoStatus === 'ganho') etapaFinal = 4;
    if (novoStatus === 'perdido') etapaFinal = 5;

    const stageName = (ACTIVE_STAGES as any)[etapaFinal]?.title || `Etapa ${etapaFinal}`;
    const novaAtividade: Atividade = { id: Date.now(), tipo: 'etapa', descricao: `Movido para ${stageName}`, created_at: new Date().toISOString() };
    const atividadesAtualizadas = [novaAtividade, ...(Array.isArray(lead?.atividades) ? lead.atividades : [])];

    setLeads(prev => prev.map(l => l.id === id ? { ...l, etapa: etapaFinal, status: novoStatus, atividades: atividadesAtualizadas } : l));
    if (editingLeadId === id) setAtividades(atividadesAtualizadas);

    try {
        const { error } = await supabase.from('leads').update({ etapa: etapaFinal, status: novoStatus, atividades: atividadesAtualizadas }).eq('id', id);
        if (error) throw error;
        
        if (novoStatus === 'ganho' && lead) {
            const acoes = isCDL
                ? [gerarCobrancaFinanceira(lead)]
                : [criarJobDeProducao(lead), gerarCobrancaFinanceira(lead)];
            await Promise.all(acoes);
            setToastMessage(isCDL ? "🎉 Novo Associado Confirmado!" : "🎉 Venda Confirmada!");
            setShowToast(true);
        }
    } catch (error: any) {
        if (error.message === 'Failed to fetch' || !navigator.onLine) {
            await localDb.syncQueue.add({ operacao: 'UPDATE', tabela: 'leads', dados: { id, etapa: etapaFinal, status: novoStatus }, data_criacao: new Date().toISOString() });
            setToastMessage("📶 Movido offline!"); 
            setShowToast(true);
        }
    }
  }, [leads, editingLeadId, fazerCheckin, criarJobDeProducao, gerarCobrancaFinanceira]);

  const confirmarPerda = useCallback(async () => {
    if (!motivoPerda.trim() || motivoPerda.length < 5) return alert("Por favor, detalhe o motivo da perda. Precisamos dessa informação para melhorar as vendas.");
    if (!lostLeadId) return;

    const lead = leads.find(l => l.id === lostLeadId);
    if (!lead) return;

    const novaNotaObj: Historico = { id: Date.now(), texto: `🔴 MOTIVO DA PERDA: ${motivoPerda}`, created_at: new Date().toISOString() };
    const novasNotas = [novaNotaObj, ...(Array.isArray(lead.notas) ? lead.notas : [])];

    setLeads(prev => prev.map(l => l.id === lostLeadId ? { ...l, etapa: 5, status: 'perdido', notas: novasNotas } : l));

    try {
        const { error } = await supabase.from('leads').update({ etapa: 5, status: 'perdido', notas: novasNotas }).eq('id', lostLeadId);
        if (error) throw error;
        setToastMessage("Lead arquivado na zona de perdidos."); 
        setShowToast(true);
    } catch (error: any) {
        if (error.message === 'Failed to fetch' || !navigator.onLine) {
            await localDb.syncQueue.add({ operacao: 'UPDATE', tabela: 'leads', dados: { id: lostLeadId, etapa: 5, status: 'perdido', notas: novasNotas }, data_criacao: new Date().toISOString() });
            setToastMessage("📶 Arquivado offline!"); 
            setShowToast(true);
        }
    }

    setIsLostModalOpen(false);
    setLostLeadId(null);
    setMotivoPerda('');
  }, [motivoPerda, lostLeadId, leads]);

  const confirmarFiliacaoCDL = useCallback(async () => {
    if (!cdlFiliacaoModal) return;
    const { leadId } = cdlFiliacaoModal;
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const valorFinal = parseFloat(cdlValorAnuidade.replace(',', '.')) || lead.valor_total || 0;
    const stageName = CDL_STAGES[4].title;
    const novaAtividade: Atividade = { id: Date.now(), tipo: 'etapa', descricao: `${stageName} — ${cdlTipoAssociacao}`, created_at: new Date().toISOString() };
    const atividadesAtualizadas = [novaAtividade, ...(Array.isArray(lead.atividades) ? lead.atividades : [])];

    setLeads(prev => prev.map(l => l.id === leadId ? {
        ...l, etapa: 4, status: 'ganho', tipo: cdlTipoAssociacao,
        contrato_inicio: cdlDataInicio, contrato_fim: cdlDataFim,
        valor_total: valorFinal, atividades: atividadesAtualizadas,
    } : l));

    await supabase.from('leads').update({
        etapa: 4, status: 'ganho', tipo: cdlTipoAssociacao,
        contrato_inicio: cdlDataInicio, contrato_fim: cdlDataFim,
        valor_total: valorFinal, atividades: atividadesAtualizadas,
    }).eq('id', leadId);

    await gerarCobrancaFinanceira({ ...lead, valor_total: valorFinal });

    setCdlFiliacaoModal(null);
    setCdlBemVindoData({ id: leadId, empresa: lead.empresa, telefone: lead.telefone || null });
    setToastMessage('🎉 Novo Associado Confirmado!');
    setShowToast(true);
  }, [cdlFiliacaoModal, leads, cdlTipoAssociacao, cdlValorAnuidade, cdlDataInicio, cdlDataFim, gerarCobrancaFinanceira]);

  const confirmarVendaSimplesCDL = useCallback(async () => {
    if (!cdlFiliacaoModal) return;
    const { leadId } = cdlFiliacaoModal;
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const novaAtividade: Atividade = { id: Date.now(), tipo: 'etapa', descricao: `${CDL_STAGES[4].title} — Venda/Serviço`, created_at: new Date().toISOString() };
    const atividadesAtualizadas = [novaAtividade, ...(Array.isArray(lead.atividades) ? lead.atividades : [])];

    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, etapa: 4, status: 'ganho', atividades: atividadesAtualizadas } : l));
    await supabase.from('leads').update({ etapa: 4, status: 'ganho', atividades: atividadesAtualizadas }).eq('id', leadId);

    setCdlFiliacaoModal(null);
    setToastMessage('✅ Venda fechada!');
    setShowToast(true);
  }, [cdlFiliacaoModal, leads]);

  const onDragEnd = useCallback(async (result: any) => {
    const { destination, draggableId } = result;
    
    if (!destination) return;
    
    if (destination.droppableId === result.source.droppableId && destination.index === result.source.index) {
        return;
    }
    
    const novaEtapa = parseInt(destination.droppableId); 
    const leadId = parseInt(draggableId);
    
    let novoStatus: string = 'aberto';
    
    if (novaEtapa === 4) {
        novoStatus = 'ganho'; 
    } else if (novaEtapa === 5) {
        novoStatus = 'perdido';
    } else { 
        const leadAtual = leads.find(l => l.id === leadId); 
        if (leadAtual && (leadAtual.status === 'ganho' || leadAtual.status === 'perdido')) {
            novoStatus = 'aberto'; 
        }
    }
    
    await mudarEtapa(leadId, novaEtapa, novoStatus);
  }, [leads, mudarEtapa]);

  const enviarWhatsapp = useCallback((e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    if (!lead.telefone) return alert("Cadastre o WhatsApp na edição!"); 
    
    let listaItens: ItemVenda[] = [];
    try {
        listaItens = Array.isArray(lead.itens) ? lead.itens : JSON.parse(lead.itens as any);
    } catch {
        listaItens = [];
    }
    
    let itensTexto = listaItens.length > 0 
        ? listaItens.map(i => `▪️ ${i.quantidade}x *${i.servico}* (R$ ${(i.quantidade * i.precoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`).join('%0A')
        : "▪️ Detalhes a combinar";
        
    const totalFormatado = lead.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const descontoFormatado = (lead.desconto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    const msgDesconto = lead.desconto && lead.desconto > 0 
        ? `🎁 *Desconto Especial:* - R$ ${descontoFormatado}%0A` 
        : "";

    const msg = `Olá *${lead.empresa}*! 🚀%0A%0AAqui é o ${perfil?.nome || 'Consultor'} da Demais FM.%0ASegue o resumo da nossa proposta (Ref: ${formatId(lead.id, 'LD')}):%0A--------------------------------%0A${itensTexto}%0A--------------------------------%0A${msgDesconto}%0A💰 *INVESTIMENTO FINAL: R$ ${totalFormatado}*%0A%0APodemos avançar com a aprovação?`;
    
    window.open(`https://wa.me/55${lead.telefone.replace(/\D/g, '')}?text=${msg}`, '_blank');

    if (lead.id < 1000000) {
      const notaWpp: Historico = {
        id: Date.now(),
        texto: `📱 WhatsApp enviado por ${perfil?.nome || 'Consultor'}`,
        created_at: new Date().toISOString(),
      };
      const novasNotas = [notaWpp, ...(Array.isArray(lead.notas) ? lead.notas : [])];
      supabase.from('leads').update({ notas: novasNotas }).eq('id', lead.id);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, notas: novasNotas } : l));
    }
  }, [perfil?.nome, supabase]);

  const imprimirProposta = useCallback(() => {
    const subtotal = itensTemporarios.reduce((acc, item) => acc + (item.precoUnitario * item.quantidade), 0);
    const total = Math.max(0, subtotal - desconto);
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    
    const janela = window.open('', '', 'width=800,height=600');
    if(!janela) return alert("Habilite popups no seu navegador!");
    
    janela.document.write(`
        <html>
            <head>
                <title>Proposta - ${novaEmpresa}</title>
                <style>
                    body { font-family: sans-serif; padding: 40px; color: #333; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px; }
                    .logo { font-size: 24px; font-weight: bold; font-style: italic; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th { text-align: left; border-bottom: 1px solid #ccc; padding: 10px; font-size: 12px; text-transform: uppercase; }
                    td { padding: 10px; border-bottom: 1px solid #eee; }
                    .total-box { text-align: right; font-size: 16px; margin-top: 5px; }
                    .total-final { text-align: right; font-size: 20px; font-weight: bold; margin-top: 10px; color: #22C55E; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">${(empresa?.nome || 'Proposta Comercial').toUpperCase()}</div>
                    <div>
                        Proposta Comercial<br>
                        ${dataHoje}
                    </div>
                </div>
                
                <h3>Cliente: ${novaEmpresa}</h3>
                
                <table>
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Qtd</th>
                            <th>Valor Unitário</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itensTemporarios.map(i => `
                            <tr>
                                <td>${i.servico}</td>
                                <td>${i.quantidade}</td>
                                <td>R$ ${i.precoUnitario.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                <td>R$ ${(i.quantidade * i.precoUnitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <div class="total-box">Subtotal: R$ ${subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                ${desconto > 0 ? `<div class="total-box" style="color: red;">Desconto: - R$ ${desconto.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>` : ''}
                <div class="total-final">INVESTIMENTO FINAL: R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
        </html>
    `);
    janela.document.close();
  }, [itensTemporarios, desconto, novaEmpresa, empresa]);

  const imprimirContrato = useCallback((e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    
    const unidadeData = unidades.find(u => u.nome === (lead.unidade || '')) || unidades[0];
    const dadosEmissora = {
      razao: unidadeData?.razao_social || '',
      endereco: unidadeData?.endereco || '',
      cnpj: unidadeData?.cnpj || '',
      cidade: unidadeData?.cidade || '',
      estado: unidadeData?.estado || '',
    };
    const localEmissora = dadosEmissora.cidade
      ? `, na cidade de ${dadosEmissora.cidade}${dadosEmissora.estado ? ` - Estado de ${nomeEstadoExtenso(dadosEmissora.estado)}` : ''}`
      : '';
    const timbradoUrl = timbradoPorUnidade(unidadeData?.nome || '');
    const ultimaNota = Array.isArray(lead.notas) && lead.notas.length > 0 ? lead.notas[0].texto : '';
    const qtdParcelasContrato = Math.max(1, parseInt(lead.parcelas || '1', 10) || 1);
    const vencimentosEfetivos = Array.isArray(lead.vencimentos_datas) && lead.vencimentos_datas.length === qtdParcelasContrato
      ? lead.vencimentos_datas
      : gerarVencimentosPadrao(lead.vencimento || '', lead.parcelas || '1');
    const formaPagamentoLabel = lead.forma_pagamento ? (FORMAS_PAGAMENTO[lead.forma_pagamento] || lead.forma_pagamento) : '';

    const janela = window.open('', '', 'width=900,height=800');
    if(!janela) return alert("Habilite popups no seu navegador!");

    let listaItens: ItemVenda[] = [];
    try {
        listaItens = Array.isArray(lead.itens) ? lead.itens : JSON.parse(lead.itens as any);
    } catch { }

    const itensHtml = listaItens.map(i => `
        <tr>
            <td style="padding: 5px; border: 1px solid #000; font-size: 9px;">${i.servico}${(i as any).bonificacao ? ' <span style="color:#b45309;font-size:8px;font-weight:bold;text-transform:uppercase;">(Bonificação)</span>' : ''}</td>
            <td style="padding: 5px; border: 1px solid #000; text-align: center; font-size: 9px;">${i.quantidade}</td>
            <td style="padding: 5px; border: 1px solid #000; text-align: right; font-size: 9px;">${(i as any).bonificacao ? '<span style="color:#b45309;font-weight:bold;">BONIFICAÇÃO</span>' : 'R$ ' + (i.quantidade * i.precoUnitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
        </tr>
    `).join('');
    const subtotalItens = listaItens.reduce((s, i) => (i as any).bonificacao ? s : s + i.quantidade * i.precoUnitario, 0);
    const linhasDesconto = (lead.desconto || 0) > 0 ? `
        <tr>
            <td style="padding: 5px; border: 1px solid #000; font-size: 9px; font-weight: bold;">Subtotal</td>
            <td style="padding: 5px; border: 1px solid #000;"></td>
            <td style="padding: 5px; border: 1px solid #000; text-align: right; font-size: 9px;">R$ ${subtotalItens.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
        </tr>
        <tr>
            <td style="padding: 5px; border: 1px solid #000; font-size: 9px; font-weight: bold;">Desconto</td>
            <td style="padding: 5px; border: 1px solid #000;"></td>
            <td style="padding: 5px; border: 1px solid #000; text-align: right; font-size: 9px; color: #cc0000;">- R$ ${(lead.desconto || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
        </tr>
    ` : '';

    const htmlContrato = isCDL ? `
        <html>
            <head>
                <title>Ficha de Filiação - ${lead.empresa}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; color: #000; line-height: 1.5; font-size: 12px; }
                    .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #000; padding-bottom: 16px; }
                    .header-logo { font-size: 28px; font-weight: 900; letter-spacing: -1px; font-style: italic; }
                    .header-sub { font-size: 11px; text-transform: uppercase; letter-spacing: 3px; margin-top: 2px; color: #444; }
                    .header h2 { font-size: 16px; font-weight: bold; margin: 10px 0 0; text-transform: uppercase; }
                    .texto-base { text-align: justify; margin-bottom: 20px; line-height: 1.6; }
                    .cliente-box { margin-bottom: 20px; line-height: 1.8; }
                    .secao-titulo { font-weight: bold; margin-top: 25px; margin-bottom: 10px; font-size: 13px; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                    th { background-color: #f0f0f0; font-size: 11px; text-align: center; border: 1px solid #000; padding: 8px; }
                    .condicoes { font-size: 11px; margin-bottom: 20px; }
                    .condicoes p { margin: 4px 0; }
                    .assinaturas { margin-top: 80px; display: flex; justify-content: space-between; text-align: center; font-weight: bold; }
                    .assinaturas div { width: 40%; border-top: 1px solid #000; padding-top: 5px; }
                    .protocolo { background: #f9f9f9; border: 1px solid #ddd; padding: 8px 16px; display: inline-block; margin-top: 8px; font-size: 11px; }
                    @media print { .btn-fechar { display: none !important; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-logo">${CDL.nome}</div>
                    <div class="header-sub">${CDL.nomeCompleto} do ${CDL.regiao}</div>
                    <h2>Ficha de Filiação — ${lead.tipo || 'Associado'}</h2>
                    <div class="protocolo">Protocolo: #${String(lead.id).padStart(6, '0')}</div>
                </div>

                <div class="texto-base">
                    Pelo presente instrumento, a empresa abaixo qualificada solicita sua filiação à <strong>${CDL.nomeCompleto} — ${CDL.nome}</strong>, CNPJ: ${dadosEmissora.cnpj || ''}, com sede à ${dadosEmissora.endereco || ''}, comprometendo-se a cumprir o Estatuto Social e as deliberações da entidade.
                </div>

                <div class="secao-titulo">1. DADOS DO ASSOCIADO</div>
                <div class="cliente-box">
                    <strong>Razão Social / Nome Fantasia:</strong> ${lead.empresa.toUpperCase()}<br/>
                    <div style="display: flex; gap: 40px;">
                        <div><strong>${rotuloDocumento(lead.cnpj || '')}:</strong> ${lead.cnpj || ''}</div>
                        <div><strong>Inscrição Estadual:</strong> ${lead.inscricao_estadual || ''}</div>
                    </div>
                    <div style="display: flex; gap: 40px;">
                        <div><strong>Telefone / WhatsApp:</strong> ${lead.telefone || ''}</div>
                        <div><strong>Município:</strong> ${lead.cidade || ''}</div>
                    </div>
                </div>

                <div class="secao-titulo">2. PLANO E VIGÊNCIA</div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-weight: bold; font-size: 11px; text-transform: uppercase;">
                    <div>INÍCIO: ${formatarData(lead.contrato_inicio || '')}</div>
                    <div>VENCIMENTO: ${formatarData(lead.contrato_fim || '')}</div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:left;">PLANO / BENEFÍCIOS</th>
                            <th>TIPO</th>
                            <th>VALOR ANUAL R$</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #000; font-size: 11px;">Anuidade CDL — Acesso a todos os benefícios da associação</td>
                            <td style="padding: 8px; border: 1px solid #000; text-align: center; font-size: 11px;">${lead.tipo || 'Associado'}</td>
                            <td style="padding: 8px; border: 1px solid #000; text-align: right; font-size: 11px;">R$ ${lead.valor_total?.toLocaleString('pt-BR', {minimumFractionDigits: 2}) || '—'}</td>
                        </tr>
                        <tr>
                            <td colspan="2" style="font-weight: bold; text-align: right; border: 1px solid #000; padding: 8px;">TOTAL</td>
                            <td style="font-weight: bold; text-align: right; border: 1px solid #000; padding: 8px;">R$ ${lead.valor_total?.toLocaleString('pt-BR', {minimumFractionDigits: 2}) || '—'}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="secao-titulo">3. CONDIÇÕES DE FILIAÇÃO</div>
                <div class="condicoes">
                    <p>1) A filiação é válida pelo período indicado acima, renovável anualmente mediante pagamento da anuidade;</p>
                    <p>2) O associado compromete-se a cumprir o Estatuto Social e as deliberações da ${CDL.nome};</p>
                    <p>3) A anuidade paga fora do prazo incidirá em juros de mora de 1% ao mês e multa de 2%;</p>
                    <p>4) A não renovação da anuidade até 30 dias após o vencimento implica na suspensão automática dos benefícios;</p>
                    <p>5) Fica eleito o Foro da Comarca de Taió para dirimir eventuais controvérsias oriundas deste instrumento.</p>
                </div>

                <div class="secao-titulo">4. FORMA DE PAGAMENTO</div>
                <div class="cliente-box">
                    <strong>Parcela(s):</strong> ${lead.parcelas || ''}<br/>
                    <strong>Vencimento(s):</strong> ${vencimentosEfetivos.length ? formatarVencimentosArray(vencimentosEfetivos) : ''}<br/>
                    ${lead.valor_total ? `<strong>Valor da Parcela:</strong> R$ ${(lead.valor_total / qtdParcelasContrato).toLocaleString('pt-BR', {minimumFractionDigits: 2})}<br/>` : ''}
                    <strong>Forma de Pagamento:</strong> ${formaPagamentoLabel || ''}<br/><br/>
                    <strong>Contato para envio da cobrança (WhatsApp):</strong> ${lead.telefone || ''}<br/>
                </div>

                <div class="assinaturas">
                    <div>Assinatura do Associado</div>
                    <div>Representante da ${CDL.nome}</div>
                </div>

                <button onclick="window.close()" style="position:fixed;bottom:24px;right:24px;background:#e11d48;color:#fff;border:none;border-radius:50px;padding:14px 28px;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:9999;letter-spacing:1px;" class="btn-fechar">✕ FECHAR</button>
                <script>window.onload = function() { window.print(); }</script>
            </body>
        </html>
    ` : `
        <html>
            <head>
                <title>Contrato - ${lead.empresa}</title>
                <style>
                    @page { size: A4; margin: 10mm; }
                    body { font-family: Arial, sans-serif; padding: 14px; color: #000; line-height: 1.3; font-size: 10.5px; }
                    .header { text-align: center; margin-bottom: 10px; }
                    .header img { max-height: 50px; margin-bottom: 5px; }
                    .header h2 { font-size: 16px; font-weight: bold; margin: 5px 0; text-transform: uppercase; }
                    .texto-base { text-align: justify; margin-bottom: 8px; line-height: 1.35; font-size: 9.5px; }
                    .cliente-box { margin-bottom: 8px; line-height: 1.45; font-size: 9.5px; }
                    .secao-titulo { font-weight: bold; margin-top: 8px; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
                    th { background-color: #f0f0f0; font-size: 9px; text-align: center; border: 1px solid #000; padding: 4px; }
                    .condicoes { font-size: 9.5px; margin-bottom: 7px; }
                    .condicoes p { margin: 1.5px 0; }
                    .assinaturas { margin-top: 16px; display: flex; justify-content: space-between; text-align: center; font-weight: bold; font-size: 9.5px; }
                    .assinaturas div { width: 40%; border-top: 1px solid #000; padding-top: 4px; }
                    .timbrado-bg { position: absolute; top: 0; left: 0; width: 100%; height: 180mm; z-index: -1; object-fit: cover; object-position: top; }
                    .pagina-tabela { page-break-inside: auto; }
                    .rodape-fixo { text-align: center; font-size: 8px; color: #999; padding-top: 6px; }
                    @media print {
                        .btn-fechar { display: none !important; }
                        html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                ${timbradoUrl ? `<img class="timbrado-bg" src="${timbradoUrl}" alt="" onerror="this.style.display='none'" />` : ''}
                <table class="pagina-tabela" style="width: 100%; border-collapse: collapse;">
                <tbody><tr><td>
                <div class="header" ${timbradoUrl ? 'style="margin-top: 130px;"' : ''}>
                    ${timbradoUrl ? '' : `<img src="/logo-demais.png" alt="Logo da Rádio" onerror="this.style.display='none'" />`}
                    <h2>Contrato para Veiculação de Publicidade</h2>
                </div>

                <div class="texto-base">
                    Que entre si fazem de um lado a empresa <strong>${dadosEmissora.razao}</strong>, emissora de radiodifusão com sede à ${dadosEmissora.endereco}${localEmissora}, CNPJ: ${dadosEmissora.cnpj}, neste ato representada denominada de EXECUTANTE, e de outro lado o CLIENTE:
                </div>

                <div class="cliente-box">
                    <strong>CLIENTE:</strong> <br/>
                    <strong>Razão Social:</strong> ${lead.empresa.toUpperCase()}<br/>
                    <strong>Nome Fantasia:</strong> ${lead.empresa.toUpperCase()}<br/>
                    <div style="display: flex; gap: 40px;">
                        <div><strong>${rotuloDocumento(lead.cnpj || '')}:</strong> ${lead.cnpj || ''}</div>
                        <div><strong>Inscrição Estadual:</strong> ${lead.inscricao_estadual || ''}</div>
                    </div>
                    <div><strong>Endereço:</strong> ${lead.endereco || ''}</div>
                    <div style="display: flex; gap: 40px;">
                        <div><strong>Fone:</strong> ${lead.telefone || ''}</div>
                        <div><strong>Município:</strong> ${lead.cidade || ''}</div>
                    </div>
                </div>

                <div class="texto-base">
                    Visando a veiculação e divulgação da publicidade do CLIENTE acima, por meio da emissora de FM da EXECUTANTE, tudo conforme as condições a seguir indicadas.
                </div>

                <div class="secao-titulo">1. VEICULAÇÃO/CUSTO DA PUBLICIDADE</div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-weight: bold; font-size: 9px; text-transform: uppercase;">
                    <div>INÍCIO DO CONTRATO: ${formatarData(lead.contrato_inicio || '')}</div>
                    <div>TÉRMINO DO CONTRATO: ${formatarData(lead.contrato_fim || '')}</div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>PROGRAMAÇÃO</th>
                            <th>QUANT.</th>
                            <th>VALOR R$</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itensHtml}
                        ${linhasDesconto}
                        <tr>
                            <td colspan="2" style="font-weight: bold; text-align: right; border: 1px solid #000; padding: 5px; font-size: 9px;">TOTAL</td>
                            <td style="font-weight: bold; text-align: right; border: 1px solid #000; padding: 5px; font-size: 9px;">R$ ${lead.valor_total?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                        </tr>
                    </tbody>
                </table>

                ${ultimaNota ? `
                <div class="secao-titulo">2. OBSERVAÇÕES</div>
                <div class="condicoes">
                    <p>${ultimaNota}</p>
                </div>
                ` : ''}

                <div class="secao-titulo">${ultimaNota ? 3 : 2}. OUTRAS CONDIÇÕES</div>
                <div class="condicoes">
                    <p>1) O presente contrato tem caráter irrevogável;</p>
                    <p>2) As inserções objeto do presente contrato são intransferíveis;</p>
                    <p>3) As parcelas pagas fora do prazo de seus vencimentos incidirão em juros e mora estabelecidos na fatura;</p>
                    <p>4) O presente contrato somente poderá ser rescindido 30 (trinta) dias após sua contratação;</p>
                    <p>5) Caso o cliente solicite a rescisão antecipada do contrato (antes do término da vigência total acordada), esta só produzirá efeitos ao final do ciclo mensal de veiculação em andamento, considerando-se ciclos de 30 (trinta) dias corridos contados a partir do início do contrato. Cancelamentos não terão efeito imediato e não serão proporcionais.</p>
                    <p>6) Fica eleito o Fórum da Cidade de ${dadosEmissora.cidade || 'Taió'} para dirimir dúvidas ou questões oriundas do presente, bem como para ser ajuizada ação de cobrança;</p>
                    <p>7) As partes reconhecem e aceitam, para todos os fins de direito, a validade jurídica da assinatura eletrônica utilizada na celebração deste contrato, nos termos do art. 10, §2º, da Medida Provisória nº 2.200-2/2001, dispensando a necessidade de certificado digital no padrão ICP-Brasil. A autenticidade e integridade das assinaturas são atestadas pelo registro de auditoria (endereço IP, data, hora e e-mail de cada signatário) gerado pela plataforma de assinatura eletrônica utilizada, o qual constitui parte integrante e inseparável deste instrumento.</p>
                </div>

                <div class="secao-titulo">${ultimaNota ? 4 : 3}. FORMA DE PAGAMENTO</div>
                <div class="cliente-box">
                    <strong>Parcela(s):</strong> ${lead.parcelas || ''}<br/>
                    <strong>Vencimento(s):</strong> ${vencimentosEfetivos.length ? formatarVencimentosArray(vencimentosEfetivos) : ''}<br/>
                    ${lead.valor_total ? `<strong>Valor da Parcela:</strong> R$ ${(lead.valor_total / qtdParcelasContrato).toLocaleString('pt-BR', {minimumFractionDigits: 2})}<br/>` : ''}
                    <strong>Forma de Pagamento:</strong> ${formaPagamentoLabel || ''}<br/><br/>
                    <strong>Contato para envio da Fatura — WhatsApp / E-mail:</strong> ${lead.telefone || ''}<br/>
                    <strong>Praça de Pagamento:</strong> ${lead.cidade || ''}
                </div>

                <div class="assinaturas">
                    <div>Assinatura do Cliente</div>
                    <div>Representante da ${unidadeData?.nome || 'Demais FM'}</div>
                </div>
                </td></tr></tbody>
                <tfoot><tr><td class="rodape-fixo">
                    ${dadosEmissora.razao} &middot; CNPJ ${dadosEmissora.cnpj} &middot; Gerado em ${new Date().toLocaleDateString('pt-BR')}
                </td></tr></tfoot>
                </table>

                <button onclick="window.close()" style="position:fixed;bottom:24px;right:24px;background:#e11d48;color:#fff;border:none;border-radius:50px;padding:14px 28px;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:9999;letter-spacing:1px;" class="btn-fechar">✕ FECHAR</button>
                <script>window.onload = function() { window.print(); }</script>
            </body>
        </html>
    `;

    janela.document.write(htmlContrato);
    janela.document.close();
  }, [isCDL, unidades]);

  const enviarParaDocuseal = useCallback(async () => {
    if (!docuSignerName.trim()) { setDocuErro('Informe o nome do signatário.'); return; }
    if (!docuSignerEmail.trim() && !docuSignerPhone.trim()) { setDocuErro('Informe e-mail ou telefone do signatário.'); return; }

    // O consultor que assina primeiro é o vendedor responsável pelo lead — não quem
    // está logado no momento do envio (pode ser um admin enviando em nome de outro).
    const leadAtual = leads.find(l => l.id === editingLeadId);
    const consultorId = leadAtual?.user_id;
    const consultorNome = (consultorId && usersMap[consultorId]) || leadAtual?.vendedor_nome || perfil?.nome || 'Consultor';
    const consultorEmail = (consultorId && usersEmailMap[consultorId]) || user?.email;

    if (!consultorEmail) { setDocuErro('O vendedor responsável por este lead não tem e-mail cadastrado — fale com o admin. Ele (consultor) precisa assinar primeiro que o cliente.'); return; }
    setDocuSending(true); setDocuErro(''); setDocuLink(null); setDocuConsultorLink(null); setDocuConsultorAssinou(false);

    const subtotal = itensTemporarios.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);
    const total = Math.max(0, subtotal - desconto);
    const notasLead = leadAtual?.notas;
    const ultimaNota = Array.isArray(notasLead) && notasLead.length > 0 ? notasLead[0].texto : '';

    const res = await fetch('/api/docuseal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: perfil?.empresa_id,
        signers: [{ name: docuSignerName.trim(), email: docuSignerEmail.trim() || undefined, phone: docuSignerPhone.trim() || undefined }],
        consultor: { nome: consultorNome, email: consultorEmail },
        deal: {
          id: editingLeadId,
          empresa: novaEmpresa,
          cnpj: novoCnpj,
          endereco: novoEndereco,
          inscricao_estadual: novoIE,
          telefone: novoTelefone,
          cidade: novaCidade,
          unidade: novaUnidade,
          contrato_inicio: contratoInicio,
          contrato_fim: contratoFim,
          itens: itensTemporarios,
          desconto,
          valor_total: total,
          parcelas,
          vencimento,
          vencimentos_datas: vencimentosDatas,
          forma_pagamento: formaPagamento,
          observacao: ultimaNota,
        },
      }),
    });
    let j: any = {};
    try { j = await res.json(); } catch { j = {}; }
    if (!res.ok) { setDocuErro(j.erro || `Erro ${res.status} ao enviar para Docuseal.`); }
    else if (!j.consultor_sign_url) { setDocuErro('Docuseal não retornou link de assinatura do consultor.'); }
    else {
      setDocuConsultorLink(j.consultor_sign_url);
      setDocuLink(j.sign_url);
      if (editingLeadId) {
        await supabase.from('leads').update({
          docuseal_submission_id: j.submission_id,
          docuseal_sign_url: j.sign_url,
          docuseal_consultor_sign_url: j.consultor_sign_url,
          docuseal_consultor_assinado: false,
        }).eq('id', editingLeadId);
        await fetchData();
      }
    }
    setDocuSending(false);
  }, [docuSignerName, docuSignerEmail, docuSignerPhone, perfil?.empresa_id, perfil?.nome, user?.email, usersMap, usersEmailMap, novaEmpresa, novoCnpj, novoEndereco, novoIE, novoTelefone, novaCidade, novaUnidade, contratoInicio, contratoFim, itensTemporarios, desconto, parcelas, vencimento, vencimentosDatas, formaPagamento, editingLeadId, leads, supabase, fetchData]);

  // Precisa persistir — senão fechar o modal antes de mandar o link pro cliente faz o
  // progresso "consultor já assinou" sumir e a tela volta pro formulário inicial.
  const confirmarConsultorAssinou = useCallback(async () => {
    setDocuConsultorAssinou(true);
    if (editingLeadId) {
      await supabase.from('leads').update({ docuseal_consultor_assinado: true }).eq('id', editingLeadId);
      await fetchData();
    }
  }, [editingLeadId, supabase, fetchData]);

  const reenviarDocuseal = useCallback(async () => {
    setDocuLink(null); setDocuConsultorLink(null); setDocuConsultorAssinou(false);
    if (editingLeadId) {
      await supabase.from('leads').update({
        docuseal_submission_id: null, docuseal_sign_url: null,
        docuseal_consultor_sign_url: null, docuseal_consultor_assinado: false,
      }).eq('id', editingLeadId);
      await fetchData();
    }
  }, [editingLeadId, supabase, fetchData]);

  const enviarContratoManual = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite selecionar os mesmos arquivos de novo depois
    if (files.length === 0 || !editingLeadId) return;
    setUploadManualEnviando(true);
    setUploadManualErro('');
    try {
      const arquivosExistentes = leads.find(l => l.id === editingLeadId)?.contrato_manual_arquivos || [];
      const novosArquivos: { nome: string; path: string }[] = [];

      for (const file of files) {
        const ext = file.name.split('.').pop() || 'pdf';
        const path = `${editingLeadId}/manual/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('contratos-assinados').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
        if (upErr) throw upErr;
        novosArquivos.push({ nome: file.name, path });
      }

      const todosArquivos = [...arquivosExistentes, ...novosArquivos];

      // O bucket é privado — guarda só o caminho; a URL de visualização é assinada na hora do clique
      const agora = new Date().toISOString();
      await supabase.from('leads').update({
        contrato_manual_url: todosArquivos[0].path,
        contrato_manual_em: agora,
        contrato_manual_arquivos: todosArquivos,
      }).eq('id', editingLeadId);

      // Libera o(s) job(s) direto pra 'entregue' — a OPEC puxa os dados via API assim que o
      // contrato for confirmado assinado, sem etapa manual no Kanban interno de produção.
      const leadRef = formatId(editingLeadId, 'LD');
      const { data: jobs } = await supabase.from('jobs').select('id').ilike('briefing', `%${leadRef}%`).eq('stage', 'aguardando_assinatura');
      if (jobs && jobs.length > 0) {
        await supabase.from('jobs').update({ stage: 'entregue' }).in('id', jobs.map((j: any) => j.id));
      }

      await fetchData();
      setToastMessage('📄 Contrato assinado anexado — produção liberada!');
      setShowToast(true);
      setShowUploadManual(false);
    } catch (err: any) {
      setUploadManualErro(err?.message || 'Erro ao enviar o PDF. Tente novamente.');
    } finally {
      setUploadManualEnviando(false);
    }
  }, [editingLeadId, leads, supabase, fetchData]);

  // Bucket "contratos-assinados" é privado — gera um link assinado (temporário) na hora do clique
  const abrirArquivoAssinado = useCallback(async (path: string) => {
    const { data, error } = await supabase.storage.from('contratos-assinados').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    else { setToastMessage('❌ Erro ao abrir o arquivo.'); setShowToast(true); console.error(error); }
  }, [supabase]);

  const abrirEmailModal = useCallback((lead: Lead) => {
    setEmailLead(lead);
    setEmailDestino('');
    setEmailResult('idle');
    setIsEmailModalOpen(true);
  }, []);

  const enviarEmailProposta = useCallback(async () => {
    if (!emailLead || !emailDestino) return;
    setEmailSending(true);
    setEmailResult('idle');
    try {
      const res = await fetch('/api/email/proposta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailDestino,
          empresa: emailLead.empresa,
          itens: emailLead.itens,
          valor_total: emailLead.valor_total,
          desconto: emailLead.desconto || 0,
          vendedor_nome: perfil?.nome || '',
          referencia: `LD-${String(emailLead.id).padStart(4, '0')}`,
          reply_to: user?.email || undefined,
        }),
      });
      if (res.ok) {
        setEmailResult('ok');
        if (emailLead.id < 1000000) {
          const notaEmail: Historico = {
            id: Date.now(),
            texto: `📧 Proposta enviada por e-mail para ${emailDestino} por ${perfil?.nome || 'Consultor'}`,
            created_at: new Date().toISOString(),
          };
          const novasNotas = [notaEmail, ...(Array.isArray(emailLead.notas) ? emailLead.notas : [])];
          supabase.from('leads').update({ notas: novasNotas }).eq('id', emailLead.id);
          setLeads(prev => prev.map(l => l.id === emailLead.id ? { ...l, notas: novasNotas } : l));
        }
        setTimeout(() => setIsEmailModalOpen(false), 1800);
      } else {
        setEmailResult('error');
      }
    } catch {
      setEmailResult('error');
    } finally {
      setEmailSending(false);
    }
  }, [emailLead, emailDestino, perfil?.nome, supabase]);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      if(!confirm(isCDL ? "Tem certeza que deseja excluir este prospecto?" : "Tem certeza que deseja excluir esta oportunidade?")) return;
      
      if (id > 1000000) {
          setLeads(prev => prev.filter(l => l.id !== id));
          if (isModalOpen) setIsModalOpen(false);
          return;
      }

      try {
          const { error } = await supabase.from('leads').delete().eq('id', id);
          if (error) throw error;
          
          setLeads(prev => prev.filter(l => l.id !== id));
          if (isModalOpen) setIsModalOpen(false);
      } catch(error: any) {
          if (error.message === 'Failed to fetch' || !navigator.onLine) {
              alert("⚠️ Você está sem internet. Não é possível deletar leads no modo offline.");
          }
      }
  }, [isModalOpen]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      if (!navigator.onLine) {
          alert("⚠️ Você precisa de internet para enviar arquivos.");
          return;
      }

      setUploading(true);
      const file = e.target.files[0];
      const fileName = `${Date.now()}.${file.name.split('.').pop()}`;

      const { data, error } = await supabase.storage.from('contratos').upload(fileName, file);

      if(data) {
         const { data: urlData } = supabase.storage.from('contratos').getPublicUrl(fileName);
         setFotoUrl(urlData.publicUrl);
         
         if(editingLeadId && editingLeadId < 1000000) {
             await supabase.from('leads').update({ foto_url: urlData.publicUrl }).eq('id', editingLeadId);
             setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, foto_url: urlData.publicUrl } : l));
         }
      }
      setUploading(false);
  };

  const adicionarNota = async () => {
      if(!novaNota || !editingLeadId) return;

      if (editingLeadId > 1000000) {
          alert("⚠️ Este Lead foi criado offline e ainda não sincronizou. Aguarde a internet voltar para adicionar notas.");
          return;
      }

      const novaNotaObj: Historico = {
          id: Date.now(),
          texto: novaNota,
          created_at: new Date().toISOString()
      };

      const novasNotas = [novaNotaObj, ...historico];
      setHistorico(novasNotas);

      const novaAtividade: Atividade = { id: Date.now() + 1, tipo: 'nota', descricao: novaNota, created_at: new Date().toISOString() };
      const novasAtividades = [novaAtividade, ...atividades];
      setAtividades(novasAtividades);
      setNovaNota('');

      setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, notas: novasNotas, atividades: novasAtividades } : l));

      if (navigator.onLine) {
          await supabase.from('leads').update({ notas: novasNotas, atividades: novasAtividades }).eq('id', editingLeadId);
      } else {
          await localDb.syncQueue.add({
              operacao: 'UPDATE', tabela: 'leads', dados: { id: editingLeadId, notas: novasNotas, atividades: novasAtividades }, data_criacao: new Date().toISOString()
          });
      }
  };

  const removerNota = async (notaId: number) => {
      if (!editingLeadId) return;

      const novasNotas = historico.filter(h => h.id !== notaId);
      setHistorico(novasNotas);
      setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, notas: novasNotas } : l));

      if (navigator.onLine) {
          await supabase.from('leads').update({ notas: novasNotas }).eq('id', editingLeadId);
      } else {
          await localDb.syncQueue.add({
              operacao: 'UPDATE', tabela: 'leads', dados: { id: editingLeadId, notas: novasNotas }, data_criacao: new Date().toISOString()
          });
      }
  };

  const salvarLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return alert("Você precisa estar logado para salvar um lead!");
    if (leadTravado) return alert("🔒 Contrato assinado — edição bloqueada. Somente um diretor pode ajustar.");

    setLoading(true);
    let finalClientId = selectedClientId;

    if (!finalClientId && novaEmpresa) {
        try {
            const { data: novoCliente, error: errCli } = await supabase
                .from('clientes')
                .insert([{
                    nome_empresa: novaEmpresa,
                    cnpj: novoCnpj || null,
                    inscricao_estadual: novoIE || null,
                    telefone: novoTelefone || null,
                    cidade: novaCidade || null,
                    endereco: novoEndereco || null,
                    status: 'ativo',
                    status_risco: 'em_analise',
                    empresa_id: perfil?.empresa_id
                }])
                .select('id, status_risco')
                .single();

            if (errCli) throw errCli;

            if (novoCliente) {
                finalClientId = novoCliente.id;
                setClientesOpcoes(prev => [...prev, {
                    id: novoCliente.id,
                    nome_empresa: novaEmpresa,
                    telefone: novoTelefone,
                    cnpj: novoCnpj,
                    inscricao_estadual: novoIE,
                    cidade: novaCidade,
                    endereco: novoEndereco,
                    status_risco: novoCliente.status_risco
                }]);
                setToastMessage("✨ Novo cliente cadastrado automaticamente!");
                setShowToast(true);
            }
        } catch (e) {
            console.error("Erro ao auto-cadastrar cliente", e);
            setLoading(false);
            return alert("Erro ao criar o cliente novo na base.");
        }
    }

    const subtotal = itensTemporarios.reduce((acc, item) => !item.bonificacao ? acc + (item.precoUnitario * item.quantidade) : acc, 0);
    const calculado = Math.max(0, subtotal - desconto);
    const valorTotalFinal = valorTotalOverride !== null ? valorTotalOverride : calculado;
    const percDesconto = subtotal > 0 ? (desconto / subtotal) * 100 : 0;

    let novoStatusAprovacao = leads.find(l => l.id === editingLeadId)?.status_aprovacao || null;

    if (!isLideranca) {
        if (percDesconto > LIMITE_DESCONTO_MAXIMO) novoStatusAprovacao = 'pendente';
        else novoStatusAprovacao = null;
    } else {
        if (percDesconto > LIMITE_DESCONTO_MAXIMO) novoStatusAprovacao = 'aprovado';
        else novoStatusAprovacao = null;
    }

    let atividadesPayload = [...atividades];
    if (editingLeadId && followupEm) {
        const leadAtual = leads.find(l => l.id === editingLeadId);
        if (leadAtual?.followup_em !== followupEm) {
            atividadesPayload = [{ id: Date.now(), tipo: 'followup', descricao: `Follow-up agendado para ${followupEm.split('-').reverse().join('/')}`, created_at: new Date().toISOString() }, ...atividadesPayload];
        }
    }

    const payload = {
        empresa: novaEmpresa,
        telefone: novoTelefone,
        unidade: novaUnidade,
        cidade: novaCidade,
        descricao: novaDescricao,
        notas: historico,
        atividades: atividadesPayload,
        tipo: tipoCliente,
        valor_total: valorTotalFinal,
        desconto: desconto,
        itens: itensTemporarios,
        foto_url: fotoUrl,
        contrato_inicio: contratoInicio || null,
        contrato_fim: contratoFim || null,
        followup_em: followupEm || null,
        cnpj: novoCnpj,
        endereco: novoEndereco || null,
        inscricao_estadual: novoIE || null,
        parcelas: parcelas,
        vencimento: vencimento || null,
        vencimentos_datas: vencimentosDatas.length ? vencimentosDatas : null,
        forma_pagamento: formaPagamento || null,
        status_aprovacao: novoStatusAprovacao,
        user_id: (isLideranca || isOpec) ? (leadUserId || null) : user.id,
        ...(editingLeadId ? {} : { status: 'aberto', etapa: 0, ordem: 0, criado_por: user.id }),
        client_id: finalClientId,
        empresa_id: perfil?.empresa_id
    };

    if (editingLeadId) {
        try {
            if (editingLeadId > 1000000) throw new Error('Failed to fetch');

            const { error } = await supabase.from('leads').update(payload).eq('id', editingLeadId);
            if (error) throw error; 
            
            setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, ...payload } as Lead : l));
            setIsModalOpen(false);
            setToastMessage("Lead atualizado e distribuído!");
            setShowToast(true);
            fetchData();
        } catch (error: any) {
            if (error.message === 'Failed to fetch' || !navigator.onLine) {
                await localDb.syncQueue.add({
                    operacao: 'UPDATE', tabela: 'leads', dados: { id: editingLeadId, ...payload }, data_criacao: new Date().toISOString()
                });
                setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, ...payload } as Lead : l));
                setIsModalOpen(false);
                setToastMessage("📶 Sem rede. Alteração salva no telemóvel/computador!");
                setShowToast(true);
            }
        }
    } else {
        try {
            const { data, error } = await supabase.from('leads').insert([payload]).select();
            if (error) throw error; 
            
            if (data) {
                setLeads(prev => [data[0] as Lead, ...prev]);
                setIsModalOpen(false);
                setToastMessage("Lead criado com sucesso! 🚀");
                setShowToast(true);
                fetchData();
            }
        } catch (error: any) {
             if (error.message === 'Failed to fetch' || !navigator.onLine) {
                const tempId = Date.now(); 
                const leadOffline = { ...payload, id: tempId, created_at: new Date().toISOString() };
                
                await localDb.syncQueue.add({
                    operacao: 'INSERT', tabela: 'leads', dados: leadOffline, data_criacao: new Date().toISOString()
                });
                setLeads(prev => [leadOffline as Lead, ...prev]);
                setIsModalOpen(false);
                setToastMessage("📶 Sem rede. Lead guardado no cofre!");
                setShowToast(true);
            }
        }
    }
  };

  const handleAprovacao = async (id: number, decisao: 'aprovado' | 'recusado') => {
      await supabase.from('leads').update({ status_aprovacao: decisao }).eq('id', id);
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status_aprovacao: decisao } : l));
      setIsModalOpen(false);
      setToastMessage(decisao === 'aprovado' ? "✅ Desconto Aprovado!" : "❌ Desconto Recusado!");
      setShowToast(true);
  };

  const abrirModal = useCallback((lead?: Lead) => {
    setShowClientDropdown(false);
    setCategoriaSelecionada(null); 
    
    if (lead) {
        setEditingLeadId(lead.id);
        setNovaEmpresa(lead.empresa);
        setNovoTelefone(lead.telefone || '');
        setNovaUnidade(lead.unidade || '');
        setNovaCidade(lead.cidade || '');
        setNovaDescricao(lead.descricao || '');
        setSelectedClientId(lead.client_id || null);
        setItensTemporarios(Array.isArray(lead.itens) ? lead.itens : []);
        setFotoUrl(lead.foto_url || '');
        setContratoInicio(lead.contrato_inicio || '');
        setContratoFim(lead.contrato_fim || '');
        setFollowupEm(lead.followup_em || '');
        setNovoCnpj(lead.cnpj || '');
        setNovoEndereco(lead.endereco || '');
        setNovoIE(lead.inscricao_estadual || '');
        setParcelas(lead.parcelas || '1');
        setVencimento(lead.vencimento || '');
        setFormaPagamento(lead.forma_pagamento || '');
        {
            const qtd = Math.max(1, parseInt(lead.parcelas || '1', 10) || 1);
            setVencimentosDatas(
                Array.isArray(lead.vencimentos_datas) && lead.vencimentos_datas.length === qtd
                    ? lead.vencimentos_datas
                    : gerarVencimentosPadrao(lead.vencimento || '', lead.parcelas || '1')
            );
        }
        setDesconto(lead.desconto || 0);
        setValorTotalOverride(null);
        setHistorico(Array.isArray(lead.notas) ? lead.notas : []);
        setAtividades(Array.isArray(lead.atividades) ? lead.atividades : []);
        setLeadUserId(lead.user_id || '');
        setMostrarDetalhes(!!(lead.cnpj || lead.contrato_inicio || lead.parcelas !== '1'));

        // O lead guarda uma cópia dos dados do cliente (telefone/CNPJ/endereço/etc) tirada
        // no momento em que foi criado ou salvo pela última vez. Se o cadastro do cliente foi
        // editado depois na tela de Clientes, essa cópia fica desatualizada — busca o registro
        // atual do cliente vinculado e sobrescreve o formulário com os dados mais recentes.
        if (lead.client_id) {
            supabase.from('clientes')
                .select('telefone, cnpj, inscricao_estadual, endereco, cidade')
                .eq('id', lead.client_id)
                .single()
                .then(({ data: clienteAtual }) => {
                    if (!clienteAtual) return;
                    if (clienteAtual.telefone) setNovoTelefone(clienteAtual.telefone);
                    if (clienteAtual.cnpj) setNovoCnpj(clienteAtual.cnpj);
                    if (clienteAtual.inscricao_estadual) setNovoIE(clienteAtual.inscricao_estadual);
                    if (clienteAtual.endereco) setNovoEndereco(clienteAtual.endereco);
                    if (clienteAtual.cidade) setNovaCidade(clienteAtual.cidade);
                });
        }
    } else {
        setEditingLeadId(null);
        setNovaEmpresa('');
        setNovoTelefone('');
        setNovaUnidade(perfil?.unidade || '');
        setNovaCidade('');
        setNovaDescricao('');
        setSelectedClientId(null);
        setItensTemporarios([]);
        setFotoUrl('');
        setContratoInicio('');
        setContratoFim('');
        setFollowupEm('');
        setNovoCnpj('');
        setNovoEndereco('');
        setCnpjError(false);
        setNovoIE('');
        setParcelas('1');
        setVencimento('');
        setVencimentosDatas([]);
        setFormaPagamento('');
        setDesconto(0);
        setValorTotalOverride(null);
        setHistorico([]);
        setAtividades([]);
        setLeadUserId(user?.id || '');
        setMostrarDetalhes(false);
    }
    setShowDocuseal(Boolean(lead?.docuseal_sign_url));
    setDocuLink(lead?.docuseal_sign_url || null);
    setDocuConsultorLink(lead?.docuseal_consultor_sign_url || null);
    setDocuConsultorAssinou(Boolean(lead?.docuseal_consultor_assinado));
    setDocuErro('');
    setShowUploadManual(false);
    setUploadManualErro('');
    setDocuSignerName(lead?.empresa || '');
    setDocuSignerEmail('');
    setDocuSignerPhone(lead?.telefone || '');
    setIsModalOpen(true);
  }, [perfil?.unidade, user?.id]);

  const leadsAtivos = useMemo(() => {
      const hojeStr = getLocalYYYYMMDD(new Date());
      return leads.filter(l => {
          if (filtroVendedor !== 'todos' && l.user_id !== filtroVendedor) return false;
          if (filtroUnidade !== 'todas' && l.unidade !== filtroUnidade) return false;
          if (filtroAtrasados && !(l.followup_em && l.followup_em < hojeStr && l.status !== 'ganho' && l.status !== 'perdido')) return false;
          if (filtroSemAssinatura && !(l.status === 'ganho' && !l.docuseal_assinado && !l.contrato_manual_url)) return false;
          const dataLead = l.created_at?.substring(0, 10);
          if (dataInicio && dataLead && dataLead < dataInicio) return false;
          if (dataFim && dataLead && dataLead > dataFim) return false;
          return true;
      });
  }, [leads, filtroVendedor, filtroUnidade, filtroAtrasados, filtroSemAssinatura, dataInicio, dataFim]);

  const totalAberto = useMemo(() => leadsAtivos.filter(l => l && l.status === 'aberto').reduce((acc, curr) => acc + (curr.valor_total || 0), 0), [leadsAtivos]);
  const totalGanhos = useMemo(() => leadsAtivos.filter(l => l && l.status === 'ganho').reduce((acc, curr) => acc + (curr.valor_total || 0), 0), [leadsAtivos]);

  let valorMetaAlvo = 0;
  const startMonth = dataInicio ? parseInt(dataInicio.split('-')[1]) : 0;
  const endMonth = dataFim ? parseInt(dataFim.split('-')[1]) : 0;
  const startYear = dataInicio ? parseInt(dataInicio.split('-')[0]) : 0;

  if (startMonth === endMonth && startMonth > 0) {
      const metaMes = metasBase.find(m => m.ano === startYear && m.mes === startMonth);
      if (metaMes) valorMetaAlvo = Number(metaMes.valor_objetivo);
  } else {
      const metaAnual = metasBase.find(m => !m.mes || m.mes === 0);
      if (metaAnual) valorMetaAlvo = Number(metaAnual.valor_objetivo);
      else {
          const metasMensais = metasBase.filter(m => m.mes >= 1 && m.mes <= 12);
          valorMetaAlvo = metasMensais.reduce((acc, curr) => acc + Number(curr.valor_objetivo), 0);
      }
  }

  const ganhosParaMeta = leadsAtivos.filter(l => l.status === 'ganho').reduce((acc, curr) => acc + (curr.valor_total || 0), 0);
  const temMetaCadastrada = valorMetaAlvo > 0;
  const percentMeta = temMetaCadastrada ? Math.min((ganhosParaMeta / valorMetaAlvo) * 100, 100) : 0;
  const labelMeta = temMetaCadastrada
    ? (startMonth === endMonth) ? (isDirector ? 'Meta Mês (Global)' : 'Meta Mês') : (isDirector ? 'Meta Anual (Global)' : 'Meta Anual')
    : 'Meta não cadastrada';

  const rankingServicos = leadsAtivos.filter(l => l && l.status === 'ganho').flatMap(l => Array.isArray(l.itens) ? l.itens : []).reduce((acc: any, item) => { acc[item.servico] = (acc[item.servico] || 0) + (item.precoUnitario * item.quantidade); return acc; }, {});

  const getLeadsByStage = useCallback((stageIdx: number) => {
      return leadsAtivos.filter(l => l && l.etapa === stageIdx).sort((a, b) => { const dateA = a.created_at ? new Date(a.created_at).getTime() : 0; const dateB = b.created_at ? new Date(b.created_at).getTime() : 0; return dateB - dateA; });
  }, [leadsAtivos]);

  const getStageTotal = useCallback((stageIdx: number) => { return getLeadsByStage(stageIdx).reduce((acc, l) => acc + (Number(l.valor_total) || 0), 0); }, [getLeadsByStage]);

  const subtotalModal = itensTemporarios.reduce((acc, item) => !item.bonificacao ? acc + (item.precoUnitario * item.quantidade) : acc, 0);
  const totalModalCalculado = Math.max(0, subtotalModal - desconto);
  const totalModalFinal = valorTotalOverride !== null ? valorTotalOverride : totalModalCalculado;
  const percModal = subtotalModal > 0 ? (desconto / subtotalModal) * 100 : 0;
  const servicosFiltradosDaUnidade = listaServicos.filter(s => !s.unidade || s.unidade === novaUnidade);
  const categoriasDisponiveis = Array.from(new Set(servicosFiltradosDaUnidade.map(s => s.tipo || 'Comercial Gravado')));
  const produtosDaCategoria = servicosFiltradosDaUnidade.filter(s => (s.tipo || 'Comercial Gravado') === categoriaSelecionada);

  return (
    <div className="h-full flex flex-col pb-20 md:pb-2 animate-in fade-in duration-500">
      
      {/* Cabeçalho compacto */}
      <div className="flex items-center gap-3 mb-2 px-2">
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic shrink-0">{isCDL ? 'Funil de Associação' : 'Pipeline'}</h1>

          {isOffline ? (
            <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1 animate-pulse shrink-0"><WifiOff size={10}/> Offline</span>
          ) : isSyncing ? (
            <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1 shrink-0"><RefreshCcw size={10} className="animate-spin"/> Sync</span>
          ) : null}

          {/* Barra de meta — ocupa o espaço central */}
          <div className="hidden md:flex flex-1 items-center gap-3 min-w-0">
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-600 to-[#22C55E] transition-all duration-1000" style={{ width: `${Math.min(percentMeta, 100)}%` }}/>
            </div>
            <span className="text-[10px] font-black text-[#22C55E] shrink-0">{Math.round(percentMeta)}%</span>
            <span className="text-[9px] text-slate-500 shrink-0 hidden lg:block">{labelMeta}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button onClick={() => setShowAgenda(true)} className="bg-white/5 border border-white/10 text-slate-400 hover:bg-blue-600/20 hover:border-blue-500/30 hover:text-blue-400 p-2 rounded-xl transition-all" title="Agenda"><CalendarDays size={16} strokeWidth={2.5}/></button>
            <button onClick={() => router.push('/visitas')} className="bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-1.5"><MapPin size={14} strokeWidth={3}/> Visitas</button>
            <button onClick={() => abrirModal()} className="bg-[#22C55E] text-[#0F172A] px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-[0_5px_20px_rgba(34,197,94,0.2)] flex items-center gap-1.5"><Plus size={14} strokeWidth={3}/> Gerar</button>
          </div>
      </div>

      {/* Barra de filtros */}
      <div className="flex items-center gap-2 px-2 mb-2">
            <div className="flex flex-nowrap items-center bg-[#0F172A] border border-white/10 rounded-xl shadow-lg h-10 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <Filter size={14} className="text-slate-400 ml-3 mr-2 shrink-0" />

              <div className="flex items-center gap-1 px-3 border-l border-white/10 h-full shrink-0">
                  <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="bg-transparent border-none text-slate-300 hover:text-white text-[10px] font-bold uppercase outline-none cursor-pointer" />
                  <span className="text-slate-600 text-[9px] font-black">ATÉ</span>
                  <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="bg-transparent border-none text-slate-300 hover:text-white text-[10px] font-bold uppercase outline-none cursor-pointer" />
              </div>

              {isLideranca && (
                  <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} className="bg-transparent border-none text-blue-400 text-[10px] font-bold uppercase outline-none cursor-pointer appearance-none px-3 border-l border-white/10 h-full shrink-0">
                    <option value="todos" className="bg-[#0F172A]">{isCDL ? 'Todos Consultores' : 'Todos Vendedores'}</option>
                    {Object.entries(usersMap).map(([id, nome]) => ( <option key={id} value={id} className="bg-[#0F172A]">{nome}</option> ))}
                  </select>
              )}

              {isDirector && (
                  <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className="bg-transparent border-none text-slate-300 hover:text-white text-[10px] font-bold uppercase outline-none cursor-pointer appearance-none px-3 border-l border-white/10 h-full shrink-0">
                    <option value="todas" className="bg-[#0F172A]">Todas Unidades</option>
                    {unidades.map(u => (
                      <option key={u.id} value={u.nome} className="bg-[#0F172A]">{u.nome}</option>
                    ))}
                  </select>
              )}

              <button onClick={() => setFiltroAtrasados(v => !v)} title="Follow-up atrasado" className={`flex items-center gap-1.5 px-3 border-l border-white/10 h-full shrink-0 text-[10px] font-bold uppercase transition-colors ${filtroAtrasados ? 'bg-red-500/10 text-red-400' : 'text-slate-400 hover:text-white'}`}>
                <AlertTriangle size={12} /> Atrasados
              </button>

              <button onClick={() => setFiltroSemAssinatura(v => !v)} title="Ganho sem contrato assinado" className={`flex items-center gap-1.5 px-3 border-l border-white/10 h-full shrink-0 text-[10px] font-bold uppercase transition-colors ${filtroSemAssinatura ? 'bg-orange-500/10 text-orange-400' : 'text-slate-400 hover:text-white'}`}>
                <PenLine size={12} /> Sem Assinatura
              </button>
            </div>

            {(filtroVendedor !== 'todos' || filtroUnidade !== 'todas' || filtroAtrasados || filtroSemAssinatura || dataInicio !== getLocalYYYYMMDD(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) || dataFim !== getLocalYYYYMMDD(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))) && (
                <button onClick={() => { setFiltroVendedor('todos'); setFiltroUnidade('todas'); setFiltroAtrasados(false); setFiltroSemAssinatura(false); const hoje = new Date(); setDataInicio(getLocalYYYYMMDD(new Date(hoje.getFullYear(), hoje.getMonth(), 1))); setDataFim(getLocalYYYYMMDD(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))); }} className="text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 rounded-xl transition-colors text-[10px] font-bold uppercase px-3 h-10 flex items-center justify-center gap-1 shadow-lg shrink-0">
                    <X size={12}/> Limpar
                </button>
            )}
      </div>

      <KanbanBoard
        activeStages={ACTIVE_STAGES}
        onDragEnd={onDragEnd}
        getLeadsByStage={getLeadsByStage}
        getStageTotal={getStageTotal}
        isDirector={isDirector}
        isLideranca={isLideranca}
        usersMap={usersMap}
        clientesMap={clientesMap}
        abrirModal={abrirModal}
        enviarWhatsapp={enviarWhatsapp}
        fazerCheckin={fazerCheckin}
        mudarEtapa={mudarEtapa}
        imprimirContrato={imprimirContrato}
        abrirEmailModal={abrirEmailModal}
        isCDL={isCDL}
      />

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-0 md:p-4">
           <div className="bg-[#0B1120] md:border border-white/10 w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-[40px] shadow-2xl relative flex flex-col">
              
              <div className="flex justify-between items-center p-6 border-b border-white/10 flex-shrink-0">
                  <h2 className="text-xl font-black uppercase italic tracking-tighter text-white flex items-center gap-2">
                      {editingLeadId ? (isCDL ? 'Editar Prospecto' : 'Editar Oportunidade') : (isCDL ? 'Novo Prospecto' : 'Novo Negócio')}
                      {editingLeadId && editingLeadId < 1000000 && <span className="text-[#22C55E] bg-[#22C55E]/10 px-2 py-1 rounded text-lg">#LD-{String(editingLeadId).padStart(4, '0')}</span>}
                  </h2>
                  <div className="flex items-center gap-2">
                      {editingLeadId && (
                        <>
                            <button onClick={(e) => handleDelete(e, editingLeadId)} className="p-2 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-colors">
                                <Trash2 size={20}/>
                            </button>
                            <button onClick={imprimirProposta} className="p-2 bg-blue-600/10 text-blue-400 rounded-full hover:bg-blue-600/20 transition-colors">
                                <Printer size={20}/>
                            </button>
                            {empresa?.modulos?.assinatura && (
                              <button
                                onClick={() => { setShowDocuseal(v => !v); setDocuLink(null); setDocuConsultorLink(null); setDocuConsultorAssinou(false); setDocuErro(''); setDocuSignerName(novaEmpresa || ''); setDocuSignerPhone(novoTelefone || ''); setDocuSignerEmail(''); }}
                                className={`p-2 rounded-full transition-colors ${showDocuseal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-400 hover:text-emerald-400'}`}
                                title="Assinatura Digital"
                              >
                                  <PenLine size={20}/>
                              </button>
                            )}
                            {!isCDL && (
                              <button
                                onClick={() => { setShowUploadManual(v => !v); setUploadManualErro(''); }}
                                className={`p-2 rounded-full transition-colors ${showUploadManual ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-slate-400 hover:text-orange-400'}`}
                                title="Anexar contrato assinado (PDF)"
                              >
                                  <Upload size={20}/>
                              </button>
                            )}
                        </>
                      )}
                      <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white"><X size={20}/></button>
                  </div>
              </div>

              {showDocuseal && (
                <div className="border-b border-emerald-500/20 bg-emerald-500/5 px-6 py-5 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-4">
                    <PenLine size={16} className="text-emerald-400"/>
                    <span className="text-emerald-300 font-black text-sm uppercase tracking-wide">Assinatura Digital</span>
                  </div>
                  {leads.find(l => l.id === editingLeadId)?.docuseal_assinado ? (
                    <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                      <CheckCircle2 size={20} className="text-emerald-400 shrink-0"/>
                      <div className="flex-1">
                        <p className="text-emerald-300 text-sm font-black">Contrato Assinado</p>
                        <p className="text-emerald-400/70 text-xs mt-0.5">Assinatura digital confirmada pelo Docuseal.</p>
                        {(() => {
                          const arquivos = leads.find(l => l.id === editingLeadId)?.docuseal_arquivos;
                          if (!Array.isArray(arquivos) || arquivos.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-3 mt-2">
                              {arquivos.map((a, i) => (
                                <button key={i} type="button" onClick={() => abrirArquivoAssinado(a.path)} className="text-emerald-400 text-xs font-bold underline hover:text-emerald-300">
                                  {a.nome}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : docuConsultorLink && !docuConsultorAssinou ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                        <PenLine size={16} className="text-orange-400 shrink-0"/>
                        <p className="text-orange-300 text-xs font-bold">1º) {consultorAtualNome} precisa assinar primeiro como consultor da rádio:</p>
                      </div>
                      <div className="flex gap-2">
                        <input readOnly value={docuConsultorLink} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono outline-none"/>
                        <a href={docuConsultorLink} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-orange-600/20 text-orange-400 rounded-xl hover:bg-orange-600/30 transition-colors" title="Assinar agora">
                          <ExternalLink size={14}/>
                        </a>
                      </div>
                      <button type="button" onClick={confirmarConsultorAssinou} className="w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-widest bg-orange-600/20 border border-orange-500/30 text-orange-300 hover:bg-orange-600/30 transition-colors">
                        Já assinei — liberar link do cliente
                      </button>
                      <button type="button" onClick={reenviarDocuseal} className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">Reenviar</button>
                    </div>
                  ) : docuConsultorLink ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                        <CheckCircle2 size={16} className="text-green-400 shrink-0"/>
                        <p className="text-green-400 text-xs font-bold">2º) Envie este link pro cliente assinar (o Docuseal já mandou por e-mail automaticamente):</p>
                      </div>
                      <div className="flex gap-2">
                        <input readOnly value={docuLink || ''} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono outline-none"/>
                        <button type="button" onClick={() => { if (docuLink) navigator.clipboard.writeText(docuLink); }} className="px-3 py-2 bg-emerald-600/20 text-emerald-400 rounded-xl hover:bg-emerald-600/30 transition-colors" title="Copiar">
                          <Link size={14}/>
                        </button>
                        {docuSignerPhone.trim() && docuLink && (
                          <a
                            href={`https://wa.me/55${docuSignerPhone.replace(/\D/g, '').replace(/^55/, '')}?text=${encodeURIComponent(`Olá, ${docuSignerName}! Segue o link para assinatura do seu contrato:\n${docuLink}`)}`}
                            target="_blank" rel="noopener noreferrer"
                            className="px-3 py-2 bg-green-600/20 text-green-400 rounded-xl hover:bg-green-600/30 transition-colors"
                            title="Enviar por WhatsApp"
                          >
                            <MessageCircle size={14}/>
                          </a>
                        )}
                      </div>
                      <button type="button" onClick={reenviarDocuseal} className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">Reenviar</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-500">Nome do Signatário *</label>
                        <input type="text" value={docuSignerName} onChange={e => setDocuSignerName(e.target.value)} placeholder="Nome completo" className="w-full mt-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"/>
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-500">E-mail</label>
                        <input type="email" value={docuSignerEmail} onChange={e => setDocuSignerEmail(e.target.value)} placeholder="email@cliente.com" className="w-full mt-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"/>
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-500">Telefone (com DDD)</label>
                        <input type="tel" value={docuSignerPhone} onChange={e => setDocuSignerPhone(e.target.value)} placeholder="47999999999" className="w-full mt-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"/>
                      </div>
                      <div className="flex items-end">
                        <button type="button" onClick={enviarParaDocuseal} disabled={docuSending} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                          {docuSending ? <Loader2 size={14} className="animate-spin"/> : <PenLine size={14}/>}
                          {docuSending ? 'Gerando contrato...' : 'Gerar e Enviar para Assinar'}
                        </button>
                      </div>
                      {docuErro && <p className="md:col-span-2 text-red-400 text-xs font-bold">{docuErro}</p>}
                      {!docuErro && <p className="md:col-span-2 text-slate-600 text-[10px]">O contrato será gerado e o link de assinatura ficará disponível aqui. Após assinar, o job avança automaticamente para produção.</p>}
                      <button type="button" onClick={() => { setShowUploadManual(true); setUploadManualErro(''); }} className="md:col-span-2 text-orange-400/80 hover:text-orange-300 text-[10px] font-bold uppercase tracking-widest transition-colors text-left flex items-center gap-1">
                        <Upload size={11}/> Já foi assinado fora do sistema? Anexar PDF assinado
                      </button>
                    </div>
                  )}
                </div>
              )}

              {showUploadManual && (
                <div className="border-b border-orange-500/20 bg-orange-500/5 px-6 py-5 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-4">
                    <Upload size={16} className="text-orange-400"/>
                    <span className="text-orange-300 font-black text-sm uppercase tracking-wide">Contrato Assinado (PDF ou Fotos)</span>
                  </div>
                  {leads.find(l => l.id === editingLeadId)?.contrato_manual_url ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
                        <CheckCircle2 size={20} className="text-orange-400 shrink-0"/>
                        <div className="flex-1 min-w-0">
                          <p className="text-orange-300 text-sm font-black">Contrato anexado — produção liberada</p>
                          <div className="flex flex-col items-start gap-0.5 mt-1">
                            {(leads.find(l => l.id === editingLeadId)?.contrato_manual_arquivos?.length
                              ? leads.find(l => l.id === editingLeadId)!.contrato_manual_arquivos!
                              : [{ nome: 'Contrato assinado', path: leads.find(l => l.id === editingLeadId)!.contrato_manual_url! }]
                            ).map((arq, i) => (
                              <button key={i} type="button" onClick={() => abrirArquivoAssinado(arq.path)} className="text-orange-400/70 text-xs underline hover:text-orange-300 truncate max-w-full">{arq.nome || `Arquivo ${i + 1}`}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <label className="flex items-center justify-center gap-2 w-full h-10 border border-dashed border-white/10 rounded-xl cursor-pointer hover:border-orange-500/50 transition-colors bg-black/30">
                        {uploadManualEnviando ? <Loader2 size={14} className="text-orange-400 animate-spin"/> : <Upload size={14} className="text-slate-600"/>}
                        <span className="text-[10px] text-slate-500 font-bold uppercase">{uploadManualEnviando ? 'Enviando...' : 'Anexar mais arquivos'}</span>
                        <input type="file" accept="application/pdf,image/*" multiple className="hidden" disabled={uploadManualEnviando} onChange={enviarContratoManual}/>
                      </label>
                      {uploadManualErro && <p className="text-red-400 text-xs font-bold">{uploadManualErro}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-orange-500/50 transition-colors bg-black/30">
                        {uploadManualEnviando ? <Loader2 size={20} className="text-orange-400 animate-spin mb-1"/> : <Upload size={20} className="text-slate-600 mb-1"/>}
                        <span className="text-[10px] text-slate-500 font-bold uppercase">{uploadManualEnviando ? 'Enviando...' : 'Selecionar PDF ou fotos do contrato assinado'}</span>
                        <input type="file" accept="application/pdf,image/*" multiple className="hidden" disabled={uploadManualEnviando} onChange={enviarContratoManual}/>
                      </label>
                      {uploadManualErro && <p className="text-red-400 text-xs font-bold">{uploadManualErro}</p>}
                      {!uploadManualErro && <p className="text-slate-600 text-[10px]">Use quando o contrato foi assinado fora do fluxo eletrônico. Pode selecionar várias fotos (uma por página). Ao anexar, a produção é liberada na hora.</p>}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <form id="leadForm" onSubmit={salvarLead} className="space-y-6">
                    {leadTravado && (
                        <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 flex items-center gap-3">
                            <Lock size={18} className="text-orange-400 shrink-0"/>
                            <p className="text-orange-300 text-xs font-bold">Contrato assinado — edição bloqueada. Somente um diretor pode ajustar esta oportunidade agora.</p>
                        </div>
                    )}
                    <fieldset disabled={leadTravado} className="space-y-6 border-0 p-0 m-0 min-w-0">

                    <div className="mb-4 relative">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Cliente / Empresa *</label>
                        <div className="relative">
                            <input 
                                className={`w-full bg-white/[0.03] border ${selectedClientId ? 'border-[#22C55E] text-[#22C55E]' : (novaEmpresa.length > 2 ? 'border-blue-500' : 'border-white/10')} rounded-xl pl-4 pr-28 py-3 text-sm font-bold outline-none focus:border-blue-500 transition-colors uppercase`}
                                placeholder="Buscar ou Cadastrar novo..." value={novaEmpresa} onChange={(e) => { setNovaEmpresa(e.target.value); setSelectedClientId(null); setShowClientDropdown(true); buscarClientes(e.target.value); }} onFocus={() => { setShowClientDropdown(true); if (novaEmpresa.length >= 2) buscarClientes(novaEmpresa); }} onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)} required
                            />
                            
                            {selectedClientId ? (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-[#22C55E]/10 text-[#22C55E] px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest">
                                    <CheckCircle2 size={12}/> Vinculado
                                </div>
                            ) : novaEmpresa.length > 2 ? (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest animate-pulse">
                                    <Sparkles size={12}/> Será Cadastrado
                                </div>
                            ) : null}
                        </div>
                        
                        {showClientDropdown && !selectedClientId && (
                            <div className="absolute z-[9999] w-full mt-1 bg-[#0F172A] border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar overflow-x-hidden">
                                {clientesBuscando && (
                                    <div className="px-4 py-3 flex items-center gap-2 text-slate-500 text-xs font-bold uppercase">
                                        <Loader2 size={12} className="animate-spin"/> Buscando...
                                    </div>
                                )}
                                {!clientesBuscando && clientesOpcoes.map(c => (
                                        <div 
                                            key={c.id} className="px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-blue-600/20 transition-colors flex flex-col"
                                            onMouseDown={(e) => { e.preventDefault(); setNovaEmpresa(c.nome_empresa); setSelectedClientId(c.id); setNovoTelefone(c.telefone || ''); if (c.cidade) setNovaCidade(c.cidade as string); if (c.cnpj) setNovoCnpj(c.cnpj as string); if (c.inscricao_estadual) setNovoIE(c.inscricao_estadual as string); if (c.endereco) setNovoEndereco(c.endereco as string); setShowClientDropdown(false); }}
                                        >
                                            <div className="flex items-center gap-2">
                                              <span className="text-white font-bold text-xs uppercase">{c.nome_empresa}</span>
                                              <div title={`Risco: ${c.risco?.toUpperCase() || 'VERDE'}`} className={`w-2 h-2 rounded-full flex-shrink-0 ${c.risco === 'vermelho' ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]' : c.risco === 'amarelo' ? 'bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.8)]' : 'bg-[#22C55E] shadow-[0_0_5px_rgba(34,197,94,0.8)]'}`} />
                                            </div>
                                            {c.cnpj && <span className="text-slate-500 text-[9px] font-mono mt-0.5">CNPJ: {c.cnpj}</span>}
                                        </div>
                                ))}
                                {!clientesBuscando && novaEmpresa.length >= 2 && clientesOpcoes.length === 0 && (
                                    <div className="px-4 py-4 text-center text-blue-400 text-xs font-bold uppercase">Novo Cliente Detectado!<br/><span className="text-[9px] text-slate-500 font-normal normal-case mt-1 block">Basta salvar que ele será cadastrado automaticamente.</span></div>
                                )}
                                {novaEmpresa.length < 2 && (
                                    <div className="px-4 py-3 text-slate-600 text-[10px] font-bold uppercase text-center">Digite ao menos 2 letras para buscar</div>
                                )}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2"><Building2 size={10} className="inline"/> Unidade / Filial *</label>
                        <select className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] cursor-pointer appearance-none" value={novaUnidade} onChange={e => { setNovaUnidade(e.target.value); setCategoriaSelecionada(null); }} required>
                            <option value="" className="bg-[#0B1120]">SELECIONE UMA UNIDADE</option>
                            {unidades.map(u => (
                              <option key={u.id} value={u.nome} className="bg-[#0B1120]">{u.nome}</option>
                            ))}
                        </select>
                    </div>

                    {(isLideranca || isOpec) && (
                        <div className="bg-yellow-500/5 border border-yellow-500/20 p-4 rounded-2xl">
                            <label className="text-[10px] font-black uppercase text-yellow-500 ml-2 flex items-center gap-1"><User size={12}/> {isCDL ? 'Consultor Responsável (Distribuição)' : 'Vendedor Responsável (Distribuição)'}</label>
                            <select className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-yellow-500 cursor-pointer appearance-none" value={leadUserId} onChange={e => setLeadUserId(e.target.value)}>
                                <option value="" className="bg-[#0B1120]">Nenhum (Fila Geral do Diretor)</option>
                                {Object.entries(usersMap).map(([id, nome]) => ( <option key={id} value={id} className="bg-[#0B1120]">{nome}</option> ))}
                            </select>
                        </div>
                    )}

                    {/* TOGGLE DETALHES */}
                    <button type="button" onClick={() => setMostrarDetalhes(v => !v)} className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/10 hover:border-white/20 rounded-xl transition-colors group">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white flex items-center gap-2">
                            <FileText size={12}/> {mostrarDetalhes ? 'Ocultar detalhes do contrato' : 'Adicionar detalhes do contrato'}
                        </span>
                        <span className={`text-slate-500 transition-transform duration-300 ${mostrarDetalhes ? 'rotate-180' : ''}`}>▼</span>
                    </button>

                    {mostrarDetalhes && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2">CNPJ</label>
                                    <input
                                        className={`w-full bg-white/[0.03] border rounded-xl px-4 py-3 text-white text-sm font-bold outline-none ${cnpjError ? 'border-red-500 focus:border-red-400' : 'border-white/10 focus:border-[#22C55E]'}`}
                                        value={novoCnpj}
                                        onChange={e => {
                                            const masked = maskCnpj(e.target.value);
                                            setNovoCnpj(masked);
                                            const digits = masked.replace(/\D/g, '');
                                            setCnpjError(digits.length === 14 && !validarCNPJ(masked));
                                        }}
                                        placeholder="00.000.000/0001-00"
                                    />
                                    {cnpjError && <p className="text-red-400 text-[9px] font-bold uppercase mt-1 ml-2">CNPJ inválido — verifique os dígitos</p>}
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Inscrição Estadual</label>
                                    <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={novoIE} onChange={e => setNovoIE(e.target.value)} placeholder="Ex: ISENTO ou Número" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Endereço</label>
                                <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={novoEndereco} onChange={e => setNovoEndereco(e.target.value)} placeholder="Rua, número - Bairro" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1"><Calendar size={10}/> Início do Contrato</label>
                                    <input type="date" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={contratoInicio} onChange={e => handleContratoInicio(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1"><CalendarDays size={10}/> Fim do Contrato</label>
                                    <input type="date" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={contratoFim} onChange={e => setContratoFim(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1"><Hash size={10}/> Qtd. Parcelas</label>
                                    <input type="text" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={parcelas} onChange={e => handleParcelasChange(e.target.value)} placeholder="Ex: 3" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1"><CalendarDays size={10}/> 1º Vencimento</label>
                                    <input type="date" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={vencimento} onChange={e => handleVencimentoChange(e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1"><Wallet size={10}/> Forma de Pagamento</label>
                                <select className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] cursor-pointer" value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}>
                                    <option value="" className="bg-[#0B1120]">Selecione</option>
                                    {Object.entries(FORMAS_PAGAMENTO).map(([valor, label]) => (
                                        <option key={valor} value={valor} className="bg-[#0B1120]">{label}</option>
                                    ))}
                                </select>
                            </div>
                            {vencimentosDatas.length > 0 && (
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1"><CalendarDays size={10}/> Vencimento de Cada Parcela</label>
                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                        {vencimentosDatas.map((data, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="text-[9px] text-slate-500 font-bold w-16 shrink-0">Parc. {i + 1}</span>
                                                <input type="date" className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-bold outline-none focus:border-[#22C55E]" value={data} onChange={e => handleVencimentoParcela(i, e.target.value)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {novaDescricao && (
                                <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-2xl">
                                    <label className="text-[10px] font-black uppercase text-blue-400 mb-2 flex items-center gap-1"><Info size={12}/> Briefing / Descrição (Portal)</label>
                                    <textarea className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-slate-400 text-sm font-medium outline-none min-h-[80px] custom-scrollbar cursor-not-allowed" value={novaDescricao} readOnly placeholder="O que o cliente precisa..." />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5 space-y-4 relative">
                        <div className="flex justify-between items-start border-b border-white/5 pb-4">
                            <div>
                                <p className="text-[10px] font-black text-[#22C55E] uppercase tracking-widest mt-1">Montar Proposta</p>
                                {novaUnidade && <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Tabela: {novaUnidade}</p>}
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-400">Subtotal: R$ {subtotalModal.toLocaleString()}</p>
                                <div className="flex items-center justify-end gap-2 mt-1 mb-1">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase">Desconto R$</span>
                                    <input type="number" className="w-20 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-2 py-1 text-xs font-bold outline-none text-right" placeholder="0" value={desconto || ''} onChange={e => setDesconto(Number(e.target.value))} />
                                </div>
                                <p className="text-sm font-black text-white bg-[#22C55E]/20 px-3 py-1 rounded-lg border border-[#22C55E]/30 inline-block">Final: R$ {totalModalFinal.toLocaleString()}</p>
                                {percModal > 0 && ( <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${percModal > LIMITE_DESCONTO_MAXIMO ? 'text-red-400' : 'text-[#22C55E]'}`}>({percModal.toFixed(1)}% OFF)</p> )}
                            </div>
                        </div>
                        
                        {!novaUnidade ? (
                            <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl text-center"><p className="text-xs font-black text-orange-400 uppercase tracking-widest animate-pulse">Selecione a Unidade para abrir a tabela de preços!</p></div>
                        ) : !categoriaSelecionada ? (
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Escolha a Categoria</p>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {categoriasDisponiveis.map(cat => ( <button key={cat} type="button" onClick={() => setCategoriaSelecionada(cat)} className="flex items-center justify-center p-4 bg-[#0F172A] border border-white/10 rounded-xl hover:border-blue-500 hover:bg-blue-600/10 transition-all group"><span className="text-[11px] font-black text-slate-300 uppercase text-center group-hover:text-blue-400">{cat}</span></button> ))}
                                </div>
                            </div>
                        ) : (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2"><button type="button" onClick={() => setCategoriaSelecionada(null)} className="p-1.5 bg-white/5 rounded-lg hover:bg-blue-600 hover:text-white text-slate-400 transition-colors"><ArrowLeft size={16}/></button><span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{categoriaSelecionada}</span></div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                    {produtosDaCategoria.map((s) => (
                                        <button key={s.id} type="button" onClick={() => setItensTemporarios([...itensTemporarios, { servico: s.nome, quantidade: 1, precoUnitario: s.preco, tempo: '30"', programa: 'ROTATIVO' }])} className="flex flex-col items-start bg-white/5 hover:bg-blue-600/20 hover:border-blue-500/50 border border-white/10 p-3 rounded-xl transition-colors text-left group">
                                            <span className="text-[10px] text-slate-300 font-bold uppercase mb-1 line-clamp-2 leading-tight group-hover:text-blue-200">{s.nome}</span><span className="text-xs font-black text-[#22C55E]">R$ {s.preco.toLocaleString('pt-BR')}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {itensTemporarios.length > 0 && (
                            <div className="space-y-2 mt-4 pt-4 border-t border-white/5">
                                {itensTemporarios.map((item, i) => (
                                    <div key={i} className="flex flex-col bg-[#0F172A] border border-white/5 p-3 rounded-xl text-[10px] text-slate-300">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                <input type="number" min="1" className="w-12 bg-black/50 border border-white/10 rounded px-1 py-1 text-center font-bold text-white outline-none focus:border-blue-500" value={item.quantidade} onChange={(e) => { const novosItens = [...itensTemporarios]; novosItens[i].quantidade = Number(e.target.value); setItensTemporarios(novosItens); }}/>
                                                <span className="font-bold uppercase truncate max-w-[120px] md:max-w-[200px]">{item.servico}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {item.bonificacao
                                                  ? <span className="font-black text-amber-400 text-[9px] uppercase tracking-wider">Bonificação</span>
                                                  : <span className="font-black text-[#22C55E]">R$ {(item.quantidade * item.precoUnitario).toLocaleString()}</span>
                                                }
                                                <button type="button" onClick={() => setItensTemporarios(itensTemporarios.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-white p-1 bg-red-500/10 hover:bg-red-500 hover:text-white rounded transition-colors"><Trash2 size={12}/></button>
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-white/5 mt-1 flex items-center gap-3">
                                            <div className="flex-1">
                                              <label className="text-[8px] text-slate-500 font-bold uppercase mb-0.5 flex items-center gap-1"><Radio size={8}/> Programa</label>
                                              <input type="text" value={item.programa || ''} onChange={(e) => { const novos = [...itensTemporarios]; novos[i].programa = e.target.value; setItensTemporarios(novos); }} className="w-full bg-black/50 border border-white/10 rounded p-1.5 outline-none text-white text-[10px] uppercase" placeholder="Ex: ROTATIVO" />
                                            </div>
                                            <label className="flex items-center gap-1.5 cursor-pointer mt-3 shrink-0">
                                              <input type="checkbox" checked={!!item.bonificacao} onChange={(e) => { const novos = [...itensTemporarios]; novos[i].bonificacao = e.target.checked; novos[i].precoUnitario = e.target.checked ? 0 : novos[i].precoUnitario; setItensTemporarios(novos); }} className="accent-amber-400 w-3 h-3"/>
                                              <span className="text-[8px] font-bold uppercase text-amber-400/80">Bonif.</span>
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {isLideranca && itensTemporarios.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[9px] font-black uppercase text-slate-500">Total calculado</p>
                              <p className="text-slate-400 text-xs font-mono">R$ {totalModalCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <label className="text-[9px] font-black uppercase text-violet-400">Valor final (diretor)</label>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-400">R$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder={totalModalCalculado.toFixed(2)}
                                  value={valorTotalOverride !== null ? valorTotalOverride : ''}
                                  onChange={e => setValorTotalOverride(e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                                  className="w-32 bg-violet-500/10 border border-violet-500/30 rounded-lg px-2 py-1.5 text-sm font-bold text-violet-300 outline-none focus:border-violet-400 text-right"
                                />
                                {valorTotalOverride !== null && (
                                  <button type="button" onClick={() => setValorTotalOverride(null)} className="text-[9px] text-slate-500 hover:text-white px-1">✕</button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                    </div>

                    {editingLeadId && (
                        <div className="grid grid-cols-1 gap-4">
                            <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5 flex flex-col">
                                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Notas Rápidas</p>
                                <div className="flex-1 overflow-y-auto max-h-32 custom-scrollbar space-y-2 mb-2">
                                    {historico.map(h => {
                                        const rawDate = h.created_at || new Date().toISOString(); const d = new Date(rawDate); const fmt = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} · ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
                                        return ( <div key={h.id} className="border-b border-white/5 pb-1 mb-1"><div className="flex justify-between items-baseline gap-2"><span className="text-[10px] text-slate-300 font-medium flex-1">{h.texto}</span><span className="text-[8px] text-slate-600 font-mono ml-2 shrink-0">{fmt}</span><button type="button" onClick={() => removerNota(h.id)} className="text-slate-600 hover:text-red-400 shrink-0" title="Apagar nota"><Trash2 size={10}/></button></div></div> );
                                    })}
                                </div>
                                <div className="flex gap-2">
                                    <input className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white outline-none" placeholder="Nova nota..." value={novaNota} onChange={e => setNovaNota(e.target.value)} />
                                    <button type="button" onClick={adicionarNota} className="bg-blue-600 text-white px-3 rounded-lg text-[10px] font-bold">OK</button>
                                </div>
                            </div>
                            {atividades.length > 0 && (
                                <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                    <p className="text-[10px] font-black text-slate-500 uppercase mb-3 flex items-center gap-1"><Clock size={10}/> Histórico de Atividades</p>
                                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                        {atividades.map((a, i) => {
                                            const d = new Date(a.created_at);
                                            const fmt = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
                                            const color = a.tipo === 'etapa' ? 'text-green-400 bg-green-500/10' : a.tipo === 'followup' ? 'text-orange-400 bg-orange-500/10' : 'text-blue-400 bg-blue-500/10';
                                            const icon = a.tipo === 'etapa' ? '→' : a.tipo === 'followup' ? '📅' : '💬';
                                            return (
                                                <div key={a.id} className={`flex items-start gap-2 text-[10px] p-2 rounded-lg ${color}`}>
                                                    <span className="flex-shrink-0 font-bold">{icon}</span>
                                                    <span className="flex-1 font-medium">{a.descricao}</span>
                                                    <span className="flex-shrink-0 text-[8px] opacity-60 font-mono">{fmt}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                <p className="text-[10px] font-black text-slate-500 uppercase mb-2 flex items-center gap-1"><CalendarDays size={10}/> Follow-up</p>
                                <input
                                    type="date"
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"
                                    value={followupEm}
                                    onChange={e => setFollowupEm(e.target.value)}
                                />
                                {followupEm && (
                                    <p className="text-[9px] text-orange-400 font-bold mt-1 flex items-center gap-1">
                                        <AlertTriangle size={9}/> Lembrete em {formatarData(followupEm)}
                                    </p>
                                )}
                            </div>
                            <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Anexos</p>
                                <label className="block w-full text-center border border-dashed border-white/10 rounded-xl p-3 cursor-pointer hover:bg-white/5 transition-all">
                                    <Upload size={16} className="mx-auto text-slate-500 mb-1"/>
                                    <span className="text-[10px] text-slate-400">{uploading ? 'Enviando...' : 'Anexar Arquivo'}</span>
                                    <input type="file" className="hidden" onChange={handleUpload}/>
                                </label>
                                {fotoUrl && <a href={fotoUrl} target="_blank" className="block text-[10px] text-blue-400 mt-2 text-center hover:underline">Ver Anexo Atual</a>}
                            </div>
                        </div>
                    )}

                    {editingLeadId && leads.find(l => l.id === editingLeadId)?.status_aprovacao === 'pendente' && (
                        <div className="bg-orange-500/10 border border-orange-500/30 p-6 rounded-2xl mt-4 text-center">
                            <Lock className="text-orange-400 mx-auto mb-2" size={24}/>
                            <h3 className="text-orange-400 font-black uppercase text-sm">Alçada de Desconto</h3>
                            <p className="text-orange-200/70 text-[10px] mb-4 mt-1">Este negócio solicita <strong>{percModal.toFixed(1)}% de desconto</strong>. O limite do vendedor é {LIMITE_DESCONTO_MAXIMO}%.</p>
                            {isLideranca ? (
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => handleAprovacao(editingLeadId, 'aprovado')} className="flex-1 bg-[#22C55E] text-black font-black uppercase tracking-widest text-[10px] py-3 rounded-xl hover:scale-105 transition-all">Aprovar Desconto</button>
                                    <button type="button" onClick={() => handleAprovacao(editingLeadId, 'recusado')} className="flex-1 bg-red-500 text-white font-black uppercase tracking-widest text-[10px] py-3 rounded-xl hover:scale-105 transition-all">Recusar</button>
                                </div>
                            ) : ( <p className="text-orange-400 font-black text-xs uppercase animate-pulse border border-orange-500/20 py-2 rounded-xl bg-orange-500/10">Aguardando Diretor/Gerente</p> )}
                        </div>
                    )}
                    </fieldset>
                </form>
              </div>

              <div className="p-6 border-t border-white/10 bg-[#0B1120] flex-shrink-0 rounded-b-[40px]">
                  <button type="submit" form="leadForm" disabled={leadTravado} className={`w-full py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] ${leadTravado ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : novaEmpresa && novaUnidade ? (percModal > LIMITE_DESCONTO_MAXIMO && !isLideranca ? 'bg-orange-500 text-white' : 'bg-[#22C55E] text-[#0F172A] hover:scale-[1.02]') : 'bg-slate-700 text-slate-400 cursor-not-allowed'}`}>
                      {leadTravado ? '🔒 Contrato assinado — bloqueado' : !editingLeadId ? (isCDL ? 'Cadastrar Prospecto' : 'Criar Oportunidade') : (percModal > LIMITE_DESCONTO_MAXIMO && !isLideranca ? 'Solicitar Aprovação' : 'Salvar Alterações')}
                  </button>
              </div>

           </div>
        </div>
      )}

      {/* 👇 MODAL DE PERDA (IA ANALYTICS) 👇 */}
      {isLostModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-[#0B1120] border border-red-500/30 w-full max-w-md rounded-[32px] shadow-2xl relative flex flex-col animate-in zoom-in-95">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-red-500/5 rounded-t-[32px]">
                    <h2 className="text-xl font-black uppercase italic tracking-tighter text-red-500 flex items-center gap-2">
                        <AlertTriangle size={24}/> Registrar Perda
                    </h2>
                    <button onClick={() => { setIsLostModalOpen(false); setMotivoPerda(''); setLostLeadId(null); }} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors">
                        <X size={20}/>
                    </button>
                </div>
                
                <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-300 font-medium">
                        Por que não fechamos este negócio? Detalhe o motivo abaixo. Nossa <strong>Inteligência Artificial</strong> usa estes dados para mapear padrões e encontrar oportunidades de recuperação no futuro.
                    </p>
                    <div>
                        <textarea 
                            className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm font-medium outline-none focus:border-red-500 min-h-[120px] resize-none custom-scrollbar" 
                            placeholder="Ex: Achou o valor muito alto, fechou com a concorrência XYZ, o budget anual da empresa já tinha acabado..." 
                            value={motivoPerda} 
                            onChange={(e) => setMotivoPerda(e.target.value)} 
                        />
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 bg-[#0F172A] rounded-b-[32px] flex gap-3">
                    <button onClick={() => { setIsLostModalOpen(false); setMotivoPerda(''); setLostLeadId(null); }} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                        Cancelar
                    </button>
                    <button onClick={confirmarPerda} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-red-600 text-white hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all">
                        Confirmar Perda
                    </button>
                </div>
            </div>
        </div>
      )}

      {proximaAcaoModal && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-black uppercase italic text-lg mb-1 flex items-center gap-2">
              <CalendarDays size={20} className="text-blue-400"/> Próxima Ação
            </h3>
            <p className="text-slate-400 text-xs mb-4">Defina o follow-up para este lead antes de avançar.</p>
            <input
              type="date"
              value={proximaAcaoDate}
              onChange={e => setProximaAcaoDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setProximaAcaoModal(null); }}
                className="flex-1 py-3 rounded-xl bg-white/5 text-slate-400 text-xs font-black uppercase hover:bg-white/10 transition-colors"
              >
                Pular
              </button>
              <button
                onClick={async () => {
                  const { leadId, etapa, status } = proximaAcaoModal;
                  setProximaAcaoModal(null);
                  if (proximaAcaoDate) {
                    await supabase.from('leads').update({ followup_em: proximaAcaoDate }).eq('id', leadId);
                    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, followup_em: proximaAcaoDate } : l));
                  }
                  mudarEtapa(leadId, etapa, status);
                }}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-xs font-black uppercase hover:bg-blue-500 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />

      {/* MODAL DE E-MAIL */}
      {isEmailModalOpen && emailLead && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setIsEmailModalOpen(false)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-[32px] w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center justify-center">
                  <Mail size={18} className="text-sky-400"/>
                </div>
                <div>
                  <h2 className="text-white font-black text-sm uppercase tracking-widest">Enviar Proposta</h2>
                  <p className="text-slate-500 text-[10px] font-bold">{emailLead.empresa}</p>
                </div>
              </div>
              <button onClick={() => setIsEmailModalOpen(false)} className="text-slate-500 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors"><X size={16}/></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">E-mail do destinatário</label>
                <input
                  type="email"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-sky-500 transition-colors"
                  placeholder="cliente@empresa.com.br"
                  value={emailDestino}
                  onChange={e => { setEmailDestino(e.target.value); setEmailResult('idle'); }}
                  autoFocus
                />
              </div>

              <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Resumo da Proposta</p>
                {(Array.isArray(emailLead.itens) ? emailLead.itens : []).slice(0, 4).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-400 truncate max-w-[200px]">{item.quantidade}x {item.servico}</span>
                    <span className="text-slate-300 font-bold ml-2 shrink-0">R$ {(item.quantidade * item.precoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div className="border-t border-white/5 pt-2 mt-2 flex justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</span>
                  <span className="text-sm font-black text-[#22C55E]">R$ {emailLead.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {emailResult === 'ok' && (
                <div className="flex items-center gap-2 text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-xl p-3">
                  <CheckCircle2 size={14}/><span className="text-xs font-black uppercase tracking-widest">E-mail enviado com sucesso!</span>
                </div>
              )}
              {emailResult === 'error' && (
                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <X size={14}/><span className="text-xs font-black uppercase tracking-widest">Falha ao enviar. Verifique o e-mail.</span>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3">
              <button onClick={() => setIsEmailModalOpen(false)} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button
                onClick={enviarEmailProposta}
                disabled={!emailDestino.includes('@') || emailSending || emailResult === 'ok'}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(14,165,233,0.3)] transition-all flex items-center justify-center gap-2"
              >
                {emailSending ? <><Loader2 size={14} className="animate-spin"/> Enviando...</> : <><Send size={14}/> Enviar</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL CONFIRMAR FILIAÇÃO CDL */}
      {cdlFiliacaoModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-[#22C55E]/30 w-full max-w-md rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0B1120] text-sm">CDL</div>
                <div>
                  <h2 className="text-lg font-black text-white uppercase italic tracking-tight">Confirmar Filiação</h2>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{CDL.nome}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Seletor de tipo de fechamento */}
              <div className="grid grid-cols-2 gap-2">
                {([['filiacao', 'Filiação CDL'], ['servico', 'Venda / Serviço']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCdlModoFechamento(val)}
                    className={`py-2.5 rounded-xl font-black uppercase text-xs tracking-widest transition-all border ${cdlModoFechamento === val ? 'bg-[#22C55E]/10 border-[#22C55E]/50 text-[#22C55E]' : 'bg-white/[0.02] border-white/10 text-slate-500 hover:border-white/20'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {cdlModoFechamento === 'filiacao' && (
                <>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Tipo de Associação *</label>
                    <div className="grid grid-cols-1 gap-2">
                      {['Associado Simples', 'Associado Plus', 'Associado Premium'].map(tipo => (
                        <label key={tipo} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${cdlTipoAssociacao === tipo ? 'bg-[#22C55E]/10 border-[#22C55E]/50 text-[#22C55E]' : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-slate-300'}`}>
                          <input type="radio" name="cdlTipo" value={tipo} className="sr-only" onChange={() => setCdlTipoAssociacao(tipo)} />
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${cdlTipoAssociacao === tipo ? 'border-[#22C55E] bg-[#22C55E]' : 'border-slate-600'}`}>
                            {cdlTipoAssociacao === tipo && <div className="w-1.5 h-1.5 bg-[#0B1120] rounded-full" />}
                          </div>
                          <span className="text-xs font-black uppercase tracking-wide">{tipo}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Valor da Anuidade (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 497,00"
                      value={cdlValorAnuidade}
                      onChange={e => setCdlValorAnuidade(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Início</label>
                      <input type="date" value={cdlDataInicio} onChange={e => setCdlDataInicio(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Vencimento</label>
                      <input type="date" value={cdlDataFim} onChange={e => setCdlDataFim(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" />
                    </div>
                  </div>
                </>
              )}

              {cdlModoFechamento === 'servico' && (
                <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 text-center">
                  <p className="text-slate-400 text-sm">Fechamento como venda/serviço. Não altera dados de filiação do associado.</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3">
              <button onClick={() => setCdlFiliacaoModal(null)} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              {cdlModoFechamento === 'filiacao' ? (
              <button
                onClick={confirmarFiliacaoCDL}
                disabled={!cdlDataInicio || !cdlDataFim}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-[#22C55E] text-[#0B1120] hover:bg-[#16A34A] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={14}/> Confirmar Filiação
              </button>
              ) : (
              <button
                onClick={confirmarVendaSimplesCDL}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-[#22C55E] text-[#0B1120] hover:bg-[#16A34A] transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={14}/> Fechar Venda
              </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL BOAS-VINDAS CDL — aparece após confirmar filiação */}
      {cdlBemVindoData && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-[#22C55E]/40 w-full max-w-sm rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-[#22C55E]/10 p-6 text-center border-b border-[#22C55E]/20">
              <div className="w-14 h-14 bg-[#22C55E] rounded-2xl flex items-center justify-center font-black text-[#0B1120] text-xl mx-auto mb-3 shadow-[0_0_30px_rgba(34,197,94,0.4)]">✓</div>
              <h2 className="text-lg font-black text-white uppercase italic tracking-tight">Filiação Confirmada!</h2>
              <p className="text-[#22C55E] font-bold text-sm mt-1">{cdlBemVindoData.empresa}</p>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                Protocolo #{String(cdlBemVindoData.id).padStart(6, '0')}
              </p>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-slate-400 text-xs text-center">Envie as credenciais de acesso para o associado via WhatsApp:</p>

              {cdlBemVindoData.telefone ? (
                <a
                  href={`https://wa.me/55${cdlBemVindoData.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Bem-vindo à ${CDL.nome}! 🎉\n\n*${cdlBemVindoData.empresa}* agora faz parte da nossa comunidade de lojistas.\n\n📋 Protocolo: #${String(cdlBemVindoData.id).padStart(6, '0')}\n🔗 Acesse sua área exclusiva:\n${CDL.portalUrl}\n\nUse seu CNPJ e o número do protocolo para entrar.\n\n— ${CDL.nome}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setCdlBemVindoData(null)}
                  className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(34,197,94,0.25)]"
                >
                  <MessageCircle size={16}/> Enviar Boas-Vindas pelo WhatsApp
                </a>
              ) : (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
                  <p className="text-yellow-400 text-xs font-bold">Telefone não cadastrado — envie o link manualmente:</p>
                  <p className="text-slate-300 text-[10px] mt-1 font-mono select-all">wegrow.app.br/portal-cdl/associado</p>
                </div>
              )}

              <button
                onClick={() => setCdlBemVindoData(null)}
                className="w-full py-2.5 rounded-xl font-bold uppercase text-xs tracking-widest text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <AgendaCalendar
        isOpen={showAgenda}
        onClose={() => setShowAgenda(false)}
        userId={user?.id || ''}
        empresaId={perfil?.empresa_id || ''}
        perfilNome={perfil?.nome}
      />

    </div>
  );
}