// Gerado por: npm run db:types (supabase gen types typescript --linked).
// Regenere após qualquer mudança de schema.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      alunas: {
        Row: {
          atualizado_em: string;
          criado_em: string;
          email: string | null;
          id: string;
          metadata: Json;
          nome: string;
          telefone: string | null;
        };
        Insert: {
          atualizado_em?: string;
          criado_em?: string;
          email?: string | null;
          id?: string;
          metadata?: Json;
          nome: string;
          telefone?: string | null;
        };
        Update: {
          atualizado_em?: string;
          criado_em?: string;
          email?: string | null;
          id?: string;
          metadata?: Json;
          nome?: string;
          telefone?: string | null;
        };
        Relationships: [];
      };
      api_tokens: {
        Row: {
          atualizado_em: string;
          criado_em: string;
          escopo: string[];
          id: string;
          nome: string;
          revogado_em: string | null;
          status: string;
          token_hash: string;
        };
        Insert: {
          atualizado_em?: string;
          criado_em?: string;
          escopo?: string[];
          id?: string;
          nome: string;
          revogado_em?: string | null;
          status?: string;
          token_hash: string;
        };
        Update: {
          atualizado_em?: string;
          criado_em?: string;
          escopo?: string[];
          id?: string;
          nome?: string;
          revogado_em?: string | null;
          status?: string;
          token_hash?: string;
        };
        Relationships: [];
      };
      briefings_enviados: {
        Row: {
          aluna_id: string | null;
          chave_alerta: string;
          conteudo: string;
          enviado_em: string;
          id: string;
          tipo: string;
        };
        Insert: {
          aluna_id?: string | null;
          chave_alerta: string;
          conteudo: string;
          enviado_em?: string;
          id?: string;
          tipo: string;
        };
        Update: {
          aluna_id?: string | null;
          chave_alerta?: string;
          conteudo?: string;
          enviado_em?: string;
          id?: string;
          tipo?: string;
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
      documentos: {
        Row: {
          aluna_id: string | null;
          assinado_em: string | null;
          atualizado_em: string;
          criado_em: string;
          id: string;
          link_drive: string | null;
          referencia_externa: string | null;
          status: string;
          tipo: string;
        };
        Insert: {
          aluna_id?: string | null;
          assinado_em?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          id?: string;
          link_drive?: string | null;
          referencia_externa?: string | null;
          status?: string;
          tipo: string;
        };
        Update: {
          aluna_id?: string | null;
          assinado_em?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          id?: string;
          link_drive?: string | null;
          referencia_externa?: string | null;
          status?: string;
          tipo?: string;
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
          evento_id_externo: string;
          id: string;
          origem: string;
          processado_em: string;
          resultado: string | null;
        };
        Insert: {
          evento_id_externo: string;
          id?: string;
          origem: string;
          processado_em?: string;
          resultado?: string | null;
        };
        Update: {
          evento_id_externo?: string;
          id?: string;
          origem?: string;
          processado_em?: string;
          resultado?: string | null;
        };
        Relationships: [];
      };
      falhas_sistema: {
        Row: {
          area: string;
          contexto: string | null;
          criado_em: string;
          erro: string;
          id: string;
          severidade: string;
        };
        Insert: {
          area: string;
          contexto?: string | null;
          criado_em?: string;
          erro: string;
          id?: string;
          severidade?: string;
        };
        Update: {
          area?: string;
          contexto?: string | null;
          criado_em?: string;
          erro?: string;
          id?: string;
          severidade?: string;
        };
        Relationships: [];
      };
      formularios: {
        Row: {
          aluna_id: string | null;
          atualizado_em: string;
          criado_em: string;
          formulario_nome: string;
          id: string;
          referencia_externa: string | null;
          respondido_em: string | null;
          respostas: Json;
        };
        Insert: {
          aluna_id?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          formulario_nome: string;
          id?: string;
          referencia_externa?: string | null;
          respondido_em?: string | null;
          respostas?: Json;
        };
        Update: {
          aluna_id?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          formulario_nome?: string;
          id?: string;
          referencia_externa?: string | null;
          respondido_em?: string | null;
          respostas?: Json;
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
      log_auditoria: {
        Row: {
          acao: string;
          aluna_id: string | null;
          criado_em: string;
          detalhes: Json;
          id: string;
          origem: string;
          resultado: string;
        };
        Insert: {
          acao: string;
          aluna_id?: string | null;
          criado_em?: string;
          detalhes?: Json;
          id?: string;
          origem: string;
          resultado: string;
        };
        Update: {
          acao?: string;
          aluna_id?: string | null;
          criado_em?: string;
          detalhes?: Json;
          id?: string;
          origem?: string;
          resultado?: string;
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
      pagamentos: {
        Row: {
          aluna_id: string | null;
          atualizado_em: string;
          criado_em: string;
          id: string;
          origem: string;
          pago_em: string | null;
          referencia_externa: string | null;
          status: string;
          valor: number;
          vencimento: string | null;
        };
        Insert: {
          aluna_id?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          id?: string;
          origem: string;
          pago_em?: string | null;
          referencia_externa?: string | null;
          status: string;
          valor: number;
          vencimento?: string | null;
        };
        Update: {
          aluna_id?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          id?: string;
          origem?: string;
          pago_em?: string | null;
          referencia_externa?: string | null;
          status?: string;
          valor?: number;
          vencimento?: string | null;
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
      reunioes: {
        Row: {
          aluna_id: string | null;
          atualizado_em: string;
          criado_em: string;
          data_hora: string;
          id: string;
          link: string | null;
          origem: string;
          referencia_externa: string | null;
          status: string;
        };
        Insert: {
          aluna_id?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          data_hora: string;
          id?: string;
          link?: string | null;
          origem: string;
          referencia_externa?: string | null;
          status: string;
        };
        Update: {
          aluna_id?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          data_hora?: string;
          id?: string;
          link?: string | null;
          origem?: string;
          referencia_externa?: string | null;
          status?: string;
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
          aluna_id: string | null;
          atualizado_em: string;
          concluido_em: string | null;
          criado_em: string;
          id: string;
          status: string;
          task_id: string;
          titulo: string;
        };
        Insert: {
          aluna_id?: string | null;
          atualizado_em?: string;
          concluido_em?: string | null;
          criado_em?: string;
          id?: string;
          status: string;
          task_id: string;
          titulo: string;
        };
        Update: {
          aluna_id?: string | null;
          atualizado_em?: string;
          concluido_em?: string | null;
          criado_em?: string;
          id?: string;
          status?: string;
          task_id?: string;
          titulo?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      normalizar_telefone: { Args: { telefone: string }; Returns: string };
      normalizar_texto: { Args: { texto: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
