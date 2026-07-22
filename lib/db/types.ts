// Tipos do banco no formato do `supabase gen types typescript`.
// Escrito à mão espelhando supabase/migrations/ porque a geração exige um
// banco acessível. Depois de linkar o projeto, regenere com: npm run db:types
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      alunas: {
        Row: {
          id: string;
          nome: string;
          email: string | null;
          telefone: string | null;
          metadata: Json;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          nome: string;
          email?: string | null;
          telefone?: string | null;
          metadata?: Json;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          email?: string | null;
          telefone?: string | null;
          metadata?: Json;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [];
      };
      pagamentos: {
        Row: {
          id: string;
          aluna_id: string | null;
          origem: string;
          status: string;
          valor: number;
          vencimento: string | null;
          pago_em: string | null;
          referencia_externa: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          aluna_id?: string | null;
          origem: string;
          status: string;
          valor: number;
          vencimento?: string | null;
          pago_em?: string | null;
          referencia_externa?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string | null;
          origem?: string;
          status?: string;
          valor?: number;
          vencimento?: string | null;
          pago_em?: string | null;
          referencia_externa?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pagamentos_aluna_id_fkey";
            columns: ["aluna_id"];
            isOneToOne: false;
            referencedRelation: "alunas";
            referencedColumns: ["id"];
          },
        ];
      };
      documentos: {
        Row: {
          id: string;
          aluna_id: string | null;
          tipo: string;
          status: string;
          assinado_em: string | null;
          link_drive: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          aluna_id?: string | null;
          tipo: string;
          status?: string;
          assinado_em?: string | null;
          link_drive?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string | null;
          tipo?: string;
          status?: string;
          assinado_em?: string | null;
          link_drive?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documentos_aluna_id_fkey";
            columns: ["aluna_id"];
            isOneToOne: false;
            referencedRelation: "alunas";
            referencedColumns: ["id"];
          },
        ];
      };
      formularios: {
        Row: {
          id: string;
          aluna_id: string | null;
          formulario_nome: string;
          respostas: Json;
          respondido_em: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          aluna_id?: string | null;
          formulario_nome: string;
          respostas?: Json;
          respondido_em?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string | null;
          formulario_nome?: string;
          respostas?: Json;
          respondido_em?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "formularios_aluna_id_fkey";
            columns: ["aluna_id"];
            isOneToOne: false;
            referencedRelation: "alunas";
            referencedColumns: ["id"];
          },
        ];
      };
      reunioes: {
        Row: {
          id: string;
          aluna_id: string | null;
          origem: string;
          data_hora: string;
          status: string;
          link: string | null;
          referencia_externa: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          aluna_id?: string | null;
          origem: string;
          data_hora: string;
          status: string;
          link?: string | null;
          referencia_externa?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string | null;
          origem?: string;
          data_hora?: string;
          status?: string;
          link?: string | null;
          referencia_externa?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reunioes_aluna_id_fkey";
            columns: ["aluna_id"];
            isOneToOne: false;
            referencedRelation: "alunas";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks_asana: {
        Row: {
          id: string;
          aluna_id: string | null;
          task_id: string;
          titulo: string;
          status: string;
          concluido_em: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          aluna_id?: string | null;
          task_id: string;
          titulo: string;
          status: string;
          concluido_em?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string | null;
          task_id?: string;
          titulo?: string;
          status?: string;
          concluido_em?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_asana_aluna_id_fkey";
            columns: ["aluna_id"];
            isOneToOne: false;
            referencedRelation: "alunas";
            referencedColumns: ["id"];
          },
        ];
      };
      eventos_brutos: {
        Row: {
          id: string;
          origem: string;
          payload: Json;
          recebido_em: string;
        };
        Insert: {
          id?: string;
          origem: string;
          payload: Json;
          recebido_em?: string;
        };
        Update: {
          id?: string;
          origem?: string;
          payload?: Json;
          recebido_em?: string;
        };
        Relationships: [];
      };
      eventos_processados: {
        Row: {
          id: string;
          origem: string;
          evento_id_externo: string;
          resultado: string | null;
          processado_em: string;
        };
        Insert: {
          id?: string;
          origem: string;
          evento_id_externo: string;
          resultado?: string | null;
          processado_em?: string;
        };
        Update: {
          id?: string;
          origem?: string;
          evento_id_externo?: string;
          resultado?: string | null;
          processado_em?: string;
        };
        Relationships: [];
      };
      briefings_enviados: {
        Row: {
          id: string;
          tipo: string;
          chave_alerta: string;
          aluna_id: string | null;
          conteudo: string;
          enviado_em: string;
        };
        Insert: {
          id?: string;
          tipo: string;
          chave_alerta: string;
          aluna_id?: string | null;
          conteudo: string;
          enviado_em?: string;
        };
        Update: {
          id?: string;
          tipo?: string;
          chave_alerta?: string;
          aluna_id?: string | null;
          conteudo?: string;
          enviado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "briefings_enviados_aluna_id_fkey";
            columns: ["aluna_id"];
            isOneToOne: false;
            referencedRelation: "alunas";
            referencedColumns: ["id"];
          },
        ];
      };
      api_tokens: {
        Row: {
          id: string;
          nome: string;
          token_hash: string;
          escopo: string[];
          status: string;
          revogado_em: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          nome: string;
          token_hash: string;
          escopo?: string[];
          status?: string;
          revogado_em?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          token_hash?: string;
          escopo?: string[];
          status?: string;
          revogado_em?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [];
      };
      log_auditoria: {
        Row: {
          id: string;
          origem: string;
          acao: string;
          aluna_id: string | null;
          resultado: string;
          detalhes: Json;
          criado_em: string;
        };
        Insert: {
          id?: string;
          origem: string;
          acao: string;
          aluna_id?: string | null;
          resultado: string;
          detalhes?: Json;
          criado_em?: string;
        };
        Update: {
          id?: string;
          origem?: string;
          acao?: string;
          aluna_id?: string | null;
          resultado?: string;
          detalhes?: Json;
          criado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "log_auditoria_aluna_id_fkey";
            columns: ["aluna_id"];
            isOneToOne: false;
            referencedRelation: "alunas";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      normalizar_texto: {
        Args: { texto: string };
        Returns: string;
      };
      normalizar_telefone: {
        Args: { telefone: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
