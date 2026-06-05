export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_character_presets: {
        Row: {
          action_mappings: Json | null
          created_at: string | null
          description: string | null
          grid_template_id: string | null
          id: string
          name: string
          owner_id: string
          riv_file_path: string
          rive_analysis: Json | null
          zone_bounds: Json | null
        }
        Insert: {
          action_mappings?: Json | null
          created_at?: string | null
          description?: string | null
          grid_template_id?: string | null
          id?: string
          name: string
          owner_id: string
          riv_file_path: string
          rive_analysis?: Json | null
          zone_bounds?: Json | null
        }
        Update: {
          action_mappings?: Json | null
          created_at?: string | null
          description?: string | null
          grid_template_id?: string | null
          id?: string
          name?: string
          owner_id?: string
          riv_file_path?: string
          rive_analysis?: Json | null
          zone_bounds?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_character_presets_grid_template_id_fkey"
            columns: ["grid_template_id"]
            isOneToOne: false
            referencedRelation: "grid_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_character_state: {
        Row: {
          id: string
          is_on_air: boolean | null
          preset_id: string | null
          session_id: string
          updated_at: string | null
          visible: boolean | null
          vm_values: Json | null
        }
        Insert: {
          id?: string
          is_on_air?: boolean | null
          preset_id?: string | null
          session_id: string
          updated_at?: string | null
          visible?: boolean | null
          vm_values?: Json | null
        }
        Update: {
          id?: string
          is_on_air?: boolean | null
          preset_id?: string | null
          session_id?: string
          updated_at?: string | null
          visible?: boolean | null
          vm_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_character_state_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "ai_character_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_character_state_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "broadcast_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_cuesheet_session_scenes: {
        Row: {
          created_at: string
          generated_css: string | null
          generated_html: string | null
          id: string
          overlay_template_id: string | null
          scene_data: Json
          scene_order: number
          session_id: string
          trigger_note: string | null
        }
        Insert: {
          created_at?: string
          generated_css?: string | null
          generated_html?: string | null
          id?: string
          overlay_template_id?: string | null
          scene_data?: Json
          scene_order: number
          session_id: string
          trigger_note?: string | null
        }
        Update: {
          created_at?: string
          generated_css?: string | null
          generated_html?: string | null
          id?: string
          overlay_template_id?: string | null
          scene_data?: Json
          scene_order?: number
          session_id?: string
          trigger_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_cuesheet_session_scenes_overlay_template_id_fkey"
            columns: ["overlay_template_id"]
            isOneToOne: false
            referencedRelation: "overlay_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_cuesheet_session_scenes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_cuesheet_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_cuesheet_sessions: {
        Row: {
          created_at: string
          expert_data: Json
          generated_count: number
          id: string
          owner_id: string
          program_title: string
          raw_input_json: string | null
          layout_profile: Json | null
          scene_count: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expert_data?: Json
          generated_count?: number
          id?: string
          owner_id: string
          program_title: string
          raw_input_json?: string | null
          layout_profile?: Json | null
          scene_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expert_data?: Json
          generated_count?: number
          id?: string
          owner_id?: string
          program_title?: string
          raw_input_json?: string | null
          layout_profile?: Json | null
          scene_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_model_config: {
        Row: {
          api_key_id: string | null
          base_url: string | null
          description: string | null
          display_name: string
          fallback_model_id: string | null
          generation_config: Json | null
          id: string
          is_active: boolean | null
          model_id: string
          provider: string | null
          rpd_limit: number | null
          rpm_limit: number | null
          system_prompt: string | null
          threshold_percent: number | null
          tier: string | null
          tpd_limit: number | null
          tpm_limit: number | null
          updated_at: string | null
        }
        Insert: {
          api_key_id?: string | null
          base_url?: string | null
          description?: string | null
          display_name: string
          fallback_model_id?: string | null
          generation_config?: Json | null
          id?: string
          is_active?: boolean | null
          model_id: string
          provider?: string | null
          rpd_limit?: number | null
          rpm_limit?: number | null
          system_prompt?: string | null
          threshold_percent?: number | null
          tier?: string | null
          tpd_limit?: number | null
          tpm_limit?: number | null
          updated_at?: string | null
        }
        Update: {
          api_key_id?: string | null
          base_url?: string | null
          description?: string | null
          display_name?: string
          fallback_model_id?: string | null
          generation_config?: Json | null
          id?: string
          is_active?: boolean | null
          model_id?: string
          provider?: string | null
          rpd_limit?: number | null
          rpm_limit?: number | null
          system_prompt?: string | null
          threshold_percent?: number | null
          tier?: string | null
          tpd_limit?: number | null
          tpm_limit?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_model_config_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          completion_tokens: number | null
          created_at: string | null
          id: string
          model_id: string
          prompt_tokens: number | null
          request_type: string | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string | null
          id?: string
          model_id: string
          prompt_tokens?: number | null
          request_type?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string | null
          id?: string
          model_id?: string
          prompt_tokens?: number | null
          request_type?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string | null
          encrypted_key: string
          id: string
          name: string
          owner_id: string | null
          service: string
        }
        Insert: {
          created_at?: string | null
          encrypted_key: string
          id?: string
          name: string
          owner_id?: string | null
          service: string
        }
        Update: {
          created_at?: string | null
          encrypted_key?: string
          id?: string
          name?: string
          owner_id?: string | null
          service?: string
        }
        Relationships: []
      }
      broadcast_segments: {
        Row: {
          color: string
          created_at: string | null
          cuesheet_item_id: string | null
          id: string
          label: string
          reporter: string | null
          segment_order: number | null
          session_id: string
          slug: string | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          cuesheet_item_id?: string | null
          id?: string
          label: string
          reporter?: string | null
          segment_order?: number | null
          session_id: string
          slug?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          cuesheet_item_id?: string | null
          id?: string
          label?: string
          reporter?: string | null
          segment_order?: number | null
          session_id?: string
          slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_segments_cuesheet_item_id_fkey"
            columns: ["cuesheet_item_id"]
            isOneToOne: false
            referencedRelation: "nrcs_cuesheet_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_segments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "broadcast_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_sessions: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          archived_at: string | null
          playhead_state: Json | null
          rundown_id: string
          status: string | null
          timeline_data: Json | null
          title: string
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          archived_at?: string | null
          playhead_state?: Json | null
          rundown_id: string
          status?: string | null
          timeline_data?: Json | null
          title: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          archived_at?: string | null
          playhead_state?: Json | null
          rundown_id?: string
          status?: string | null
          timeline_data?: Json | null
          title?: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_sessions_rundown_id_fkey"
            columns: ["rundown_id"]
            isOneToOne: false
            referencedRelation: "rundowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_slots: {
        Row: {
          bundle_id: string
          cg_type: string
          field_mapping: Json | null
          graphic_id: string | null
          id: string
          priority: number | null
          sort_order: number | null
        }
        Insert: {
          bundle_id: string
          cg_type: string
          field_mapping?: Json | null
          graphic_id?: string | null
          id?: string
          priority?: number | null
          sort_order?: number | null
        }
        Update: {
          bundle_id?: string
          cg_type?: string
          field_mapping?: Json | null
          graphic_id?: string | null
          id?: string
          priority?: number | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bundle_slots_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "template_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_slots_graphic_id_fkey"
            columns: ["graphic_id"]
            isOneToOne: false
            referencedRelation: "graphics"
            referencedColumns: ["id"]
          },
        ]
      }
      cuesheet_data_sources: {
        Row: {
          column_schema: Json | null
          config: Json | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          name: string
          owner_id: string
          raw_data: Json | null
          row_count: number | null
          source_type: string
          updated_at: string | null
        }
        Insert: {
          column_schema?: Json | null
          config?: Json | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          owner_id: string
          raw_data?: Json | null
          row_count?: number | null
          source_type: string
          updated_at?: string | null
        }
        Update: {
          column_schema?: Json | null
          config?: Json | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          owner_id?: string
          raw_data?: Json | null
          row_count?: number | null
          source_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuesheet_data_sources_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_data_sources: {
        Row: {
          accent: string | null
          api_key_id: string | null
          auth_type: string | null
          body_template: Json | null
          created_at: string | null
          description: string | null
          endpoint: string
          headers: Json | null
          icon: string | null
          id: string
          is_active: boolean | null
          last_status: number | null
          last_tested: string | null
          method: string | null
          name: string
          owner_id: string
          provider: string | null
          query_params: Json | null
          response_mapping: Json | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          accent?: string | null
          api_key_id?: string | null
          auth_type?: string | null
          body_template?: Json | null
          created_at?: string | null
          description?: string | null
          endpoint: string
          headers?: Json | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          last_status?: number | null
          last_tested?: string | null
          method?: string | null
          name: string
          owner_id: string
          provider?: string | null
          query_params?: Json | null
          response_mapping?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          accent?: string | null
          api_key_id?: string | null
          auth_type?: string | null
          body_template?: Json | null
          created_at?: string | null
          description?: string | null
          endpoint?: string
          headers?: Json | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          last_status?: number | null
          last_tested?: string | null
          method?: string | null
          name?: string
          owner_id?: string
          provider?: string | null
          query_params?: Json | null
          response_mapping?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_data_sources_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_data_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_cg_links: {
        Row: {
          cg_item_id: string
          cg_system: string
          created_at: string
          id: string
          link_type: string
          story_id: string
        }
        Insert: {
          cg_item_id: string
          cg_system?: string
          created_at?: string
          id?: string
          link_type?: string
          story_id: string
        }
        Update: {
          cg_item_id?: string
          cg_system?: string
          created_at?: string
          id?: string
          link_type?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fathom_cg_links_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "fathom_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_context_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string
          context_id: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          chunk_index?: number
          chunk_text: string
          context_id: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          context_id?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fathom_context_chunks_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "fathom_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_contexts: {
        Row: {
          ai_summary: string | null
          clearance_level: string
          context_type: string
          created_at: string
          file_path: string | null
          id: string
          is_used_in_broadcast: boolean | null
          metadata: Json | null
          processing_status: string
          source_url: string | null
          story_id: string
          title: string
        }
        Insert: {
          ai_summary?: string | null
          clearance_level?: string
          context_type?: string
          created_at?: string
          file_path?: string | null
          id?: string
          is_used_in_broadcast?: boolean | null
          metadata?: Json | null
          processing_status?: string
          source_url?: string | null
          story_id: string
          title?: string
        }
        Update: {
          ai_summary?: string | null
          clearance_level?: string
          context_type?: string
          created_at?: string
          file_path?: string | null
          id?: string
          is_used_in_broadcast?: boolean | null
          metadata?: Json | null
          processing_status?: string
          source_url?: string | null
          story_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fathom_contexts_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "fathom_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_entities: {
        Row: {
          created_at: string
          description: string | null
          entity_type: string
          id: string
          metadata: Json | null
          name: string
          story_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          name: string
          story_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          name?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fathom_entities_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "fathom_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_entity_relations: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          relation_type: string
          source_entity_id: string
          target_entity_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          relation_type: string
          source_entity_id: string
          target_entity_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          relation_type?: string
          source_entity_id?: string
          target_entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fathom_entity_relations_source_entity_id_fkey"
            columns: ["source_entity_id"]
            isOneToOne: false
            referencedRelation: "fathom_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fathom_entity_relations_target_entity_id_fkey"
            columns: ["target_entity_id"]
            isOneToOne: false
            referencedRelation: "fathom_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_programs: {
        Row: {
          air_time: string | null
          code: string | null
          color: string | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          weekdays: number[] | null
        }
        Insert: {
          air_time?: string | null
          code?: string | null
          color?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          weekdays?: number[] | null
        }
        Update: {
          air_time?: string | null
          code?: string | null
          color?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          weekdays?: number[] | null
        }
        Relationships: []
      }
      fathom_second_screen_cards: {
        Row: {
          card_type: string
          cdn_url: string | null
          content: Json
          created_at: string
          display_order: number
          id: string
          is_published: boolean | null
          story_id: string
        }
        Insert: {
          card_type: string
          cdn_url?: string | null
          content?: Json
          created_at?: string
          display_order?: number
          id?: string
          is_published?: boolean | null
          story_id: string
        }
        Update: {
          card_type?: string
          cdn_url?: string | null
          content?: Json
          created_at?: string
          display_order?: number
          id?: string
          is_published?: boolean | null
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fathom_second_screen_cards_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "fathom_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      fathom_stories: {
        Row: {
          aired_at: string | null
          broadcast_script: string | null
          bureau: string | null
          created_at: string
          id: string
          metadata: Json | null
          program: string | null
          reporter_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          aired_at?: string | null
          broadcast_script?: string | null
          bureau?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          program?: string | null
          reporter_id: string
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          aired_at?: string | null
          broadcast_script?: string | null
          bureau?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          program?: string | null
          reporter_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      fathom_story_assignments: {
        Row: {
          air_date: string
          cg_texts: Json | null
          created_at: string | null
          id: string
          notes: string | null
          program_id: string
          segment_order: number | null
          status: string | null
          story_id: string
          updated_at: string | null
        }
        Insert: {
          air_date: string
          cg_texts?: Json | null
          created_at?: string | null
          id?: string
          notes?: string | null
          program_id: string
          segment_order?: number | null
          status?: string | null
          story_id: string
          updated_at?: string | null
        }
        Update: {
          air_date?: string
          cg_texts?: Json | null
          created_at?: string | null
          id?: string
          notes?: string | null
          program_id?: string
          segment_order?: number | null
          status?: string | null
          story_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fathom_story_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "fathom_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fathom_story_assignments_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "fathom_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      fonts: {
        Row: {
          category: string
          created_at: string | null
          display_name: string
          family_name: string
          file_size: number | null
          id: string
          is_active: boolean
          is_public: boolean
          license_note: string | null
          license_type: string
          mime_type: string | null
          owner_id: string
          storage_path: string
          style: string
          updated_at: string | null
          weight: number
        }
        Insert: {
          category?: string
          created_at?: string | null
          display_name: string
          family_name: string
          file_size?: number | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          license_note?: string | null
          license_type?: string
          mime_type?: string | null
          owner_id: string
          storage_path: string
          style?: string
          updated_at?: string | null
          weight?: number
        }
        Update: {
          category?: string
          created_at?: string | null
          display_name?: string
          family_name?: string
          file_size?: number | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          license_note?: string | null
          license_type?: string
          mime_type?: string | null
          owner_id?: string
          storage_path?: string
          style?: string
          updated_at?: string | null
          weight?: number
        }
        Relationships: []
      }
      graphics: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          owner_id: string
          template_data: Json
          thumbnail_path: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          owner_id: string
          template_data?: Json
          thumbnail_path?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          owner_id?: string
          template_data?: Json
          thumbnail_path?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graphics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      grid_templates: {
        Row: {
          created_at: string | null
          description: string | null
          forked_from: string | null
          id: string
          is_public: boolean | null
          name: string
          owner_id: string
          template_data: Json
          thumbnail_path: string | null
          updated_at: string | null
          visibility: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          forked_from?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          owner_id: string
          template_data?: Json
          thumbnail_path?: string | null
          updated_at?: string | null
          visibility?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          forked_from?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          owner_id?: string
          template_data?: Json
          thumbnail_path?: string | null
          updated_at?: string | null
          visibility?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grid_templates_forked_from_fkey"
            columns: ["forked_from"]
            isOneToOne: false
            referencedRelation: "grid_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grid_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          file_size: number | null
          id: string
          is_public: boolean | null
          keywords: string[] | null
          mime_type: string | null
          name: string
          owner_id: string
          storage_path: string
          storage_path_2k: string | null
          storage_path_4k: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          id?: string
          is_public?: boolean | null
          keywords?: string[] | null
          mime_type?: string | null
          name: string
          owner_id: string
          storage_path: string
          storage_path_2k?: string | null
          storage_path_4k?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          id?: string
          is_public?: boolean | null
          keywords?: string[] | null
          mime_type?: string | null
          name?: string
          owner_id?: string
          storage_path?: string
          storage_path_2k?: string | null
          storage_path_4k?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "images_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nrcs_cuesheet_items: {
        Row: {
          article_type: string | null
          cg_data: Json | null
          created_at: string | null
          cuesheet_id: string
          id: string
          item_order: number | null
          linked_rundown_item_id: string | null
          mapping_result: Json | null
          nrcs_item_id: string
          reporter: string | null
          slug: string
          source_row_id: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          article_type?: string | null
          cg_data?: Json | null
          created_at?: string | null
          cuesheet_id: string
          id?: string
          item_order?: number | null
          linked_rundown_item_id?: string | null
          mapping_result?: Json | null
          nrcs_item_id: string
          reporter?: string | null
          slug: string
          source_row_id?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          article_type?: string | null
          cg_data?: Json | null
          created_at?: string | null
          cuesheet_id?: string
          id?: string
          item_order?: number | null
          linked_rundown_item_id?: string | null
          mapping_result?: Json | null
          nrcs_item_id?: string
          reporter?: string | null
          slug?: string
          source_row_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nrcs_cuesheet_items_cuesheet_id_fkey"
            columns: ["cuesheet_id"]
            isOneToOne: false
            referencedRelation: "nrcs_cuesheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nrcs_cuesheet_items_linked_rundown_item_id_fkey"
            columns: ["linked_rundown_item_id"]
            isOneToOne: false
            referencedRelation: "rundown_items"
            referencedColumns: ["id"]
          },
        ]
      }
      nrcs_cuesheets: {
        Row: {
          bundle_id: string | null
          created_at: string | null
          id: string
          linked_rundown_id: string | null
          owner_id: string
          program_date: string
          program_name: string
          source_id: string | null
          source_type: string | null
          status: string | null
          total_items: number | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          bundle_id?: string | null
          created_at?: string | null
          id?: string
          linked_rundown_id?: string | null
          owner_id: string
          program_date: string
          program_name: string
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          bundle_id?: string | null
          created_at?: string | null
          id?: string
          linked_rundown_id?: string | null
          owner_id?: string
          program_date?: string
          program_name?: string
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nrcs_cuesheets_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "template_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nrcs_cuesheets_linked_rundown_id_fkey"
            columns: ["linked_rundown_id"]
            isOneToOne: false
            referencedRelation: "rundowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nrcs_cuesheets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nrcs_cuesheets_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "cuesheet_data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nrcs_cuesheets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      overlay_data_sources: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          last_fetched: string | null
          name: string
          owner_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_fetched?: string | null
          name: string
          owner_id?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_fetched?: string | null
          name?: string
          owner_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      overlay_gallery: {
        Row: {
          created_at: string | null
          id: string
          is_favorite: boolean | null
          name: string
          owner_id: string | null
          tags: string[] | null
          template_id: string | null
          thumbnail: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_favorite?: boolean | null
          name: string
          owner_id?: string | null
          tags?: string[] | null
          template_id?: string | null
          thumbnail?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_favorite?: boolean | null
          name?: string
          owner_id?: string | null
          tags?: string[] | null
          template_id?: string | null
          thumbnail?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overlay_gallery_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "overlay_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      overlay_state: {
        Row: {
          active_content_index: number | null
          animation_state: string | null
          conflict_mode: string | null
          current_data: Json | null
          group_tag: string | null
          id: string
          is_active: boolean | null
          pending_data: Json | null
          render_state: Json | null
          replicant_data: Json | null
          session_id: string | null
          tags: string[] | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          active_content_index?: number | null
          animation_state?: string | null
          conflict_mode?: string | null
          current_data?: Json | null
          group_tag?: string | null
          id?: string
          is_active?: boolean | null
          pending_data?: Json | null
          render_state?: Json | null
          replicant_data?: Json | null
          session_id?: string | null
          tags?: string[] | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active_content_index?: number | null
          animation_state?: string | null
          conflict_mode?: string | null
          current_data?: Json | null
          group_tag?: string | null
          id?: string
          is_active?: boolean | null
          pending_data?: Json | null
          render_state?: Json | null
          replicant_data?: Json | null
          session_id?: string | null
          tags?: string[] | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overlay_state_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "broadcast_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overlay_state_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "overlay_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      overlay_templates: {
        Row: {
          ai_metadata: Json | null
          ai_prompt: string | null
          animation_config: Json | null
          blend_mode: string | null
          category: string | null
          created_at: string | null
          dashboard_schema: Json | null
          data_source: Json | null
          description: string | null
          graphic_data: Json
          grid_template_id: string | null
          id: string
          folder_id: string | null
          is_public: boolean | null
          layer: number | null
          name: string
          owner_id: string | null
          plugin_type: string | null
          refresh_interval: number | null
          replicant_defaults: Json | null
          source_code: Json | null
          source_type: string | null
          tags: string[] | null
          thumbnail: string | null
          updated_at: string | null
          visibility: string
          workspace_id: string | null
          zone_bounds: Json | null
          zone_ids: string[] | null
        }
        Insert: {
          ai_metadata?: Json | null
          ai_prompt?: string | null
          animation_config?: Json | null
          blend_mode?: string | null
          category?: string | null
          created_at?: string | null
          dashboard_schema?: Json | null
          data_source?: Json | null
          description?: string | null
          graphic_data?: Json
          grid_template_id?: string | null
          id?: string
          folder_id?: string | null
          is_public?: boolean | null
          layer?: number | null
          name: string
          owner_id?: string | null
          plugin_type?: string | null
          refresh_interval?: number | null
          replicant_defaults?: Json | null
          source_code?: Json | null
          source_type?: string | null
          tags?: string[] | null
          thumbnail?: string | null
          updated_at?: string | null
          visibility?: string
          workspace_id?: string | null
          zone_bounds?: Json | null
          zone_ids?: string[] | null
        }
        Update: {
          ai_metadata?: Json | null
          ai_prompt?: string | null
          animation_config?: Json | null
          blend_mode?: string | null
          category?: string | null
          created_at?: string | null
          dashboard_schema?: Json | null
          data_source?: Json | null
          description?: string | null
          graphic_data?: Json
          grid_template_id?: string | null
          id?: string
          folder_id?: string | null
          is_public?: boolean | null
          layer?: number | null
          name?: string
          owner_id?: string | null
          plugin_type?: string | null
          refresh_interval?: number | null
          replicant_defaults?: Json | null
          source_code?: Json | null
          source_type?: string | null
          tags?: string[] | null
          thumbnail?: string | null
          updated_at?: string | null
          visibility?: string
          workspace_id?: string | null
          zone_bounds?: Json | null
          zone_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "overlay_templates_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "overlay_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overlay_templates_grid_template_id_fkey"
            columns: ["grid_template_id"]
            isOneToOne: false
            referencedRelation: "grid_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overlay_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      overlay_folders: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_system: boolean
          name: string
          owner_id: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_system?: boolean
          name: string
          owner_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_system?: boolean
          name?: string
          owner_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overlay_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_workspace_id: string | null
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string
          is_admin: boolean | null
          last_login_at: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          active_workspace_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          is_admin?: boolean | null
          last_login_at?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          active_workspace_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_admin?: boolean | null
          last_login_at?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_workspace_id_fkey"
            columns: ["active_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active_rundown_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_broadcasting: boolean | null
          name: string
          owner_id: string
          settings: Json | null
          timeline_data: Json | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          active_rundown_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_broadcasting?: boolean | null
          name: string
          owner_id: string
          settings?: Json | null
          timeline_data?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          active_rundown_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_broadcasting?: boolean | null
          name?: string
          owner_id?: string
          settings?: Json | null
          timeline_data?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rundown_items: {
        Row: {
          created_at: string | null
          data: Json | null
          duration: number | null
          id: string
          item_order: number
          parent_item_id: string | null
          rundown_id: string
          section_id: string | null
          source_id: string | null
          source_name: string | null
          source_type: string | null
          template_id: string | null
          thumbnail: string | null
          track_layer: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          duration?: number | null
          id?: string
          item_order?: number
          parent_item_id?: string | null
          rundown_id: string
          section_id?: string | null
          source_id?: string | null
          source_name?: string | null
          source_type?: string | null
          template_id?: string | null
          thumbnail?: string | null
          track_layer?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          duration?: number | null
          id?: string
          item_order?: number
          parent_item_id?: string | null
          rundown_id?: string
          section_id?: string | null
          source_id?: string | null
          source_name?: string | null
          source_type?: string | null
          template_id?: string | null
          thumbnail?: string | null
          track_layer?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rundown_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "rundown_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rundown_items_rundown_id_fkey"
            columns: ["rundown_id"]
            isOneToOne: false
            referencedRelation: "rundowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rundown_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rundowns: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean | null
          project_id: string | null
          sections_data: Json | null
          title: string
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          project_id?: string | null
          sections_data?: Json | null
          title: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          project_id?: string | null
          sections_data?: Json | null
          title?: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rundowns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rundowns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      session_action_logs: {
        Row: {
          action_detail: Json | null
          action_type: string
          created_at: string | null
          id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          action_detail?: Json | null
          action_type: string
          created_at?: string | null
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          action_detail?: Json | null
          action_type?: string
          created_at?: string | null
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_action_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "broadcast_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      template_bundles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          owner_id: string
          program_name: string | null
          theme_config: Json | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          owner_id: string
          program_name?: string | null
          theme_config?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          owner_id?: string
          program_name?: string | null
          theme_config?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_bundles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_bundles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          owner_id: string | null
          thumbnail_path: string | null
          timeline_preset: Json
          updated_at: string | null
          visibility: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          owner_id?: string | null
          thumbnail_path?: string | null
          timeline_preset?: Json
          updated_at?: string | null
          visibility?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          owner_id?: string | null
          thumbnail_path?: string | null
          timeline_preset?: Json
          updated_at?: string | null
          visibility?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whiteboards: {
        Row: {
          created_at: string | null
          document_state: Json
          generation: number | null
          id: string
          name: string
          owner_id: string | null
          thumbnail_url: string | null
          updated_at: string | null
          visibility: string | null
          workspace_id: string
          yjs_state: string | null
        }
        Insert: {
          created_at?: string | null
          document_state?: Json
          generation?: number | null
          id?: string
          name: string
          owner_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          visibility?: string | null
          workspace_id: string
          yjs_state?: string | null
        }
        Update: {
          created_at?: string | null
          document_state?: Json
          generation?: number | null
          id?: string
          name?: string
          owner_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          visibility?: string | null
          workspace_id?: string
          yjs_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whiteboards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whiteboards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          id: string
          joined_at: string | null
          role: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fathom_match_chunks: {
        Args: {
          decay_rate?: number
          match_count?: number
          match_threshold?: number
          query_embedding: string
          required_clearance?: string
        }
        Returns: {
          ai_summary: string
          chunk_id: string
          chunk_text: string
          context_id: string
          context_title: string
          similarity: number
          story_id: string
          time_weighted_score: number
        }[]
      }
      has_role: { Args: { required_role: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_workspace_member: { Args: { ws_id: string }; Returns: boolean }
      my_workspace_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
