"use client";
import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  Plus, X, Trash2, Radio, Zap, Mic2, MessageCircle, MapPin, 
  Upload, Target, MapPinOff, User, Briefcase, Printer, Edit2,
  Sparkles, Crosshair, Calendar, CalendarDays, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Toast } from '@/components/Toast';

// --- TIPOS ---
type ItemVenda = { servico: string; quantidade: number; precoUnitario: number; };
type Historico = { id: number; texto: string; created_at: string; }; 
type ServicoConfig = { id: number; nome: string; preco: number; tipo?: string };

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
  filial_id?: number;
  client_id?: number;
  contrato_inicio?: string; 
  contrato_fim?: string; 
  origem?: string;
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

export default function DealsPage() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({}); 
  const [clientesOpcoes, setClientesOpcoes] = useState<ClienteOpcao[]>([]);
  const [listaServicos, setListaServicos] = useState<ServicoConfig[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<number | null>(null);
  
  const [novaEmpresa, setNovaEmpresa] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [tipoCliente, setTipoCliente] = useState<'Agência' | 'Anunciante'>('Anunciante');
  
  const [contratoInicio, setContratoInicio] = useState('');
  const [contratoFim, setContratoFim] = useState('');
  
  const [itensTemporarios, setItensTemporarios] = useState<ItemVenda[]>([]);
  const [servicoAtual, setServicoAtual] = useState('');
  const [qtdAtual, setQtdAtual] = useState(1);
  const [precoAtual, setPrecoAtual] = useState(0);
  const [desconto, setDesconto] = useState(0); 
  
  const [fotoUrl, setFotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [novaNota, setNovaNota] = useState('');

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const [metaMensal, setMetaMensal] = useState(1); 
  
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      
      let query = supabase.from('leads').select('*');
      if (!isDirector) {
        query = query.eq('user_id', user.id);
      }

      const { data: leadsData } = await query.order('created_at', { ascending: false });
      
      if (leadsData) {
          setLeads(leadsData);
          const userIds = Array.from(new Set(leadsData.map(l => l.user_id).filter(Boolean)));
          if (userIds.length > 0) {
              const { data: perfisData } = await supabase.from('profiles').select('id, nome').in('id', userIds);
              if (perfisData) {
                  const mapa = perfisData.reduce((acc: any, p) => ({...acc, [p.id]: p.nome}), {});
                  setUsersMap(mapa);
              }
          }
      }

      // 👇 BUSCA DA META INTELIGENTE (MÊS E ANO ATUAIS) 👇
      try {
          const dataAtual = new Date();
          const mesAtual = dataAtual.getMonth() + 1; // getMonth() retorna 0-11, então somamos 1
          const anoAtual = dataAtual.getFullYear();

          if (isDirector) {
              // Diretor: Puxa a meta GLOBAL (onde user_id é nulo) do mês e ano exatos
              const { data: metaData } = await supabase
                  .from('metas')
                  .select('valor_objetivo')
                  .is('user_id', null)
                  .eq('mes', mesAtual)
                  .eq('ano', anoAtual)
                  .single();
              
              if (metaData && metaData.valor_objetivo) {
                  setMetaMensal(Number(metaData.valor_objetivo));
              }
          } else {
              // Vendedor: Puxa a meta DELE (pelo user.id) do mês e ano exatos
              const { data: metaData } = await supabase
                  .from('metas')
                  .select('valor_objetivo')
                  .eq('user_id', user.id)
                  .eq('mes', mesAtual)
                  .eq('ano', anoAtual)
                  .single();
              
              if (metaData && metaData.valor_objetivo) {
                  setMetaMensal(Number(metaData.valor_objetivo));
              }
          }
      } catch (err) {
          console.log("Aviso: Meta do mês atual não encontrada ou erro na busca.", err);
      }
      // ----------------------------------------

      const { data: clientesData } = await supabase.from('clientes').select('id, nome_empresa, telefone, cnpj, email').eq('status', 'ativo').order('nome_empresa', { ascending: true });
      if (clientesData) setClientesOpcoes(clientesData as any);

      const { data: servicosData } = await supabase.from('servicos').select('*').order('id', { ascending: true });
      
      if (servicosData && servicosData.length > 0) {
          setListaServicos(servicosData);
      } else {
          setListaServicos([
              { id: 1, nome: 'Blitz', preco: 1200, tipo: 'Zap' },
              { id: 2, nome: 'Spot', preco: 800, tipo: 'Radio' },
              { id: 3, nome: 'Chamada', preco: 450, tipo: 'Mic2' }
          ]);
      }
      
      setLoading(false);
    };
    fetchData();
  }, [user, isDirector]);

  const getIcone = (tipo: string | undefined) => {
      if(tipo === 'Zap') return <Zap size={14} className="text-yellow-400" />;
      if(tipo === 'Radio') return <Radio size={14} className="text-purple-400" />;
      return <Mic2 size={14} className="text-blue-400" />;
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
    const briefingAutomatico = `VENDA APROVADA ✅\n\nItens: ${resumoItens}\nValor Final: R$ ${lead.valor_total} (Desconto aplicado: R$ ${lead.desconto || 0})\n\n(Gerado automaticamente)`;
    
    await supabase.from('jobs').insert([{
        titulo: `Gravação: ${lead.empresa}`,
        briefing: briefingAutomatico,
        client_id: lead.client_id,
        user_id: user?.id,
        stage: 'roteiro',
        prioridade: 'media',
        deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    }]);
  };

  const gerarCobrancaFinanceira = async (lead: Lead) => {
      await supabase.from('lancamentos').insert([{
          titulo: `VENDA: ${lead.empresa}`,
          valor: lead.valor_total,
          tipo: 'entrada',
          categoria: 'vendas',
          status: 'pendente',
          data_vencimento: new Date().toISOString().split('T')[0],
          user_id: user?.id
      }]);
  };

  const mudarEtapa = async (id: number, novaEtapa: number, novoStatus: 'ganho' | 'perdido' | 'aberto') => {
    let etapaFinal = novaEtapa;
    if (novoStatus === 'ganho') etapaFinal = 4;
    if (novoStatus === 'perdido') etapaFinal = 5;

    setLeads(prev => prev.map(l => 
        l.id === id ? { ...l, etapa: etapaFinal, status: novoStatus } : l
    ));

    const { error } = await supabase.from('leads').update({ etapa: etapaFinal, status: novoStatus }).eq('id', id);
    
    if (!error) {
        if (novoStatus === 'ganho') {
            const lead = leads.find(l => l.id === id);
            if (lead) {
                await Promise.all([
                    criarJobDeProducao(lead),
                    gerarCobrancaFinanceira(lead)
                ]);
                setToastMessage("🎉 Venda Confirmada! Enviado para Produção e Financeiro.");
                setShowToast(true);
            }
        }
    } else {
        console.error("Erro ao mudar etapa:", error);
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
         if (leadAtual && (leadAtual.status === 'ganho' || leadAtual.status === 'perdido')) {
             novoStatus = 'aberto';
         }
    }

    await mudarEtapa(leadId, novaEtapa, novoStatus);
  };

  const enviarWhatsapp = (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    if (!lead.telefone) return alert("Cadastre o WhatsApp na edição!"); 

    let listaItens: ItemVenda[] = [];
    try {
        if (Array.isArray(lead.itens)) {
            listaItens = lead.itens;
        } else if (typeof lead.itens === 'string') {
            listaItens = JSON.parse(lead.itens);
        }
    } catch (err) {
        listaItens = [];
    }

    let itensTexto = "";
    if (listaItens.length > 0) {
        itensTexto = listaItens.map(i => {
             const totalItem = (i.quantidade * i.precoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
             return `▪️ ${i.quantidade}x *${i.servico}* (R$ ${totalItem})`;
        }).join('%0A');
    } else {
        itensTexto = "▪️ Detalhes a combinar";
    }

    const totalFormatado = lead.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const descontoFormatado = (lead.desconto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const nomeConsultor = perfil?.nome || 'Consultor';

    let msgDesconto = "";
    if (lead.desconto && lead.desconto > 0) {
        msgDesconto = `🎁 *Desconto Especial:* - R$ ${descontoFormatado}%0A`;
    }

    const msg = 
        `Olá *${lead.empresa}*! 🚀%0A%0A` +
        `Aqui é o ${nomeConsultor} da Demais FM.%0A` +
        `Segue o resumo da nossa proposta:%0A` +
        `--------------------------------%0A` +
        `${itensTexto}%0A` +
        `--------------------------------%0A` +
        `${msgDesconto}%0A` +
        `💰 *INVESTIMENTO FINAL: R$ ${totalFormatado}*%0A%0A` +
        `Podemos avançar com a aprovação?`;

    const telefoneLimpo = lead.telefone.replace(/\D/g, '');
    window.open(`https://wa.me/55${telefoneLimpo}?text=${msg}`, '_blank');
  };

  const imprimirProposta = () => {
    const subtotal = itensTemporarios.reduce((acc, item) => acc + (item.precoUnitario * item.quantidade), 0);
    const total = Math.max(0, subtotal - desconto);
    
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const janela = window.open('', '', 'width=800,height=600');
    if(!janela) return alert("Habilite popups");

    janela.document.write(`
      <html>
        <head><title>Proposta - ${novaEmpresa}</title><style>body{font-family:sans-serif;padding:40px;color:#333}.header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:20px;margin-bottom:30px}.logo{font-size:24px;font-weight:bold;font-style:italic}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{text-align:left;border-bottom:1px solid #ccc;padding:10px;font-size:12px;text-transform:uppercase}td{padding:10px;border-bottom:1px solid #eee}.total-box{text-align:right;font-size:16px;margin-top:5px;}.total-final{text-align:right;font-size:20px;font-weight:bold;margin-top:10px;color:#22C55E;}</style></head>
        <body>
          <div class="header"><div class="logo">WEGROW</div><div>Proposta Comercial<br>${dataHoje}</div></div>
          <h3>Cliente: ${novaEmpresa}</h3>
          <table><thead><tr><th>Item</th><th>Qtd</th><th>Valor</th><th>Total</th></tr></thead><tbody>
          ${itensTemporarios.map(i => `<tr><td>${i.servico}</td><td>${i.quantidade}</td><td>R$ ${i.precoUnitario.toLocaleString('pt-BR')}</td><td>R$ ${(i.quantidade*i.precoUnitario).toLocaleString('pt-BR')}</td></tr>`).join('')}
          </tbody></table>
          <div class="total-box">Subtotal: R$ ${subtotal.toLocaleString('pt-BR')}</div>
          ${desconto > 0 ? `<div class="total-box" style="color:red">Desconto: - R$ ${desconto.toLocaleString('pt-BR')}</div>` : ''}
          <div class="total-final">Total Final: R$ ${total.toLocaleString('pt-BR')}</div>
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
        const { latitude, longitude } = pos.coords;
        const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
        const now = new Date();
        const msg = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')} às ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        
        const { error } = await supabase.from('leads').update({ checkin: msg, localizacao_url: mapsUrl }).eq('id', id);

        if (!error) {
          setLeads(prev => prev.map(l => l.id === id ? { ...l, checkin: msg, localizacao_url: mapsUrl } : l));
          setToastMessage("📍 Check-in realizado com sucesso!");
          setShowToast(true);
        } else {
          alert("Erro ao salvar no banco. Verifique sua conexão.");
        }
      },
      (err) => {
        console.error(err);
        setToastMessage("Falha no GPS ❌");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      if(!confirm("Excluir oportunidade?")) return;
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (!error) {
        setLeads(prev => prev.filter(l => l.id !== id));
        if (isModalOpen) setIsModalOpen(false);
      }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      setUploading(true);
      const file = e.target.files[0];
      const fileName = `${Date.now()}.${file.name.split('.').pop()}`;
      const { data } = await supabase.storage.from('contratos').upload(fileName, file);
      if(data) {
         const { data: url } = supabase.storage.from('contratos').getPublicUrl(fileName);
         setFotoUrl(url.publicUrl);
         if(editingLeadId) {
             await supabase.from('leads').update({ foto_url: url.publicUrl }).eq('id', editingLeadId);
             setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, foto_url: url.publicUrl } : l));
         }
      }
      setUploading(false);
  };

  const carregarHistorico = async (id: number) => {
      const { data } = await supabase.from('historico_leads').select('*').eq('lead_id', id).order('created_at', { ascending: false });
      if(data) setHistorico(data);
  };

  const adicionarNota = async () => {
      if(!novaNota || !editingLeadId) return;
      const { data } = await supabase.from('historico_leads').insert([{ lead_id: editingLeadId, texto: novaNota }]).select();
      if(data) { 
          const novaNotaComData = { ...data[0], created_at: data[0].created_at || new Date().toISOString() };
          setHistorico(prev => [novaNotaComData, ...prev]); 
          setNovaNota(''); 
      }
  };

  const salvarLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaEmpresa) return alert("Digite o nome do cliente!");
    if (!user) return alert("Você precisa estar logado!");

    const subtotal = itensTemporarios.reduce((acc, item) => acc + (item.precoUnitario * item.quantidade), 0);
    const valorTotalFinal = Math.max(0, subtotal - desconto); 

    const payload = {
        empresa: novaEmpresa,
        telefone: novoTelefone,
        tipo: tipoCliente,
        valor_total: valorTotalFinal,
        desconto: desconto, 
        itens: itensTemporarios,
        foto_url: fotoUrl,
        contrato_inicio: contratoInicio || null,
        contrato_fim: contratoFim || null,
        ...(editingLeadId ? {} : { status: 'aberto', etapa: 0, ordem: 0 }),
        user_id: user.id,
        client_id: selectedClientId
    };

    if (editingLeadId) {
        const { error } = await supabase.from('leads').update(payload).eq('id', editingLeadId);
        if (!error) {
            setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, ...payload } as Lead : l));
            setIsModalOpen(false);
            setToastMessage("Lead atualizado!");
            setShowToast(true);
        } else {
            console.error("ERRO AO ATUALIZAR:", error);
            alert(`Erro ao atualizar: ${error.message}`);
        }
    } else {
        const { data, error } = await supabase.from('leads').insert([payload]).select();
        if (error) {
            console.error("ERRO AO CRIAR LEAD:", error);
            alert(`ERRO DE BANCO: ${error.message}`);
        } else if (data) {
            setLeads(prev => [data[0] as Lead, ...prev]);
            setIsModalOpen(false);
            setToastMessage("Lead criado com sucesso! 🚀");
            setShowToast(true);
        }
    }
  };

  const abrirModal = (lead?: Lead) => {
    if (lead) {
        setEditingLeadId(lead.id);
        setNovaEmpresa(lead.empresa);
        setNovoTelefone(lead.telefone || '');
        setSelectedClientId(lead.client_id || null);
        setItensTemporarios(Array.isArray(lead.itens) ? lead.itens : []);
        setFotoUrl(lead.foto_url || '');
        setContratoInicio(lead.contrato_inicio || '');
        setContratoFim(lead.contrato_fim || '');
        setDesconto(lead.desconto || 0); 
        carregarHistorico(lead.id);
    } else {
        setEditingLeadId(null);
        setNovaEmpresa('');
        setNovoTelefone('');
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

  const totalGanhos = leads.filter(l => l.status === 'ganho').reduce((acc, curr) => acc + curr.valor_total, 0);
  const totalAberto = leads.filter(l => l.status === 'aberto').reduce((acc, curr) => acc + curr.valor_total, 0);
  
  // Evita calcular % se a meta do banco for zero ou não carregar
  const percentMeta = metaMensal > 0 ? Math.min((totalGanhos / metaMensal) * 100, 100) : 0;
  
  const rankingServicos = leads.filter(l => l.status === 'ganho').flatMap(l => Array.isArray(l.itens) ? l.itens : []).reduce((acc: any, item) => { acc[item.servico] = (acc[item.servico] || 0) + (item.precoUnitario * item.quantidade); return acc; }, {});

  const getLeadsByStage = (stageIdx: number) => {
      return leads
        .filter(l => l.etapa === stageIdx)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const getStageTotal = (stageIdx: number) => {
      return getLeadsByStage(stageIdx).reduce((acc, l) => acc + (Number(l.valor_total) || 0), 0);
  };

  const isMission = (text: string) => text && (text.includes('Meta') || text.includes('Resgate'));

  const subtotalModal = itensTemporarios.reduce((acc, item) => acc + (item.precoUnitario * item.quantidade), 0);
  const totalModalFinal = Math.max(0, subtotalModal - desconto);

  return (
    <div className="h-full flex flex-col pb-20 md:pb-2">
      
      {/* HEADER + META */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 mb-2 px-2">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">Pipeline</h1>
          <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold tracking-widest uppercase">
             <span className="text-blue-400 flex items-center gap-1"><User size={10}/> {perfil?.nome}</span>
          </div>
        </div>
        
        <div className="hidden md:block flex-1 max-w-sm px-6">
           <div className="flex justify-between text-[9px] font-black uppercase tracking-widest mb-1">
              <span className="text-slate-400 flex items-center gap-1">
                  <Target size={10}/> {isDirector ? 'Meta Global (Mês Atual)' : 'Meta Individual (Mês Atual)'} 
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

      {/* DASHBOARD CARDS */}
      <div className="flex md:grid md:grid-cols-3 gap-2 overflow-x-auto pb-2 px-1 mb-2 snap-x snap-mandatory">
        <div className="min-w-[160px] md:min-w-0 bg-gradient-to-br from-blue-600/20 to-transparent border border-white/5 p-3 rounded-2xl shadow-xl snap-center">
          <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-0.5">Pipeline</p>
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

      {/* KANBAN */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 pb-2 h-[calc(100vh-220px)] md:h-[calc(100vh-200px)] items-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory px-1 md:px-0">
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
                            const daysLeft = getDaysLeft(lead.contrato_fim);

                            return (
                                <Draggable key={lead.id} draggableId={lead.id.toString()} index={index}>
                                    {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className={`bg-white/[0.03] p-3 rounded-xl border border-white/5 group hover:border-[#22C55E]/50 transition-all relative ${snapshot.isDragging ? 'rotate-2 scale-105 shadow-2xl bg-[#0F172A] z-50' : ''}`}
                                    >
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="flex items-center gap-2">
                                                    <div className="cursor-pointer bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors" onClick={() => abrirModal(lead)}>
                                                        <Edit2 size={10} className="text-slate-500"/>
                                                    </div>
                                                    <span className="text-[8px] text-slate-600 font-mono tracking-tighter">{formatarData(lead.created_at)}</span>
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
                                            
                                            <div className="mb-2">
                                                {lead.checkin && isMission(lead.checkin) ? (
                                                    <div className="bg-purple-600/20 border border-purple-500/30 p-1.5 rounded-lg flex items-center gap-2 mb-1">
                                                        {lead.checkin.includes('Resgate') ? <Sparkles size={12} className="text-purple-400"/> : <Crosshair size={12} className="text-purple-400"/>}
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
                                                <h4 className="text-white font-black text-sm uppercase leading-tight hover:text-[#22C55E] transition-colors truncate max-w-full">{lead.empresa}</h4>
                                                {lead.origem === 'Portal Web' && (
                                                    <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                                                        🌐 VIA SITE
                                                    </span>
                                                )}
                                            </div>

                                            <div className="space-y-0.5 border-l border-white/10 pl-2 mb-2">
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
                                                        <button onClick={() => mudarEtapa(lead.id, 4, 'ganho')} className="py-1.5 bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E] hover:text-[#0F172A] rounded text-[9px] font-black uppercase tracking-wider transition-colors">GANHO</button>
                                                        <button onClick={() => mudarEtapa(lead.id, 5, 'perdido')} className="py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white rounded text-[9px] font-black uppercase tracking-wider transition-colors">PERDIDO</button>
                                                    </div>
                                                </div>
                                            ) : lead.status === 'ganho' ? (
                                                <div className="mt-1 text-center pt-2 border-t border-white/5">
                                                    <a href="/jobs" className="inline-flex items-center gap-1 text-[9px] bg-blue-600/10 text-blue-400 px-3 py-1.5 rounded font-black uppercase hover:bg-blue-600 hover:text-white transition-all">
                                                        <Briefcase size={10}/> VER NA PRODUÇÃO
                                                    </a>
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-0 md:p-4">
           <div className="bg-[#0B1120] md:border border-white/10 w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-[40px] shadow-2xl relative flex flex-col">
              
              <div className="flex justify-between items-center p-6 border-b border-white/10 flex-shrink-0">
                  <h2 className="text-xl font-black uppercase italic tracking-tighter text-white">{editingLeadId ? 'Editar Oportunidade' : 'Novo Negócio'}</h2>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Cliente / Empresa</label>
                            <input 
                                list="clientes-list"
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"
                                placeholder="Digite ou selecione..."
                                value={novaEmpresa}
                                onChange={(e) => {
                                    const texto = e.target.value;
                                    setNovaEmpresa(texto);
                                    const clienteEncontrado = clientesOpcoes.find(c => c.nome_empresa === texto);
                                    if(clienteEncontrado) {
                                        setSelectedClientId(clienteEncontrado.id);
                                        setNovoTelefone(clienteEncontrado.telefone || '');
                                    } else {
                                        setSelectedClientId(null);
                                    }
                                }}
                                required
                            />
                            <datalist id="clientes-list">
                                {clientesOpcoes.map(c => (
                                    <option key={c.id} value={c.nome_empresa} />
                                ))}
                            </datalist>
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">WhatsApp</label>
                            <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={novoTelefone} onChange={e => setNovoTelefone(e.target.value)} />
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

                    <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5 space-y-4 relative">
                        <div className="flex justify-between items-start">
                            <p className="text-[10px] font-black text-[#22C55E] uppercase tracking-widest mt-1">Itens da Proposta</p>
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
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 pb-2">
                            {listaServicos.map((s) => (
                                <button key={s.id} type="button" onClick={() => { setServicoAtual(s.nome); setPrecoAtual(s.preco); }} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-xl text-[9px] text-slate-300 font-bold uppercase transition-colors">
                                    {getIcone(s.tipo)} {s.nome}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <input className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none" placeholder="Serviço" value={servicoAtual} onChange={e => setServicoAtual(e.target.value)} />
                            <input type="number" className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white outline-none text-center" placeholder="Qtd" value={qtdAtual} onChange={e => setQtdAtual(Number(e.target.value))} />
                            <input type="number" className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white outline-none" placeholder="R$" value={precoAtual} onChange={e => setPrecoAtual(Number(e.target.value))} />
                            <button type="button" onClick={() => {
                                if(!servicoAtual) return;
                                setItensTemporarios([...itensTemporarios, { servico: servicoAtual, quantidade: qtdAtual, precoUnitario: precoAtual }]);
                                setServicoAtual(''); setPrecoAtual(0);
                            }} className="bg-blue-600 text-white px-3 rounded-lg font-bold">+</button>
                        </div>

                        <div className="space-y-2">
                            {itensTemporarios.map((item, i) => (
                                <div key={i} className="flex justify-between items-center bg-white/5 p-2 rounded-lg text-[10px] text-slate-300">
                                    <span>{item.quantidade}x {item.servico}</span>
                                    <div className="flex items-center gap-2">
                                        <span>R$ {(item.quantidade * item.precoUnitario).toLocaleString()}</span>
                                        <button type="button" onClick={() => setItensTemporarios(itensTemporarios.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-white"><Trash2 size={12}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {editingLeadId && (
                        <div className="grid grid-cols-1 gap-4">
                            <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5 flex flex-col">
                                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Notas</p>
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
                </form>
              </div>

              <div className="p-6 border-t border-white/10 bg-[#0B1120] flex-shrink-0 rounded-b-[40px]">
                  <button type="submit" form="leadForm" className="w-full bg-[#22C55E] text-[#0F172A] py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                      {editingLeadId ? 'Salvar Alterações' : 'Criar Oportunidade'}
                  </button>
              </div>

           </div>
        </div>
      )}

      <Toast 
        message={toastMessage} 
        isVisible={showToast} 
        onClose={() => setShowToast(false)} 
      />

    </div>
  );
}