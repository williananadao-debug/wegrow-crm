import { supabase } from './supabase';
import { localDb } from './localDb';

// Função que "Enche o Cofre" do celular
export const syncDataToLocal = async () => {
  // Se estiver sem internet, nem tenta buscar na nuvem
  if (typeof window !== 'undefined' && !navigator.onLine) {
    console.log('📱 Modo Offline: Usando dados do cofre local.');
    return;
  }

  try {
    console.log('🔄 Sincronizando dados com a nuvem...');

    // 1. Puxa TODOS os clientes do Supabase
    const { data: clientes } = await supabase.from('clientes').select('*');
    if (clientes && clientes.length > 0) {
      // Guarda/Atualiza tudo no Dexie (Celular)
      await localDb.clientes.bulkPut(clientes); 
    }

    // 2. Puxa TODOS os Leads
    const { data: leads } = await supabase.from('leads').select('*');
    if (leads && leads.length > 0) {
      await localDb.leads.bulkPut(leads);
    }

    console.log('✅ Cofre Offline abastecido com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao encher o cofre:', error);
  }
};