import { net, protocol } from 'electron'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolveNoteAssetPath } from './NoteService'
import { appLogger } from '../shared/logger'

export const NOTE_ASSET_SCHEME = 'note-asset'

export function registerNoteAssetSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: NOTE_ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
      },
    },
  ])
}

export function registerNoteAssetProtocol(): void {
  protocol.handle(NOTE_ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const segments = url.pathname
        .split('/')
        .filter(Boolean)
        .map((segment) => decodeURIComponent(segment))
      const [noteId, ...relativeParts] = segments

      if (url.hostname !== 'local' || !noteId || relativeParts.length === 0) {
        return new Response(null, { status: 400 })
      }

      const assetPath = resolveNoteAssetPath(noteId, relativeParts.join('/'))
      if (!assetPath || !fs.existsSync(assetPath)) {
        return new Response(null, { status: 404 })
      }

      return net.fetch(pathToFileURL(assetPath).toString())
    } catch (error) {
      appLogger.warn('notes.asset-read-failed', error)
      return new Response(null, { status: 404 })
    }
  })
}
