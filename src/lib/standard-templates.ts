import type { Standard } from './types'

type BaseStd = Omit<Standard, 'id' | 'org_id' | 'created_at'>

export interface TemplateCard {
  key: string
  title: string
  description: string
  /** Present on dropdown and multi-select cards; absent on simple cards. */
  options?: { label: string; value: string }[]
  /** If 'rftemplates', caller must populate options from GET /api/rftemplates. */
  dynamicOptions?: 'rftemplates'
  /** When true, renders checkboxes instead of a dropdown. Caller passes string[]. */
  multiSelect?: boolean
  /** Default checked values for multi-select cards. */
  multiSelectDefault?: string[]
  /** Returns the standards to create. Multi-select cards receive string[]. */
  getStandards: (selectedValue?: string | string[]) => BaseStd[]
  /** Returns true if this template is already represented in the loaded standards list. */
  isAdded: (standards: Standard[]) => boolean
}

export interface TemplateGroup {
  label: string
  templates: TemplateCard[]
}

export interface TabConfig {
  id: 'wlan' | 'site'
  label: string
  groups: TemplateGroup[]
}

const W: Pick<BaseStd, 'scope' | 'filter' | 'enabled' | 'auto_remediate'> = {
  scope: 'wlan', filter: undefined, enabled: true, auto_remediate: null,
}

const S: Pick<BaseStd, 'scope' | 'filter' | 'enabled' | 'auto_remediate'> = {
  scope: 'site', filter: undefined, enabled: true, auto_remediate: null,
}

