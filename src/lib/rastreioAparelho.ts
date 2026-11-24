// Comandos de configuração do rastreador (família GT06/Concox) enviados pela internet, pelo
// Traccar (tipo "custom" = o mesmo texto que iria por SMS). A resposta do aparelho volta como
// evento commandResult e aparece em "Respostas do aparelho" no painel do veículo.
//
// Só comandos seguros: nada que mude servidor/APN (isso derruba o aparelho e só volta por SMS).
import type { SupabaseClient } from '@supabase/supabase-js';
import { garantirDispositivoTraccar, traccarConfigurado, enviarTextoTraccar } from '@/lib/rastreio';

export type ComandoAparelho = 'localizar' | 'status' | 'parametros' | 'versao' | 'rede' | 'reiniciar' | 'intervalo' | 'velocidade' | 'sos' | 'sos_limpar'
  | 'vigilancia' | 'vibracao' | 'alarme_energia' | 'alarme_bateria' | 'alarme_ignicao' | 'curva' | 'distancia' | 'sinal_vida';

export const COMANDOS: Record<ComandoAparelho, { rotulo: string; ajuda: string }> = {
  localizar: { rotulo: 'Localizar agora', ajuda: 'Pede a posição na hora (WHERE#).' },
  status: { rotulo: 'Status', ajuda: 'Bateria, GPS, GSM, ignição e relé (STATUS#).' },
  parametros: { rotulo: 'Parâmetros', ajuda: 'IMEI, intervalos, SOS e fuso configurados (PARAM#).' },
  rede: { rotulo: 'Servidor e APN', ajuda: 'Só leitura: mostra para onde ele envia (GPRSSET#).' },
  versao: { rotulo: 'Versão', ajuda: 'Modelo e firmware (VERSION#).' },
  intervalo: { rotulo: 'Intervalo de envio', ajuda: 'De quanto em quanto tempo manda posição (TIMER).' },
  velocidade: { rotulo: 'Alarme de velocidade no aparelho', ajuda: 'O próprio rastreador avisa acima do limite (SPEED).' },
  sos: { rotulo: 'Números SOS', ajuda: 'Celulares que recebem SMS de alarme do aparelho (SOS,A).' },
  sos_limpar: { rotulo: 'Apagar números SOS', ajuda: 'Remove os 3 números SOS (SOS,D).' },
  reiniciar: { rotulo: 'Reiniciar aparelho', ajuda: 'Reinicia o rastreador; volta em ~1 min (RESET#).' },
  vigilancia: { rotulo: 'Modo vigilância (âncora)', ajuda: 'Alarme se o veículo sair X metros de onde está estacionado (MOVING).' },
  vibracao: { rotulo: 'Alarme de vibração', ajuda: 'Alarme quando mexem no carro desligado (SENALM).' },
  alarme_energia: { rotulo: 'Alarme de corte de energia', ajuda: 'Avisa se cortarem o fio do rastreador (POWERALM).' },
  alarme_bateria: { rotulo: 'Alarme de bateria interna baixa', ajuda: 'Avisa quando a bateria interna está acabando (BATALM).' },
  alarme_ignicao: { rotulo: 'Alarme de ignição', ajuda: 'O próprio aparelho avisa ao ligar/desligar (ACCALM).' },
  curva: { rotulo: 'Posição nas curvas', ajuda: 'Manda ponto a cada mudança de direção: trajeto mais fiel (ANGLEREP).' },
  distancia: { rotulo: 'Envio por distância', ajuda: 'Manda posição a cada X metros (DISTANCE).' },
  sinal_vida: { rotulo: 'Sinal de vida', ajuda: 'Intervalo do "estou vivo" com o carro parado (HBT).' },
};

type Params = { ligado?: number; desligado?: number; kmh?: number; segundos?: number; ativo?: boolean; numeros?: string[]; metros?: number; graus?: number; minutos?: number; sms?: boolean };

