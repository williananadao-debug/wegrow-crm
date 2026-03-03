"use client";
import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  Plus, X, Trash2, Radio, Zap, Mic2, MessageCircle, MapPin, 
  Upload, Target, MapPinOff, User, Briefcase, Printer, Edit2,
  Sparkles, Crosshair, Calendar, CalendarDays, AlertTriangle, 
  Building2, FileText, Hash, CheckCircle2, WifiOff, RefreshCcw, 
  Info, Lock, Megaphone, Smartphone, Headphones, ArrowLeft, Package, Newspaper, Filter
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Toast } from '@/components/Toast';
import { localDb } from '@/lib/localDb'; 
import { syncOfflineDataToCloud } from '@/lib/syncService'; 

// --- TIPOS ---
type ItemVenda = { servico: string; quantidade: number; precoUnitario: number; };
type Historico = { id: number; texto: string; created_at: string; }; 
type ServicoConfig = { id: number; nome: string; preco: number; tipo?: string; unidade?: string; };

type Lead = { 
  id: number; 
  empresa: string; 
  valor_total: number; 
  desconto?: number; 
  itens: ItemVenda[]; 
  etapa: number; 
  status: 'aberto' | 'ganho' | 'perdido'; 
  tipo: 'Agência' | 'Anunciante';
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
  notas?: Historico[];  
  status_aprovacao?: 'pendente' | 'aprovado' | 'recusado' | null; 
};

type ClienteOpcao = {
  id: number;
  nome_empresa: string;
  telefone: string; 
  cnpj?: string;
  email?: string;
};

const STAGES = {
  0: { title: 'Novo Lead', color: 'border-slate-500' },
  1: { title: 'Contato Feito', color: 'border-blue-500' },
  2: { title: 'Proposta', color: 'border-purple-500' },
  3: { title: 'Negociação', color: 'border-yellow-500' },
  4: { title: 'Ganhos', color: 'border-[#22C55E]' },
  5: { title: 'Perdidos', color: 'border-red-500' },
};

const formatId = (id: number, prefix: string) => {
    return `${prefix}-${String(id).padStart(4, '0')}`;
};

