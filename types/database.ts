npm warn exec The following package was not found and will be installed: supabase@2.101.0
175 | ${Rm(_.cause,"  ")}
176 | }`:_.stack).join(`
177 | `),Rm=(w,_)=>{let R=w.stack.split(`
178 | `),D=`${_}[cause]: ${R[0]}`;for(let J=1,Y=R.length;J<Y;J++)D+=`
179 | ${_}${R[J]}`;if(w.cause)D+=` {
180 | ${_}}`;return D},kQ=`~effect/Fiber/${FB}`,RS0={_A:_0,_E:_0},DS0={id:0},x5=()=>globalThis[YY];class dT{constructor(w,_=!0){this[kQ]=RS0,this.setContext(w),this.id=++DS0.id,this.currentOpCount=0,this.currentLoopCount=0,this.interruptible=_,this._stack=[],this._observers=[],this._exit=void 0,this._children=void 0,this._interruptedCause=void 0,this._yielded=void 0,this.runtimeMetrics?.recordFiberStart(this.context)}[kQ];id;interruptible;currentOpCount;currentLoopCount;_stack;_observers;_exit;_currentExit;_children;_interruptedCause;_yielded;context;currentScheduler;currentTracerContext;currentSpan;currentLogLevel;minimumLogLevel;currentStackFrame;runtimeMetrics;maxOpsBeforeYield;currentPreventYield;_dispatcher=void 0;get currentDispatcher(){return this._dispatcher??=this.currentScheduler.makeDispatcher()}getRef(w){return RT(this.context,w)}addObserver(w){if(this._exit)return w(this._exit),y1;return this._observers.push(w),()=>{let _=this._observers.indexOf(w);if(_>=0)this._observers.splice(_,1)}}interruptUnsafe(w

SyntaxError: JSON Parse error: Unable to parse JSON string
      at ~effect/Effect/successCont (/$bunfs/root/supabase:180:7863)
      at runLoop (/$bunfs/root/supabase:180:2053)
      at evaluate (/$bunfs/root/supabase:180:1441)
      at <anonymous> (/$bunfs/root/supabase:180:5706)
      at <anonymous> (/$bunfs/root/supabase:189:12261)
      at <anonymous> (node:fs:225:13)

Bun v1.3.13 (macOS arm64)
: {
          campaign_id: string
          completed_at: string | null
          created_at: string
          error: string | null
          failed_count: number
          id: string
          processed: number
          started_at: string | null
          status: string
          step_number: number
          total: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          campaign_id: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_count?: number
          id?: string
          processed?: number
          started_at?: string | null
          status?: string
          step_number: number
          total?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          campaign_id?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_count?: number
          id?: string
          processed?: number
          started_at?: string | null
          status?: string
          step_number?: number
          total?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_batch_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_batch_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_draft_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          hit_count: number
          id: string
          result_json: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          hit_count?: number
          id?: string
          result_json: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          hit_count?: number
          id?: string
          result_json?: Json
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          campaign_id: string | null
          completion_tokens: number
          cost_usd: number | null
          created_at: string
          id: string
          lead_id: string | null
          model: string
          prompt_tokens: number
          task: string
          total_tokens: number
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          completion_tokens: number
          cost_usd?: number | null
          created_at?: string
          id?: string
          lead_id?: string | null
          model: string
          prompt_tokens: number
          task: string
          total_tokens: number
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          completion_tokens?: number
          cost_usd?: number | null
          created_at?: string
          id?: string
          lead_id?: string | null
          model?: string
          prompt_tokens?: number
          task?: string
          total_tokens?: number
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      app_secrets: {
        Row: {
          ciphertext: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          called_at: string
          created_at: string
          duration_sec: number | null
          id: string
          lead_id: string
          logged_by: string
          notes: string | null
          outcome: Database["public"]["Enums"]["call_outcome"]
          workspace_id: string
        }
        Insert: {
          called_at?: string
          created_at?: string
          duration_sec?: number | null
          id?: string
          lead_id: string
          logged_by: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"]
          workspace_id: string
        }
        Update: {
          called_at?: string
          created_at?: string
          duration_sec?: number | null
          id?: string
          lead_id?: string
          logged_by?: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sequence_steps: {
        Row: {
          ai_tone: string
          body_template: string
          campaign_id: string
          created_at: string
          delay_days: number
          id: string
          step_number: number
          subject_template: string
          use_ai: boolean
        }
        Insert: {
          ai_tone?: string
          body_template: string
          campaign_id: string
          created_at?: string
          delay_days?: number
          id?: string
          step_number: number
          subject_template: string
          use_ai?: boolean
        }
        Update: {
          ai_tone?: string
          body_template?: string
          campaign_id?: string
          created_at?: string
          delay_days?: number
          id?: string
          step_number?: number
          subject_template?: string
          use_ai?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sequence_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          batch_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          emails_bounced: number
          emails_clicked: number
          emails_opened: number
          emails_replied: number
          emails_sent: number
          id: string
          name: string
          paused_at: string | null
          scheduled_start: string | null
          sending_account_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          total_leads: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          emails_bounced?: number
          emails_clicked?: number
          emails_opened?: number
          emails_replied?: number
          emails_sent?: number
          id?: string
          name: string
          paused_at?: string | null
          scheduled_start?: string | null
          sending_account_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          total_leads?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          emails_bounced?: number
          emails_clicked?: number
          emails_opened?: number
          emails_replied?: number
          emails_sent?: number
          id?: string
          name?: string
          paused_at?: string | null
          scheduled_start?: string | null
          sending_account_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          total_leads?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "lead_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          attempts: number
          campaign_id: string | null
          created_at: string
          email_id: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          scheduled_for: string
          sending_account_id: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          created_at?: string
          email_id: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          scheduled_for?: string
          sending_account_id: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          created_at?: string
          email_id?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          scheduled_for?: string
          sending_account_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: true
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          ai_personalised: boolean
          ai_usage_id: string | null
          body_html: string
          body_text: string | null
          bounce_reason: string | null
          bounced_at: string | null
          campaign_id: string | null
          cancelled_at: string | null
          clicked_at: string | null
          created_at: string
          id: string
          is_ai_generated: boolean
          lead_id: string
          open_pixel_id: string | null
          opened_at: string | null
          replied_at: string | null
          resend_message_id: string | null
          scheduled_for: string | null
          sending_account_id: string
          sent_at: string | null
          sent_by: string | null
          sequence_step_id: string | null
          status: Database["public"]["Enums"]["email_status"]
          step_number: number | null
          subject: string
          tracking_pixel_id: string
          workspace_id: string
        }
        Insert: {
          ai_personalised?: boolean
          ai_usage_id?: string | null
          body_html: string
          body_text?: string | null
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id?: string | null
          cancelled_at?: string | null
          clicked_at?: string | null
          created_at?: string
          id?: string
          is_ai_generated?: boolean
          lead_id: string
          open_pixel_id?: string | null
          opened_at?: string | null
          replied_at?: string | null
          resend_message_id?: string | null
          scheduled_for?: string | null
          sending_account_id: string
          sent_at?: string | null
          sent_by?: string | null
          sequence_step_id?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          step_number?: number | null
          subject: string
          tracking_pixel_id?: string
          workspace_id: string
        }
        Update: {
          ai_personalised?: boolean
          ai_usage_id?: string | null
          body_html?: string
          body_text?: string | null
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id?: string | null
          cancelled_at?: string | null
          clicked_at?: string | null
          created_at?: string
          id?: string
          is_ai_generated?: boolean
          lead_id?: string
          open_pixel_id?: string | null
          opened_at?: string | null
          replied_at?: string | null
          resend_message_id?: string | null
          scheduled_for?: string | null
          sending_account_id?: string
          sent_at?: string | null
          sent_by?: string | null
          sequence_step_id?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          step_number?: number | null
          subject?: string
          tracking_pixel_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_emails_ai_usage"
            columns: ["ai_usage_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_emails_campaign"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_emails_sequence_step"
            columns: ["sequence_step_id"]
            isOneToOne: false
            referencedRelation: "campaign_sequence_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          due_at: string
          id: string
          is_ai_suggested: boolean
          lead_id: string
          notes: string | null
          priority: Database["public"]["Enums"]["activity_priority"]
          title: string
          type: Database["public"]["Enums"]["activity_item_type"]
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          due_at: string
          id?: string
          is_ai_suggested?: boolean
          lead_id: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["activity_priority"]
          title: string
          type?: Database["public"]["Enums"]["activity_item_type"]
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string
          id?: string
          is_ai_suggested?: boolean
          lead_id?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["activity_priority"]
          title?: string
          type?: Database["public"]["Enums"]["activity_item_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_batches: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          lead_count: number
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          lead_count?: number
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          lead_count?: number
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_imports: {
        Row: {
          batch_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          error_log: Json | null
          failed_rows: number | null
          field_mapping: Json
          file_name: string
          id: string
          imported_rows: number | null
          status: string
          storage_path: string
          total_rows: number | null
          workspace_id: string
        }
        Insert: {
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          error_log?: Json | null
          failed_rows?: number | null
          field_mapping?: Json
          file_name: string
          id?: string
          imported_rows?: number | null
          status?: string
          storage_path: string
          total_rows?: number | null
          workspace_id: string
        }
        Update: {
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error_log?: Json | null
          failed_rows?: number | null
          field_mapping?: Json
          file_name?: string
          id?: string
          imported_rows?: number | null
          status?: string
          storage_path?: string
          total_rows?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_imports_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "lead_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_imports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          created_at: string
          lead_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          lead_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          lead_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ai_summary: string | null
          assigned_to: string | null
          batch_id: string | null
          company: string | null
          created_at: string
          custom_fields: Json
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          import_id: string | null
          interest_status: Database["public"]["Enums"]["interest_status"]
          is_unsubscribed: boolean
          last_activity_at: string | null
          last_call_outcome: Database["public"]["Enums"]["call_outcome"] | null
          last_contacted_at: string | null
          last_name: string | null
          linkedin_url: string | null
          phone: string | null
          pipeline_stage_id: string | null
          source: string
          status: Database["public"]["Enums"]["lead_status"]
          title: string | null
          unsubscribed_at: string | null
          updated_at: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          ai_summary?: string | null
          assigned_to?: string | null
          batch_id?: string | null
          company?: string | null
          created_at?: string
          custom_fields?: Json
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          import_id?: string | null
          interest_status?: Database["public"]["Enums"]["interest_status"]
          is_unsubscribed?: boolean
          last_activity_at?: string | null
          last_call_outcome?: Database["public"]["Enums"]["call_outcome"] | null
          last_contacted_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          phone?: string | null
          pipeline_stage_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          title?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          ai_summary?: string | null
          assigned_to?: string | null
          batch_id?: string | null
          company?: string | null
          created_at?: string
          custom_fields?: Json
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          import_id?: string | null
          interest_status?: Database["public"]["Enums"]["interest_status"]
          is_unsubscribed?: boolean
          last_activity_at?: string | null
          last_call_outcome?: Database["public"]["Enums"]["call_outcome"] | null
          last_contacted_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          phone?: string | null
          pipeline_stage_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          title?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "lead_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "lead_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          assigned_to: string | null
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          lead_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lead_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lead_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          id: string
          in_app: boolean
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          in_app?: boolean
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          in_app?: boolean
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          campaign_id: string | null
          created_at: string
          email_id: string | null
          id: string
          is_read: boolean
          lead_id: string | null
          link: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          created_at?: string
          email_id?: string | null
          id?: string
          is_read?: boolean
          lead_id?: string | null
          link?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          created_at?: string
          email_id?: string | null
          id?: string
          is_read?: boolean
          lead_id?: string | null
          link?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sending_accounts: {
        Row: {
          created_at: string
          daily_limit: number
          emails_sent_today: number
          from_email: string
          from_name: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_tested_at: string | null
          last_used_at: string | null
          name: string
          quota_reset_at: string
          resend_api_key_vault_id: string | null
          smtp_host: string | null
          smtp_pass_vault_id: string | null
          smtp_port: number | null
          smtp_secure: boolean
          smtp_user: string | null
          type: Database["public"]["Enums"]["sending_account_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          emails_sent_today?: number
          from_email: string
          from_name?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_tested_at?: string | null
          last_used_at?: string | null
          name: string
          quota_reset_at?: string
          resend_api_key_vault_id?: string | null
          smtp_host?: string | null
          smtp_pass_vault_id?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean
          smtp_user?: string | null
          type: Database["public"]["Enums"]["sending_account_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          emails_sent_today?: number
          from_email?: string
          from_name?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_tested_at?: string | null
          last_used_at?: string | null
          name?: string
          quota_reset_at?: string
          resend_api_key_vault_id?: string | null
          smtp_host?: string | null
          smtp_pass_vault_id?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean
          smtp_user?: string | null
          type?: Database["public"]["Enums"]["sending_account_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sending_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      unsubscribes: {
        Row: {
          email: string
          id: string
          lead_id: string | null
          source: string | null
          unsubscribed_at: string
          workspace_id: string
        }
        Insert: {
          email: string
          id?: string
          lead_id?: string | null
          source?: string | null
          unsubscribed_at?: string
          workspace_id: string
        }
        Update: {
          email?: string
          id?: string
          lead_id?: string | null
          source?: string | null
          unsubscribed_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unsubscribes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unsubscribes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          is_active: boolean
          joined_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          joined_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          joined_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
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
      workspace_settings: {
        Row: {
          ai_enabled: boolean
          ai_monthly_token_budget: number
          created_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_enabled?: boolean
          ai_monthly_token_budget?: number
          created_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_enabled?: boolean
          ai_monthly_token_budget?: number
          created_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      sending_accounts_safe: {
        Row: {
          created_at: string | null
          daily_limit: number | null
          emails_sent_today: number | null
          from_email: string | null
          from_name: string | null
          id: string | null
          is_active: boolean | null
          last_error: string | null
          last_tested_at: string | null
          last_used_at: string | null
          name: string | null
          quota_reset_at: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_secure: boolean | null
          smtp_user: string | null
          type: Database["public"]["Enums"]["sending_account_type"] | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          daily_limit?: number | null
          emails_sent_today?: number | null
          from_email?: string | null
          from_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_error?: string | null
          last_tested_at?: string | null
          last_used_at?: string | null
          name?: string | null
          quota_reset_at?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          type?: Database["public"]["Enums"]["sending_account_type"] | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          daily_limit?: number | null
          emails_sent_today?: number | null
          from_email?: string | null
          from_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_error?: string | null
          last_tested_at?: string | null
          last_used_at?: string | null
          name?: string | null
          quota_reset_at?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          type?: Database["public"]["Enums"]["sending_account_type"] | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sending_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_workspace_claims: { Args: { event: Json }; Returns: Json }
      bulk_delete_leads_by_filter: {
        Args: {
          p_assigned_to_filter?: string
          p_assigned_unassigned?: boolean
          p_batch_id_filter?: string
          p_cold_only?: boolean
          p_date_from?: string
          p_date_to?: string
          p_interests?: string[]
          p_my_leads?: boolean
          p_scope_to_rep?: boolean
          p_search?: string
          p_statuses?: string[]
          p_viewer_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      bulk_update_leads: {
        Args: {
          p_assigned_to?: string
          p_batch_id?: string
          p_ids: string[]
          p_status?: string
          p_workspace_id: string
        }
        Returns: number
      }
      bulk_update_leads_by_filter: {
        Args: {
          p_assigned_to_filter?: string
          p_assigned_unassigned?: boolean
          p_batch_id_filter?: string
          p_clear_assigned?: boolean
          p_clear_batch?: boolean
          p_cold_only?: boolean
          p_date_from?: string
          p_date_to?: string
          p_interests?: string[]
          p_my_leads?: boolean
          p_new_assigned_to?: string
          p_new_batch_id?: string
          p_new_status?: string
          p_scope_to_rep?: boolean
          p_search?: string
          p_statuses?: string[]
          p_viewer_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      can_view_lead: {
        Args: { lead_row: Database["public"]["Tables"]["leads"]["Row"] }
        Returns: boolean
      }
      check_unsubscribed: {
        Args: { email_addr: string; ws_id: string }
        Returns: boolean
      }
      cleanup_ai_cache: { Args: never; Returns: undefined }
      cleanup_old_notifications: { Args: never; Returns: undefined }
      current_user_email: { Args: never; Returns: string }
      get_batch_analytics: {
        Args: { p_batch_ids: string[]; p_workspace_id: string }
        Returns: Json
      }
      get_call_stats_by_rep: {
        Args: { p_end: string; p_start: string; p_workspace_id: string }
        Returns: Json
      }
      get_email_metrics_analytics: {
        Args: {
          p_end: string
          p_rep_id?: string
          p_start: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_leads_assigned_status_counts: {
        Args: { p_workspace_id: string }
        Returns: {
          assigned_to: string
          cnt: number
          status: string
        }[]
      }
      get_leads_status_counts: {
        Args: { p_workspace_id: string }
        Returns: {
          cnt: number
          status: string
        }[]
      }
      get_leads_status_counts_for_rep: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          cnt: number
          status: string
        }[]
      }
      get_my_role: {
        Args: { ws_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
      get_pipeline_leads_json: {
        Args: {
          p_assigned_to?: string
          p_per_stage_limit?: number
          p_search?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_pipeline_stage_overflow: {
        Args: {
          p_assigned_to?: string
          p_limit?: number
          p_offset?: number
          p_stage_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_reps_analytics: {
        Args: { p_end: string; p_start: string; p_workspace_id: string }
        Returns: Json
      }
      get_time_series_analytics: {
        Args: {
          p_campaign_id?: string
          p_end: string
          p_rep_id?: string
          p_start: string
          p_workspace_id: string
        }
        Returns: Json
      }
      get_unique_leads_called: {
        Args: { p_since: string; p_user_id: string; p_workspace_id: string }
        Returns: number
      }
      get_unique_leads_called_by_rep: {
        Args: { p_since: string; p_workspace_id: string }
        Returns: {
          leads_called: number
          user_id: string
        }[]
      }
      get_unique_leads_called_by_rep_range: {
        Args: { p_end: string; p_start: string; p_workspace_id: string }
        Returns: {
          leads_called: number
          user_id: string
        }[]
      }
      get_user_by_email: { Args: { p_email: string }; Returns: Json }
      get_user_workspace_id: { Args: never; Returns: string }
      get_users_by_ids: {
        Args: { p_user_ids: string[]; p_workspace_id: string }
        Returns: Json
      }
      get_workspace_leads: {
        Args: {
          p_assigned_to?: string
          p_max_rows?: number
          p_workspace_id: string
        }
        Returns: {
          ai_summary: string | null
          assigned_to: string | null
          batch_id: string | null
          company: string | null
          created_at: string
          custom_fields: Json
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          import_id: string | null
          interest_status: Database["public"]["Enums"]["interest_status"]
          is_unsubscribed: boolean
          last_activity_at: string | null
          last_call_outcome: Database["public"]["Enums"]["call_outcome"] | null
          last_contacted_at: string | null
          last_name: string | null
          linkedin_url: string | null
          phone: string | null
          pipeline_stage_id: string | null
          source: string
          status: Database["public"]["Enums"]["lead_status"]
          title: string | null
          unsubscribed_at: string | null
          updated_at: string
          website: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_workspace_leads_json: {
        Args: {
          p_assigned_to?: string
          p_max_rows?: number
          p_workspace_id: string
        }
        Returns: Json
      }
      get_workspace_leads_page: {
        Args: {
          p_assigned_to?: string
          p_assigned_unassigned?: boolean
          p_batch_id?: string
          p_cold_only?: boolean
          p_date_from?: string
          p_date_to?: string
          p_interests?: string[]
          p_limit?: number
          p_my_leads?: boolean
          p_offset?: number
          p_scope_to_rep?: boolean
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_statuses?: string[]
          p_viewer_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          required_role: Database["public"]["Enums"]["workspace_role"]
          ws_id: string
        }
        Returns: boolean
      }
      increment_campaign_bounced: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      increment_campaign_clicked: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      increment_campaign_opened: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      increment_campaign_replied: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      increment_campaign_sent: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      is_admin: { Args: { ws_id: string }; Returns: boolean }
      is_manager_or_above: { Args: { ws_id: string }; Returns: boolean }
      is_workspace_member: { Args: { ws_id: string }; Returns: boolean }
      log_activity: {
        Args: {
          p_lead_id: string
          p_metadata?: Json
          p_type: Database["public"]["Enums"]["activity_type"]
          p_workspace_id: string
        }
        Returns: string
      }
      recompute_lead_last_activity: {
        Args: { p_lead_id: string }
        Returns: undefined
      }
      release_send_lock: { Args: never; Returns: undefined }
      reset_all_quotas: { Args: never; Returns: undefined }
      role_rank: {
        Args: { r: Database["public"]["Enums"]["workspace_role"] }
        Returns: number
      }
      seed_default_pipeline_stages: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      try_acquire_send_lock: { Args: never; Returns: boolean }
      try_increment_quota: { Args: { account_id: string }; Returns: boolean }
    }
    Enums: {
      activity_item_type: "follow_up" | "callback"
      activity_priority: "high" | "medium" | "low"
      activity_type:
        | "lead_created"
        | "lead_imported"
        | "lead_status_changed"
        | "note_added"
        | "note_edited"
        | "note_deleted"
        | "email_sent"
        | "email_opened"
        | "email_clicked"
        | "email_replied"
        | "email_bounced"
        | "campaign_started"
        | "campaign_paused"
        | "campaign_resumed"
        | "campaign_completed"
        | "campaign_cancelled"
        | "ai_draft_generated"
        | "follow_up_scheduled"
        | "follow_up_completed"
        | "follow_up_sent"
        | "unsubscribed"
        | "lead_assigned"
        | "member_invited"
        | "member_removed"
        | "member_deactivated"
        | "role_changed"
        | "call_logged"
      call_outcome:
        | "answered"
        | "voicemail"
        | "no_answer"
        | "wrong_number"
        | "callback_requested"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "cancelled"
      email_status:
        | "queued"
        | "sending"
        | "sent"
        | "failed"
        | "bounced"
        | "opened"
        | "clicked"
        | "replied"
      interest_status: "pending" | "interested" | "not_interested"
      lead_status:
        | "new"
        | "contacted"
        | "replied"
        | "interested"
        | "not_interested"
        | "do_not_contact"
        | "unsubscribed"
        | "converted"
        | "called"
        | "emailed"
        | "voicemail"
        | "no_answer"
        | "wrong_number"
        | "sold_already"
      notification_type: "mention" | "follow_up_due" | "lead_assigned"
      sending_account_type: "resend" | "smtp"
      workspace_role: "viewer" | "rep" | "manager" | "admin" | "super_admin"
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
  public: {
    Enums: {
      activity_item_type: ["follow_up", "callback"],
      activity_priority: ["high", "medium", "low"],
      activity_type: [
        "lead_created",
        "lead_imported",
        "lead_status_changed",
        "note_added",
        "note_edited",
        "note_deleted",
        "email_sent",
        "email_opened",
        "email_clicked",
        "email_replied",
        "email_bounced",
        "campaign_started",
        "campaign_paused",
        "campaign_resumed",
        "campaign_completed",
        "campaign_cancelled",
        "ai_draft_generated",
        "follow_up_scheduled",
        "follow_up_completed",
        "follow_up_sent",
        "unsubscribed",
        "lead_assigned",
        "member_invited",
        "member_removed",
        "member_deactivated",
        "role_changed",
        "call_logged",
      ],
      call_outcome: [
        "answered",
        "voicemail",
        "no_answer",
        "wrong_number",
        "callback_requested",
      ],
      campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "cancelled",
      ],
      email_status: [
        "queued",
        "sending",
        "sent",
        "failed",
        "bounced",
        "opened",
        "clicked",
        "replied",
      ],
      interest_status: ["pending", "interested", "not_interested"],
      lead_status: [
        "new",
        "contacted",
        "replied",
        "interested",
        "not_interested",
        "do_not_contact",
        "unsubscribed",
        "converted",
        "called",
        "emailed",
        "voicemail",
        "no_answer",
        "wrong_number",
        "sold_already",
      ],
      notification_type: ["mention", "follow_up_due", "lead_assigned"],
      sending_account_type: ["resend", "smtp"],
      workspace_role: ["viewer", "rep", "manager", "admin", "super_admin"],
    },
  },
} as const

