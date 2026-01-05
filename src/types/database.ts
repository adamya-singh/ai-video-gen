export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      assets: {
        Row: {
          created_at: string | null
          generation_metadata: Json | null
          id: string
          scene_id: string
          status: string | null
          storage_path: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          generation_metadata?: Json | null
          id?: string
          scene_id: string
          status?: string | null
          storage_path?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          generation_metadata?: Json | null
          id?: string
          scene_id?: string
          status?: string | null
          storage_path?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          created_at: string | null
          format: string | null
          id: string
          project_id: string
          quality: string | null
          storage_path: string | null
          thumbnail_path: string | null
        }
        Insert: {
          created_at?: string | null
          format?: string | null
          id?: string
          project_id: string
          quality?: string | null
          storage_path?: string | null
          thumbnail_path?: string | null
        }
        Update: {
          created_at?: string | null
          format?: string | null
          id?: string
          project_id?: string
          quality?: string | null
          storage_path?: string | null
          thumbnail_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          aspect_ratio: string | null
          created_at: string | null
          current_step: number | null
          id: string
          settings: Json | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          settings?: Json | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          settings?: Json | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scenes: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: string
          image_prompt: string | null
          motion_type: string | null
          order_index: number
          script_segment: string | null
          shot_list_id: string
          status: string | null
          video_prompt: string | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          image_prompt?: string | null
          motion_type?: string | null
          order_index: number
          script_segment?: string | null
          shot_list_id: string
          status?: string | null
          video_prompt?: string | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          image_prompt?: string | null
          motion_type?: string | null
          order_index?: number
          script_segment?: string | null
          shot_list_id?: string
          status?: string | null
          video_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenes_shot_list_id_fkey"
            columns: ["shot_list_id"]
            isOneToOne: false
            referencedRelation: "shot_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          approved_at: string | null
          created_at: string | null
          full_script: string | null
          id: string
          outline: Json | null
          project_id: string
          revision_count: number | null
          word_count: number | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string | null
          full_script?: string | null
          id?: string
          outline?: Json | null
          project_id: string
          revision_count?: number | null
          word_count?: number | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string | null
          full_script?: string | null
          id?: string
          outline?: Json | null
          project_id?: string
          revision_count?: number | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_lists: {
        Row: {
          approved_at: string | null
          created_at: string | null
          id: string
          project_id: string
          video_style: string | null
          first_image_confirmed_at: string | null
          all_images_confirmed_at: string | null
          first_video_confirmed_at: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string | null
          id?: string
          project_id: string
          video_style?: string | null
          first_image_confirmed_at?: string | null
          all_images_confirmed_at?: string | null
          first_video_confirmed_at?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string | null
          id?: string
          project_id?: string
          video_style?: string | null
          first_image_confirmed_at?: string | null
          all_images_confirmed_at?: string | null
          first_video_confirmed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shot_lists_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          approved_at: string | null
          created_at: string | null
          hook_angles: Json | null
          id: string
          project_id: string
          raw_input: string | null
          refined_statement: string | null
          selected_title: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string | null
          hook_angles?: Json | null
          id?: string
          project_id: string
          raw_input?: string | null
          refined_statement?: string | null
          selected_title?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string | null
          hook_angles?: Json | null
          id?: string
          project_id?: string
          raw_input?: string | null
          refined_statement?: string | null
          selected_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