export default function DealsPage() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;
  
  const LIMITE_DESCONTO_MAXIMO = 5; 
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente' || perfil?.email === 'admin@wegrow.com';
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({}); 
  const [clientesOpcoes, setClientesOpcoes] = useState<ClienteOpcao[]>([]);
  const [listaServicos, setListaServicos] = useState<ServicoConfig[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<number | null>(null);
  
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
  
  const [itensTemporarios, setItensTemporarios] = useState<ItemVenda[]>([]);
  const [desconto, setDesconto] = useState(0); 

  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(null);
  
  const [fotoUrl, setFotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [novaNota, setNovaNota] = useState('');

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const [metaMensal, setMetaMensal] = useState(1); 
  
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // 👇 ESTADOS DA TORRE DE CONTROLE (FILTROS) 👇
  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos');
  const [filtroUnidade, setFiltroUnidade] = useState<string>('todas');
  const [filtroData, setFiltroData] = useState<string>(''); // YYYY-MM

  const fetchData = async () => {
    setLoading(true);
    
    let query = supabase.from('leads').select('*');
    if (!isDirector) query = query.eq('user_id', user?.id);

    let { data: leadsData } = await query.order('created_at', { ascending: false });
    let leadsBase: any[] = leadsData || [];

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

    const leadsFiltrados = leadsBase.filter(l => l && l.id);

    if (navigator.onLine && leadsData) {
        setLeads(leadsFiltrados.filter(l => l.id < 1000000) as Lead[]);
    } else {
        setLeads(leadsFiltrados as Lead[]);
    }

    const userIds = Array.from(new Set(leadsFiltrados.map(l => l?.user_id).filter(Boolean)));
    if (userIds.length > 0) {
        const { data: perfisData } = await supabase.from('profiles').select('id, nome').in('id', userIds as string[]);
        if (perfisData) {
            const mapa = perfisData.reduce((acc: any, p) => ({...acc, [p.id]: p.nome}), {});
            setUsersMap(mapa);
        }
    }

    try {
        const dataAtual = new Date();
        const mesAtual = dataAtual.getMonth() + 1; 
        const anoAtual = dataAtual.getFullYear();

        let metaQuery = supabase.from('metas').select('valor_objetivo').eq('mes', mesAtual).eq('ano', anoAtual);
        if (isDirector) metaQuery = metaQuery.is('user_id', null);
        else metaQuery = metaQuery.eq('user_id', user?.id);

        const { data: metaData } = await metaQuery.single();
        if (metaData && metaData.valor_objetivo) setMetaMensal(Number(metaData.valor_objetivo));
    } catch (err) {}

    let allClientes: ClienteOpcao[] = [];
    let page = 0;
    let fetchMore = true;
    while(fetchMore) {
        const { data } = await supabase.from('clientes').select('id, nome_empresa, telefone, cnpj, email').eq('status', 'ativo').order('nome_empresa', { ascending: true }).range(page * 1000, (page + 1) * 1000 - 1);
        if (data && data.length > 0) { allClientes = [...allClientes, ...(data as any)]; page++; } 
        else { fetchMore = false; }
    }
    setClientesOpcoes(allClientes);

    const { data: servicosData } = await supabase.from('servicos').select('*').order('id', { ascending: true });
    if (servicosData && servicosData.length > 0) {
        setListaServicos(servicosData);
    } else {
        setListaServicos([{ id: 1, nome: 'Blitz', preco: 1200, tipo: 'Blitz', unidade: '' }]);
    }
    setLoading(false);
  };

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
  }, [user, isDirector]);

  const getIcone = (tipo: string | undefined) => {
    switch (tipo) {
        case 'Comercial Gravado':
        case 'Mic2': 
            return <Mic2 className="text-blue-400" size={18} />;
        case 'Feito ao Vivo':
            return <Megaphone className="text-yellow-400" size={18} />;
        case 'Blitz': 
        case 'Zap': 
            return <Zap className="text-yellow-400" size={18} />;
        case 'Patrocínio':
        case 'Radio': 
            return <Radio className="text-purple-400" size={18} />;
        case 'Impacto Jornalístico': 
            return <Newspaper className="text-red-400" size={18} />;
        case 'Digital':
            return <Smartphone className="text-green-400" size={18} />;
        case 'Podcast':
            return <Headphones className="text-orange-400" size={18} />;
        default:
            return <Package className="text-slate-400" size={18} />;
    }
  };

  const formatarData = (dataIso: string) => {
    if (!dataIso) return '';
    const parts = dataIso.split('T')[0].split('-');
    if(parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return new Date(dataIso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const getDaysLeft = (endDate?: string) => {
    if (!endDate) return null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const end = new Date(endDate + 'T00:00:00');
    const diffTime = end.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const criarJobDeProducao = async (lead: Lead) => {
    const resumoItens = lead.itens.map(i => `${i.quantidade}x ${i.servico}`).join(', ');
    const briefingAutomatico = `VENDA APROVADA ✅ (Ref: ${formatId(lead.id, 'LD')})\n\nUnidade: ${lead.unidade || 'Não informada'}\nItens: ${resumoItens}\nValor Final: R$ ${lead.valor_total} (Desconto aplicado: R$ ${lead.desconto || 0})\n\n(Gerado automaticamente)`;
    
    await supabase.from('jobs').insert([{
        titulo: `Gravação: ${lead.empresa}`,
        briefing: briefingAutomatico,
        client_id: lead.client_id,
        user_id: user?.id,
        empresa_id: perfil?.empresa_id,
        stage: 'roteiro',
        prioridade: 'media',
        deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    }]);
  };

  const gerarCobrancaFinanceira = async (lead: Lead) => {
      await supabase.from('lancamentos').insert([{
          titulo: `VENDA: ${lead.empresa} (${lead.unidade || 'Geral'}) - OS: ${formatId(lead.id, 'LD')}`,
          valor: lead.valor_total,
          tipo: 'entrada',
          categoria: 'vendas',
          status: 'pendente',
          data_vencimento: new Date().toISOString().split('T')[0],
          user_id: user?.id,
          empresa_id: perfil?.empresa_id 
      }]);
  };

  const mudarEtapa = async (id: number, novaEtapa: number, novoStatus: 'ganho' | 'perdido' | 'aberto') => {
    const lead = leads.find(l => l.id === id);
    
    if (novoStatus === 'ganho' || novaEtapa === 4) {
        if (lead?.status_aprovacao === 'pendente') {
            alert("⚠️ NEGÓCIO BLOQUEADO: Este lead está aguardando aprovação da Liderança devido ao alto desconto.");
            return; 
        }
        if (lead?.status_aprovacao === 'recusado') {
            alert("❌ O desconto foi RECUSADO pela diretoria. Ajuste os valores na edição antes de dar o Ganho.");
            return; 
        }
    }

    let etapaFinal = novaEtapa;
    if (novoStatus === 'ganho') etapaFinal = 4;
    if (novoStatus === 'perdido') etapaFinal = 5;

    setLeads(prev => prev.map(l => l.id === id ? { ...l, etapa: etapaFinal, status: novoStatus } : l));

    try {
        const { error } = await supabase.from('leads').update({ etapa: etapaFinal, status: novoStatus }).eq('id', id);
        if (error) throw error;

        if (novoStatus === 'ganho' && lead) {
            await Promise.all([criarJobDeProducao(lead), gerarCobrancaFinanceira(lead)]);
            setToastMessage("🎉 Venda Confirmada! Enviado para Produção e Financeiro.");
            setShowToast(true);
        }
    } catch (error: any) {
        if (error.message === 'Failed to fetch' || !navigator.onLine) {
            await localDb.syncQueue.add({
                operacao: 'UPDATE', tabela: 'leads', dados: { id, etapa: etapaFinal, status: novoStatus }, data_criacao: new Date().toISOString()
            });
            setToastMessage("📶 Movido offline!");
            setShowToast(true);
        }
    }
  };

  const onDragEnd = async (result: any) => {
    const { destination, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === result.source.droppableId && destination.index === result.source.index) return;

    const novaEtapa = parseInt(destination.droppableId);
    const leadId = parseInt(draggableId);

    let novoStatus: 'aberto' | 'ganho' | 'perdido' = 'aberto';
    if (novaEtapa === 4) novoStatus = 'ganho';
    else if (novaEtapa === 5) novoStatus = 'perdido';
    else {
         const leadAtual = leads.find(l => l.id === leadId);
         if (leadAtual && (leadAtual.status === 'ganho' || leadAtual.status === 'perdido')) novoStatus = 'aberto';
    }

    await mudarEtapa(leadId, novaEtapa, novoStatus);
  };

  const enviarWhatsapp = (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    if (!lead.telefone) return alert("Cadastre o WhatsApp na edição!"); 

    let listaItens: ItemVenda[] = [];
    try {
        listaItens = Array.isArray(lead.itens) ? lead.itens : JSON.parse(lead.itens as any);
    } catch { listaItens = []; }

    let itensTexto = listaItens.length > 0 ? listaItens.map(i => `▪️ ${i.quantidade}x *${i.servico}* (R$ ${(i.quantidade * i.precoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`).join('%0A') : "▪️ Detalhes a combinar";

    const totalFormatado = lead.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const descontoFormatado = (lead.desconto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const msgDesconto = lead.desconto && lead.desconto > 0 ? `🎁 *Desconto Especial:* - R$ ${descontoFormatado}%0A` : "";

    const msg = `Olá *${lead.empresa}*! 🚀%0A%0AAqui é o ${perfil?.nome || 'Consultor'} da Demais FM.%0ASegue o resumo da nossa proposta (Ref: ${formatId(lead.id, 'LD')}):%0A--------------------------------%0A${itensTexto}%0A--------------------------------%0A${msgDesconto}%0A💰 *INVESTIMENTO FINAL: R$ ${totalFormatado}*%0A%0APodemos avançar com a aprovação?`;

    window.open(`https://wa.me/55${lead.telefone.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const imprimirProposta = () => {
    const subtotal = itensTemporarios.reduce((acc, item) => acc + (item.precoUnitario * item.quantidade), 0);
    const total = Math.max(0, subtotal - desconto);
    
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const janela = window.open('', '', 'width=800,height=600');
    if(!janela) return alert("Habilite popups");

    janela.document.write(`
      <html>
        <head>
          <title>Proposta - ${novaEmpresa}</title>
          <style>
            body{font-family:sans-serif;padding:40px;color:#333}
            .header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:20px;margin-bottom:30px}
            .logo{font-size:24px;font-weight:bold;font-style:italic}
            table{width:100%;border-collapse:collapse;margin-bottom:20px}
            th{text-align:left;border-bottom:1px solid #ccc;padding:10px;font-size:12px;text-transform:uppercase}
            td{padding:10px;border-bottom:1px solid #eee}
            .total-box{text-align:right;font-size:16px;margin-top:5px;}
            .total-final{text-align:right;font-size:20px;font-weight:bold;margin-top:10px;color:#22C55E;}
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">WEGROW</div>
            <div>Proposta Comercial<br>${dataHoje}</div>
          </div>
          <h3>Cliente: ${novaEmpresa}</h3>
          <table>
            <thead>
              <tr><th>Item</th><th>Qtd</th><th>Valor</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${itensTemporarios.map(i => `<tr><td>${i.servico}</td><td>${i.quantidade}</td><td>R$ ${i.precoUnitario.toLocaleString('pt-BR')}</td><td>R$ ${(i.quantidade*i.precoUnitario).toLocaleString('pt-BR')}</td></tr>`).join('')}
            </tbody>
          </table>
          <div class="total-box">Subtotal: R$ ${subtotal.toLocaleString('pt-BR')}</div>
          ${desconto > 0 ? `<div class="total-box" style="color:red">Desconto: - R$ ${desconto.toLocaleString('pt-BR')}</div>` : ''}
          <div class="total-final">Total Final: R$ ${total.toLocaleString('pt-BR')}</div>
          <script>window.onload=function(){window.print()}</script>
        </body>
      </html>
    `);
    janela.document.close();
  };

  const gerarContrato = (lead: Lead) => {
    let listaItens: ItemVenda[] = [];
    try { listaItens = Array.isArray(lead.itens) ? lead.itens : JSON.parse(lead.itens as any); } catch { listaItens = []; }
    
    const total = lead.valor_total;
    const descontoAplicado = lead.desconto || 0;
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    const dataIni = lead.contrato_inicio ? formatarData(lead.contrato_inicio) : '_____/_____/_____';
    const dataFim = lead.contrato_fim ? formatarData(lead.contrato_fim) : '_____/_____/_____';
    
    const refInterna = formatId(lead.id, 'LD');

    const janela = window.open('', '', 'width=800,height=800');
    if(!janela) return alert("Habilite os popups no seu navegador para gerar o contrato.");

    janela.document.write(`
      <html>
        <head>
          <title>Contrato - ${lead.empresa}</title>
          <style>
            body { font-family: 'Times New Roman', serif; padding: 40px; color: #000; line-height: 1.6; text-align: justify; }
            .header { text-align: center; margin-bottom: 20px; }
            .ref-interna { text-align: right; font-size: 10px; color: #666; font-family: sans-serif; margin-bottom: 20px; }
            .logo { font-size: 28px; font-weight: bold; font-style: italic; font-family: sans-serif; }
            h1 { font-size: 18px; text-transform: uppercase; text-align: center; text-decoration: underline; margin-bottom: 30px; }
            h2 { font-size: 14px; font-weight: bold; margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-family: sans-serif; font-size: 12px;}
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; }
            .assinaturas { margin-top: 60px; display: flex; justify-content: space-between; gap: 40px;}
            .assinatura-box { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 5px; }
          </style>
        </head>
        <body>
          <div class="ref-interna">Nº Registro: ${refInterna}</div>
          <div class="header"><div class="logo">DEMAIS FM</div></div>
          <h1>Contrato de Prestação de Serviços Publicitários</h1>
          
          <p><strong>CONTRATADA:</strong> Demais FM, empresa de publicidade e radiodifusão.</p>
          <p><strong>CONTRATANTE:</strong> ${lead.empresa}, doravante denominada simplesmente CONTRATANTE.</p>
          <p>As partes acima qualificadas celebram o presente contrato, que se regerá pelas seguintes cláusulas:</p>
          
          <h2>CLÁUSULA 1ª - DO OBJETO</h2>
          <p>O presente contrato tem como objeto a veiculação e prestação dos seguintes serviços publicitários para a CONTRATANTE${lead.unidade ? ` na unidade <strong>${lead.unidade}</strong>` : ''}:</p>
          <table>
            <thead><tr><th>Serviço</th><th>Qtd</th><th>Valor Unit.</th><th>Total</th></tr></thead>
            <tbody>
              ${listaItens.map(i => `<tr><td>${i.servico}</td><td>${i.quantidade}</td><td>R$ ${i.precoUnitario.toLocaleString('pt-BR')}</td><td>R$ ${(i.quantidade * i.precoUnitario).toLocaleString('pt-BR')}</td></tr>`).join('')}
            </tbody>
          </table>

          <h2>CLÁUSULA 2ª - DOS VALORES E PAGAMENTO</h2>
          <p>Pela prestação dos serviços, a CONTRATANTE pagará à CONTRATADA o valor total de <strong>R$ ${total.toLocaleString('pt-BR')}</strong>.</p>
          ${descontoAplicado > 0 ? `<p><em>* Foi aplicado um desconto comercial especial no valor de R$ ${descontoAplicado.toLocaleString('pt-BR')} sobre o valor original da tabela.</em></p>` : ''}

          <h2>CLÁUSULA 3ª - DA VIGÊNCIA E VEICULAÇÃO</h2>
          <p>A prestação dos serviços terá início oficial em <strong>${dataIni}</strong> e término previsto para <strong>${dataFim}</strong>.</p>

          <h2>CLÁUSULA 4ª - FORO</h2>
          <p>As partes elegem o foro da comarca da CONTRATADA para dirimir quaisquer dúvidas oriundas deste contrato, renunciando a qualquer outro por mais privilegiado que seja.</p>

          <p style="text-align: right; margin-top: 60px;">Local e Data: ____________________________, ${dataHoje}.</p>

          <div class="assinaturas">
            <div class="assinatura-box">CONTRATADA<br>Equipe Comercial</div>
            <div class="assinatura-box">CONTRATANTE<br>${lead.empresa}</div>
          </div>

          <script>window.onload=function(){window.print()}</script>
        </body>
      </html>
    `);
    janela.document.close();
  };

  const fazerCheckin = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!navigator.geolocation) return alert("Seu navegador ou dispositivo não suporta geolocalização.");
    
    setToastMessage("🛰️ Obtendo localização exata...");
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
            setToastMessage("📍 Check-in realizado com sucesso!");
            setShowToast(true);
        } catch (error: any) {
            if (error.message === 'Failed to fetch' || !navigator.onLine) {
                await localDb.syncQueue.add({ operacao: 'UPDATE', tabela: 'leads', dados: { id, checkin: msg, localizacao_url: mapsUrl }, data_criacao: new Date().toISOString() });
                setLeads(prev => prev.map(l => l.id === id ? { ...l, checkin: msg, localizacao_url: mapsUrl } : l));
                setToastMessage("📍 Salvo no Celular! Sincroniza em breve.");
                setShowToast(true);
            }
        }
      },
      (err) => { setToastMessage("Falha no GPS ❌"); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      if(!confirm("Excluir oportunidade?")) return;

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
              alert("⚠️ Sem internet: Não é possível deletar leads do servidor no modo offline por segurança.");
          }
      }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      if (!navigator.onLine) return alert("⚠️ Conecte à internet para enviar arquivos.");
      setUploading(true);
      const file = e.target.files[0];
      const fileName = `${Date.now()}.${file.name.split('.').pop()}`;
      const { data } = await supabase.storage.from('contratos').upload(fileName, file);
      if(data) {
         const { data: url } = supabase.storage.from('contratos').getPublicUrl(fileName);
         setFotoUrl(url.publicUrl);
         if(editingLeadId && editingLeadId < 1000000) { 
             await supabase.from('leads').update({ foto_url: url.publicUrl }).eq('id', editingLeadId);
             setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, foto_url: url.publicUrl } : l));
         }
      }
      setUploading(false);
  };

  const adicionarNota = async () => {
      if(!novaNota || !editingLeadId) return;
      if (editingLeadId > 1000000) return alert("⚠️ Este Lead ainda não sincronizou com o servidor. Aguarde a internet para adicionar notas.");
      
      const novaNotaObj: Historico = { 
          id: Date.now(), 
          texto: novaNota, 
          created_at: new Date().toISOString() 
      };
      
      const novasNotas = [novaNotaObj, ...historico];

      setHistorico(novasNotas);
      setNovaNota('');
      setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, notas: novasNotas } : l));
      
      if (navigator.onLine) {
          await supabase.from('leads').update({ notas: novasNotas }).eq('id', editingLeadId);
      } else {
          await localDb.syncQueue.add({ operacao: 'UPDATE', tabela: 'leads', dados: { id: editingLeadId, notas: novasNotas }, data_criacao: new Date().toISOString() });
      }
  };

  const salvarLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return alert("Você precisa estar logado!");
    if (!selectedClientId) return alert("⚠️ ALERTA: Você precisa selecionar um cliente válido na lista suspensa!");

    const subtotal = itensTemporarios.reduce((acc, item) => acc + (item.precoUnitario * item.quantidade), 0);
    const valorTotalFinal = Math.max(0, subtotal - desconto); 

    const percDesconto = subtotal > 0 ? (desconto / subtotal) * 100 : 0;
    let novoStatusAprovacao = leads.find(l => l.id === editingLeadId)?.status_aprovacao || null;

    if (!isLideranca) {
        if (percDesconto > LIMITE_DESCONTO_MAXIMO) {
            novoStatusAprovacao = 'pendente';
        } else {
            novoStatusAprovacao = null; 
        }
    } else {
        if (percDesconto > LIMITE_DESCONTO_MAXIMO) novoStatusAprovacao = 'aprovado';
        else novoStatusAprovacao = null;
    }

    const payload = {
        empresa: novaEmpresa,
        telefone: novoTelefone,
        unidade: novaUnidade, 
        cidade: novaCidade,       
        descricao: novaDescricao, 
        notas: historico,         
        tipo: tipoCliente,
        valor_total: valorTotalFinal,
        desconto: desconto, 
        itens: itensTemporarios,
        foto_url: fotoUrl,
        contrato_inicio: contratoInicio || null,
        contrato_fim: contratoFim || null,
        status_aprovacao: novoStatusAprovacao, 
        ...(editingLeadId ? {} : { status: 'aberto', etapa: 0, ordem: 0 }),
        user_id: user.id,
        client_id: selectedClientId,
        empresa_id: perfil?.empresa_id 
    };

    if (editingLeadId) {
        try {
            if (editingLeadId > 1000000) throw new Error('Failed to fetch');

            const { error } = await supabase.from('leads').update(payload).eq('id', editingLeadId);
            if (error) throw error; 

            setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, ...payload } as Lead : l));
            setIsModalOpen(false);
            setToastMessage("Lead atualizado!");
            setShowToast(true);
        } catch (error: any) {
            if (error.message === 'Failed to fetch' || !navigator.onLine) {
                await localDb.syncQueue.add({
                    operacao: 'UPDATE', tabela: 'leads', dados: { id: editingLeadId, ...payload }, data_criacao: new Date().toISOString()
                });
                setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, ...payload } as Lead : l));
                setIsModalOpen(false);
                setToastMessage("📶 Sem rede. Alteração salva no celular!");
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

  const abrirModal = async (lead?: Lead) => {
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
        setDesconto(lead.desconto || 0); 
        setHistorico(Array.isArray(lead.notas) ? lead.notas : []);
    } else {
        setEditingLeadId(null);
        setNovaEmpresa('');
        setNovoTelefone('');
        setNovaUnidade('');
        setNovaCidade('');
        setNovaDescricao('');
        setSelectedClientId(null);
        setItensTemporarios([]);
        setFotoUrl('');
        setContratoInicio('');
        setContratoFim('');
        setDesconto(0); 
        setHistorico([]);
    }
    setIsModalOpen(true);
  };

  // 👇 LÓGICA DO FILTRO DA LIDERANÇA APLICADA AQUI 👇
  const leadsAtivos = leads.filter(l => {
      if (filtroVendedor !== 'todos' && l.user_id !== filtroVendedor) return false;
      if (filtroUnidade !== 'todas' && l.unidade !== filtroUnidade) return false;
      if (filtroData && !l.created_at.startsWith(filtroData)) return false;
      return true;
  });

  const totalGanhos = leadsAtivos.filter(l => l && l.status === 'ganho').reduce((acc, curr) => acc + (curr.valor_total || 0), 0);
  const totalAberto = leadsAtivos.filter(l => l && l.status === 'aberto').reduce((acc, curr) => acc + (curr.valor_total || 0), 0);
  const percentMeta = metaMensal > 0 ? Math.min((totalGanhos / metaMensal) * 100, 100) : 0;
  
  const rankingServicos = leadsAtivos.filter(l => l && l.status === 'ganho').flatMap(l => Array.isArray(l.itens) ? l.itens : []).reduce((acc: any, item) => { acc[item.servico] = (acc[item.servico] || 0) + (item.precoUnitario * item.quantidade); return acc; }, {});

  const getLeadsByStage = (stageIdx: number) => {
      return leadsAtivos
        .filter(l => l && l.etapa === stageIdx)
        .sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        });
  };

  const getStageTotal = (stageIdx: number) => {
      return getLeadsByStage(stageIdx).reduce((acc, l) => acc + (Number(l.valor_total) || 0), 0);
  };

  const subtotalModal = itensTemporarios.reduce((acc, item) => acc + (item.precoUnitario * item.quantidade), 0);
  const totalModalFinal = Math.max(0, subtotalModal - desconto);
  const percModal = subtotalModal > 0 ? (desconto / subtotalModal) * 100 : 0;

  const servicosFiltradosDaUnidade = listaServicos.filter(s => {
      return !s.unidade || s.unidade === novaUnidade;
  });
  
  const categoriasDisponiveis = Array.from(new Set(servicosFiltradosDaUnidade.map(s => s.tipo || 'Comercial Gravado')));
  const produtosDaCategoria = servicosFiltradosDaUnidade.filter(s => (s.tipo || 'Comercial Gravado') === categoriaSelecionada);

  return (
    <div className="h-full flex flex-col pb-20 md:pb-2">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 mb-2 px-2">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">Pipeline</h1>
          
          <div className="flex items-center gap-2 mt-1">
             <span className="text-blue-400 flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase"><User size={10}/> {perfil?.nome}</span>
             
             {isOffline ? (
                <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                    <WifiOff size={10} /> Offline
                </span>
             ) : isSyncing ? (
                <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                    <RefreshCcw size={10} className="animate-spin" /> Sincronizando
                </span>
             ) : (
                <span className="bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                    <CheckCircle2 size={10} /> Online
                </span>
             )}
          </div>
        </div>
        
        <div className="hidden md:block flex-1 max-w-sm px-6">
           <div className="flex justify-between text-[9px] font-black uppercase tracking-widest mb-1">
              <span className="text-slate-400 flex items-center gap-1">
                  <Target size={10}/> {isDirector ? 'Meta Global' : 'Meta Individual'} 
                  <span className="text-white ml-1 font-mono">R$ {metaMensal.toLocaleString('pt-BR')}</span>
              </span>
              <span className="text-[#22C55E]">{Math.round(percentMeta)}%</span>
           </div>
           <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
               <div className="h-full bg-gradient-to-r from-blue-600 to-[#22C55E] transition-all duration-1000" style={{ width: `${percentMeta}%` }}></div>
           </div>
        </div>

        <div>
            <button onClick={() => abrirModal()} className="bg-[#22C55E] text-[#0F172A] px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-[0_5px_20px_rgba(34,197,94,0.2)] flex items-center gap-2"><Plus size={16} strokeWidth={3} /> Gerar</button>
        </div>
      </div>

      {/* 👇 BARRA DE FILTROS DA LIDERANÇA 👇 */}
      <div className="flex flex-wrap items-center gap-2 px-2 mb-2">
        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 gap-3 flex-wrap">
            <div className="flex items-center gap-1 text-slate-400">
                <Filter size={12} /> <span className="text-[9px] font-bold uppercase tracking-widest">Filtros:</span>
            </div>
            
            {isLideranca && (
              <select 
                value={filtroVendedor} 
                onChange={e => setFiltroVendedor(e.target.value)}
                className="bg-transparent border-none text-blue-400 text-[10px] font-bold uppercase outline-none cursor-pointer"
              >
                <option value="todos" className="bg-[#0B1120]">👤 Todos os Vendedores</option>
                {Object.entries(usersMap).map(([id, nome]) => (
                  <option key={id} value={id} className="bg-[#0B1120]">{nome}</option>
                ))}
              </select>
            )}
            
            {isLideranca && <span className="text-white/10">|</span>}

            <select 
              value={filtroUnidade} 
              onChange={e => setFiltroUnidade(e.target.value)}
              className="bg-transparent border-none text-slate-300 text-[10px] font-bold uppercase outline-none cursor-pointer"
            >
              <option value="todas" className="bg-[#0B1120]">🏢 Todas as Unidades</option>
              <option value="DEMAIS FM 104,7" className="bg-[#0B1120]">DEMAIS FM 104,7</option>
              <option value="DEMAIS FM 107,9" className="bg-[#0B1120]">DEMAIS FM 107,9</option>
              <option value="DEMAIS FM 101,1" className="bg-[#0B1120]">DEMAIS FM 101,1</option>
            </select>

            <span className="text-white/10">|</span>

            <input 
              type="month" 
              value={filtroData} 
              onChange={e => setFiltroData(e.target.value)}
              className="bg-transparent border-none text-slate-300 text-[10px] font-bold uppercase outline-none cursor-pointer"
            />
        </div>
        
        {(filtroVendedor !== 'todos' || filtroUnidade !== 'todas' || filtroData !== '') && (
            <button onClick={() => {setFiltroVendedor('todos'); setFiltroUnidade('todas'); setFiltroData('');}} className="text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 rounded-lg transition-colors text-[9px] font-bold uppercase px-3 py-2 flex items-center gap-1">
                <X size={10}/> Limpar
            </button>
        )}
      </div>

      <div className="flex md:grid md:grid-cols-3 gap-2 overflow-x-auto pb-2 px-1 mb-2 snap-x snap-mandatory">
        <div className="min-w-[160px] md:min-w-0 bg-gradient-to-br from-blue-600/20 to-transparent border border-white/5 p-3 rounded-2xl shadow-xl snap-center">
          <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-0.5">Pipeline Aberto</p>
          <p className="text-lg md:text-xl font-black text-white italic">R$ {totalAberto.toLocaleString('pt-BR', { notation: "compact" })}</p>
        </div>
        
        <div className="min-w-[160px] md:min-w-0 bg-gradient-to-br from-[#22C55E]/20 to-transparent border border-white/5 p-3 rounded-2xl shadow-xl snap-center">
          <p className="text-[9px] font-black text-[#22C55E] uppercase tracking-widest mb-0.5">Total Ganho</p>
          <p className="text-lg md:text-xl font-black text-white italic">R$ {totalGanhos.toLocaleString('pt-BR', { notation: "compact" })}</p>
        </div>
        
        <div className="min-w-[160px] md:min-w-0 bg-white/[0.02] border border-white/5 p-3 rounded-2xl shadow-xl snap-center">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Top Serviços</p>
          <div className="space-y-0.5">
            {Object.entries(rankingServicos).slice(0, 2).map(([nome, valor]: any) => (
              <div key={nome} className="flex justify-between text-[9px] font-bold"><span className="text-slate-400 uppercase italic truncate max-w-[80px]">{nome}</span><span className="text-white">R$ {valor.toLocaleString('pt-BR', { notation: "compact" })}</span></div>
            ))}
          </div>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 pb-2 h-[calc(100vh-260px)] md:h-[calc(100vh-240px)] items-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory px-1 md:px-0">
          {Object.entries(STAGES).map(([key, stage]) => {
            const stageIdx = parseInt(key);
            const totalColuna = getStageTotal(stageIdx);
            const leadsDaColuna = getLeadsByStage(stageIdx);

            return (
                <Droppable key={key} droppableId={key}>
                {(provided) => (
                    <div 
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`bg-[#0B1120] border-t-4 ${stage.color} border-x border-b border-white/5 rounded-2xl p-2 h-full flex flex-col min-w-[85vw] md:min-w-[250px] md:flex-1 snap-center`}
                    >
                    <div className="flex items-center justify-between mb-2 px-1 pt-1">
                        <h3 className="text-white font-black uppercase italic text-xs tracking-wide truncate">{stage.title}</h3>
                        <span className="text-slate-600 text-[9px] font-bold bg-white/5 px-1.5 py-0.5 rounded-md">{leadsDaColuna.length}</span>
                    </div>
                    
                    <div className="mb-2 px-1 text-[10px] font-mono text-slate-500 text-right border-b border-white/5 pb-1">
                        Total: R$ {totalColuna.toLocaleString('pt-BR', { notation: "compact" })}
                    </div>

                    <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-1 pb-10">
                        {leadsDaColuna.map((lead, index) => {
                            if (!lead || !lead.id) return null;

                            const daysLeft = getDaysLeft(lead.contrato_fim);
                            const isPhantom = lead.id > 1000000;

                            return (
                                <Draggable key={lead.id} draggableId={lead.id.toString()} index={index}>
                                    {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className={`bg-white/[0.03] p-3 rounded-xl border border-white/5 group hover:border-[#22C55E]/50 transition-all relative ${snapshot.isDragging ? 'rotate-2 scale-105 shadow-2xl bg-[#0F172A] z-50' : ''}`}
                                    >
                                            {/* 👇 SELOS DE APROVAÇÃO NO KANBAN 👇 */}
                                            {lead.status_aprovacao === 'pendente' && (
                                                <div className="bg-orange-500/20 border border-orange-500/40 p-1.5 rounded-lg mb-2 flex items-center gap-1 text-orange-400">
                                                    <Lock size={12}/>
                                                    <span className="text-[9px] font-black uppercase tracking-widest animate-pulse">Aprovação Pendente</span>
                                                </div>
                                            )}
                                            {lead.status_aprovacao === 'recusado' && (
                                                <div className="bg-red-500/20 border border-red-500/40 p-1.5 rounded-lg mb-2 flex items-center gap-1 text-red-400">
                                                    <X size={12}/>
                                                    <span className="text-[9px] font-black uppercase tracking-widest">Desconto Recusado</span>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-start mb-1">
                                                <div className="flex items-center gap-2">
                                                    <div className="cursor-pointer bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors" onClick={() => abrirModal(lead)}>
                                                        <Edit2 size={10} className="text-slate-500"/>
                                                    </div>
                                                    {isPhantom ? (
                                                        <span className="text-[8px] font-black text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded tracking-widest flex items-center gap-0.5 animate-pulse">
                                                            <RefreshCcw size={8}/> OFFLINE
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] font-black text-slate-400 bg-white/5 px-1.5 py-0.5 rounded tracking-widest flex items-center gap-0.5">
                                                            <Hash size={8}/>LD-{String(lead.id).padStart(4, '0')}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                <div className="flex flex-col md:flex-row gap-2 md:gap-2">
                                                    <button onClick={(e) => enviarWhatsapp(e, lead)} className="bg-white/5 md:bg-transparent p-2 md:p-0 rounded-lg md:rounded-none text-[#22C55E] hover:text-white hover:bg-[#22C55E]/20 transition-all">
                                                        <MessageCircle size={18} className="md:w-[14px] md:h-[14px]" />
                                                    </button>
                                                    <button onClick={(e) => fazerCheckin(e, lead.id)} className="bg-white/5 md:bg-transparent p-2 md:p-0 rounded-lg md:rounded-none text-blue-400 hover:text-white hover:bg-blue-600/20 transition-all">
                                                        <MapPin size={18} className="md:w-[14px] md:h-[14px]"/>
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            {(lead.origem === 'Portal Web' || lead.descricao) && (
                                                <div className="bg-blue-500/10 border border-blue-500/20 p-2 rounded-lg mt-2 mb-2">
                                                    <div className="flex items-center gap-1 mb-1">
                                                        <Info size={10} className="text-blue-400"/>
                                                        <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Veio do Portal</span>
                                                    </div>
                                                    {lead.descricao && <p className="text-[10px] text-slate-300 italic line-clamp-3">"{lead.descricao}"</p>}
                                                    {lead.cidade && (
                                                        <span className="mt-1 inline-block text-[8px] font-bold text-slate-400 uppercase">📍 Cidade: {lead.cidade}</span>
                                                    )}
                                                </div>
                                            )}

                                            <div className="mb-2 mt-2">
                                                {lead.checkin && lead.checkin.includes('Meta') ? (
                                                    <div className="bg-purple-600/20 border border-purple-500/30 p-1.5 rounded-lg flex items-center gap-2 mb-1">
                                                        <Crosshair size={12} className="text-purple-400"/>
                                                        <span className="text-[9px] font-bold text-purple-200 uppercase truncate">{lead.checkin}</span>
                                                    </div>
                                                ) : lead.checkin ? (
                                                    <div className="flex items-center gap-1 mb-1">
                                                        <MapPin size={10} className="text-pink-500" />
                                                        <span className="text-[9px] font-bold text-blue-400 uppercase truncate">Visitado {lead.checkin.split(',')[0]}</span>
                                                    </div>
                                                ) : (
                                                    lead.status === 'aberto' && <div className="flex items-center gap-1 mb-2"><MapPinOff size={10} className="text-red-500" /><span className="text-[9px] font-black text-red-500 uppercase">PENDENTE</span></div>
                                                )}
                                            </div>

                                            <div className="mb-1 flex items-center gap-2 flex-wrap">
                                                <h4 className="font-black text-sm uppercase leading-tight transition-colors truncate max-w-full text-white group-hover:text-slate-200">
                                                    {lead.empresa}
                                                </h4>
                                                {lead.unidade && (
                                                    <span className="bg-white/5 text-slate-300 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                                                        <Building2 size={8}/> {lead.unidade}
                                                    </span>
                                                )}
                                            </div>

                                            {/* 👇 ETIQUETA COM O NOME DO VENDEDOR 👇 */}
                                            {isLideranca && lead.user_id && usersMap[lead.user_id] && (
                                                <div className="mb-2 mt-1 inline-flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded text-[8px] font-black text-blue-400 uppercase tracking-widest">
                                                    <User size={8} /> {usersMap[lead.user_id]}
                                                </div>
                                            )}

                                            <div className="space-y-0.5 border-l border-white/10 pl-2 mb-2 mt-1">
                                                {Array.isArray(lead.itens) && lead.itens.slice(0, 2).map((item, i) => (
                                                    <p key={i} className="text-[9px] text-slate-400 font-bold uppercase truncate">{item.quantidade}x {item.servico}</p>
                                                ))}
                                                {Array.isArray(lead.itens) && lead.itens.length > 2 && <p className="text-[9px] text-slate-500 italic">+{lead.itens.length - 2} itens...</p>}
                                            </div>

                                            <div className="flex items-center gap-1 text-[#22C55E] font-black text-sm mb-2">
                                                R$ {lead.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                {lead.desconto && lead.desconto > 0 ? <span className="text-[8px] text-red-400 ml-1 bg-red-500/10 px-1 py-0.5 rounded">COM DESCONTO</span> : null}
                                            </div>

                                            {lead.contrato_inicio && lead.contrato_fim && (
                                                <div className="mb-2 flex items-center gap-2 p-1.5 bg-white/[0.02] border border-white/5 rounded-lg">
                                                    <CalendarDays size={12} className="text-slate-500" />
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black uppercase text-slate-500">Contrato</span>
                                                        <span className="text-[9px] text-slate-300 font-mono leading-none">
                                                            {formatarData(lead.contrato_inicio)} até {formatarData(lead.contrato_fim)}
                                                        </span>
                                                    </div>
                                                    
                                                    {daysLeft !== null && daysLeft <= 30 && daysLeft >= 0 && (
                                                        <div className="ml-auto flex items-center gap-1 bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase animate-pulse border border-red-500/30">
                                                            <AlertTriangle size={10}/> {daysLeft}D
                                                        </div>
                                                    )}
                                                    {daysLeft !== null && daysLeft < 0 && (
                                                        <div className="ml-auto flex items-center bg-red-500 text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase">
                                                            VENCIDO
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {lead.status === 'aberto' ? (
                                                <div className="space-y-2 pt-1">
                                                    <button onClick={() => mudarEtapa(lead.id, lead.etapa + 1, 'aberto')} className="w-full py-1.5 bg-white/5 text-slate-300 hover:bg-blue-600 hover:text-white rounded text-[9px] font-black uppercase tracking-wider transition-colors border border-white/5">
                                                        AVANÇAR ETAPA
                                                    </button>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button 
                                                            onClick={() => mudarEtapa(lead.id, 4, 'ganho')} 
                                                            className={`py-1.5 rounded text-[9px] font-black uppercase tracking-wider transition-colors ${lead.status_aprovacao === 'pendente' ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E] hover:text-[#0F172A]'}`}
                                                        >
                                                            GANHO
                                                        </button>
                                                        <button onClick={() => mudarEtapa(lead.id, 5, 'perdido')} className="py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white rounded text-[9px] font-black uppercase tracking-wider transition-colors">PERDIDO</button>
                                                    </div>
                                                </div>
                                            ) : lead.status === 'ganho' ? (
                                                <div className="mt-2 flex gap-2 pt-2 border-t border-white/5">
                                                    <a href="/jobs" className="flex-1 text-center inline-flex justify-center items-center gap-1 text-[8px] bg-blue-600/10 text-blue-400 px-2 py-1.5 rounded font-black uppercase hover:bg-blue-600 hover:text-white transition-all">
                                                        <Briefcase size={10}/> PRODUÇÃO
                                                    </a>
                                                    <button onClick={(e) => { e.stopPropagation(); gerarContrato(lead); }} className="flex-1 text-center inline-flex justify-center items-center gap-1 text-[8px] bg-purple-600/10 text-purple-400 px-2 py-1.5 rounded font-black uppercase hover:bg-purple-600 hover:text-white transition-all">
                                                        <FileText size={10}/> CONTRATO
                                                    </button>
                                                </div>
                                            ) : null}
                                    </div>
                                    )}
                                </Draggable>
                            );
                        })}
                        {provided.placeholder}
                    </div>
                    </div>
                )}
                </Droppable>
            )
          })}
        </div>
      </DragDropContext>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-0 md:p-4">
           <div className="bg-[#0B1120] md:border border-white/10 w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-[40px] shadow-2xl relative flex flex-col">
              
              <div className="flex justify-between items-center p-6 border-b border-white/10 flex-shrink-0">
                  <h2 className="text-xl font-black uppercase italic tracking-tighter text-white flex items-center gap-2">
                      {editingLeadId ? `Editar Oportunidade ` : 'Novo Negócio'}
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
                        </>
                      )}
                      <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white"><X size={20}/></button>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <form id="leadForm" onSubmit={salvarLead} className="space-y-6">
                    
                    <div className="mb-4 relative">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Cliente / Empresa *</label>
                        <div className="relative">
                            <input 
                                className={`w-full bg-white/[0.03] border ${selectedClientId ? 'border-[#22C55E] text-[#22C55E]' : 'border-white/10'} rounded-xl pl-4 pr-24 py-3 text-sm font-bold outline-none focus:border-blue-500 transition-colors uppercase`}
                                placeholder="Buscar cliente..."
                                value={novaEmpresa}
                                onChange={(e) => {
                                    setNovaEmpresa(e.target.value);
                                    setSelectedClientId(null); 
                                    setShowClientDropdown(true);
                                }}
                                onFocus={() => setShowClientDropdown(true)}
                                onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                                required
                            />
                            {selectedClientId && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-[#22C55E]/10 text-[#22C55E] px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest">
                                    <CheckCircle2 size={12}/> Vinculado
                                </div>
                            )}
                        </div>
                        
                        {showClientDropdown && !selectedClientId && (
                            <div className="absolute z-[9999] w-full mt-1 bg-[#0F172A] border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar overflow-x-hidden">
                                {clientesOpcoes
                                    .filter(c => c.nome_empresa.toLowerCase().includes(novaEmpresa.toLowerCase()))
                                    .slice(0, 50) 
                                    .map(c => (
                                        <div 
                                            key={c.id} 
                                            className="px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-blue-600/20 transition-colors flex flex-col"
                                            onClick={() => {
                                                setNovaEmpresa(c.nome_empresa);
                                                setSelectedClientId(c.id);
                                                setNovoTelefone(c.telefone || '');
                                                setShowClientDropdown(false);
                                            }}
                                        >
                                            <span className="text-white font-bold text-xs uppercase">{c.nome_empresa}</span>
                                            {c.cnpj && <span className="text-slate-500 text-[9px] font-mono mt-0.5">CNPJ: {c.cnpj}</span>}
                                        </div>
                                    ))}
                                {clientesOpcoes.filter(c => c.nome_empresa.toLowerCase().includes(novaEmpresa.toLowerCase())).length === 0 && (
                                    <div className="px-4 py-4 text-center text-slate-500 text-xs font-bold uppercase">
                                        Nenhum cliente encontrado.
                                        <br/>
                                        <span className="text-[9px] font-normal normal-case mt-1 block">Cadastre o cliente na aba de Clientes primeiro.</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">WhatsApp</label>
                            <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={novoTelefone} onChange={e => setNovoTelefone(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1"><Building2 size={10}/> Unidade / Filial *</label>
                            <select 
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] cursor-pointer appearance-none" 
                                value={novaUnidade} 
                                onChange={e => { setNovaUnidade(e.target.value); setCategoriaSelecionada(null); }}
                                required
                            >
                                <option value="" className="bg-[#0B1120]">SELECIONE UMA UNIDADE</option>
                                <option value="DEMAIS FM 104,7" className="bg-[#0B1120]">DEMAIS FM 104,7</option>
                                <option value="DEMAIS FM 107,9" className="bg-[#0B1120]">DEMAIS FM 107,9</option>
                                <option value="DEMAIS FM 101,1" className="bg-[#0B1120]">DEMAIS FM 101,1</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1"><Calendar size={10}/> Início do Contrato</label>
                            <input type="date" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={contratoInicio} onChange={e => setContratoInicio(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1"><CalendarDays size={10}/> Fim do Contrato</label>
                            <input type="date" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={contratoFim} onChange={e => setContratoFim(e.target.value)} />
                        </div>
                    </div>

                    <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-2xl">
                        <label className="text-[10px] font-black uppercase text-blue-400 mb-2 flex items-center gap-1"><Info size={12}/> Briefing / Descrição (Portal)</label>
                        <textarea
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-slate-400 text-sm font-medium outline-none min-h-[80px] custom-scrollbar cursor-not-allowed"
                            value={novaDescricao}
                            readOnly
                            title="O briefing original do cliente não pode ser alterado. Use as Notas para adicionar informações."
                            placeholder="O que o cliente precisa..."
                        />
                    </div>

                    {/* 👇 O NOVO PDV BLINDADO SEM CAMPO MANUAL 👇 */}
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
                                    <input 
                                        type="number" 
                                        className="w-20 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-2 py-1 text-xs font-bold outline-none text-right" 
                                        placeholder="0" 
                                        value={desconto || ''} 
                                        onChange={e => setDesconto(Number(e.target.value))} 
                                    />
                                </div>
                                <p className="text-sm font-black text-white bg-[#22C55E]/20 px-3 py-1 rounded-lg border border-[#22C55E]/30 inline-block">
                                    Final: R$ {totalModalFinal.toLocaleString()}
                                </p>
                                {percModal > 0 && (
                                    <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${percModal > LIMITE_DESCONTO_MAXIMO ? 'text-red-400' : 'text-[#22C55E]'}`}>
                                        ({percModal.toFixed(1)}% OFF)
                                    </p>
                                )}
                            </div>
                        </div>
                        
                        {!novaUnidade ? (
                            <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl text-center">
                                <p className="text-xs font-black text-orange-400 uppercase tracking-widest animate-pulse">Selecione a Unidade para abrir a tabela de preços!</p>
                            </div>
                        ) : !categoriaSelecionada ? (
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Escolha a Categoria</p>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {categoriasDisponiveis.map(cat => (
                                        <button key={cat} type="button" onClick={() => setCategoriaSelecionada(cat)} className="flex flex-col items-center justify-center p-4 bg-[#0F172A] border border-white/10 rounded-xl hover:border-blue-500 hover:bg-blue-600/10 transition-all group">
                                            <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                                {getIcone(cat)}
                                            </div>
                                            <span className="text-[10px] font-black text-slate-300 uppercase text-center">{cat}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => setCategoriaSelecionada(null)} className="p-1.5 bg-white/5 rounded-lg hover:bg-blue-600 hover:text-white text-slate-400 transition-colors"><ArrowLeft size={16}/></button>
                                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{categoriaSelecionada}</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                    {produtosDaCategoria.map((s) => (
                                        <button key={s.id} type="button" onClick={() => setItensTemporarios([...itensTemporarios, { servico: s.nome, quantidade: 1, precoUnitario: s.preco }])} className="flex flex-col items-start bg-white/5 hover:bg-blue-600/20 hover:border-blue-500/50 border border-white/10 p-3 rounded-xl transition-colors text-left group">
                                            <span className="text-[10px] text-slate-300 font-bold uppercase mb-1 line-clamp-2 leading-tight group-hover:text-blue-200">{s.nome}</span>
                                            <span className="text-xs font-black text-[#22C55E]">R$ {s.preco.toLocaleString('pt-BR')}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* O Carrinho só aparece se tiver itens */}
                        {itensTemporarios.length > 0 && (
                            <div className="space-y-2 mt-4 pt-4 border-t border-white/5">
                                {itensTemporarios.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center bg-[#0F172A] border border-white/5 p-3 rounded-xl text-[10px] text-slate-300">
                                        <div className="flex items-center gap-2">
                                            <input type="number" min="1" className="w-12 bg-black/50 border border-white/10 rounded px-1 py-1 text-center font-bold text-white outline-none focus:border-blue-500" value={item.quantidade} onChange={(e) => {
                                                const novosItens = [...itensTemporarios];
                                                novosItens[i].quantidade = Number(e.target.value);
                                                setItensTemporarios(novosItens);
                                            }}/>
                                            <span className="font-bold uppercase truncate max-w-[120px] md:max-w-[200px]">{item.servico}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-[#22C55E]">R$ {(item.quantidade * item.precoUnitario).toLocaleString()}</span>
                                            <button type="button" onClick={() => setItensTemporarios(itensTemporarios.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-white p-1 bg-red-500/10 hover:bg-red-500 hover:text-white rounded transition-colors"><Trash2 size={12}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {editingLeadId && (
                        <div className="grid grid-cols-1 gap-4">
                            <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5 flex flex-col">
                                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Notas Rápidas</p>
                                <div className="flex-1 overflow-y-auto max-h-32 custom-scrollbar space-y-2 mb-2">
                                    {historico.map(h => {
                                        const rawDate = h.created_at || new Date().toISOString();
                                        const d = new Date(rawDate);
                                        const fmt = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} · ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
                                        return (
                                            <div key={h.id} className="border-b border-white/5 pb-1 mb-1">
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-[10px] text-slate-300 font-medium">{h.texto}</span>
                                                    <span className="text-[8px] text-slate-600 font-mono ml-2">{fmt}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-2">
                                    <input className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white outline-none" placeholder="Nova nota..." value={novaNota} onChange={e => setNovaNota(e.target.value)} />
                                    <button type="button" onClick={adicionarNota} className="bg-blue-600 text-white px-3 rounded-lg text-[10px] font-bold">OK</button>
                                </div>
                            </div>
                            <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Anexos</p>
                                <label className="block w-full text-center border border-dashed border-white/10 rounded-xl p-3 cursor-pointer hover:bg-white/5 transition-all">
                                    <Upload size={16} className="mx-auto text-slate-500 mb-1"/>
                                    <span className="text-[10px] text-slate-400">{uploading ? 'Enviando...' : 'Anexar Contrato'}</span>
                                    <input type="file" className="hidden" onChange={handleUpload}/>
                                </label>
                                {fotoUrl && <a href={fotoUrl} target="_blank" className="block text-[10px] text-blue-400 mt-2 text-center hover:underline">Ver Anexo Atual</a>}
                            </div>
                        </div>
                    )}

                    {/* 👇 PAINEL DE APROVAÇÃO (SÓ APARECE SE PASSAR DO LIMITE) 👇 */}
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
                            ) : (
                                <p className="text-orange-400 font-black text-xs uppercase animate-pulse border border-orange-500/20 py-2 rounded-xl bg-orange-500/10">Aguardando Diretor/Gerente</p>
                            )}
                        </div>
                    )}
                </form>
              </div>

              <div className="p-6 border-t border-white/10 bg-[#0B1120] flex-shrink-0 rounded-b-[40px]">
                  <button type="submit" form="leadForm" className={`w-full py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] ${selectedClientId && novaUnidade ? (percModal > LIMITE_DESCONTO_MAXIMO && !isLideranca ? 'bg-orange-500 text-white' : 'bg-[#22C55E] text-[#0F172A] hover:scale-[1.02]') : 'bg-slate-700 text-slate-400 cursor-not-allowed'}`}>
                      {!editingLeadId ? 'Criar Oportunidade' : (percModal > LIMITE_DESCONTO_MAXIMO && !isLideranca ? 'Solicitar Aprovação' : 'Salvar Alterações')}
                  </button>
              </div>

           </div>
        </div>
      )}

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}