export const TABS: TabConfig[] = [
  {
    id: 'wlan',
    label: 'WLAN',
    groups: [
      {
        label: 'Performance',
        templates: [
          {
            key: 'fast_roaming',
            title: 'Fast Roaming (802.11r)',
            description: 'Reduces roam latency <50ms — PSK/EAP WLANs only.',
            getStandards: () => [{
              ...W,
              name: 'Fast Roaming (802.11r)',
              description: 'Enable 802.11r Fast BSS Transition for seamless roaming. Skipped on open/OWE WLANs.',
              filter: [
                { field: 'auth.type', condition: 'in', value: ['psk', 'eap'] },
              ],
              check_field: 'roam_mode', check_condition: 'eq', check_value: '11r',
              remediation_field: 'roam_mode', remediation_value: '11r',
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'roam_mode'),
          },
          {
            key: 'data_rates',
            title: 'Data Rates',
            description: 'Enforce a rate template across 2.4, 5, and 6 GHz. Remediation sets all three bands at once.',
            options: [
              { label: 'No Legacy', value: 'no-legacy' },
              { label: 'High Density', value: 'high-density' },
              { label: 'Compatible', value: 'compatible' },
            ],
            getStandards: (val = 'no-legacy') => [{
              ...W,
              name: `Data Rates (${val})`,
              description: `Enforce the ${val} rate template across 2.4, 5, and 6 GHz.`,
              check_field: 'rateset.5.template',
              check_condition: 'eq',
              check_value: val,
              remediation_field: 'rateset',
              remediation_value: {
                '5':  { template: val, min_rssi: 0 },
                '6':  { template: val, min_rssi: 0 },
                '24': { template: val, min_rssi: 0 },
              },
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'rateset.5.template'),
          },
          {
            key: 'wifi7',
            title: 'Wi-Fi 7 (802.11be)',
            description: 'Ensure Wi-Fi 7 is enabled or disabled across all WLANs.',
            options: [
              { label: 'Enabled', value: 'enabled' },
              { label: 'Disabled', value: 'disabled' },
            ],
            getStandards: (val = 'enabled') => {
              const disable = val !== 'enabled'
              return [{
                ...W,
                name: `Wi-Fi 7 (802.11be) ${disable ? 'Disabled' : 'Enabled'}`,
                description: `Ensure 802.11be (Wi-Fi 7) is ${disable ? 'disabled' : 'enabled'} on all WLANs.`,
                check_field: 'disable_11be',
                check_condition: 'eq',
                check_value: disable,
                remediation_field: 'disable_11be',
                remediation_value: disable,
              }]
            },
            isAdded: (stds) => stds.some(s => s.check_field === 'disable_11be'),
          },
        ],
      },
      {
        label: 'Radio Band',
        templates: [
          {
            key: 'radio_band',
            title: 'Radio Band',
            description: 'Enforce which bands WLANs must broadcast on. Remediation replaces the bands list entirely.',
            options: [
              { label: '2.4 GHz', value: '24' },
              { label: '5 GHz',   value: '5'  },
              { label: '6 GHz',   value: '6'  },
            ],
            multiSelect: true,
            multiSelectDefault: ['24', '5', '6'],
            getStandards: (selected) => {
              const bands = (Array.isArray(selected) ? selected : selected ? [selected] : [])
                .slice().sort()
              if (bands.length === 0) return []
              const label = bands.map(b => b === '24' ? '2.4 GHz' : b === '5' ? '5 GHz' : '6 GHz').join(' + ')
              return [{
                ...W,
                name: `Radio Band — ${label}`,
                description: `Ensure WLANs broadcast on ${label} only.`,
                check_field: 'bands', check_condition: 'set_eq', check_value: bands,
                remediation_field: 'bands', remediation_value: bands,
              }]
            },
            isAdded: (stds) => stds.some(s => s.check_field === 'bands'),
          },
        ],
      },
      {
        label: 'Network Efficiency',
        templates: [
          {
            key: 'arp_filter',
            title: 'ARP Filtering',
            description: 'Proxy ARP replies — cuts broadcast traffic.',
            getStandards: () => [{
              ...W,
              name: 'ARP Filtering',
              description: 'Enable ARP filtering to suppress broadcast ARP storms and proxy replies.',
              check_field: 'arp_filter', check_condition: 'truthy', check_value: null,
              remediation_field: 'arp_filter', remediation_value: true,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'arp_filter'),
          },
          {
            key: 'limit_bcast',
            title: 'Broadcast/Multicast Filtering',
            description: 'Drop non-essential broadcast frames to protect airtime.',
            getStandards: () => [{
              ...W,
              name: 'Broadcast/Multicast Filtering',
              description: 'Limit broadcast and multicast traffic to reduce airtime waste.',
              check_field: 'limit_bcast', check_condition: 'truthy', check_value: null,
              remediation_field: 'limit_bcast', remediation_value: true,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'limit_bcast'),
          },
          {
            key: 'disable_gw_down',
            title: 'Disable When Gateway Down',
            description: 'Disables WLAN when AP cannot reach its gateway.',
            getStandards: () => [{
              ...W,
              name: 'Disable When Gateway Down',
              description: 'Disable WLAN when the AP cannot reach its gateway.',
              check_field: 'disable_when_gateway_unreachable', check_condition: 'truthy', check_value: null,
              remediation_field: 'disable_when_gateway_unreachable', remediation_value: true,
            }],
            isAdded: (stds) =>
              stds.some(s => s.check_field === 'disable_when_gateway_unreachable'),
          },
        ],
      },
    ],
  },
  {
    id: 'site',
    label: 'Site',
    groups: [
      {
        label: 'Radio',
        templates: [
          {
            key: 'rftemplate',
            title: 'RF Template',
            description: 'Apply an org RF template to all sites.',
            options: [],
            dynamicOptions: 'rftemplates',
            getStandards: (val = '') => {
              if (!val) return []
              return [{
                ...S,
                name: 'RF Template',
                description: 'Ensure sites use the selected org RF template.',
                check_field: 'rftemplate_id', check_condition: 'eq', check_value: val,
                remediation_field: 'rftemplate_id', remediation_value: val,
              }]
            },
            isAdded: (stds) => stds.some(s => s.check_field === 'rftemplate_id'),
          },
        ],
      },
      {
        label: 'Reliability',
        templates: [
          {
            key: 'persist_config',
            title: 'AP Config Persistence',
            description: 'AP retains config and serves clients when cloud connection is lost.',
            getStandards: () => [{
              ...S,
              name: 'AP Config Persistence',
              description: 'Store AP config locally so APs remain functional during cloud outages.',
              check_field: 'persist_config_on_device', check_condition: 'truthy', check_value: null,
              remediation_field: 'persist_config_on_device', remediation_value: true,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'persist_config_on_device'),
          },
          {
            key: 'uplink_monitoring',
            title: 'AP Uplink Monitoring',
            description: 'Keep WLANs up if the AP uplink goes down.',
            getStandards: () => [{
              ...S,
              name: 'AP Uplink Monitoring',
              description: 'Ensure keep_wlans_up_if_down is false (enabled) so WLANs stay active when the AP uplink port loses connectivity.',
              check_field: 'uplink_port_config.keep_wlans_up_if_down', check_condition: 'falsy', check_value: null,
              remediation_field: 'uplink_port_config.keep_wlans_up_if_down', remediation_value: false,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'uplink_port_config.keep_wlans_up_if_down'),
          },
        ],
      },
    ],
  },
]
