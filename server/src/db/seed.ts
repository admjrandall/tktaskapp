import { db } from './index.js'
import { clients } from './schema/clients.js'
import { departments } from './schema/departments.js'
import { projects } from './schema/projects.js'
import { tasks } from './schema/tasks.js'
import { people } from './schema/people.js'
import { tags } from './schema/tags.js'
import { sql } from 'drizzle-orm'

const TENANT_ID = 'dev-tenant-1'

async function seed(): Promise<void> {
  console.log('[seed] Starting seed for tenant:', TENANT_ID)

  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.tenant_id = ${TENANT_ID}`)

    // Admin user
    await tx.execute(sql`
      INSERT INTO tenant_users (id, org_id, entra_tenant_id, external_id, email, display_name, role)
      VALUES (
        gen_random_uuid(),
        ${TENANT_ID}::uuid,
        'dev-entra-tenant',
        'dev-admin-oid',
        'admin@dev.local',
        'Dev Admin',
        'admin'
      )
      ON CONFLICT (external_id) DO NOTHING
    `)

    // Tags
    await tx
      .insert(tags)
      .values([
        { id: 'tag-vip-1', tenantId: TENANT_ID, name: 'VIP', color: '#7c3aed' },
        { id: 'tag-high-value-1', tenantId: TENANT_ID, name: 'High Value', color: '#dc2626' },
      ])
      .onConflictDoNothing()

    // Clients
    await tx
      .insert(clients)
      .values([
        {
          id: 'client-acme-1',
          tenantId: TENANT_ID,
          name: 'Acme Corp',
          contactName: 'Jane Smith',
          email: 'jane@acme.example',
          stage: 'Active',
          description: 'Key enterprise account',
        },
        {
          id: 'client-globex-1',
          tenantId: TENANT_ID,
          name: 'Globex Industries',
          contactName: 'John Burns',
          email: 'john@globex.example',
          stage: 'Prospect',
          description: 'Inbound lead from trade show',
        },
      ])
      .onConflictDoNothing()

    // Department
    await tx
      .insert(departments)
      .values([
        {
          id: 'dept-eng-1',
          tenantId: TENANT_ID,
          name: 'Engineering',
          description: 'Product engineering team',
        },
      ])
      .onConflictDoNothing()

    // Projects
    await tx
      .insert(projects)
      .values([
        {
          id: 'proj-platform-1',
          tenantId: TENANT_ID,
          name: 'Platform Upgrade',
          stage: 'Active',
          priority: 'High',
          clientId: 'client-acme-1',
          description: 'Migrate to new infrastructure',
        },
        {
          id: 'proj-onboard-1',
          tenantId: TENANT_ID,
          name: 'Globex Onboarding',
          stage: 'Planning',
          priority: 'Medium',
          clientId: 'client-globex-1',
          description: 'Initial onboarding project',
        },
        {
          id: 'proj-internal-1',
          tenantId: TENANT_ID,
          name: 'Internal Tooling',
          stage: 'Active',
          priority: 'Low',
          description: 'Internal dev tools improvements',
        },
      ])
      .onConflictDoNothing()

    // Tasks
    await tx
      .insert(tasks)
      .values([
        {
          id: 'task-1',
          tenantId: TENANT_ID,
          title: 'Set up dev environment',
          status: 'Done',
          priority: 'High',
          projectId: 'proj-platform-1',
        },
        {
          id: 'task-2',
          tenantId: TENANT_ID,
          title: 'Design API schema',
          status: 'In Progress',
          priority: 'High',
          projectId: 'proj-platform-1',
        },
        {
          id: 'task-3',
          tenantId: TENANT_ID,
          title: 'Write integration tests',
          status: 'Todo',
          priority: 'Medium',
          projectId: 'proj-platform-1',
        },
        {
          id: 'task-4',
          tenantId: TENANT_ID,
          title: 'Prepare onboarding docs',
          status: 'Todo',
          priority: 'Medium',
          projectId: 'proj-onboard-1',
        },
        {
          id: 'task-5',
          tenantId: TENANT_ID,
          title: 'Kick-off call with Globex',
          status: 'Todo',
          priority: 'High',
          projectId: 'proj-onboard-1',
        },
      ])
      .onConflictDoNothing()

    // People
    await tx
      .insert(people)
      .values([
        {
          id: 'person-1',
          tenantId: TENANT_ID,
          name: 'Alice Developer',
          role: 'Senior Engineer',
          email: 'alice@dev.local',
          departmentId: 'dept-eng-1',
        },
        {
          id: 'person-2',
          tenantId: TENANT_ID,
          name: 'Bob Manager',
          role: 'Account Manager',
          email: 'bob@dev.local',
          clientId: 'client-acme-1',
        },
      ])
      .onConflictDoNothing()
  })

  console.log('[seed] Done.')
}

seed().catch((err: unknown) => {
  console.error('[seed] Error:', err)
  process.exit(1)
})
