import type { Standard } from './types'

type BaseStd = Omit<Standard, 'id' | 'org_id' | 'created_at'>

export interface TemplateCard {
  key: string
  title: string
  description: string
  /** Present on dropdown and dynamic cards; absent on simple cards. */
  options?: { label: string; value: string }[]
  /** If 'rftemplates', caller must populate options from GET /api/rftemplates. */
  dynamicOptions?: 'rftemplates'
  /** Returns the standards to create. Simple cards ignore selectedValue. */
  getStandards: (selectedValue?: string) => BaseStd[]
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
                { field: 'auth.type', condition: 'eq', value: 'psk' },
                { field: 'auth.type', condition: 'eq', value: 'eap' },
              ],
              check_field: 'roam_mode', check_condition: 'eq', check_value: '11r',
              remediation_field: 'roam_mode', remediation_value: '11r',
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'roam_mode'),
          },
          {
            key: 'data_rates',
            title: 'Data Rates',
            description: 'Enforce a rate template on 2.4, 5, and 6 GHz (creates 3 standards).',
            options: [
              { label: 'No Legacy', value: 'no-legacy' },
              { label: 'High Density', value: 'high-density' },
              { label: 'Compatible', value: 'compatible' },
            ],
            getStandards: (val = 'no-legacy') =>
              ['24', '5', '6'].map(band => ({
                ...W,
                name: `Data Rates — ${band === '24' ? '2.4' : band} GHz (${val})`,
                description: `Set ${band === '24' ? '2.4' : band} GHz rate template to ${val}.`,
                check_field: `rateset.${band}.template`,
                check_condition: 'eq',
                check_value: val,
                remediation_field: `rateset.${band}.template`,
                remediation_value: val,
              })),
            isAdded: (stds) =>
              ['24', '5', '6'].every(b => stds.some(s => s.check_field === `rateset.${b}.template`)),
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
            key: 'band_24',
            title: 'Radio Band — 2.4 GHz',
            description: 'Require WLANs to broadcast on 2.4 GHz.',
            getStandards: () => [{
              ...W,
              name: 'Radio Band — 2.4 GHz',
              description: 'Ensure WLANs are configured to broadcast on 2.4 GHz.',
              check_field: 'bands', check_condition: 'contains_item', check_value: '24',
              remediation_field: 'bands', remediation_value: ['24'],
            }],
            isAdded: (stds) =>
              stds.some(s => s.check_field === 'bands' && s.check_value === '24'),
          },
          {
            key: 'band_5',
            title: 'Radio Band — 5 GHz',
            description: 'Require WLANs to broadcast on 5 GHz.',
            getStandards: () => [{
              ...W,
              name: 'Radio Band — 5 GHz',
              description: 'Ensure WLANs are configured to broadcast on 5 GHz.',
              check_field: 'bands', check_condition: 'contains_item', check_value: '5',
              remediation_field: 'bands', remediation_value: ['5'],
            }],
            isAdded: (stds) =>
              stds.some(s => s.check_field === 'bands' && s.check_value === '5'),
          },
          {
            key: 'band_6',
            title: 'Radio Band — 6 GHz',
            description: 'Require WLANs to broadcast on 6 GHz.',
            getStandards: () => [{
              ...W,
              name: 'Radio Band — 6 GHz',
              description: 'Ensure WLANs are configured to broadcast on 6 GHz.',
              check_field: 'bands', check_condition: 'contains_item', check_value: '6',
              remediation_field: 'bands', remediation_value: ['6'],
            }],
            isAdded: (stds) =>
              stds.some(s => s.check_field === 'bands' && s.check_value === '6'),
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
        ],
      },
      {
        label: 'Security',
        templates: [
          {
            key: 'switch_root_pw',
            title: 'Switch Mgmt Root Password',
            description: 'Ensure a root password is set on managed switches. Checks password is set — value not verified.',
            getStandards: () => [{
              ...S,
              name: 'Switch Mgmt Root Password',
              description: 'Ensure managed switches have a root password configured. Password value cannot be verified.',
              check_field: 'switch_mgmt.root_password', check_condition: 'truthy', check_value: null,
              remediation_field: 'switch_mgmt.root_password', remediation_value: null,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'switch_mgmt.root_password'),
          },
          {
            key: 'wan_root_pw',
            title: 'WAN Edge Root Password',
            description: 'Ensure a root password is set on WAN edge devices. Checks password is set — value not verified.',
            getStandards: () => [{
              ...S,
              name: 'WAN Edge Root Password',
              description: 'Ensure WAN edge devices have a root password configured. Password value cannot be verified.',
              check_field: 'gateway_mgmt.root_password', check_condition: 'truthy', check_value: null,
              remediation_field: 'gateway_mgmt.root_password', remediation_value: null,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'gateway_mgmt.root_password'),
          },
        ],
      },
    ],
  },
]
