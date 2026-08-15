-- Pipeline interno da própria WeGrow — contatos/prospects que a empresa está de olho,
-- separado do CRM multi-tenant (que é pra dado de cliente, não pra prospecção da WeGrow
-- sobre si mesma). Só acessível via service role (API /api/admin/prospects), igual
-- clientes_wegrow — sem policy de usuário comum.
create table if not exists public.wegrow_prospects (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  segmento text,
  cidade text,
  status text not null default 'bom_fit', -- cliente | avancado | bom_fit | porte_grande | perdido
  canal text, -- ialto | nilton | organico | indicacao | direto (null = ainda não definido)
  faturamento_nota text, -- texto livre — nem sempre vira número exato
  fonte text, -- de onde veio o dado (Econodata, memória interna, diretório regional...)
  estrategia text, -- próximo passo / estratégia de abordagem
  contato text,
  whatsapp text,
  notas text,
  proxima_acao_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wegrow_prospects enable row level security;
-- Nenhuma policy criada de propósito: só o service role (server-side, via API admin) acessa.
-- BYPASSRLS do service_role só pula a checagem de policy — GRANT de tabela é separado e
-- não vem de graça nesse projeto (diferente do padrão default do Supabase), tem que pedir.
grant select, insert, update, delete on public.wegrow_prospects to service_role;

-- Seed com o mapa de prospecção já levantado (Radar Alto Vale, 25 empresas reais).
insert into public.wegrow_prospects (nome, segmento, cidade, status, canal, faturamento_nota, fonte, estrategia) values
('Demais FM', 'Rádio & Mídia', 'Taió / Rio do Sul — rede de 3 emissoras', 'cliente', 'direto', 'R$ 1.050/mês (contrato)', 'Contrato WeGrow assinado — memória interna', 'Já é cliente — foco em upsell (Financeiro/Assinatura Digital nas outras praças) e usá-lo como case-âncora de broadcasting em todo pitch novo do segmento.'),
('Grupo Foscarini', 'Construção & Engenharia', 'Alto Vale — obras públicas / licitação', 'avancado', 'direto', 'R$ 497/mês (módulo Argus)', 'Pipeline WeGrow — memória interna', 'Em negociação avançada — fechar com o módulo Argus já pronto como prova concreta, não promessa; não abrir escopo novo até assinar.'),
('PRO Engenharia Construtora', 'Construção & Engenharia', 'Rio do Sul', 'bom_fit', null, 'Faturamento não disponível', 'Diretório regional de construtoras', 'Abordagem fria assim que Foscarini fechar — mesmo segmento (obras/licitação) e mesma dor, prova social local pronta pra usar.'),
('ORAS Incorporadora e Construtora', 'Construção & Engenharia', 'Rio do Sul', 'bom_fit', null, 'Faturamento não disponível', 'Diretório regional de construtoras', 'Mesmo pacote de abordagem que PRO Engenharia — mesma cidade, mesmo case de referência, pode ir junto na mesma leva.'),
('Bertotti', 'Comércio & Varejo', 'Alto Vale — comércio', 'avancado', 'direto', 'R$ 548/mês (Pulse + Financeiro)', 'Pipeline WeGrow — memória interna', 'Negociação avançada com produto pronto (Pulse + Financeiro) — fechar rápido, sem depender de nenhum build adicional.'),
('GB Motors', 'Comércio & Varejo', 'Alto Vale — revenda de veículos', 'cliente', 'direto', 'Valor de contrato não registrado', 'Cliente ativo — módulo Argus Veículos', 'Cliente ativo sem valor de contrato formalizado — prioridade administrativa antes de qualquer expansão de escopo com ele.'),
('Rede Top Supermercados', 'Comércio & Varejo', 'Ibirama e região', 'bom_fit', null, 'Faturamento não disponível', 'Busca regional de varejo', 'Sem canal mapeado ainda — achar o contato certo antes de prospectar a frio, não sair ligando sem referência.'),
('Mercados Nunes, Aterrado e São Pedro', 'Comércio & Varejo', 'Pouso Redondo', 'bom_fit', null, 'Faturamento não disponível — 3 dos maiores mercados locais do município', 'Econodata — maiores empresas de mercado, Pouso Redondo', '3 maiores mercados do mesmo município — abordagem em bloco, mesma cidade, provável mesma dor de gestão comercial.'),
('Contraco Máquinas', 'Indústria', 'Taió', 'bom_fit', 'ialto', 'Faturamento não disponível — 40 anos, exporta p/ LatAm', 'Já é case do parceiro IAlto — alinhar antes de abordar', 'Não abordar direto — alinhar com o Leonardo (IAlto) antes de qualquer contato, pra não sobrepor canal com um case que já é dele.'),
('Metalúrgica Riosulense S.A.', 'Indústria', 'Rio do Sul (Barra do Trombudo)', 'bom_fit', null, 'Faturamento não disponível — autopeças', 'Econodata — maiores empresas de metalurgia', 'Sem canal ainda — prospecção fria via Econodata; citar Contraco como referência de segmento assim que puder falar dela abertamente.'),
('Hedler Indústria de Alimentos', 'Indústria', 'Trombudo Central', 'bom_fit', null, 'R$ 14,3 milhões/ano', 'Econodata — maiores empresas de Trombudo Central', 'Porte confirmado (R$14,3M/ano) — dado real já valida o fit de tamanho, prioridade alta pra prospecção fria.'),
('ICAVI Ind. de Caldeiras Vale do Itajaí', 'Indústria', 'Pouso Redondo', 'bom_fit', null, 'Faturamento não disponível — 1ª maior indústria do município', 'Econodata — maiores empresas de indústria, Pouso Redondo', 'Maior indústria do município — abordar citando a posição de liderança local; ARPU potencial acima da média do segmento.'),
('Selva Norte Indústria de Madeiras', 'Indústria', 'Pouso Redondo', 'bom_fit', null, 'Faturamento não disponível — madeireira', 'Econodata — maiores empresas de indústria, Pouso Redondo', 'Sem dado de porte — prioridade baixa até confirmar tamanho; entra na leva de prospecção exploratória de Pouso Redondo.'),
('PROACO Indústria Metalúrgica', 'Indústria', 'Ituporanga', 'bom_fit', null, 'Faturamento não disponível — metalurgia', 'Econodata — maiores empresas de Ituporanga', 'Mesmo padrão de Riosulense — metalurgia é o sub-segmento mais repetido do mapa, vale montar um pitch padronizado pro nicho.'),
('Águas Negras Indústria de Papel', 'Indústria', 'Ituporanga', 'bom_fit', null, 'Faturamento não disponível — 1ª maior empresa do município', 'Econodata — maiores empresas de Ituporanga', 'Maior empresa do município — mesmo racional do ICAVI, prioridade alta apesar do faturamento não confirmado.'),
('Indústria Têxtil Agrolândia S/A', 'Indústria', 'Agrolândia', 'bom_fit', null, 'Faturamento não disponível', 'Diretório de maiores empresas de Agrolândia', 'Sem dado de porte nem canal — baixa prioridade até surgir mais informação ou um gancho de entrada.'),
('Pamplona Alimentos S/A', 'Indústria', 'Rio do Sul + Presidente Getúlio + Laurentino', 'porte_grande', null, 'R$ 2,4 bilhões/ano', '1.600+ funcionários — provável ERP próprio (Revista Sucesso SA)', 'Porte grande demais pro perfil de hoje — não priorizar; revisitar só se a WeGrow ganhar um módulo enterprise robusto.'),
('Mondini Plantas', 'Agro & Atacado', 'Taió', 'bom_fit', 'nilton', 'Faturamento não disponível — 5 gerações, carteira nacional B2B', 'Canal Nilton — memória interna', 'Canal Nilton já mapeado — próximo passo é ele agendar a conversa, não abordagem fria por conta própria.'),
('Cerealista Ludvig', 'Agro & Atacado', 'Ituporanga', 'bom_fit', null, 'Faturamento não disponível', 'Econodata — maiores empresas de Ituporanga', 'Sem canal — prospecção fria via Econodata; mesmo município da Mondini, avaliar abordagem conjunta com o Nilton.'),
('COOPERMAVIPI', 'Agro & Atacado', 'Agrolândia', 'porte_grande', null, 'Faturamento não disponível — cooperativa, maior empresa do município', 'Diretório de maiores empresas de Agrolândia', 'Cooperativa — decisão colegiada e mais lenta; mapear quem decide antes de investir tempo, não tratar como venda direta simples.'),
('CRAVIL', 'Agro & Atacado', 'Rio do Sul — 55 unidades, 40+ municípios', 'porte_grande', null, 'R$ 1+ bilhão/ano (2022)', 'Cooperativa — decisão colegiada, ciclo de venda distinto', 'Mesmo padrão colegiado da COOPERMAVIPI, em escala bem maior — só vale o esforço se surgir uma porta de entrada por indicação, não abordagem fria.'),
('Alto Vale Transportes e Logística', 'Transporte & Logística', 'Rio do Sul', 'bom_fit', null, 'Faturamento não disponível — cargas rodoviárias, atua desde 2017', 'Diretório regional de transportadoras', 'Único nome do segmento no mapa, sem canal — prospecção fria exploratória, baixo custo de tentar.'),
('MidiAds', 'Serviços', 'Taió', 'bom_fit', 'nilton', 'Faturamento não disponível — pequena, agência digital', 'Canal Nilton — também potencial parceiro de revenda', 'Potencial duplo (cliente e parceiro de revenda) — vale conversa de parceria antes de tratar só como prospect comum.'),
('Contabilidade Andderson', 'Serviços', 'Taió', 'bom_fit', 'nilton', 'Faturamento não disponível — familiar, 20+ anos', 'Canal Nilton — maior potencial como indicador que como cliente', 'Vale mais como indicador (base de clientes da contabilidade) do que como cliente direto — priorizar conversa de parceria de indicação via Nilton.'),
('Menegazzi e Santos Empreend. Imobiliários', 'Serviços', 'Trombudo Central', 'bom_fit', null, 'R$ 10,4 milhões/ano', 'Econodata — maiores empresas de Trombudo Central', 'Porte confirmado (R$10,4M/ano) — prospecção fria justificada pelo dado real, mesmo sem canal ainda.')
on conflict (nome) do nothing;
