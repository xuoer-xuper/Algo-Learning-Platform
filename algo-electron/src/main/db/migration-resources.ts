import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

export interface KnownDrizzleMigration {
  readonly tag: string
  readonly when: number
  readonly sha256: string
}

export interface LoadedDrizzleMigration extends KnownDrizzleMigration {
  readonly sql: string
}

export interface MigrationResources {
  readonly folder: string
  readonly migrations: readonly LoadedDrizzleMigration[]
}

export const KNOWN_DRIZZLE_MIGRATIONS: readonly KnownDrizzleMigration[] = [
  {
    tag: '0000_baseline',
    when: 1794022401703,
    sha256: 'b92f46f0e3cf2258b73dd4c1845c4646640b2f7d98309ef96d681bbf2bc20216',
  },
]

const migrationIdentitySchema = z.object({
  tag: z.string().regex(/^\d{4}_[a-zA-Z0-9_-]+$/),
  when: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
const journalSchema = z.object({
  version: z.literal('7'),
  dialect: z.literal('sqlite'),
  entries: z
    .array(
      z.object({
        idx: z.number().int().nonnegative(),
        version: z.literal('6'),
        when: z.number().int().positive(),
        tag: migrationIdentitySchema.shape.tag,
        breakpoints: z.boolean(),
      }),
    )
    .min(1),
})

export function resolveMigrationFolder(input: {
  packaged: boolean
  appRoot: string
  resourcesPath: string
}): string {
  const root = input.packaged ? input.resourcesPath : input.appRoot
  if (!path.isAbsolute(root)) throw new Error('Migration resource root must be absolute')
  return path.join(root, 'drizzle')
}

/** Validate the complete compiled resource list before opening a user database. */
export function loadMigrationResources(
  folder: string,
  expected: readonly KnownDrizzleMigration[] = KNOWN_DRIZZLE_MIGRATIONS,
): MigrationResources {
  if (!path.isAbsolute(folder)) throw new Error('Migration resource folder must be absolute')
  const identities = z.array(migrationIdentitySchema).min(1).safeParse(expected)
  if (!identities.success || identities.data[0].tag !== '0000_baseline') {
    throw new Error('Invalid compiled migration identities')
  }
  const tags = new Set<string>()
  let previous = 0
  for (const identity of identities.data) {
    if (
      !Number.isSafeInteger(identity.when) ||
      identity.when <= previous ||
      tags.has(identity.tag)
    ) {
      throw new Error('Compiled migration identities must be ordered and unique')
    }
    previous = identity.when
    tags.add(identity.tag)
  }

  let journalInput: unknown
  try {
    journalInput = JSON.parse(fs.readFileSync(path.join(folder, 'meta', '_journal.json'), 'utf8'))
  } catch {
    throw new Error('Migration journal is missing or unreadable')
  }
  const parsed = journalSchema.safeParse(journalInput)
  if (!parsed.success || parsed.data.entries.length !== identities.data.length) {
    throw new Error('Migration journal does not match the compiled history')
  }
  const sqlEntries = fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => /\.sql$/i.test(entry.name))
  if (sqlEntries.some((entry) => !entry.isFile())) {
    throw new Error('Migration SQL resource must be a regular file')
  }
  const sqlFiles = sqlEntries.map((entry) => entry.name).sort()
  const expectedFiles = identities.data.map(({ tag }) => `${tag}.sql`).sort()
  if (JSON.stringify(sqlFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('Migration SQL resource set does not match the compiled history')
  }

  const migrations = identities.data.map((identity, index) => {
    const entry = parsed.data.entries[index]
    if (entry.idx !== index || entry.tag !== identity.tag || entry.when !== identity.when) {
      throw new Error('Migration journal order or identity mismatch')
    }
    let sql: string
    try {
      const file = path.join(folder, `${identity.tag}.sql`)
      const bytes = fs.readFileSync(file)
      if (createHash('sha256').update(bytes).digest('hex') !== identity.sha256) {
        throw new Error('hash mismatch')
      }
      sql = bytes.toString('utf8')
    } catch {
      throw new Error(`Migration SQL is missing or has an invalid hash: ${identity.tag}`)
    }
    return Object.freeze({ ...identity, sql })
  })
  return Object.freeze({ folder, migrations: Object.freeze(migrations) })
}
