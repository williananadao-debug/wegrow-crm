"use client";
import { useState, useEffect, useCallback } from 'react';
import {
  MapPin, Plus, X, CheckCircle2, Clock, Zap,
  ArrowLeft, Loader2,
  Navigation, Building2, Phone,
  Calendar, Search, Camera, Image as ImageIcon,
  Map, User, Sparkles, TrendingUp, AlertTriangle, ShieldAlert, Trash2,
  SkipForward, Route
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Toast } from '@/components/Toast';
import { useUnidades } from '@/lib/useUnidades';
import { geocodificarParadas, type ParadaGeo } from '@/lib/geocode';

const RotaMapa = dynamic(() => import('@/components/RotaMapa'), { ssr: false });

type Visita = {
  id: number;
  empresa: string;
  telefone?: string;
  observacao?: string;
  user_id?: string;
  empresa_id?: string;
  unidade?: string;
  cidade?: string;
  latitude?: number;
  longitude?: number;
  localizacao_url?: string;
  lead_id?: number | null;
  foto_url?: string | null;
  cliente_id?: number | null;
  created_at: string;
};

type Perfil = {
  id: string;
  nome: string;
  cargo?: string;
};

function getLocalYYYYMMDD(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

type ClienteRota = { id: number; nome_empresa: string; endereco?: string; numero?: string; bairro?: string; cidade?: string; estado?: string; telefone?: string; };

type ParadaRota = {
  id: number; // rotas_dia_paradas.id
  cliente_id: number;
  ordem: number;
  status: 'pendente' | 'visitada' | 'pulada';
  score?: number;
  motivo?: string;
  nome_empresa: string;
  endereco?: string; numero?: string; bairro?: string; cidade?: string; estado?: string; telefone?: string;
};

export default function VisitasPage() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil as any;
  const empresa = auth.empresa;
  const temPulse = Boolean(empresa?.modulos?.pulse);
  const router = useRouter();
  const { unidades } = useUnidades(perfil?.empresa_id);

  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [vendedores, setVendedores] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState('todos');
  const [filtroLead, setFiltroLead] = useState<'todos' | 'com_lead' | 'sem_lead'>('todos');
  const [dataInicio, setDataInicio] = useState(() => {
    const hoje = new Date();
    return getLocalYYYYMMDD(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  });
  const [dataFim, setDataFim] = useState(() => {
    const hoje = new Date();
    return getLocalYYYYMMDD(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
  });

  // Deep-link vindo do Dashboard (clique num KPI/gráfico lá abre aqui já filtrado)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vendedor = params.get('vendedor');
    const lead = params.get('filtroLead');
    const ini = params.get('dataInicio');
    const fim = params.get('dataFim');
    if (vendedor) setFiltroVendedor(vendedor);
    if (lead === 'todos' || lead === 'com_lead' || lead === 'sem_lead') setFiltroLead(lead);
    if (ini) setDataInicio(ini);
    if (fim) setDataFim(fim);
  }, []);

  // Modal de nova visita
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [empresaVisita, setEmpresaVisita] = useState('');
  const [telefone, setTelefone] = useState('');
  const [unidadeVisita, setUnidadeVisita] = useState('');
  const [cidade, setCidade] = useState('');
  const [cidadeDetectando, setCidadeDetectando] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'ok' | 'denied'>('idle');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  // Busca de cliente já cadastrado ao digitar o nome na visita — se não encontrar, segue livre (genérico)
  const [sugestoesClienteVisita, setSugestoesClienteVisita] = useState<ClienteRota[]>([]);
  const [buscandoClienteVisita, setBuscandoClienteVisita] = useState(false);
  const [mostrarSugestoesVisita, setMostrarSugestoesVisita] = useState(false);
  const [clienteVisitaSelecionado, setClienteVisitaSelecionado] = useState<string | null>(null);
  const [clienteVisitaSelecionadoId, setClienteVisitaSelecionadoId] = useState<number | null>(null);

  // Modal criar lead a partir de visita
  const [criarLeadVisita, setCriarLeadVisita] = useState<Visita | null>(null);
  const [criandoLead, setCriandoLead] = useState(false);
  const [excluindoVisita, setExcluindoVisita] = useState(false);

  // Modal de detalhe da visita (dados completos + foto)
  const [visitaDetalhe, setVisitaDetalhe] = useState<Visita | null>(null);

  // Rota do Dia (Pulse) — o diretor/gerente monta a rota inteligente (gerar_rota_dia_ia) e o
  // vendedor acompanha aqui; progresso salvo no banco (rotas_dia / rotas_dia_paradas), não
  // mais em localStorage, pra sobreviver a troca de aparelho e a liderança acompanhar ao vivo.
  const [isRotaModalOpen, setIsRotaModalOpen] = useState(false);
  const [buscaClienteRota, setBuscaClienteRota] = useState('');
  const [resultadosClienteRota, setResultadosClienteRota] = useState<ClienteRota[]>([]);
  const [buscandoClienteRota, setBuscandoClienteRota] = useState(false);
  const [paradasRota, setParadasRota] = useState<ParadaRota[]>([]);
  const [rotaDiaId, setRotaDiaId] = useState<number | null>(null);
  const [carregandoRota, setCarregandoRota] = useState(false);

  const carregarRotaHoje = useCallback(async () => {
    if (!perfil?.empresa_id || !user?.id) return;
    setCarregandoRota(true);
    const hoje = getLocalYYYYMMDD(new Date());
    const { data: rota } = await supabase.from('rotas_dia')
      .select('id')
      .eq('empresa_id', perfil.empresa_id)
      .eq('vendedor_id', user.id)
      .eq('data', hoje)
      .maybeSingle();
    if (!rota) { setRotaDiaId(null); setParadasRota([]); setCarregandoRota(false); return; }
    setRotaDiaId(rota.id);
    const { data: paradas } = await supabase.from('rotas_dia_paradas')
      .select('id, cliente_id, ordem, status, score, motivo, clientes(nome_empresa, endereco, numero, bairro, cidade, estado, telefone)')
      .eq('rota_id', rota.id)
      .order('ordem');
    setParadasRota(((paradas as any[]) || []).map(p => ({
      id: p.id, cliente_id: p.cliente_id, ordem: p.ordem, status: p.status, score: p.score, motivo: p.motivo,
      nome_empresa: p.clientes?.nome_empresa || 'Cliente removido', endereco: p.clientes?.endereco, numero: p.clientes?.numero,
      bairro: p.clientes?.bairro, cidade: p.clientes?.cidade, estado: p.clientes?.estado, telefone: p.clientes?.telefone,
    })));
    setCarregandoRota(false);
  }, [perfil?.empresa_id, user?.id]);

  function abrirRotaDoDia() {
    setIsRotaModalOpen(true);
    carregarRotaHoje();
  }

  // Carrega o resumo da rota assim que a página abre, pro contador no botão do header já
  // vir certo antes do vendedor clicar em "Rota do Dia"
  useEffect(() => { carregarRotaHoje(); }, [carregarRotaHoje]);

  // Progresso ao vivo — se o diretor gerar/completar a rota ou outra aba marcar uma parada,
  // essa tela recarrega sozinha (mesmo padrão de canal usado em NotificationBell).
  useEffect(() => {
    if (!isRotaModalOpen || !user?.id) return;
    const channel = supabase
      .channel(`rota-dia-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rotas_dia_paradas', filter: `vendedor_id=eq.${user.id}` }, () => {
        carregarRotaHoje();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isRotaModalOpen, user?.id, carregarRotaHoje]);

  async function garantirRotaHoje(): Promise<number | null> {
    if (rotaDiaId) return rotaDiaId;
    if (!perfil?.empresa_id || !user?.id) return null;
    const hoje = getLocalYYYYMMDD(new Date());
    const { data: nova, error } = await supabase.from('rotas_dia')
      .insert([{ empresa_id: perfil.empresa_id, vendedor_id: user.id, data: hoje, criado_por: user.id }])
      .select('id').single();
    if (error || !nova) {
      // Corrida com outra aba/o diretor gerando ao mesmo tempo — a rota já existe, só busca o id
      const { data: existente } = await supabase.from('rotas_dia')
        .select('id').eq('empresa_id', perfil.empresa_id).eq('vendedor_id', user.id).eq('data', hoje).maybeSingle();
      if (existente) { setRotaDiaId(existente.id); return existente.id; }
      return null;
    }
    setRotaDiaId(nova.id);
    return nova.id;
  }

  useEffect(() => {
    if (buscaClienteRota.trim().length < 2) { setResultadosClienteRota([]); return; }
    setBuscandoClienteRota(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clientes')
        .select('id, nome_empresa, endereco, numero, bairro, cidade, estado, telefone')
        .eq('status', 'ativo')
        .eq('empresa_id', perfil?.empresa_id)
        .ilike('nome_empresa', `%${buscaClienteRota.trim()}%`)
        .order('nome_empresa').limit(10);
      setResultadosClienteRota((data as ClienteRota[]) || []);
      setBuscandoClienteRota(false);
    }, 350);
    return () => clearTimeout(t);
  }, [buscaClienteRota, perfil?.empresa_id]);

  useEffect(() => {
    if (!isModalOpen) return;
    if (empresaVisita.trim().length < 2 || empresaVisita === clienteVisitaSelecionado) {
      setSugestoesClienteVisita([]);
      return;
    }
    setBuscandoClienteVisita(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clientes')
        .select('id, nome_empresa, endereco, numero, bairro, cidade, estado, telefone')
        .eq('status', 'ativo')
        .eq('empresa_id', perfil?.empresa_id)
        .ilike('nome_empresa', `%${empresaVisita.trim()}%`)
        .order('nome_empresa').limit(6);
      setSugestoesClienteVisita((data as ClienteRota[]) || []);
      setMostrarSugestoesVisita(true);
      setBuscandoClienteVisita(false);
    }, 350);
    return () => clearTimeout(t);
  }, [empresaVisita, isModalOpen, perfil?.empresa_id, clienteVisitaSelecionado]);

  function selecionarClienteVisita(c: ClienteRota) {
    setEmpresaVisita(c.nome_empresa);
    setClienteVisitaSelecionado(c.nome_empresa);
    setClienteVisitaSelecionadoId(c.id);
    if (c.telefone) setTelefone(c.telefone);
    if (c.cidade) setCidade(c.cidade);
    setSugestoesClienteVisita([]);
    setMostrarSugestoesVisita(false);
  }

  const adicionarParada = async (c: ClienteRota) => {
    if (paradasRota.some(p => p.cliente_id === c.id)) return;
    setBuscaClienteRota('');
    setResultadosClienteRota([]);
    const rid = await garantirRotaHoje();
    if (!rid || !perfil?.empresa_id || !user?.id) return;
    const ordem = paradasRota.length > 0 ? Math.max(...paradasRota.map(p => p.ordem)) + 1 : 1;
    const { data, error } = await supabase.from('rotas_dia_paradas')
      .insert([{ rota_id: rid, empresa_id: perfil.empresa_id, vendedor_id: user.id, cliente_id: c.id, ordem, status: 'pendente' }])
      .select('id').single();
    if (!error && data) {
      setParadasRota(prev => [...prev, {
        id: data.id, cliente_id: c.id, ordem, status: 'pendente',
        nome_empresa: c.nome_empresa, endereco: c.endereco, numero: c.numero, bairro: c.bairro, cidade: c.cidade, estado: c.estado, telefone: c.telefone,
      }]);
    }
  };

  const removerParada = async (paradaId: number) => {
    setParadasRota(prev => prev.filter(p => p.id !== paradaId));
    await supabase.from('rotas_dia_paradas').delete().eq('id', paradaId);
  };

  const marcarStatusParada = async (paradaId: number, status: ParadaRota['status']) => {
    setParadasRota(prev => prev.map(p => p.id === paradaId ? { ...p, status } : p));
    await supabase.from('rotas_dia_paradas').update({ status }).eq('id', paradaId);
  };

  const moverParada = async (index: number, delta: number) => {
    const alvo = index + delta;
    if (alvo < 0 || alvo >= paradasRota.length) return;
    const a = paradasRota[index], b = paradasRota[alvo];
    const novo = [...paradasRota];
    [novo[index], novo[alvo]] = [novo[alvo], novo[index]];
    setParadasRota(novo);
    await Promise.all([
      supabase.from('rotas_dia_paradas').update({ ordem: b.ordem }).eq('id', a.id),
      supabase.from('rotas_dia_paradas').update({ ordem: a.ordem }).eq('id', b.id),
    ]);
  };

  const enderecoParada = (c: { endereco?: string; numero?: string; bairro?: string; cidade?: string; estado?: string; nome_empresa: string }) => {
    const partes = [c.endereco && c.numero ? `${c.endereco}, ${c.numero}` : c.endereco, c.bairro, c.cidade, c.estado].filter(Boolean);
    return partes.length > 0 ? partes.join(', ') : c.nome_empresa;
  };

  const abrirRotaNoMaps = () => {
    const pendentes = paradasRota.filter(p => p.status === 'pendente');
    const alvo = pendentes.length > 0 ? pendentes : paradasRota;
    if (alvo.length === 0) return;
    const enderecos = alvo.map(c => encodeURIComponent(enderecoParada(c)));
    const destino = enderecos[enderecos.length - 1];
    const waypoints = enderecos.slice(0, -1).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destino}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;
    window.open(url, '_blank');
  };

  // Preview do trajeto dentro do sistema (Leaflet + OpenStreetMap, sem API paga) — só pra
  // visualizar a ordem das paradas antes de sair. A navegação com voz continua sendo o
  // Google Maps mesmo, isso nenhum mapa embutido em página substitui.
  const [paradasGeo, setParadasGeo] = useState<ParadaGeo[]>([]);
  useEffect(() => {
    if (!isRotaModalOpen || paradasRota.length === 0) { setParadasGeo([]); return; }
    const base: ParadaGeo[] = paradasRota.map(p => {
      const existente = paradasGeo.find(g => g.id === p.id);
      return { id: p.id, nome: p.nome_empresa, endereco: enderecoParada(p), lat: existente?.lat, lng: existente?.lng };
    });
    setParadasGeo(base);
    geocodificarParadas(base, setParadasGeo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRotaModalOpen, paradasRota]);

  // Reordena as paradas pela proximidade real (nearest-neighbor sobre lat/lng já geocodificado
  // pro preview) — aproximação em plano (Math.hypot) é suficiente pra distâncias dentro de uma
  // cidade, não precisa de haversine pra esse caso de uso.
  function ordenarParadasPorProximidade() {
    const comCoord = paradasGeo.filter(g => g.lat !== undefined && g.lng !== undefined);
    if (comCoord.length < 2) return;
    const restante = [...comCoord];
    const ordenado: ParadaGeo[] = [restante.shift()!];
    while (restante.length > 0) {
      const atual = ordenado[ordenado.length - 1];
      let melhorIdx = 0, melhorDist = Infinity;
      restante.forEach((p, i) => {
        const d = Math.hypot(p.lat! - atual.lat!, p.lng! - atual.lng!);
        if (d < melhorDist) { melhorDist = d; melhorIdx = i; }
      });
      ordenado.push(restante.splice(melhorIdx, 1)[0]);
    }
    const idsOrdenados = ordenado.map(g => g.id);
    const semCoord = paradasRota.filter(p => !idsOrdenados.includes(p.id));
    const novaOrdem = [
      ...idsOrdenados.map(id => paradasRota.find(p => p.id === id)!).filter(Boolean),
      ...semCoord,
    ];
    setParadasRota(novaOrdem);
    novaOrdem.forEach((p, i) => { supabase.from('rotas_dia_paradas').update({ ordem: i + 1 }).eq('id', p.id).then(() => {}); });
  }

  // Remove só as paradas pendentes/puladas — as já visitadas ficam como histórico do dia
  const limparRotaHoje = async () => {
    const idsRemover = paradasRota.filter(p => p.status !== 'visitada').map(p => p.id);
    setParadasRota(prev => prev.filter(p => p.status === 'visitada'));
    if (idsRemover.length > 0) await supabase.from('rotas_dia_paradas').delete().in('id', idsRemover);
  };

  // Relatório Estratégico IA (analisa observações das visitas filtradas)
  const [relatorioIAOpen, setRelatorioIAOpen] = useState(false);
  const [relatorioIALoading, setRelatorioIALoading] = useState(false);
  const [relatorioIAErro, setRelatorioIAErro] = useState('');
  const [relatorioIA, setRelatorioIA] = useState<{
    resumo_executivo?: string;
    sinais_compra?: { cliente: string; sinal: string; comentario_origem: string; recomendacao?: string; cidade?: string }[];
    objecoes?: { padrao: string; ocorrencias: number; exemplo: string; recomendacao?: string }[];
    risco_perda?: { cliente: string; motivo: string; comentario_origem: string; recomendacao?: string; cidade?: string }[];
    concentracao_regional?: { cidade: string; oportunidades: number; riscos: number }[];
  } | null>(null);
  const [relatorioIAContagem, setRelatorioIAContagem] = useState(0);
  const [relatorioIAClientes, setRelatorioIAClientes] = useState(0);

  const isDirector = perfil?.cargo === 'diretor';
  const isGerente = perfil?.cargo === 'gerente';
  const isLideranca = isDirector || isGerente;

  const toast = useCallback((msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
  }, []);

  const carregarVisitas = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    let query = supabase
      .from('visitas')
      .select('*')
      .eq('empresa_id', perfil.empresa_id)
      .order('created_at', { ascending: false });

    if (dataInicio) query = query.gte('created_at', dataInicio);
    if (dataFim) query = query.lte('created_at', `${dataFim}T23:59:59`);

    if (!isDirector) {
      if (isGerente && perfil?.unidade) query = query.eq('unidade', perfil.unidade);
      else query = query.eq('user_id', user?.id);
    }

    const { data, error } = await query;
    if (!error && data) setVisitas(data as Visita[]);
    setLoading(false);
  }, [perfil?.empresa_id, perfil?.unidade, user?.id, isDirector, isGerente, dataInicio, dataFim]);

  const carregarVendedores = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    let query = supabase
      .from('profiles')
      .select('id, nome, cargo')
      .eq('empresa_id', perfil.empresa_id);
    if (!isDirector && isGerente && perfil?.unidade) query = query.eq('unidade', perfil.unidade);
    const { data } = await query;
    if (data) setVendedores(data as Perfil[]);
  }, [perfil?.empresa_id, perfil?.unidade, isDirector, isGerente]);

  useEffect(() => {
    carregarVisitas();
    carregarVendedores();
  }, [carregarVisitas, carregarVendedores]);

  const nomesMap: Record<string, string> = {};
  vendedores.forEach(v => { nomesMap[v.id] = v.nome; });

  async function buscarCidadePorCoords(lat: number, lng: number) {
    setCidadeDetectando(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`);
      if (res.ok) {
        const data = await res.json();
        const addr = data?.address || {};
        const cidadeDetectada = addr.city || addr.town || addr.village || addr.municipality || addr.county;
        if (cidadeDetectada) setCidade(cidadeDetectada);
      }
    } catch { /* falha silenciosa — usuário pode digitar a cidade manualmente */ }
    setCidadeDetectando(false);
  }

  function abrirModalNovaVisita() {
    setEmpresaVisita('');
    setTelefone('');
    setUnidadeVisita(perfil?.unidade || (unidades.length === 1 ? unidades[0].nome : ''));
    setCidade('');
    setObservacao('');
    setCoords(null);
    setGeoStatus('loading');
    setSaveError('');
    setFotoFile(null);
    setFotoPreview(null);
    setSugestoesClienteVisita([]);
    setMostrarSugestoesVisita(false);
    setClienteVisitaSelecionado(null);
    setClienteVisitaSelecionadoId(null);
    setIsModalOpen(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus('ok');
        buscarCidadePorCoords(pos.coords.latitude, pos.coords.longitude);
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setFotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function salvarVisita() {
    if (!empresaVisita.trim()) return;
    if (!perfil?.empresa_id) {
      setSaveError('Perfil não carregado. Recarregue a página.');
      return;
    }
    setSaving(true);
    setSaveError('');

    let foto_url: string | null = null;
    if (fotoFile) {
      setUploadingFoto(true);
      try {
        const ext = fotoFile.name.split('.').pop() || 'jpg';
        const path = `${perfil.empresa_id}/${Date.now()}.${ext}`;
        // upsert:false — o caminho ja tem timestamp, entao nunca colide de verdade, e evitar
        // upsert contorna uma exigencia do Postgres de satisfazer a policy de UPDATE tambem
        // (nao so INSERT) em operacoes de upsert, mesmo pra arquivo novo.
        const { error: upErr } = await supabase.storage.from('visitas').upload(path, fotoFile, { upsert: false, contentType: fotoFile.type || 'image/jpeg' });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('visitas').getPublicUrl(path);
          foto_url = urlData.publicUrl;
        } else {
          console.error('[visitas] erro ao enviar foto:', upErr.message);
          toast('⚠️ Visita salva, mas a foto não pôde ser enviada.');
        }
      } catch (err) {
        console.error('[visitas] erro ao enviar foto:', err);
        toast('⚠️ Visita salva, mas a foto não pôde ser enviada.');
      }
      setUploadingFoto(false);
    }

    // Só amarra ao cliente real se o texto do campo ainda é exatamente o nome que veio da
    // sugestão selecionada — se o vendedor editou depois, volta a ser genérico (sem cliente_id).
    const cliente_id = (clienteVisitaSelecionadoId && empresaVisita.trim() === clienteVisitaSelecionado)
      ? clienteVisitaSelecionadoId
      : null;

    const mapsUrl = coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : null;
    const payload = {
      empresa: empresaVisita.trim(),
      telefone: telefone || null,
      cidade: cidade || null,
      observacao: observacao || null,
      user_id: user?.id,
      empresa_id: perfil.empresa_id,
      unidade: unidadeVisita || null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      localizacao_url: mapsUrl,
      lead_id: null,
      foto_url,
      cliente_id,
    };
    try {
      const { data, error } = await supabase.from('visitas').insert([payload]).select();
      if (error) throw error;
      if (data) setVisitas(prev => [data[0] as Visita, ...prev]);

      // Vínculo automático com a Rota do Dia: se esse cliente é uma parada pendente hoje,
      // marca como visitada — o vendedor não precisa fazer nada além de registrar a visita.
      if (data && cliente_id) {
        const hoje = getLocalYYYYMMDD(new Date());
        const { data: rotaHoje } = await supabase.from('rotas_dia')
          .select('id')
          .eq('empresa_id', perfil.empresa_id)
          .eq('vendedor_id', user?.id)
          .eq('data', hoje)
          .maybeSingle();
        if (rotaHoje) {
          await supabase.from('rotas_dia_paradas')
            .update({ status: 'visitada', visita_id: data[0].id })
            .eq('rota_id', rotaHoje.id)
            .eq('cliente_id', cliente_id)
            .eq('status', 'pendente');
        }
      }

      setIsModalOpen(false);
      toast('Visita registrada! 📍');
    } catch (err: any) {
      setSaveError(err?.message || 'Erro ao salvar visita. Verifique se a tabela foi criada no Supabase.');
    } finally {
      setSaving(false);
    }
  }

  async function excluirVisita(visita: Visita) {
    if (!isDirector) return;
    if (!confirm(`Excluir a visita "${visita.empresa}"? Essa ação não pode ser desfeita.`)) return;
    setExcluindoVisita(true);
    try {
      if (visita.foto_url) {
        const marcador = '/object/public/visitas/';
        const idx = visita.foto_url.indexOf(marcador);
        if (idx !== -1) {
          const path = decodeURIComponent(visita.foto_url.slice(idx + marcador.length));
          await supabase.storage.from('visitas').remove([path]);
        }
      }
      const { error } = await supabase.from('visitas').delete().eq('id', visita.id);
      if (error) throw error;
      setVisitas(prev => prev.filter(v => v.id !== visita.id));
      setVisitaDetalhe(null);
      toast('Visita excluída.');
    } catch (err) {
      console.error('[visitas] erro ao excluir:', err);
      toast('Erro ao excluir a visita.');
    } finally {
      setExcluindoVisita(false);
    }
  }

  async function criarLeadDaVisita(visita: Visita) {
    setCriandoLead(true);
    try {
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert([{
          empresa: visita.empresa,
          telefone: visita.telefone || null,
          descricao: visita.observacao || null,
          tipo: 'visita',
          origem: 'Visita',
          etapa: 0,
          status: 'aberto',
          valor_total: 0,
          user_id: visita.user_id,
          empresa_id: visita.empresa_id,
          unidade: visita.unidade || null,
          latitude: visita.latitude ?? null,
          longitude: visita.longitude ?? null,
          localizacao_url: visita.localizacao_url || null,
        }])
        .select()
        .single();

      if (leadError) throw leadError;

      const { error: updateError } = await supabase
        .from('visitas')
        .update({ lead_id: leadData.id })
        .eq('id', visita.id);

      if (updateError) throw updateError;

      setVisitas(prev => prev.map(v => v.id === visita.id ? { ...v, lead_id: leadData.id } : v));
      setCriarLeadVisita(null);
      toast('Lead criado no pipeline! 🎯');
    } catch {
      toast('Erro ao criar lead.');
    } finally {
      setCriandoLead(false);
    }
  }

  const visitasFiltradas = visitas.filter(v => {
    if (filtroVendedor !== 'todos' && v.user_id !== filtroVendedor) return false;
    if (filtroLead === 'com_lead' && !v.lead_id) return false;
    if (filtroLead === 'sem_lead' && v.lead_id) return false;
    if (busca && !v.empresa.toLowerCase().includes(busca.toLowerCase()) && !v.telefone?.includes(busca)) return false;
    return true;
  });

  async function gerarRelatorioIA() {
    if (visitasFiltradas.length === 0) {
      toast('Nenhuma visita no filtro atual pra analisar.');
      return;
    }
    setRelatorioIAOpen(true);
    setRelatorioIALoading(true);
    setRelatorioIAErro('');
    setRelatorioIA(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/ia/relatorio-visitas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ visitaIds: visitasFiltradas.map(v => v.id) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Erro ao gerar relatório.');
      setRelatorioIA(j.relatorio);
      setRelatorioIAContagem(j.visitasAnalisadas || 0);
      setRelatorioIAClientes(j.clientesAnalisados || 0);
    } catch (err: any) {
      setRelatorioIAErro(err?.message || 'Erro ao gerar relatório.');
    } finally {
      setRelatorioIALoading(false);
    }
  }

  const visitasDoVendedor = visitas.filter(v => filtroVendedor === 'todos' || v.user_id === filtroVendedor);
  const totalVisitas = visitasDoVendedor.length;
  const comLead = visitasDoVendedor.filter(v => v.lead_id).length;
  const semLead = visitasDoVendedor.filter(v => !v.lead_id).length;
  return (
    <div className="h-full flex flex-col pb-20 md:pb-2 animate-in fade-in duration-500">

      {/* TOPO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 px-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic flex items-center gap-2">
              <MapPin size={24} className="text-blue-400" /> Visitas
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
              {perfil?.nome} — histórico de visitas a campo
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {temPulse && (
            <button
              onClick={abrirRotaDoDia}
              className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
            >
              <Navigation size={14} /> Rota do Dia {paradasRota.length > 0 ? `(${paradasRota.length})` : ''}
            </button>
          )}
          <button
            onClick={gerarRelatorioIA}
            disabled={visitasFiltradas.length === 0}
            className="flex items-center gap-2 bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
          >
            <Sparkles size={14} /> Relatório Estratégico IA ({visitasFiltradas.length})
          </button>
          <button
            onClick={abrirModalNovaVisita}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_5px_20px_rgba(59,130,246,0.3)] flex items-center gap-2"
          >
            <Plus size={16} strokeWidth={3} /> Registrar Visita
          </button>
        </div>
      </div>

      {/* CARDS RESUMO */}
      <div className="grid grid-cols-3 gap-2 px-2 mb-4">
        <div className="bg-[#0B1120] border border-white/10 rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-white">{totalVisitas}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total</div>
        </div>
        <div className="bg-[#0B1120] border border-[rgb(var(--cor-primaria-rgb)/20%)] rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-[var(--cor-primaria)]">{comLead}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[rgb(var(--cor-primaria-rgb)/70%)]">Com Lead</div>
        </div>
        <div className="bg-[#0B1120] border border-orange-500/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-orange-400">{semLead}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-orange-400/70">Sem Lead</div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap items-center gap-2 px-2 mb-4">
        <div className="flex items-center bg-[#0B1120] border border-white/10 rounded-xl px-3 h-9 gap-2 flex-1 min-w-[180px]">
          <Search size={12} className="text-slate-400" />
          <input
            type="text"
            placeholder="Buscar empresa ou telefone..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="bg-transparent text-white text-xs outline-none w-full placeholder:text-slate-600"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#0B1120] border border-white/10 rounded-xl h-9 overflow-hidden">
          {(['todos', 'com_lead', 'sem_lead'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setFiltroLead(opt)}
              className={`px-3 h-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                filtroLead === opt
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt === 'todos' ? 'Todos' : opt === 'com_lead' ? 'Com Lead' : 'Sem Lead'}
            </button>
          ))}
        </div>

        {isLideranca && (
          <select
            value={filtroVendedor}
            onChange={e => setFiltroVendedor(e.target.value)}
            className="bg-[#0B1120] border border-white/10 rounded-xl text-blue-400 text-[10px] font-bold uppercase outline-none cursor-pointer appearance-none px-3 h-9"
          >
            <option value="todos" className="bg-[#0B1120]">Todos Vendedores</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id} className="bg-[#0B1120]">{v.nome}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-2 bg-[#0B1120] border border-white/10 rounded-xl px-3 h-9">
          <Calendar size={12} className="text-slate-400 shrink-0" />
          <input
            type="date"
            value={dataInicio}
            onChange={e => setDataInicio(e.target.value)}
            className="bg-transparent text-white text-[10px] font-bold outline-none"
          />
          <span className="text-slate-600 text-[10px]">até</span>
          <input
            type="date"
            value={dataFim}
            onChange={e => setDataFim(e.target.value)}
            className="bg-transparent text-white text-[10px] font-bold outline-none"
          />
        </div>
      </div>

      {/* LISTA DE VISITAS */}
      <div className="flex-1 overflow-y-auto px-2 space-y-2 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-blue-400" />
          </div>
        ) : visitasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <MapPin size={48} className="text-slate-700" />
            <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">Nenhuma visita encontrada</p>
            <button
              onClick={abrirModalNovaVisita}
              className="mt-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2"
            >
              <Plus size={14} /> Registrar primeira visita
            </button>
          </div>
        ) : (
          visitasFiltradas.map(visita => (
            <div
              key={visita.id}
              onClick={() => setVisitaDetalhe(visita)}
              className={`bg-[#0B1120] border rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 transition-all hover:border-white/20 cursor-pointer ${
                visita.lead_id ? 'border-[rgb(var(--cor-primaria-rgb)/20%)]' : 'border-white/10'
              }`}
            >
              {/* ÍCONE + DADOS */}
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${
                  visita.lead_id ? 'bg-[rgb(var(--cor-primaria-rgb)/10%)] border border-[rgb(var(--cor-primaria-rgb)/30%)]' : 'bg-blue-500/10 border border-blue-500/30'
                }`}>
                  <MapPin size={18} className={visita.lead_id ? 'text-[var(--cor-primaria)]' : 'text-blue-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-white font-black text-sm truncate">{visita.empresa}</span>
                    {visita.lead_id ? (
                      <span className="bg-[rgb(var(--cor-primaria-rgb)/15%)] border border-[rgb(var(--cor-primaria-rgb)/40%)] text-[var(--cor-primaria)] text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={9} /> Lead no Pipeline
                      </span>
                    ) : (
                      <span className="bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock size={9} /> Sem Lead
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    <span className="flex items-center gap-1">
                      <Calendar size={9} />
                      {formatDate(visita.created_at)} às {formatTime(visita.created_at)}
                    </span>
                    {visita.telefone && (
                      <span className="flex items-center gap-1">
                        <Phone size={9} /> {visita.telefone}
                      </span>
                    )}
                    {visita.unidade && (
                      <span className="flex items-center gap-1">
                        <Building2 size={9} /> {visita.unidade}
                      </span>
                    )}
                    {visita.cidade && (
                      <span className="flex items-center gap-1">
                        <Map size={9} /> {visita.cidade}
                      </span>
                    )}
                    {isLideranca && visita.user_id && nomesMap[visita.user_id] && (
                      <span className="flex items-center gap-1">
                        <User size={9} /> {nomesMap[visita.user_id]}
                      </span>
                    )}
                    {visita.localizacao_url && (
                      <a
                        href={visita.localizacao_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Navigation size={9} /> Ver no Maps
                      </a>
                    )}
                  </div>
                  {visita.observacao && (
                    <p className="mt-1.5 text-slate-400 text-xs line-clamp-2 italic">
                      "{visita.observacao}"
                    </p>
                  )}
                </div>
              </div>

              {/* AÇÕES */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {visita.lead_id ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push('/deals'); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[rgb(var(--cor-primaria-rgb)/10%)] border border-[rgb(var(--cor-primaria-rgb)/30%)] text-[var(--cor-primaria)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[rgb(var(--cor-primaria-rgb)/20%)] transition-colors"
                  >
                    <Zap size={12} /> Ver Pipeline
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setCriarLeadVisita(visita); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600/15 border border-blue-500/30 text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all"
                  >
                    <Plus size={12} /> Criar Lead
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL: NOVA VISITA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-blue-500/30 w-full max-w-md rounded-[32px] shadow-2xl flex flex-col animate-in zoom-in-95 max-h-[90dvh]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-blue-500/5 rounded-t-[32px] flex-shrink-0">
              <h2 className="text-xl font-black uppercase italic tracking-tighter text-blue-400 flex items-center gap-2">
                <MapPin size={22} /> Registrar Visita
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                geoStatus === 'ok' ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : geoStatus === 'denied' ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
              }`}>
                <MapPin size={12} className={geoStatus === 'loading' ? 'animate-pulse' : ''} />
                {geoStatus === 'loading' && 'Obtendo localização...'}
                {geoStatus === 'ok' && `Localização capturada: ${coords?.lat.toFixed(5)}, ${coords?.lng.toFixed(5)}`}
                {geoStatus === 'denied' && 'Sem permissão de localização — visita será salva sem coordenadas'}
              </div>

              <div className="relative">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Nome do Cliente / Empresa *
                </label>
                <div className="relative">
                  <input
                    autoFocus
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
                    placeholder="Ex: João Silva, Loja ABC..."
                    value={empresaVisita}
                    onChange={e => { setEmpresaVisita(e.target.value); setClienteVisitaSelecionado(null); setClienteVisitaSelecionadoId(null); }}
                    onFocus={() => { if (sugestoesClienteVisita.length > 0) setMostrarSugestoesVisita(true); }}
                    onBlur={() => setTimeout(() => setMostrarSugestoesVisita(false), 150)}
                  />
                  {buscandoClienteVisita && (
                    <Loader2 size={14} className="animate-spin text-slate-500 absolute right-4 top-1/2 -translate-y-1/2" />
                  )}
                </div>
                {mostrarSugestoesVisita && sugestoesClienteVisita.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-[#0F172A] border border-white/10 rounded-xl overflow-hidden max-h-52 overflow-y-auto shadow-2xl">
                    {sugestoesClienteVisita.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => selecionarClienteVisita(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-white/5 border-b border-white/5 last:border-0"
                      >
                        <p className="text-white text-sm font-bold">{c.nome_empresa}</p>
                        <p className="text-slate-500 text-xs truncate">{enderecoParada(c)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {unidades.length > 1 && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block flex items-center gap-1.5">
                    <Building2 size={12}/> Unidade / Filial
                  </label>
                  <select
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors cursor-pointer appearance-none"
                    value={unidadeVisita}
                    onChange={e => setUnidadeVisita(e.target.value)}
                  >
                    <option value="" className="bg-[#0B1120]">Selecione uma unidade</option>
                    {unidades.map(u => (
                      <option key={u.id} value={u.nome} className="bg-[#0B1120]">{u.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                    Telefone (opcional)
                  </label>
                  <input
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
                    placeholder="(00) 00000-0000"
                    value={telefone}
                    onChange={e => setTelefone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                    Cidade
                  </label>
                  <input
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
                    placeholder={cidadeDetectando ? 'Detectando via GPS...' : 'Ex: Taió'}
                    value={cidade}
                    onChange={e => setCidade(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Observação
                </label>
                <textarea
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-blue-500 min-h-[90px] resize-none custom-scrollbar transition-colors"
                  placeholder="O que aconteceu na visita? Cliente disse que..."
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block flex items-center gap-2">
                  <Camera size={12}/> Foto do Check-in (opcional)
                </label>
                {fotoPreview ? (
                  <div className="relative inline-block">
                    <img src={fotoPreview} alt="Preview" className="w-full max-h-40 object-cover rounded-xl border border-white/10" />
                    <button type="button" onClick={() => { setFotoFile(null); setFotoPreview(null); }} className="absolute top-2 right-2 bg-black/70 text-white p-1 rounded-lg hover:bg-red-500 transition-colors">
                      <X size={12}/>
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-blue-500/50 transition-colors bg-black/30">
                    <ImageIcon size={20} className="text-slate-600 mb-1"/>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Tirar foto ou selecionar</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoChange} />
                  </label>
                )}
              </div>
            </div>

            {saveError && (
              <div className="px-6 pb-2">
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-xs font-bold">
                  {saveError}
                </div>
              </div>
            )}

            <div className="p-6 border-t border-white/10 bg-[#0F172A] rounded-b-[32px] flex gap-3 flex-shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvarVisita}
                disabled={!empresaVisita.trim() || saving}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin"/> : <MapPin size={14}/>}
                {uploadingFoto ? 'Enviando foto...' : saving ? 'Salvando...' : 'Registrar Visita'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR CRIAR LEAD */}
      {criarLeadVisita && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-white/10 w-full max-w-sm rounded-[28px] shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-center">
                <Zap size={18} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-white font-black text-sm uppercase tracking-widest">Criar Lead</h2>
                <p className="text-slate-500 text-[10px] font-bold">{criarLeadVisita.empresa}</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-slate-400 text-sm">
                Isso vai criar um lead no pipeline de Vendas para{' '}
                <span className="text-white font-bold">{criarLeadVisita.empresa}</span> com base nessa visita.
              </p>
            </div>
            <div className="p-6 border-t border-white/10 flex gap-3">
              <button
                onClick={() => setCriarLeadVisita(null)}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => criarLeadDaVisita(criarLeadVisita)}
                disabled={criandoLead}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {criandoLead ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {criandoLead ? 'Criando...' : 'Criar Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALHE DA VISITA */}
      {visitaDetalhe && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setVisitaDetalhe(null)}>
          <div className="bg-[#0B1120] border border-white/10 w-full max-w-md rounded-[28px] shadow-2xl flex flex-col animate-in zoom-in-95 max-h-[90dvh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10 flex justify-between items-start bg-blue-500/5 rounded-t-[28px] flex-shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-white">{visitaDetalhe.empresa}</h2>
                {visitaDetalhe.lead_id ? (
                  <span className="bg-[rgb(var(--cor-primaria-rgb)/15%)] border border-[rgb(var(--cor-primaria-rgb)/40%)] text-[var(--cor-primaria)] text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 size={9} /> Lead no Pipeline
                  </span>
                ) : (
                  <span className="bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Clock size={9} /> Sem Lead
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isDirector && (
                  <button
                    onClick={() => excluirVisita(visitaDetalhe)}
                    disabled={excluindoVisita}
                    title="Excluir visita"
                    className="p-2 bg-red-500/10 rounded-full text-red-500/70 hover:text-white hover:bg-red-500 transition-all disabled:opacity-50"
                  >
                    {excluindoVisita ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  </button>
                )}
                <button onClick={() => setVisitaDetalhe(null)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              {visitaDetalhe.foto_url && (
                <a href={visitaDetalhe.foto_url} target="_blank" rel="noopener noreferrer">
                  <img src={visitaDetalhe.foto_url} alt="Foto da visita" className="w-full max-h-80 object-cover rounded-2xl border border-white/10 hover:border-blue-500/50 transition-all" />
                </a>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Calendar size={12} className="text-blue-400 shrink-0"/>
                  {formatDate(visitaDetalhe.created_at)} às {formatTime(visitaDetalhe.created_at)}
                </div>
                {visitaDetalhe.telefone && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Phone size={12} className="text-blue-400 shrink-0"/> {visitaDetalhe.telefone}
                  </div>
                )}
                {visitaDetalhe.unidade && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Building2 size={12} className="text-blue-400 shrink-0"/> {visitaDetalhe.unidade}
                  </div>
                )}
                {visitaDetalhe.cidade && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Map size={12} className="text-blue-400 shrink-0"/> {visitaDetalhe.cidade}
                  </div>
                )}
                {isLideranca && visitaDetalhe.user_id && nomesMap[visitaDetalhe.user_id] && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <User size={12} className="text-blue-400 shrink-0"/> {nomesMap[visitaDetalhe.user_id]}
                  </div>
                )}
              </div>

              {visitaDetalhe.observacao && (
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Observação</p>
                  <p className="text-slate-300 text-sm italic">"{visitaDetalhe.observacao}"</p>
                </div>
              )}

              {visitaDetalhe.localizacao_url && (
                <a
                  href={visitaDetalhe.localizacao_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600/20 rounded-xl py-2.5 text-xs font-black uppercase tracking-widest transition-colors"
                >
                  <Navigation size={14} /> Ver no Maps
                </a>
              )}
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3 flex-shrink-0">
              {visitaDetalhe.lead_id ? (
                <button
                  onClick={() => { setVisitaDetalhe(null); router.push('/deals'); }}
                  className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-[rgb(var(--cor-primaria-rgb)/10%)] border border-[rgb(var(--cor-primaria-rgb)/30%)] text-[var(--cor-primaria)] hover:bg-[rgb(var(--cor-primaria-rgb)/20%)] transition-all flex items-center justify-center gap-2"
                >
                  <Zap size={14} /> Ver Pipeline
                </button>
              ) : (
                <button
                  onClick={() => { setCriarLeadVisita(visitaDetalhe); setVisitaDetalhe(null); }}
                  className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-blue-600/15 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Criar Lead
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {relatorioIAOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setRelatorioIAOpen(false)}>
          <div className="bg-[#0B1120] border border-purple-500/20 rounded-[32px] max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-purple-500/20 rounded-xl flex items-center justify-center"><Sparkles size={18} className="text-purple-400"/></div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase italic tracking-tighter">Relatório Estratégico IA</h2>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">
                    {relatorioIALoading ? 'Analisando comentários...' : `${relatorioIAContagem} visita${relatorioIAContagem === 1 ? '' : 's'} · ${relatorioIAClientes} cliente${relatorioIAClientes === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setRelatorioIAOpen(false)} className="text-slate-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2 transition-all">
                <X size={18}/>
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
              {relatorioIALoading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={28} className="animate-spin text-purple-400" />
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Cruzando comentários e GPS...</p>
                </div>
              )}

              {!relatorioIALoading && relatorioIAErro && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-400 text-sm font-bold">
                  {relatorioIAErro}
                </div>
              )}

              {!relatorioIALoading && relatorioIA && (
                <>
                  {relatorioIA.resumo_executivo && (
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4">
                      <p className="text-purple-300 text-sm font-bold italic">{relatorioIA.resumo_executivo}</p>
                    </div>
                  )}

                  <div>
                    <h3 className="flex items-center gap-2 text-xs font-black text-[var(--cor-primaria)] uppercase tracking-widest mb-3">
                      <TrendingUp size={14}/> Sinais de Compra {relatorioIA.sinais_compra?.length ? `(${relatorioIA.sinais_compra.length})` : ''}
                    </h3>
                    {relatorioIA.sinais_compra && relatorioIA.sinais_compra.length > 0 ? (
                      <div className="space-y-2">
                        {relatorioIA.sinais_compra.map((s, i) => (
                          <div key={i} className="bg-[rgb(var(--cor-primaria-rgb)/5%)] border border-[rgb(var(--cor-primaria-rgb)/20%)] rounded-xl p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-white text-xs font-black uppercase">{s.cliente}</p>
                              {s.cidade && <span className="text-[8px] text-slate-500 font-bold uppercase flex items-center gap-0.5 flex-shrink-0"><Map size={8}/> {s.cidade}</span>}
                            </div>
                            <p className="text-[var(--cor-primaria)] text-xs font-bold mt-0.5">{s.sinal}</p>
                            <p className="text-slate-500 text-[10px] italic mt-1">&quot;{s.comentario_origem}&quot;</p>
                            {s.recomendacao && <p className="text-white/80 text-[10px] font-bold mt-2 flex items-start gap-1"><Zap size={10} className="text-[var(--cor-primaria)] mt-0.5 flex-shrink-0"/> {s.recomendacao}</p>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-slate-600 text-xs">Nenhum sinal claro de compra encontrado neste recorte.</p>}
                  </div>

                  <div>
                    <h3 className="flex items-center gap-2 text-xs font-black text-orange-400 uppercase tracking-widest mb-3">
                      <AlertTriangle size={14}/> Objeções Recorrentes {relatorioIA.objecoes?.length ? `(${relatorioIA.objecoes.length})` : ''}
                    </h3>
                    {relatorioIA.objecoes && relatorioIA.objecoes.length > 0 ? (
                      <div className="space-y-2">
                        {relatorioIA.objecoes.map((o, i) => (
                          <div key={i} className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-white text-xs font-black uppercase">{o.padrao}</p>
                              <span className="text-orange-400 text-[10px] font-black">{o.ocorrencias}x</span>
                            </div>
                            <p className="text-slate-500 text-[10px] italic mt-1">&quot;{o.exemplo}&quot;</p>
                            {o.recomendacao && <p className="text-white/80 text-[10px] font-bold mt-2 flex items-start gap-1"><Zap size={10} className="text-orange-400 mt-0.5 flex-shrink-0"/> {o.recomendacao}</p>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-slate-600 text-xs">Nenhum padrão de objeção recorrente identificado.</p>}
                  </div>

                  <div>
                    <h3 className="flex items-center gap-2 text-xs font-black text-red-400 uppercase tracking-widest mb-3">
                      <ShieldAlert size={14}/> Risco de Perda {relatorioIA.risco_perda?.length ? `(${relatorioIA.risco_perda.length})` : ''}
                    </h3>
                    {relatorioIA.risco_perda && relatorioIA.risco_perda.length > 0 ? (
                      <div className="space-y-2">
                        {relatorioIA.risco_perda.map((r, i) => (
                          <div key={i} className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-white text-xs font-black uppercase">{r.cliente}</p>
                              {r.cidade && <span className="text-[8px] text-slate-500 font-bold uppercase flex items-center gap-0.5 flex-shrink-0"><Map size={8}/> {r.cidade}</span>}
                            </div>
                            <p className="text-red-400 text-xs font-bold mt-0.5">{r.motivo}</p>
                            <p className="text-slate-500 text-[10px] italic mt-1">&quot;{r.comentario_origem}&quot;</p>
                            {r.recomendacao && <p className="text-white/80 text-[10px] font-bold mt-2 flex items-start gap-1"><Zap size={10} className="text-red-400 mt-0.5 flex-shrink-0"/> {r.recomendacao}</p>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-slate-600 text-xs">Nenhum sinal de risco/insatisfação identificado.</p>}
                  </div>

                  {relatorioIA.concentracao_regional && relatorioIA.concentracao_regional.length > 0 && (
                    <div>
                      <h3 className="flex items-center gap-2 text-xs font-black text-blue-400 uppercase tracking-widest mb-3">
                        <Map size={14}/> Concentração Regional
                      </h3>
                      <div className="space-y-2">
                        {relatorioIA.concentracao_regional.map((c, i) => (
                          <div key={i} className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex items-center justify-between">
                            <p className="text-white text-xs font-black uppercase">{c.cidade}</p>
                            <div className="flex items-center gap-3">
                              {c.oportunidades > 0 && <span className="text-[10px] text-[var(--cor-primaria)] font-black">{c.oportunidades} oportunidade{c.oportunidades === 1 ? '' : 's'}</span>}
                              {c.riscos > 0 && <span className="text-[10px] text-red-400 font-black">{c.riscos} risco{c.riscos === 1 ? '' : 's'}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isRotaModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4" onClick={() => setIsRotaModalOpen(false)}>
          <div className="bg-[#0B1120] border border-white/10 rounded-3xl w-full max-w-lg sm:max-w-xl md:max-w-3xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
              <div>
                <h2 className="text-lg font-black uppercase italic tracking-tighter text-white flex items-center gap-2">
                  <Navigation size={18} className="text-amber-400" /> Rota do Dia
                </h2>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-0.5">
                  {rotaDiaId ? 'Gerada pela liderança — acompanhe e ajuste aqui' : 'Nenhuma rota gerada ainda — busque clientes pra montar a sua'}
                </p>
              </div>
              <button onClick={() => setIsRotaModalOpen(false)} className="text-slate-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2 transition-all"><X size={18}/></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="relative">
                <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-amber-500">
                  <Search size={14} className="text-slate-500 flex-shrink-0" />
                  <input value={buscaClienteRota} onChange={e => setBuscaClienteRota(e.target.value)} placeholder="Buscar cliente pra adicionar na rota..." className="flex-1 bg-transparent outline-none text-white text-sm" />
                  {buscandoClienteRota && <Loader2 size={14} className="animate-spin text-slate-500" />}
                </div>
                {resultadosClienteRota.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-[#0F172A] border border-white/10 rounded-xl overflow-hidden max-h-52 overflow-y-auto shadow-2xl">
                    {resultadosClienteRota.map(c => (
                      <button key={c.id} onClick={() => adicionarParada(c)} className="w-full text-left px-4 py-2.5 hover:bg-white/5 border-b border-white/5 last:border-0">
                        <p className="text-white text-sm font-bold">{c.nome_empresa}</p>
                        <p className="text-slate-500 text-xs truncate">{enderecoParada(c)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {paradasRota.length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    <span>Progresso do dia</span>
                    <span className="text-amber-400">{paradasRota.filter(p => p.status === 'visitada').length}/{paradasRota.length} visitadas</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--cor-primaria)] transition-all"
                      style={{ width: `${(paradasRota.filter(p => p.status === 'visitada').length / paradasRota.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {carregandoRota ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={24} className="animate-spin text-amber-400" />
                </div>
              ) : paradasRota.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <Navigation size={28} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-xs font-bold text-slate-500 uppercase">Nenhuma parada adicionada ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {paradasRota.map((c, i) => {
                    const statusCfg = c.status === 'visitada'
                      ? { label: 'Visitada', color: 'text-[var(--cor-primaria)]', bg: 'bg-[rgb(var(--cor-primaria-rgb)/10%)] border-[rgb(var(--cor-primaria-rgb)/30%)]', icon: <CheckCircle2 size={9} /> }
                      : c.status === 'pulada'
                      ? { label: 'Pulada', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', icon: <SkipForward size={9} /> }
                      : { label: 'Pendente', color: 'text-slate-400', bg: 'bg-white/5 border-white/10', icon: <Clock size={9} /> };
                    return (
                      <div key={c.id} className={`flex items-start gap-2 border rounded-xl p-3 ${
                        c.status === 'visitada' ? 'bg-[rgb(var(--cor-primaria-rgb)/5%)] border-[rgb(var(--cor-primaria-rgb)/10%)]' : c.status === 'pulada' ? 'bg-orange-500/5 border-orange-500/10 opacity-70' : 'bg-white/[0.02] border-white/5'
                      }`}>
                        <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5">{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <p className="text-white text-sm font-bold truncate">{c.nome_empresa}</p>
                            <span className={`border px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${statusCfg.bg} ${statusCfg.color}`}>
                              {statusCfg.icon} {statusCfg.label}
                            </span>
                          </div>
                          <p className="text-slate-500 text-[10px] truncate">{enderecoParada(c)}</p>
                          {c.motivo && <p className="text-slate-600 text-[9px] italic mt-0.5 truncate">{c.motivo}</p>}
                        </div>
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                          <div className="flex gap-1">
                            <button onClick={() => moverParada(i, -1)} disabled={i === 0} className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded text-slate-300">↑</button>
                            <button onClick={() => moverParada(i, 1)} disabled={i === paradasRota.length - 1} className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded text-slate-300">↓</button>
                          </div>
                          <div className="flex gap-1">
                            {c.status !== 'visitada' && (
                              <button onClick={() => marcarStatusParada(c.id, 'visitada')} title="Marcar como visitada" className="w-6 h-6 flex items-center justify-center bg-[rgb(var(--cor-primaria-rgb)/10%)] hover:bg-[rgb(var(--cor-primaria-rgb)/20%)] rounded text-[var(--cor-primaria)]"><CheckCircle2 size={12}/></button>
                            )}
                            {c.status === 'pendente' && (
                              <button onClick={() => marcarStatusParada(c.id, 'pulada')} title="Pular por hoje" className="w-6 h-6 flex items-center justify-center bg-orange-500/10 hover:bg-orange-500/20 rounded text-orange-400"><SkipForward size={12}/></button>
                            )}
                            {c.status !== 'pendente' && (
                              <button onClick={() => marcarStatusParada(c.id, 'pendente')} title="Reabrir parada" className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-slate-400"><X size={12}/></button>
                            )}
                            <button onClick={() => removerParada(c.id)} title="Remover da rota" className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-red-500/20 rounded text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {paradasRota.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Prévia do trajeto</p>
                    <button onClick={ordenarParadasPorProximidade} className="flex items-center gap-1 text-[9px] font-black text-amber-400 hover:text-amber-300 uppercase tracking-widest transition-colors">
                      <Route size={10} /> Ordenar por proximidade
                    </button>
                  </div>
                  <RotaMapa paradas={paradasGeo} />
                  <p className="text-[9px] text-slate-600 mt-1.5">Linha reta entre as paradas, só pra visualizar — a rota de verdade (com trânsito e ruas) abre no Google Maps abaixo.</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/10 flex-shrink-0 space-y-2">
              <button
                onClick={abrirRotaNoMaps}
                disabled={paradasRota.length === 0}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-[#0B1120] font-black uppercase text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <Navigation size={14} /> Abrir rota no Google Maps
              </button>
              {paradasRota.length > 0 && (
                <button onClick={limparRotaHoje} className="w-full text-slate-500 hover:text-red-400 text-[10px] font-bold uppercase py-1 transition-colors">
                  Limpar paradas pendentes
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}
