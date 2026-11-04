import { z } from 'zod'

export const dataTableSchema = z.enum([
  'problems',
  'submissions',
  'notes',
  'stats',
  'sites',
  'scripts',
  'credentials',
  'coach',
])

export type DataTable = z.infer<typeof dataTableSchema>

export const dataChangedPayloadSchema = z.object({
  tables: z.array(dataTableSchema),
})

export type DataChangedPayload = z.infer<typeof dataChangedPayloadSchema>
