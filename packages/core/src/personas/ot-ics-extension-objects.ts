// ── OT/ICS Vertical Pack — Extension Object Presets ──────────────────────────
// Seed definitions for the four standard OT/ICS extension object types.
// These are stored as ExtensionObjectDef records in the 'extensionObjectDefs'
// IDB store when an operator or field-engineer persona is first activated.

export interface ExtensionObjectFieldDef {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'select'
  required?: boolean
  options?: string[]
}

export interface ExtensionObjectDefPreset {
  id: string
  name: string
  label: string
  fields: ExtensionObjectFieldDef[]
  icon: string
  color: string
  allowedRelations: string[]
  createdAt: string
  updatedAt: string
}

const _NOW = '2026-05-22T00:00:00.000Z'

export const OT_ICS_EXTENSION_OBJECT_PRESETS: ExtensionObjectDefPreset[] = [
  {
    id: 'ot-asset',
    name: 'asset',
    label: 'Asset',
    icon: 'cpu',
    color: '#0369a1',
    allowedRelations: ['clients', 'projects', 'tasks'],
    fields: [
      { key: 'assetTag', label: 'Asset Tag', type: 'text', required: true },
      { key: 'serialNumber', label: 'Serial Number', type: 'text' },
      {
        key: 'assetType',
        label: 'Asset Type',
        type: 'select',
        options: ['PLC', 'HMI', 'Sensor', 'Valve', 'Pump', 'Motor', 'Panel', 'Other'],
      },
      { key: 'location', label: 'Location / Zone', type: 'text' },
      { key: 'installDate', label: 'Install Date', type: 'date' },
      { key: 'lastInspection', label: 'Last Inspection', type: 'date' },
      { key: 'nextMaintenanceDue', label: 'Next Maintenance Due', type: 'date' },
      {
        key: 'criticality',
        label: 'Criticality',
        type: 'select',
        options: ['Low', 'Medium', 'High', 'Critical'],
      },
      { key: 'online', label: 'Online / Active', type: 'boolean' },
    ],
    createdAt: _NOW,
    updatedAt: _NOW,
  },
  {
    id: 'ot-work-order',
    name: 'work-order',
    label: 'Work Order',
    icon: 'clipboard',
    color: '#b45309',
    allowedRelations: ['clients', 'tasks', 'people'],
    fields: [
      { key: 'woNumber', label: 'WO Number', type: 'text', required: true },
      {
        key: 'woType',
        label: 'Type',
        type: 'select',
        options: ['Preventive', 'Corrective', 'Emergency', 'Inspection', 'Calibration'],
      },
      { key: 'assetRef', label: 'Asset Tag / ID', type: 'text' },
      { key: 'siteId', label: 'Site', type: 'text' },
      { key: 'scheduledDate', label: 'Scheduled Date', type: 'date', required: true },
      { key: 'completedDate', label: 'Completed Date', type: 'date' },
      { key: 'technicianId', label: 'Assigned Technician', type: 'text' },
      { key: 'estimatedHours', label: 'Estimated Hours', type: 'number' },
      { key: 'partsRequired', label: 'Parts Required', type: 'text' },
      { key: 'safetyPermit', label: 'Safety Permit Required', type: 'boolean' },
    ],
    createdAt: _NOW,
    updatedAt: _NOW,
  },
  {
    id: 'ot-site',
    name: 'site',
    label: 'Site',
    icon: 'map-pin',
    color: '#15803d',
    allowedRelations: ['clients', 'projects', 'people'],
    fields: [
      { key: 'siteCode', label: 'Site Code', type: 'text', required: true },
      { key: 'siteName', label: 'Site Name', type: 'text', required: true },
      { key: 'address', label: 'Address', type: 'text' },
      { key: 'region', label: 'Region / Zone', type: 'text' },
      {
        key: 'siteType',
        label: 'Site Type',
        type: 'select',
        options: ['Plant', 'Substation', 'Pipeline', 'Wellhead', 'Data Center', 'Other'],
      },
      { key: 'operatingHours', label: 'Operating Hours', type: 'text' },
      { key: 'onCallContact', label: 'On-Call Contact', type: 'text' },
      {
        key: 'hazardClassification',
        label: 'Hazard Classification',
        type: 'select',
        options: ['None', 'Class I Div 1', 'Class I Div 2', 'ATEX Zone 1', 'ATEX Zone 2'],
      },
      { key: 'activeAlerts', label: 'Active Alerts', type: 'number' },
    ],
    createdAt: _NOW,
    updatedAt: _NOW,
  },
  {
    id: 'ot-compliance-audit',
    name: 'compliance-audit',
    label: 'Compliance Audit',
    icon: 'shield-check',
    color: '#7e22ce',
    allowedRelations: ['clients', 'projects', 'people'],
    fields: [
      { key: 'auditRef', label: 'Audit Reference', type: 'text', required: true },
      {
        key: 'standard',
        label: 'Standard / Framework',
        type: 'select',
        options: ['IEC 62443', 'NERC CIP', 'ISO 27001', 'NIST CSF', 'SOC 2', 'Custom'],
      },
      { key: 'auditDate', label: 'Audit Date', type: 'date', required: true },
      { key: 'auditor', label: 'Lead Auditor', type: 'text' },
      { key: 'scope', label: 'Scope / Systems', type: 'text' },
      { key: 'findingsCount', label: 'Total Findings', type: 'number' },
      { key: 'criticalFindings', label: 'Critical Findings', type: 'number' },
      { key: 'remediationDue', label: 'Remediation Due Date', type: 'date' },
      { key: 'passed', label: 'Audit Passed', type: 'boolean' },
      { key: 'reportUrl', label: 'Report URL / Reference', type: 'text' },
    ],
    createdAt: _NOW,
    updatedAt: _NOW,
  },
]

export function getOTICSExtensionObjectPreset(id: string): ExtensionObjectDefPreset | undefined {
  return OT_ICS_EXTENSION_OBJECT_PRESETS.find((p) => p.id === id)
}
