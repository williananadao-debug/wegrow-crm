import { supabase } from './supabase';
import { localDb } from './localDb';

// 1. DESCE DADOS (Nuvem -> Celular)
export const syncDataToLocal = async (empresaId: string) => {
  if (!empresaId) return;
  if (typeof window !== 'undefined' && !navigator.onLine) return;
  try {
    const { data: clientes } = await supabase
      .from('clientes')
      .select('id, nome_empresa, telefone, cnpj, cidade, status, user_id, empresa_id')
      .eq('empresa_id', empresaId)
      .limit(500);
    if (clientes && clientes.length > 0) await localDb.clientes.bulkPut(clientes);

    const { data: leads } = await supabase
      .from('leads')
      .select('id, empresa, valor_total, etapa, status, tipo, created_at, user_id, empresa_id, client_id, unidade, descricao, itens')
      .eq('empresa_id', empresaId)
      .limit(500);
    if (leads && leads.length > 0) await localDb.leads.bulkPut(leads);
  } catch (error) {
    console.error('Erro no sync local:', error);
  }
};

// Trava por módulo (mesma aba) + localStorage (múltiplas abas)
let isSyncing = false;
const SYNC_LOCK_KEY = 'wegrow_sync_lock';
const SYNC_LOCK_TTL = 30_000; // 30s — tempo máximo esperado para um ciclo de sync

function acquireSyncLock(): boolean {
  if (typeof window === 'undefined') return false;
  const ts = parseInt(localStorage.getItem(SYNC_LOCK_KEY) ?? '0', 10);
  if (Date.now() - ts < SYNC_LOCK_TTL) return false;
  localStorage.setItem(SYNC_LOCK_KEY, String(Date.now()));
  return true;
}

function releaseSyncLock() {
  if (typeof window !== 'undefined') localStorage.removeItem(SYNC_LOCK_KEY);
}

// 2. SOBE DADOS (Celular -> Nuvem)
export const syncOfflineDataToCloud = async () => {
  if (typeof window !== 'undefined' && !navigator.onLine) return;

  // Trava rápida na mesma aba; trava via localStorage entre abas
  if (isSyncing) return;
  if (!acquireSyncLock()) return;

  try {
    isSyncing = true;
    const fila = await localDb.syncQueue.toArray();
    if (fila.length === 0) return;

    console.log(`🚀 Identificado ${fila.length} registros offline. Subindo para a nuvem...`);

    for (const item of fila) {
        const { id, operacao, tabela, dados } = item;

        if (!dados.empresa_id) {
            console.warn(`[sync] Item ignorado — sem empresa_id: tabela=${tabela} id=${dados.id}`);
            await localDb.syncQueue.delete(id);
            continue;
        }

        // Limpa a fila PRIMEIRO para evitar duplicar se der oscilação de rede
        await localDb.syncQueue.delete(id);

        if (operacao === 'INSERT') {
            const { id: _, ...dadosLimpos } = dados;
            await supabase.from(tabela).insert([dadosLimpos]);
        }
        else if (operacao === 'UPDATE') {
            await supabase.from(tabela).update(dados).eq('id', dados.id).eq('empresa_id', dados.empresa_id);
        }
    }

    console.log('✅ Dados offline salvos na nuvem com sucesso!');
    window.dispatchEvent(new Event('sync-completed'));

  } catch (error) {
    console.error('❌ Erro ao subir dados:', error);
  } finally {
    isSyncing = false;
    releaseSyncLock();
  }
};