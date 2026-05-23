#!/usr/bin/env node
// scripts/dataverse-provision.mjs
// Provisions Phase 5 Dataverse tables for Tech Key CRM (tktaskapp_ prefix).
//
// Usage:
//   DATAVERSE_ENV_URL=https://org.crm.dynamics.com DATAVERSE_TOKEN=<bearer> node scripts/dataverse-provision.mjs
//
// Prerequisites:
//   - Obtain a token scoped to your Dataverse environment (e.g. via `az account get-access-token`
//     or MSAL device-code flow). The token needs the Dynamics CRM user_impersonation scope.
//   - The app registration must have the "System Administrator" or "System Customizer" role in
//     the target environment to create EntityDefinitions.
//
// The script is idempotent — it skips tables that already exist.

const ENV_URL = (process.env['DATAVERSE_ENV_URL'] ?? '').replace(/\/$/, '')
const TOKEN = process.env['DATAVERSE_TOKEN'] ?? ''

if (!ENV_URL || !TOKEN) {
  console.error('Error: DATAVERSE_ENV_URL and DATAVERSE_TOKEN environment variables are required.')
  process.exit(1)
}

// ── Table definitions ─────────────────────────────────────────────────────────
// Each entry maps to one Dataverse custom table. A single Memo column (JSON blob)
// stores the serialised record — matching how the adapter pushes data.

/** @type {Array<{ schemaName: string; displayName: string; pluralName: string; description: string }>} */
const TABLES = [
  {
    schemaName: 'tktaskapp_deal',
    displayName: 'TK Deal',
    pluralName: 'TK Deals',
    description: 'CRM pipeline deal — Phase 5 (C.1)',
  },
  {
    schemaName: 'tktaskapp_pipeline',
    displayName: 'TK Pipeline',
    pluralName: 'TK Pipelines',
    description: 'CRM sales/delivery pipeline — Phase 5 (C.1)',
  },
  {
    schemaName: 'tktaskapp_aiattributedef',
    displayName: 'TK AI Attribute Definition',
    pluralName: 'TK AI Attribute Definitions',
    description: 'AI Attribute field definition for CRM entities — C.2',
  },
  {
    schemaName: 'tktaskapp_aiattributevalue',
    displayName: 'TK AI Attribute Value',
    pluralName: 'TK AI Attribute Values',
    description: 'Computed AI Attribute value with EU AI Act provenance — C.2',
  },
  {
    schemaName: 'tktaskapp_extensionobjdef',
    displayName: 'TK Extension Object Definition',
    pluralName: 'TK Extension Object Definitions',
    description: 'User-definable extension object schema — C.1',
  },
  {
    schemaName: 'tktaskapp_extensionobjinstance',
    displayName: 'TK Extension Object Instance',
    pluralName: 'TK Extension Object Instances',
    description: 'Instance of a user-defined extension object — C.1',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function odataHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
  }
}

function label(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    UserLocalizedLabel: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
      Label: text,
      LanguageCode: 1033,
    },
    LocalizedLabels: [],
  }
}

async function tableExists(schemaName) {
  const url = `${ENV_URL}/api/data/v9.2/EntityDefinitions?$filter=SchemaName eq '${schemaName}'&$select=SchemaName`
  const resp = await fetch(url, { headers: odataHeaders() })
  if (!resp.ok) throw new Error(`EntityDefinitions query failed: HTTP ${resp.status}`)
  const data = await resp.json()
  return Array.isArray(data.value) && data.value.length > 0
}

async function createTable(table) {
  const { schemaName, displayName, pluralName, description } = table

  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: schemaName,
    DisplayName: label(displayName),
    DisplayCollectionName: label(pluralName),
    Description: label(description),
    OwnershipType: 'UserOwned',
    HasActivities: false,
    HasNotes: false,
    IsActivity: false,
    PrimaryNameAttribute: `${schemaName}name`,
    Attributes: [
      // Primary name — required by Dataverse for all custom tables
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: `${schemaName}name`,
        DisplayName: label('Name'),
        RequiredLevel: { Value: 'ApplicationRequired', CanBeChanged: false, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
        MaxLength: 255,
        IsPrimaryName: true,
      },
      // JSON data blob — adapter serialises the full record here
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
        SchemaName: `${schemaName}data`,
        DisplayName: label('JSON Data'),
        RequiredLevel: { Value: 'None', CanBeChanged: false, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
        MaxLength: 1_048_576,
      },
    ],
  }

  const resp = await fetch(`${ENV_URL}/api/data/v9.2/EntityDefinitions`, {
    method: 'POST',
    headers: odataHeaders(),
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '<no body>')
    throw new Error(`Failed to create ${schemaName}: HTTP ${resp.status} — ${errBody.slice(0, 300)}`)
  }

  return resp.headers.get('OData-EntityId') ?? '(created)'
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nTech Key CRM — Dataverse Phase 5 Provisioning`)
  console.log(`Environment: ${ENV_URL}\n`)

  let created = 0
  let skipped = 0

  for (const table of TABLES) {
    process.stdout.write(`  ${table.schemaName.padEnd(38)} `)
    try {
      if (await tableExists(table.schemaName)) {
        console.log('already exists — skipped')
        skipped++
      } else {
        const ref = await createTable(table)
        console.log(`created  ${ref}`)
        created++
      }
    } catch (err) {
      console.log(`FAILED — ${err.message}`)
      // Continue so other tables can still be created
    }
  }

  console.log(`\nDone. Created: ${created}  Skipped: ${skipped}`)
  if (created > 0) {
    console.log('Publish customizations in the Power Apps Maker portal to activate the new tables.')
  }
}

main().catch((err) => {
  console.error('\nFatal:', err.message)
  process.exit(1)
})
