async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Request failed')
  }
  return res.json()
}

export const api = {
  getOrg: () => request<import('./types').OrgConfig>('api/org'),
  connect: (mist_token: string, cloud_endpoint: string) =>
    request('api/org/connect', { method: 'POST', body: JSON.stringify({ mist_token, cloud_endpoint }) }),
  updateSettings: (settings: { drift_interval_mins: number; auto_remediate: boolean }) =>
    request('api/org/settings', { method: 'PATCH', body: JSON.stringify(settings) }),

  listSites: () => request<{ sites: import('./types').Site[] }>('api/sites'),
  syncSites: () => request<{ synced: number }>('api/sites/sync', { method: 'POST' }),
  toggleMonitored: (siteId: string, monitored: boolean) =>
    request(`api/sites/${siteId}/monitored?monitored=${monitored}`, { method: 'PATCH' }),
  runSite: (siteId: string) =>
    request(`api/sites/${siteId}/run`, { method: 'POST', body: JSON.stringify({ triggered_by: 'manual' }) }),
  getSiteFindings: (siteId: string) =>
    request<{ findings: import('./types').Finding[] }>(`api/sites/${siteId}/findings`),

  listStandards: () => request<{ standards: import('./types').Standard[] }>('api/standards'),
  createStandard: (body: Omit<import('./types').Standard, 'id' | 'org_id' | 'created_at'>) =>
    request<import('./types').Standard>('api/standards', { method: 'POST', body: JSON.stringify(body) }),
  updateStandard: (id: string, body: Partial<import('./types').Standard>) =>
    request<import('./types').Standard>(`api/standards/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteStandard: (id: string) =>
    request(`api/standards/${id}`, { method: 'DELETE' }),
  toggleStandard: (id: string, enabled: boolean) =>
    request(`api/standards/${id}/toggle?enabled=${enabled}`, { method: 'PATCH' }),

  listIncidents: () => request<{ incidents: import('./types').Incident[] }>('api/incidents'),
  suppressIncident: (id: string) =>
    request(`api/incidents/${id}/suppress`, { method: 'PATCH' }),

  listPendingRemediation: () =>
    request<{ actions: import('./types').RemediationAction[] }>('api/remediation'),
  approveRemediation: (id: string) =>
    request(`api/remediation/${id}/approve`, { method: 'POST' }),
  rejectRemediation: (id: string) =>
    request(`api/remediation/${id}/reject`, { method: 'POST' }),
}
