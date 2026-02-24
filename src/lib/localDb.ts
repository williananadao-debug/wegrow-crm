import Dexie, { Table } from 'dexie';

// 1. Definindo o formato do nosso Banco de Dados Local
export class WeGrowDatabase extends Dexie {
  leads!: Table<any, string>; 
  clientes!: Table<any, string>;
  syncQueue!: Table<any, number>; // ⏳ A "Fila de Espera" para quando a internet voltar

  constructor() {
    super('WeGrowOfflineDB');
    
    // 2. Criando as tabelas e os índices (o que o sistema pode pesquisar rápido)
    this.version(1).stores({
      // O 'id' é a chave principal. O 'sync_status' vai dizer se já subiu pra nuvem ou não.
      leads: 'id, status, user_id, vendedor_nome, sync_status', 
      clientes: 'id, nome_empresa, cnpj, sync_status',
      
      // Essa é a tabela mágica: tudo que for criado offline cai aqui primeiro
      syncQueue: '++id, operacao, tabela, data_criacao' 
    });
  }
}

// 3. Exportando o banco para o sistema inteiro usar
export const localDb = new WeGrowDatabase();