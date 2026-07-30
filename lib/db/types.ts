/**
 * Tipos do banco no formato do `supabase gen types typescript`.
 *
 * IMPORTANTE: este arquivo espelha exatamente a saída do comando abaixo,
 * derivado das migrations em supabase/migrations. Foi escrito à mão porque o
 * ambiente não tem uma instância Supabase (local/linkada) para rodar o gerador.
 * Ao ter o projeto Supabase disponível, regenere com:
 *
 *   npm run db:types
 *   # equivale a: supabase gen types typescript --project-id <REF> > lib/db/types.ts
 *   # (ou --local, com o supabase start rodando)
 *
 * Mantenha em sincronia com as migrations sempre que o schema mudar.
 */

export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      alunas: {
        Row: {
          id: string;
          nome: string;
          email: string | null;
          telefone: string | null;
          criado_em: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          email?: string | null;
          telefone?: string | null;
          criado_em?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          email?: string | null;
          telefone?: string | null;
          criado_em?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pagamentos: {
        Row: {
          id: string;
          aluna_id: string;
          origem: string;
          status: string;
          valor: number;
          vencimento: string | null;
          pago_em: string | null;
          referencia_externa: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          aluna_id: string;
          origem: string;
          status: string;
          valor: number;
          vencimento?: string | null;
          pago_em?: string | null;
          referencia_externa?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string;
          origem?: string;
          status?: string;
          valor?: number;
          vencimento?: string | null;
          pago_em?: string | null;
          referencia_externa?: string | null;
          created_at?: string;
          updated_at?: string;
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
          aluna_id: string;
          tipo: string;
          status: string;
          origem: string;
          documento_id_externo: string | null;
          assinado_em: string | null;
          motivo_rejeicao: string | null;
          link_assinado: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          aluna_id: string;
          tipo: string;
          status?: string;
          origem?: string;
          documento_id_externo?: string | null;
          assinado_em?: string | null;
          motivo_rejeicao?: string | null;
          link_assinado?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string;
          tipo?: string;
          status?: string;
          origem?: string;
          documento_id_externo?: string | null;
          assinado_em?: string | null;
          motivo_rejeicao?: string | null;
          link_assinado?: string | null;
          created_at?: string;
          updated_at?: string;
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
      materiais: {
        Row: {
          id: string;
          aluna_id: string;
          nome_arquivo: string;
          tipo: string | null;
          link_drive: string | null;
          adicionado_em: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          aluna_id: string;
          nome_arquivo: string;
          tipo?: string | null;
          link_drive?: string | null;
          adicionado_em?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string;
          nome_arquivo?: string;
          tipo?: string | null;
          link_drive?: string | null;
          adicionado_em?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "materiais_aluna_id_fkey";
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
          aluna_id: string;
          formulario_nome: string;
          respostas: Json;
          respondido_em: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          aluna_id: string;
          formulario_nome: string;
          respostas?: Json;
          respondido_em?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string;
          formulario_nome?: string;
          respostas?: Json;
          respondido_em?: string | null;
          created_at?: string;
          updated_at?: string;
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
          aluna_id: string;
          origem: string;
          data_hora: string | null;
          status: string | null;
          link: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          aluna_id: string;
          origem: string;
          data_hora?: string | null;
          status?: string | null;
          link?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string;
          origem?: string;
          data_hora?: string | null;
          status?: string | null;
          link?: string | null;
          created_at?: string;
          updated_at?: string;
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
          aluna_id: string;
          task_id: string;
          titulo: string;
          status: string | null;
          criado_em: string | null;
          concluido_em: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          aluna_id: string;
          task_id: string;
          titulo: string;
          status?: string | null;
          criado_em?: string | null;
          concluido_em?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          aluna_id?: string;
          task_id?: string;
          titulo?: string;
          status?: string | null;
          criado_em?: string | null;
          concluido_em?: string | null;
          created_at?: string;
          updated_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          origem: string;
          payload: Json;
          recebido_em?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          origem?: string;
          payload?: Json;
          recebido_em?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      eventos_processados: {
        Row: {
          id: string;
          origem: string;
          evento_id_externo: string;
          processado_em: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          origem: string;
          evento_id_externo: string;
          processado_em?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          origem?: string;
          evento_id_externo?: string;
          processado_em?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      briefings_enviados: {
        Row: {
          id: string;
          destino: string;
          canal: string;
          conteudo: string;
          status: string;
          enviado_em: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          destino: string;
          canal?: string;
          conteudo: string;
          status?: string;
          enviado_em?: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          destino?: string;
          canal?: string;
          conteudo?: string;
          status?: string;
          enviado_em?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      falhas_sistema: {
        Row: {
          id: string;
          tipo: string;
          severidade: string;
          mensagem: string;
          contexto: Json;
          resolvido: boolean;
          resolvido_em: string | null;
          ocorrido_em: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tipo: string;
          severidade?: string;
          mensagem: string;
          contexto?: Json;
          resolvido?: boolean;
          resolvido_em?: string | null;
          ocorrido_em?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tipo?: string;
          severidade?: string;
          mensagem?: string;
          contexto?: Json;
          resolvido?: boolean;
          resolvido_em?: string | null;
          ocorrido_em?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_tokens: {
        Row: {
          id: string;
          nome: string;
          token_hash: string;
          escopo: string[];
          status: string;
          ultimo_uso_em: string | null;
          expira_em: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          token_hash: string;
          escopo?: string[];
          status?: string;
          ultimo_uso_em?: string | null;
          expira_em?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          token_hash?: string;
          escopo?: string[];
          status?: string;
          ultimo_uso_em?: string | null;
          expira_em?: string | null;
          created_at?: string;
          updated_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          origem: string;
          acao: string;
          aluna_id?: string | null;
          resultado: string;
          detalhes?: Json;
          criado_em?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          origem?: string;
          acao?: string;
          aluna_id?: string | null;
          resultado?: string;
          detalhes?: Json;
          criado_em?: string;
          created_at?: string;
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
    Views: {
      [_ in never]: never;
    };
    Functions: {
      set_updated_at: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// ---------------------------------------------------------------------------
// Helpers utilitários (também emitidos pelo `supabase gen types typescript`).
// ---------------------------------------------------------------------------
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