/** Monta o texto do comando, validando os valores. */
export function textoComando(cmd: ComandoAparelho, p: Params = {}): string {
  const int = (v: unknown, min: number, max: number, nome: string) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${nome}: use de ${min} a ${max}.`);
    return n;
  };
  switch (cmd) {
    case 'localizar': return 'WHERE#';
    case 'status': return 'STATUS#';
    case 'parametros': return 'PARAM#';
    case 'rede': return 'GPRSSET#';
    case 'versao': return 'VERSION#';
    case 'reiniciar': return 'RESET#';
    case 'intervalo':
      return `TIMER,${int(p.ligado, 10, 300, 'Com ignição ligada (s)')},${int(p.desligado, 10, 3600, 'Com ignição desligada (s)')}#`;
    case 'velocidade':
      if (p.ativo === false) return 'SPEED,OFF#';
      return `SPEED,ON,${int(p.segundos ?? 20, 5, 600, 'Tempo acima do limite (s)')},${int(p.kmh, 20, 250, 'Velocidade (km/h)')},1#`;
    case 'sos': {
      const nums = (p.numeros || []).map(n => String(n).replace(/\D/g, '')).filter(Boolean).slice(0, 3);
      if (!nums.length || nums.some(n => n.length < 10 || n.length > 13)) throw new Error('Informe de 1 a 3 celulares com DDD.');
      return `SOS,A,${nums.join(',')}#`;
    }
    case 'sos_limpar': return 'SOS,D,1,2,3#';
    // Alarmes do aparelho: M = 0 só internet, 1 internet + SMS para os números SOS
    case 'vigilancia':
      if (p.ativo === false) return 'MOVING,OFF#';
      return `MOVING,ON,${int(p.metros ?? 200, 100, 1000, 'Raio (m)')},${p.sms ? 1 : 0}#`;
    case 'vibracao': return p.ativo === false ? 'SENALM,OFF#' : `SENALM,ON,${p.sms ? 1 : 0}#`;
    case 'alarme_energia': return p.ativo === false ? 'POWERALM,OFF#' : `POWERALM,ON,${p.sms ? 1 : 0}#`;
    case 'alarme_bateria': return p.ativo === false ? 'BATALM,OFF#' : `BATALM,ON,${p.sms ? 1 : 0}#`;
    case 'alarme_ignicao': return p.ativo === false ? 'ACCALM,OFF#' : `ACCALM,ON,${p.sms ? 1 : 0}#`;
    case 'curva':
      if (p.ativo === false) return 'ANGLEREP,OFF#';
      return `ANGLEREP,ON,${int(p.graus ?? 30, 5, 180, 'Ângulo (graus)')},3#`;
    case 'distancia': return `DISTANCE,${p.ativo === false ? 0 : int(p.metros ?? 300, 50, 10000, 'Distância (m)')}#`;
    case 'sinal_vida': return `HBT,${int(p.minutos ?? 5, 1, 300, 'Intervalo (min)')}#`;
  }
}

/** Envia ao aparelho (só diretor/gerente, validado na rota) e registra no log de comandos. */
export async function configurarAparelho(db: SupabaseClient, p: {
  empresaId: string; veiculoId: string; comando: ComandoAparelho; params?: Params; autor: { userId: string | null; nome: string };
}) {
  if (!(p.comando in COMANDOS)) throw new Error('Comando inválido.');
  const texto = textoComando(p.comando, p.params);
  const { data: v } = await db.from('rastreio_veiculos').select('id, empresa_id, placa, imei, traccar_device_id, ultima_velocidade, ultima_lat, ultima_lng')
    .eq('id', p.veiculoId).eq('empresa_id', p.empresaId).eq('status', 'ativo').maybeSingle();
  if (!v) throw new Error('Veículo não encontrado.');
  if (!traccarConfigurado()) throw new Error('Servidor de rastreio ainda não configurado.');

  const log = (status: 'enviado' | 'erro', detalhe: string) => db.from('rastreio_comandos').insert({
    empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'configurar', comando: texto, status, motivo: COMANDOS[p.comando].rotulo, detalhe,
    origem: 'painel', velocidade_no_momento: v.ultima_velocidade, lat: v.ultima_lat, lng: v.ultima_lng, user_id: p.autor.userId, user_nome: p.autor.nome,
  });
  try {
    let deviceId = v.traccar_device_id as number | null;
    if (!deviceId) {
      deviceId = await garantirDispositivoTraccar(v.imei, v.placa);
      await db.from('rastreio_veiculos').update({ traccar_device_id: deviceId }).eq('id', v.id);
    }
    const { naFila } = await enviarTextoTraccar(deviceId, texto);
    const mensagem = naFila
      ? 'Aparelho sem sinal agora: o comando fica na fila e vai quando ele comunicar.'
      : 'Comando entregue. A resposta do aparelho aparece abaixo em alguns segundos.';
    await log('enviado', mensagem);
    return { naFila, mensagem, texto };
  } catch (err) {
    await log('erro', (err as Error).message);
    throw new Error(`Falha ao enviar: ${(err as Error).message}`);
  }
}
