// Basic Database Types representing the Supabase Schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      farms: {
        Row: {
          id: string
          name: string
          location_description: string | null
          notes: string | null
          status: string
          created_at: string
        }
      }
      cattle_lots: {
        Row: {
          id: string
          name: string
          owner: string | null
          category: string | null
          current_quantity: number
          farm_id: string | null
          pasture_id: string | null
          origin: string | null
          notes: string | null
          status: string
          created_at: string
        }
      }
      expenses: {
        Row: {
          id: string
          category: string | null
          subcategory: string | null
          description: string | null
          amount: number
          expense_date: string
          payment_method: string | null
          supplier_name: string | null
          status: string
          created_at: string
        }
      }
      revenues: {
        Row: {
          id: string
          category: string | null
          description: string | null
          amount: number
          revenue_date: string
          payment_method: string | null
          status: string
          created_at: string
        }
      }
      inventory_items: {
        Row: {
          id: string
          name: string
          category: string | null
          unit: string | null
          current_quantity: number
          minimum_quantity: number | null
          location_description: string | null
          status: string
          created_at: string
        }
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          due_date: string | null
          priority: string
          status: string
          created_at: string
        }
      }
      pending_actions: {
        Row: {
          id: string
          source_message_id: string | null
          action_type: string
          interpreted_data_json: Json
          requires_confirmation: boolean
          confirmation_status: string
          created_at: string
        }
      }
    }
  }
}

// Helper types for easier imports
export type Farm = Database['public']['Tables']['farms']['Row']
export type CattleLot = Database['public']['Tables']['cattle_lots']['Row']
export type Expense = Database['public']['Tables']['expenses']['Row']
export type Revenue = Database['public']['Tables']['revenues']['Row']
export type InventoryItem = Database['public']['Tables']['inventory_items']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type PendingAction = Database['public']['Tables']['pending_actions']['Row']
