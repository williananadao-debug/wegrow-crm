import { supabase } from './supabase';
import { localDb } from './localDb';

// 1. DESCE DADOS (Nuvem -> Celular) - O backup de segurança
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

// 2. SOBE DADOS (Celular -> Nuvem) - O Caminhão Forte
export const syncOfflineDataToCloud = async () => {
  if (typeof window !== 'undefined' && !navigator.onLine) return;

  try {
    const fila = await localDb.syncQueue.toArray();
    if (fila.length === 0) return;

    console.log(`🚀 Identificado ${fila.length} registros offline. Subindo para a nuvem...`);

    for (const item of fila) {
        const { id, operacao, tabela, dados } = item;

        if (operacao === 'INSERT') {
            // Tira o ID provisório (que usamos no offline) pro Supabase gerar um real
            const { id: _, ...dadosLimpos } = dados; 
            const { error } = await supabase.from(tabela).insert([dadosLimpos]);
            if (!error) await localDb.syncQueue.delete(id); // Limpa da fila se deu certo
        } 
        else if (operacao === 'UPDATE') {
            const { error } = await supabase.from(tabela).update(dados).eq('id', dados.id);
            if (!error) await localDb.syncQueue.delete(id);
        }
    }
    
    console.log('✅ Dados offline salvos na nuvem com sucesso!');
    // Avisa a tela do Kanban que os dados subiram para ela se atualizar sozinha
    window.dispatchEvent(new Event('sync-completed'));

  } catch (error) {
    console.error('❌ Erro ao subir dados:', error);
  }
};