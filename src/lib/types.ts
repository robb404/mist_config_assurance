export interface OrgConfig {
  org_id: string
  org_name: string
  cloud_endpoint: string
  drift_interval_mins: number
  auto_remediate: boolean
  mode: 'polling' | 'webhook'
}

export interface OrgUsage {
  mode: 'polling' | 'webhook'
  calls_used_this_hour: number
  calls_window_start: string | null
  site_count: number
  webhook_url: string | null
  webhook_configured: boolean
  calls_per_hour: number
  min_interval_mins: number
  interval_safe: boolean
  recommend_webhooks: boolean
}

export interface DigestSettings {
  frequency: 'daily' | 'weekly' | null
  extra_recipients: string[]
  last_sent_at: string | null
  last_error: string | null
  resend_configured: boolean
}

export interface DigestTestResult {
  ok: boolean
  skipped: boolean
  error: string | null
}

export interface DebugLogEntry {
  id: number
  timestamp: number
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  logger: string
  message: string
}

export interface DebugLogPage {
  entries: DebugLogEntry[]
  last_id: number
}

export interface Site {
  id: string
  org_id: string
  name: string
  monitored: boolean
  last_checked_at: string | null
  check_error: string | null
}

export interface Standard {
  id: string
  org_id: string
  name: string
  description?: string
  scope: 'wlan' | 'site' | 'org'
  filter?: object[]
  check_field: string
  check_condition: string
  check_value?: unknown
  remediation_field: string
  remediation_value: unknown
  auto_remediate?: boolean | null
  enabled: boolean
  created_at: string
}

export interface Finding {
  id: string
  run_id: string
  standard_id: string
  wlan_id?: string
  ssid?: string
  status: 'pass' | 'fail' | 'skip'
  actual_value?: string
}

export interface Incident {
  id: string
  org_id: string
  site_id: string
  site_name: string
  standard_id: string
  title: string
  wlan_id?: string
  ssid?: string
  opened_at: string
  resolved_at?: string
  status: 'open' | 'resolved' | 'suppressed'
}

export interface RemediationAction {
  id: string
  incident_id: string
  org_id: string
  site_id: string
  wlan_id?: string
  standard_id: string
  desired_value: unknown
  attempted_at?: string
  status: 'pending' | 'approved' | 'rejected' | 'success' | 'failed'
  error_detail?: string
}

export interface ValidationRun {
  id: string
  org_id: string
  site_id: string
  site_name: string
  run_at: string
  triggered_by: 'manual' | 'scheduled'
  passed: number
  failed: number
  skipped: number
}

export interface AIConfig {
  configured: boolean
  provider?: 'anthropic' | 'openai' | 'ollama'
  model?: string
  base_url?: string | null
  has_key?: boolean
}

export interface FieldEntry {
  scope: 'wlan' | 'site' | 'org'
  type: string
  values: string[]
  notes: string
}

export type FieldDict = Record<string, FieldEntry>

export interface RfTemplate {
  id: string
  name: string
}
