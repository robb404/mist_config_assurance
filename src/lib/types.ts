export interface OrgConfig {
  org_id: string
  org_name: string
  cloud_endpoint: string
  drift_interval_mins: number
  auto_remediate: boolean
}

export interface Site {
  id: string
  org_id: string
  name: string
  monitored: boolean
  last_checked_at: string | null
}

export interface Standard {
  id: string
  org_id: string
  name: string
  description?: string
  scope: 'wlan' | 'site'
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
  openai_auth_method?: 'key' | 'oauth' | null
  model?: string
  base_url?: string | null
  has_key?: boolean
  oauth_connected?: boolean
  oauth_token_expiry?: string | null
}
