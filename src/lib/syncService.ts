import { supabase } from './supabase';
import { localDb } from './localDb';

// 1. DESCE DADOS (Nuvem -> Celular)
export const syncDataToLocal = async () => {
  if (typeof window !== 'undefined' && !navigator.onLine) return;
  try {
    const { data: clientes } = await supabase.from('clientes').select('*');
    if (clientes && clientes.length > 0) await localDb.clientes.bulkPut(clientes); 

    const { data: leads } = await supabase.from('leads').select('*');
    if (leads && leads.length > 0) await localDb.leads.bulkPut(leads);
  } catch (error) {
    console.error('Erro no sync local:', error);
  }
};

// 👇 A TRAVA DE SEGURANÇA 👇
let isSyncing = false; 

// 2. SOBE DADOS (Celular -> Nuvem)
export const syncOfflineDataToCloud = async () => {
  if (typeof window !== 'undefined' && !navigator.onLine) return;
  
  // Se já estiver sincronizando, bloqueia execução dupla!
  if (isSyncing) return; 

  try {
    isSyncing = true; // Tranca a porta
    const fila = await localDb.syncQueue.toArray();
    if (fila.length === 0) return;

    console.log(`🚀 Identificado ${fila.length} registros offline. Subindo para a nuvem...`);

    for (const item of fila) {
        const { id, operacao, tabela, dados } = item;

        // Limpa a fila PRIMEIRO para evitar duplicar se der oscilação de rede
        await localDb.syncQueue.delete(id); 

        if (operacao === 'INSERT') {
            const { id: _, ...dadosLimpos } = dados; 
            await supabase.from(tabela).insert([dadosLimpos]);
        } 
        else if (operacao === 'UPDATE') {
            await supabase.from(tabela).update(dados).eq('id', dados.id);
        }
    }
    
    console.log('✅ Dados offline salvos na nuvem com sucesso!');
    window.dispatchEvent(new Event('sync-completed'));

  } catch (error) {
    console.error('❌ Erro ao subir dados:', error);
  } finally {
    isSyncing = false; // Destranca a porta ao terminar
  }
};