export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_compliance: {
        Row: {
          created_at: string
          created_by: string
          esic: string
          gst: string
          id: string
          mwf: string
          notes: string | null
          period_month: string
          pf: string
          ptec: string
          ptrc: string
          tds: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          esic?: string
          gst?: string
          id?: string
          mwf?: string
          notes?: string | null
          period_month: string
          pf?: string
          ptec?: string
          ptrc?: string
          tds?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          esic?: string
          gst?: string
          id?: string
          mwf?: string
          notes?: string | null
          period_month?: string
          pf?: string
          ptec?: string
          ptrc?: string
          tds?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          checkout_note: string | null
          id: string
          lat: number | null
          lng: number | null
          location_label: string | null
          punch_in: string | null
          punch_out: string | null
          user_id: string
          work_date: string
        }
        Insert: {
          checkout_note?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          punch_in?: string | null
          punch_out?: string | null
          user_id: string
          work_date?: string
        }
        Update: {
          checkout_note?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          punch_in?: string | null
          punch_out?: string | null
          user_id?: string
          work_date?: string
        }
        Relationships: []
      }
      ba_appointments: {
        Row: {
          address: string | null
          agreement_path: string | null
          approved: string
          approved_by_name: string | null
          ba_alloted: string
          ba_mobile: string | null
          ba_name: string | null
          branding_done: string
          branding_done_paths: string[]
          branding_place_paths: string[]
          coordinated_with_vendor: string
          created_at: string
          created_by: string
          design_finalization: string
          fitting: string
          id: string
          mobile: string | null
          notes: string | null
          outlet_name: string
          outlet_owner_name: string | null
          quotation_path: string | null
          quotation_received: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          agreement_path?: string | null
          approved?: string
          approved_by_name?: string | null
          ba_alloted?: string
          ba_mobile?: string | null
          ba_name?: string | null
          branding_done?: string
          branding_done_paths?: string[]
          branding_place_paths?: string[]
          coordinated_with_vendor?: string
          created_at?: string
          created_by: string
          design_finalization?: string
          fitting?: string
          id?: string
          mobile?: string | null
          notes?: string | null
          outlet_name: string
          outlet_owner_name?: string | null
          quotation_path?: string | null
          quotation_received?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          agreement_path?: string | null
          approved?: string
          approved_by_name?: string | null
          ba_alloted?: string
          ba_mobile?: string | null
          ba_name?: string | null
          branding_done?: string
          branding_done_paths?: string[]
          branding_place_paths?: string[]
          coordinated_with_vendor?: string
          created_at?: string
          created_by?: string
          design_finalization?: string
          fitting?: string
          id?: string
          mobile?: string | null
          notes?: string | null
          outlet_name?: string
          outlet_owner_name?: string | null
          quotation_path?: string | null
          quotation_received?: string
          updated_at?: string
        }
        Relationships: []
      }
      ba_sales: {
        Row: {
          amount: number
          ba_id: string
          created_at: string
          id: string
          notes: string | null
          product_id: string
          qty: number
          rate: number
          retailer_id: string | null
          sale_date: string
        }
        Insert: {
          amount?: number
          ba_id: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          qty: number
          rate?: number
          retailer_id?: string | null
          sale_date?: string
        }
        Update: {
          amount?: number
          ba_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          qty?: number
          rate?: number
          retailer_id?: string | null
          sale_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ba_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ba_sales_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      ba_stock: {
        Row: {
          ba_id: string
          created_at: string
          id: string
          product_id: string
          qty: number
          retailer_id: string | null
          updated_at: string
        }
        Insert: {
          ba_id: string
          created_at?: string
          id?: string
          product_id: string
          qty?: number
          retailer_id?: string | null
          updated_at?: string
        }
        Update: {
          ba_id?: string
          created_at?: string
          id?: string
          product_id?: string
          qty?: number
          retailer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ba_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ba_stock_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      ba_stock_moves: {
        Row: {
          ba_id: string
          created_at: string
          id: string
          kind: string
          notes: string | null
          product_id: string
          qty: number
          reference: string | null
          retailer_id: string | null
        }
        Insert: {
          ba_id: string
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          product_id: string
          qty: number
          reference?: string | null
          retailer_id?: string | null
        }
        Update: {
          ba_id?: string
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          product_id?: string
          qty?: number
          reference?: string | null
          retailer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ba_stock_moves_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ba_stock_moves_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      barcodes: {
        Row: {
          barcode_no: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          product_allotted: string
          updated_at: string
        }
        Insert: {
          barcode_no: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          product_allotted: string
          updated_at?: string
        }
        Update: {
          barcode_no?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          product_allotted?: string
          updated_at?: string
        }
        Relationships: []
      }
      claims: {
        Row: {
          approved_amount: number | null
          claim_amount: number | null
          created_at: string
          created_by: string
          display_amount: number
          distributor_id: string | null
          extra_margin: number
          id: string
          invoice_no: string | null
          invoice_path: string | null
          notes: string | null
          retailer_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_amount?: number | null
          claim_amount?: number | null
          created_at?: string
          created_by: string
          display_amount?: number
          distributor_id?: string | null
          extra_margin?: number
          id?: string
          invoice_no?: string | null
          invoice_path?: string | null
          notes?: string | null
          retailer_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_amount?: number | null
          claim_amount?: number | null
          created_at?: string
          created_by?: string
          display_amount?: number
          distributor_id?: string | null
          extra_margin?: number
          id?: string
          invoice_no?: string | null
          invoice_path?: string | null
          notes?: string | null
          retailer_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          mode: string
          reference: string | null
          retailer_id: string | null
          review_note: string | null
          salesman_id: string
          status: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          mode?: string
          reference?: string | null
          retailer_id?: string | null
          review_note?: string | null
          salesman_id: string
          status?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          mode?: string
          reference?: string | null
          retailer_id?: string | null
          review_note?: string | null
          salesman_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_stock: {
        Row: {
          batch_no: string | null
          created_at: string
          id: string
          physical_qty: number
          product_id: string
          reserved_qty: number
          updated_at: string
        }
        Insert: {
          batch_no?: string | null
          created_at?: string
          id?: string
          physical_qty?: number
          product_id: string
          reserved_qty?: number
          updated_at?: string
        }
        Update: {
          batch_no?: string | null
          created_at?: string
          id?: string
          physical_qty?: number
          product_id?: string
          reserved_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      csa_payments: {
        Row: {
          amount: number
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          created_role: string
          csa_id: string
          distributor_id: string
          id: string
          mode: string
          notes: string | null
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          created_role?: string
          csa_id: string
          distributor_id: string
          id?: string
          mode?: string
          notes?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          created_role?: string
          csa_id?: string
          distributor_id?: string
          id?: string
          mode?: string
          notes?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "csa_payments_csa_id_fkey"
            columns: ["csa_id"]
            isOneToOne: false
            referencedRelation: "csas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csa_payments_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      csa_stock: {
        Row: {
          csa_id: string
          id: string
          physical_qty: number
          product_id: string
          reserved_qty: number
          updated_at: string
        }
        Insert: {
          csa_id: string
          id?: string
          physical_qty?: number
          product_id: string
          reserved_qty?: number
          updated_at?: string
        }
        Update: {
          csa_id?: string
          id?: string
          physical_qty?: number
          product_id?: string
          reserved_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "csa_stock_csa_id_fkey"
            columns: ["csa_id"]
            isOneToOne: false
            referencedRelation: "csas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csa_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      csas: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          depot_id: string | null
          email: string | null
          gstin: string | null
          id: string
          name: string
          phone: string | null
          state: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          depot_id?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          phone?: string | null
          state?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          depot_id?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          phone?: string | null
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csas_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          created_at: string
          created_by: string
          csa_id: string | null
          dispatch_date: string
          distributor_id: string
          id: string
          lr_no: string
          order_id: string
          receive_note: string | null
          received_at: string | null
          received_by: string | null
          remarks: string | null
          status: string
          transporter_mobile: string | null
          transporter_name: string
          updated_at: string
          vehicle_no: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          csa_id?: string | null
          dispatch_date?: string
          distributor_id: string
          id?: string
          lr_no: string
          order_id: string
          receive_note?: string | null
          received_at?: string | null
          received_by?: string | null
          remarks?: string | null
          status?: string
          transporter_mobile?: string | null
          transporter_name: string
          updated_at?: string
          vehicle_no?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          csa_id?: string | null
          dispatch_date?: string
          distributor_id?: string
          id?: string
          lr_no?: string
          order_id?: string
          receive_note?: string | null
          received_at?: string | null
          received_by?: string | null
          remarks?: string | null
          status?: string
          transporter_mobile?: string | null
          transporter_name?: string
          updated_at?: string
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_csa_id_fkey"
            columns: ["csa_id"]
            isOneToOne: false
            referencedRelation: "csas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      depot_stock: {
        Row: {
          batch_no: string | null
          created_at: string
          depot_id: string
          id: string
          physical_qty: number
          product_id: string
          reserved_qty: number
          updated_at: string
        }
        Insert: {
          batch_no?: string | null
          created_at?: string
          depot_id: string
          id?: string
          physical_qty?: number
          product_id: string
          reserved_qty?: number
          updated_at?: string
        }
        Update: {
          batch_no?: string | null
          created_at?: string
          depot_id?: string
          id?: string
          physical_qty?: number
          product_id?: string
          reserved_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "depot_stock_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depot_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      depots: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          name: string
          phone: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      distributor_stock: {
        Row: {
          batch_no: string | null
          distributor_id: string
          expiry_date: string | null
          id: string
          physical_qty: number
          product_id: string
          reserved_qty: number
          updated_at: string
        }
        Insert: {
          batch_no?: string | null
          distributor_id: string
          expiry_date?: string | null
          id?: string
          physical_qty?: number
          product_id: string
          reserved_qty?: number
          updated_at?: string
        }
        Update: {
          batch_no?: string | null
          distributor_id?: string
          expiry_date?: string | null
          id?: string
          physical_qty?: number
          product_id?: string
          reserved_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_stock_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_visits: {
        Row: {
          address: string | null
          created_at: string
          distributor_id: string | null
          distributor_name: string
          id: string
          notes: string | null
          phone: string | null
          salesman_id: string
          updated_at: string
          visited_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          distributor_id?: string | null
          distributor_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          salesman_id: string
          updated_at?: string
          visited_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          distributor_id?: string | null
          distributor_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          salesman_id?: string
          updated_at?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_visits_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributors: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          csa_id: string | null
          email: string | null
          gstin: string | null
          id: string
          name: string
          outstanding: number
          phone: string | null
          state: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          csa_id?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          outstanding?: number
          phone?: string | null
          state?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          csa_id?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          outstanding?: number
          phone?: string | null
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributors_csa_id_fkey"
            columns: ["csa_id"]
            isOneToOne: false
            referencedRelation: "csas"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_details: {
        Row: {
          aadhaar_no: string | null
          account_holder: string | null
          address: string | null
          bank_account_no: string | null
          bank_name: string | null
          blood_group: string | null
          city: string | null
          created_at: string
          ctc_annual: number
          date_of_birth: string | null
          date_of_joining: string | null
          department: string | null
          designation: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_type: string
          esic_no: string | null
          exit_date: string | null
          father_name: string | null
          gender: string | null
          id: string
          ifsc_code: string | null
          marital_status: string | null
          notes: string | null
          pan_no: string | null
          personal_email: string | null
          pf_no: string | null
          pincode: string | null
          reporting_manager: string | null
          state: string | null
          status: string
          uan_no: string | null
          updated_at: string
          user_id: string
          work_location: string | null
        }
        Insert: {
          aadhaar_no?: string | null
          account_holder?: string | null
          address?: string | null
          bank_account_no?: string | null
          bank_name?: string | null
          blood_group?: string | null
          city?: string | null
          created_at?: string
          ctc_annual?: number
          date_of_birth?: string | null
          date_of_joining?: string | null
          department?: string | null
          designation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string
          esic_no?: string | null
          exit_date?: string | null
          father_name?: string | null
          gender?: string | null
          id?: string
          ifsc_code?: string | null
          marital_status?: string | null
          notes?: string | null
          pan_no?: string | null
          personal_email?: string | null
          pf_no?: string | null
          pincode?: string | null
          reporting_manager?: string | null
          state?: string | null
          status?: string
          uan_no?: string | null
          updated_at?: string
          user_id: string
          work_location?: string | null
        }
        Update: {
          aadhaar_no?: string | null
          account_holder?: string | null
          address?: string | null
          bank_account_no?: string | null
          bank_name?: string | null
          blood_group?: string | null
          city?: string | null
          created_at?: string
          ctc_annual?: number
          date_of_birth?: string | null
          date_of_joining?: string | null
          department?: string | null
          designation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string
          esic_no?: string | null
          exit_date?: string | null
          father_name?: string | null
          gender?: string | null
          id?: string
          ifsc_code?: string | null
          marital_status?: string | null
          notes?: string | null
          pan_no?: string | null
          personal_email?: string | null
          pf_no?: string | null
          pincode?: string | null
          reporting_manager?: string | null
          state?: string | null
          status?: string
          uan_no?: string | null
          updated_at?: string
          user_id?: string
          work_location?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          bill_amount: number
          created_at: string
          da_amount: number
          distance_km: number
          expense_date: string
          id: string
          kind: string
          notes: string | null
          receipt_path: string | null
          route: string | null
          status: string
          ta_amount: number
          total_amount: number | null
          user_id: string
          vendor: string | null
        }
        Insert: {
          bill_amount?: number
          created_at?: string
          da_amount?: number
          distance_km?: number
          expense_date?: string
          id?: string
          kind?: string
          notes?: string | null
          receipt_path?: string | null
          route?: string | null
          status?: string
          ta_amount?: number
          total_amount?: number | null
          user_id: string
          vendor?: string | null
        }
        Update: {
          bill_amount?: number
          created_at?: string
          da_amount?: number
          distance_km?: number
          expense_date?: string
          id?: string
          kind?: string
          notes?: string | null
          receipt_path?: string | null
          route?: string | null
          status?: string
          ta_amount?: number
          total_amount?: number | null
          user_id?: string
          vendor?: string | null
        }
        Relationships: []
      }
      influencer_appointments: {
        Row: {
          address: string | null
          agreement_accept: string
          agreement_sign: string
          approved_by_name: string | null
          content_approved: string
          content_received: string
          created_at: string
          created_by: string
          dispatch_details: string | null
          id: string
          insta_link: string | null
          mobile: string | null
          name: string
          pincode: string | null
          posted_platforms: string[]
          product_chosen: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          agreement_accept?: string
          agreement_sign?: string
          approved_by_name?: string | null
          content_approved?: string
          content_received?: string
          created_at?: string
          created_by: string
          dispatch_details?: string | null
          id?: string
          insta_link?: string | null
          mobile?: string | null
          name: string
          pincode?: string | null
          posted_platforms?: string[]
          product_chosen?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          agreement_accept?: string
          agreement_sign?: string
          approved_by_name?: string | null
          content_approved?: string
          content_received?: string
          created_at?: string
          created_by?: string
          dispatch_details?: string | null
          id?: string
          insta_link?: string | null
          mobile?: string | null
          name?: string
          pincode?: string | null
          posted_platforms?: string[]
          product_chosen?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          cgst: number
          created_at: string
          id: string
          igst: number
          invoice_no: string
          net_amount: number
          order_id: string
          sgst: number
          taxable_value: number
        }
        Insert: {
          cgst?: number
          created_at?: string
          id?: string
          igst?: number
          invoice_no?: string
          net_amount?: number
          order_id: string
          sgst?: number
          taxable_value?: number
        }
        Update: {
          cgst?: number
          created_at?: string
          id?: string
          igst?: number
          invoice_no?: string
          net_amount?: number
          order_id?: string
          sgst?: number
          taxable_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      leaves: {
        Row: {
          created_at: string
          from_date: string
          id: string
          leave_type: string
          reason: string | null
          status: string
          to_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_date: string
          id?: string
          leave_type?: string
          reason?: string | null
          status?: string
          to_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          status?: string
          to_date?: string
          user_id?: string
        }
        Relationships: []
      }
      location_pings: {
        Row: {
          accuracy: number | null
          id: string
          lat: number
          lng: number
          recorded_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          accuracy?: number | null
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          user_id: string
          work_date?: string
        }
        Update: {
          accuracy?: number | null
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: []
      }
      manager_assignments: {
        Row: {
          created_at: string
          csa_id: string | null
          distributor_id: string | null
          id: string
          manager_id: string
          member_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          csa_id?: string | null
          distributor_id?: string | null
          id?: string
          manager_id: string
          member_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          csa_id?: string | null
          distributor_id?: string | null
          id?: string
          manager_id?: string
          member_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_assignments_csa_id_fkey"
            columns: ["csa_id"]
            isOneToOne: false
            referencedRelation: "csas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_assignments_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      office_day_reviews: {
        Row: {
          created_at: string
          id: string
          note: string | null
          rated_by: string
          stars: number
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          rated_by: string
          stars: number
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          rated_by?: string
          stars?: number
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: []
      }
      office_tasks: {
        Row: {
          assigned_by: string
          assigned_to: string
          completed_at: string | null
          completion_note: string | null
          created_at: string
          description: string | null
          id: string
          priority: string
          rated_at: string | null
          rated_by: string | null
          rating: number | null
          rating_note: string | null
          status: string
          task_date: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by: string
          assigned_to: string
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          rated_at?: string | null
          rated_by?: string | null
          rating?: number | null
          rating_note?: string | null
          status?: string
          task_date?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          assigned_to?: string
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          rated_at?: string | null
          rated_by?: string | null
          rating?: number | null
          rating_note?: string | null
          status?: string
          task_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          amount: number
          free_qty: number
          id: string
          order_id: string
          product_id: string
          qty: number
          rate: number
        }
        Insert: {
          amount?: number
          free_qty?: number
          id?: string
          order_id: string
          product_id: string
          qty?: number
          rate?: number
        }
        Update: {
          amount?: number
          free_qty?: number
          id?: string
          order_id?: string
          product_id?: string
          qty?: number
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          csa_id: string | null
          depot_id: string | null
          distributor_id: string | null
          id: string
          kind: Database["public"]["Enums"]["order_kind"]
          notes: string | null
          order_no: string
          retailer_id: string | null
          salesman_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
        }
        Insert: {
          created_at?: string
          csa_id?: string | null
          depot_id?: string | null
          distributor_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["order_kind"]
          notes?: string | null
          order_no?: string
          retailer_id?: string | null
          salesman_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
        }
        Update: {
          created_at?: string
          csa_id?: string | null
          depot_id?: string | null
          distributor_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["order_kind"]
          notes?: string | null
          order_no?: string
          retailer_id?: string | null
          salesman_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_csa_id_fkey"
            columns: ["csa_id"]
            isOneToOne: false
            referencedRelation: "csas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          csa_rate: number
          gst_rate: number
          hsn: string | null
          id: string
          mrp: number
          name: string
          packing_size: string | null
          ptr: number
          pts: number
          sku: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          csa_rate?: number
          gst_rate?: number
          hsn?: string | null
          id?: string
          mrp?: number
          name: string
          packing_size?: string | null
          ptr?: number
          pts?: number
          sku: string
        }
        Update: {
          category?: string | null
          created_at?: string
          csa_rate?: number
          gst_rate?: number
          hsn?: string | null
          id?: string
          mrp?: number
          name?: string
          packing_size?: string | null
          ptr?: number
          pts?: number
          sku?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          csa_id: string | null
          depot_id: string | null
          designation: string | null
          distributor_id: string | null
          employee_code: string | null
          full_name: string
          id: string
          phone: string | null
          reports_to: string | null
          retailer_id: string | null
        }
        Insert: {
          created_at?: string
          csa_id?: string | null
          depot_id?: string | null
          designation?: string | null
          distributor_id?: string | null
          employee_code?: string | null
          full_name?: string
          id: string
          phone?: string | null
          reports_to?: string | null
          retailer_id?: string | null
        }
        Update: {
          created_at?: string
          csa_id?: string | null
          depot_id?: string | null
          designation?: string | null
          distributor_id?: string | null
          employee_code?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          reports_to?: string | null
          retailer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_csa_id_fkey"
            columns: ["csa_id"]
            isOneToOne: false
            referencedRelation: "csas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailers: {
        Row: {
          address: string | null
          area: string | null
          city: string | null
          created_at: string
          created_by: string | null
          credit_limit: number
          display_amount: number
          distributor_id: string | null
          email: string | null
          gstin: string | null
          id: string
          lat: number | null
          lng: number | null
          margin_pct: number
          name: string
          outstanding: number
          owner_name: string | null
          phone: string | null
          pincode: string | null
          retailer_type: string
          state: string | null
        }
        Insert: {
          address?: string | null
          area?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          display_amount?: number
          distributor_id?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          margin_pct?: number
          name: string
          outstanding?: number
          owner_name?: string | null
          phone?: string | null
          pincode?: string | null
          retailer_type?: string
          state?: string | null
        }
        Update: {
          address?: string | null
          area?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          display_amount?: number
          distributor_id?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          margin_pct?: number
          name?: string
          outstanding?: number
          owner_name?: string | null
          phone?: string | null
          pincode?: string | null
          retailer_type?: string
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retailers_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_structures: {
        Row: {
          basic: number
          conveyance: number
          created_at: string
          deductions: number
          effective_from: string
          esic_employee: number
          esic_employer: number
          esic_no: string | null
          gratuity: number
          hra: number
          id: string
          labour_welfare_fund: number
          loan_recovery: number
          medical_allowance: number
          mediclaim: number
          other_allowance: number
          other_deductions: number
          pan_no: string | null
          pf_employee: number
          pf_employer: number
          professional_tax: number
          special_allowance: number
          tds: number
          uan_no: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          basic?: number
          conveyance?: number
          created_at?: string
          deductions?: number
          effective_from?: string
          esic_employee?: number
          esic_employer?: number
          esic_no?: string | null
          gratuity?: number
          hra?: number
          id?: string
          labour_welfare_fund?: number
          loan_recovery?: number
          medical_allowance?: number
          mediclaim?: number
          other_allowance?: number
          other_deductions?: number
          pan_no?: string | null
          pf_employee?: number
          pf_employer?: number
          professional_tax?: number
          special_allowance?: number
          tds?: number
          uan_no?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          basic?: number
          conveyance?: number
          created_at?: string
          deductions?: number
          effective_from?: string
          esic_employee?: number
          esic_employer?: number
          esic_no?: string | null
          gratuity?: number
          hra?: number
          id?: string
          labour_welfare_fund?: number
          loan_recovery?: number
          medical_allowance?: number
          mediclaim?: number
          other_allowance?: number
          other_deductions?: number
          pan_no?: string | null
          pf_employee?: number
          pf_employer?: number
          professional_tax?: number
          special_allowance?: number
          tds?: number
          uan_no?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schemes: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          discount_pct: number | null
          free_qty: number | null
          id: string
          min_qty: number | null
          min_value: number | null
          product_id: string | null
          title: string
          valid_till: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          discount_pct?: number | null
          free_qty?: number | null
          id?: string
          min_qty?: number | null
          min_value?: number | null
          product_id?: string | null
          title: string
          valid_till?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          discount_pct?: number | null
          free_qty?: number | null
          id?: string
          min_qty?: number | null
          min_value?: number | null
          product_id?: string | null
          title?: string
          valid_till?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schemes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      social_media_calendar: {
        Row: {
          approved: string
          approved_by_name: string | null
          content_pillar: string | null
          content_type: string
          created_at: string
          created_by: string
          day_label: string | null
          design_mime: string | null
          design_path: string | null
          entry_date: string | null
          handover_to_designer: string
          id: string
          in_data_bank: boolean
          platforms: string[]
          posting: string
          updated_at: string
        }
        Insert: {
          approved?: string
          approved_by_name?: string | null
          content_pillar?: string | null
          content_type?: string
          created_at?: string
          created_by: string
          day_label?: string | null
          design_mime?: string | null
          design_path?: string | null
          entry_date?: string | null
          handover_to_designer?: string
          id?: string
          in_data_bank?: boolean
          platforms?: string[]
          posting?: string
          updated_at?: string
        }
        Update: {
          approved?: string
          approved_by_name?: string | null
          content_pillar?: string | null
          content_type?: string
          created_at?: string
          created_by?: string
          day_label?: string | null
          design_mime?: string | null
          design_path?: string | null
          entry_date?: string | null
          handover_to_designer?: string
          id?: string
          in_data_bank?: boolean
          platforms?: string[]
          posting?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          ba_id: string | null
          batch_no: string | null
          created_at: string
          csa_id: string | null
          current_qty: number
          delta: number
          distributor_id: string | null
          id: string
          new_qty: number
          product_id: string
          reason: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scope: string
          status: string
          stock_id: string
          updated_at: string
        }
        Insert: {
          ba_id?: string | null
          batch_no?: string | null
          created_at?: string
          csa_id?: string | null
          current_qty: number
          delta: number
          distributor_id?: string | null
          id?: string
          new_qty: number
          product_id: string
          reason: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope: string
          status?: string
          stock_id: string
          updated_at?: string
        }
        Update: {
          ba_id?: string | null
          batch_no?: string | null
          created_at?: string
          csa_id?: string | null
          current_qty?: number
          delta?: number
          distributor_id?: string | null
          id?: string
          new_qty?: number
          product_id?: string
          reason?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope?: string
          status?: string
          stock_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_csa_id_fkey"
            columns: ["csa_id"]
            isOneToOne: false
            referencedRelation: "csas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      targets: {
        Row: {
          daily_target_amount: number
          id: string
          period_month: string
          target_amount: number
          user_id: string
          visits_target: number
        }
        Insert: {
          daily_target_amount?: number
          id?: string
          period_month: string
          target_amount?: number
          user_id: string
          visits_target?: number
        }
        Update: {
          daily_target_amount?: number
          id?: string
          period_month?: string
          target_amount?: number
          user_id?: string
          visits_target?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          checked_in_at: string
          id: string
          notes: string | null
          productive: boolean
          retailer_id: string
          salesman_id: string
        }
        Insert: {
          checked_in_at?: string
          id?: string
          notes?: string | null
          productive?: boolean
          retailer_id: string
          salesman_id: string
        }
        Update: {
          checked_in_at?: string
          id?: string
          notes?: string | null
          productive?: boolean
          retailer_id?: string
          salesman_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_office_user: { Args: { _uid: string }; Returns: boolean }
      can_see_retailer: { Args: { _rid: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_hr_admin: { Args: { _uid: string }; Returns: boolean }
      is_manager_role: { Args: { _uid: string }; Returns: boolean }
      manager_scope_users: {
        Args: { _manager: string }
        Returns: {
          user_id: string
        }[]
      }
      manager_sees_csa: { Args: { _csa: string }; Returns: boolean }
      manager_sees_distributor: { Args: { _dist: string }; Returns: boolean }
      manager_sees_user: { Args: { _uid: string }; Returns: boolean }
      receive_delivery: {
        Args: { _accept: boolean; _id: string; _note?: string }
        Returns: {
          created_at: string
          created_by: string
          csa_id: string | null
          dispatch_date: string
          distributor_id: string
          id: string
          lr_no: string
          order_id: string
          receive_note: string | null
          received_at: string | null
          received_by: string | null
          remarks: string | null
          status: string
          transporter_mobile: string | null
          transporter_name: string
          updated_at: string
          vehicle_no: string | null
        }
        SetofOptions: {
          from: "*"
          to: "deliveries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_claim: {
        Args: { _amount: number; _approve: boolean; _id: string; _note: string }
        Returns: {
          approved_amount: number | null
          claim_amount: number | null
          created_at: string
          created_by: string
          display_amount: number
          distributor_id: string | null
          extra_margin: number
          id: string
          invoice_no: string | null
          invoice_path: string | null
          notes: string | null
          retailer_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_collection: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          mode: string
          reference: string | null
          retailer_id: string | null
          review_note: string | null
          salesman_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "collections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_csa_payment: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: {
          amount: number
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          created_role: string
          csa_id: string
          distributor_id: string
          id: string
          mode: string
          notes: string | null
          reference: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "csa_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_stock_adjustment: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: {
          ba_id: string | null
          batch_no: string | null
          created_at: string
          csa_id: string | null
          current_qty: number
          delta: number
          distributor_id: string | null
          id: string
          new_qty: number
          product_id: string
          reason: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scope: string
          status: string
          stock_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_adjustments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "csa"
        | "distributor"
        | "salesman"
        | "ba"
        | "depot"
        | "manager"
        | "ase"
        | "asm"
        | "business_manager"
        | "hr"
        | "office"
        | "office_manager"
      order_kind: "secondary" | "primary" | "depot" | "company"
      order_status:
        | "pending"
        | "accepted"
        | "invoiced"
        | "dispatched"
        | "delivered"
        | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "csa",
        "distributor",
        "salesman",
        "ba",
        "depot",
        "manager",
        "ase",
        "asm",
        "business_manager",
        "hr",
        "office",
        "office_manager",
      ],
      order_kind: ["secondary", "primary", "depot", "company"],
      order_status: [
        "pending",
        "accepted",
        "invoiced",
        "dispatched",
        "delivered",
        "rejected",
      ],
    },
  },
} as const
