import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DownloadPathAllocator,
  getManagedDownloadDirectory,
  MAX_DOWNLOAD_FILENAME_LENGTH,
  sanitizeDownloadFilename,
} from '../../electron/downloads/downloadPath'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-download-path-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('sanitizeDownloadFilename', () => {
  it.each([
    ['../../problem.pdf', 'problem.pdf'],
    ['C:\\temp\\answer.cpp', 'answer.cpp'],
    ['CON.txt', '_CON.txt'],
    ['NUL .log', '_NUL .log'],
    ['bad<name>:final?.zip', 'bad-name-final-.zip'],
    [`bad\u0000\u001fname\u007f.txt`, 'badname.txt'],
    [`report\u202Ecod.exe`, 'reportcod.exe'],
    ['  ...  ', 'download'],
  ])('normalizes %s without allowing path components', (input, expected) => {
    expect(sanitizeDownloadFilename(input)).toBe(expected)
  })

  it('preserves the final extension while enforcing a conservative length limit', () => {
    const fileName = sanitizeDownloadFilename(`${'a'.repeat(300)}.tar.gz`)
    expect(Array.from(fileName).length).toBeLessThanOrEqual(MAX_DOWNLOAD_FILENAME_LENGTH)
    expect(fileName.endsWith('.gz')).toBe(true)
  })
})

describe('DownloadPathAllocator', () => {
  it('uses the application download directory and handles existing and reserved names', () => {
    const userDataDirectory = createTemporaryDirectory()
    const downloadDirectory = getManagedDownloadDirectory(userDataDirectory)
    fs.mkdirSync(downloadDirectory, { recursive: true })
    fs.writeFileSync(path.join(downloadDirectory, 'report.pdf'), 'existing')
    const allocator = new DownloadPathAllocator(downloadDirectory)

    const first = allocator.reserve('../report.pdf')
    const second = allocator.reserve('report.pdf')
    expect(first).toBe(path.join(downloadDirectory, 'report (1).pdf'))
    expect(second).toBe(path.join(downloadDirectory, 'report (2).pdf'))
    expect(path.dirname(first)).toBe(downloadDirectory)

    allocator.release(first)
    expect(allocator.reserve('report.pdf')).toBe(first)
  })

  it('rejects relative managed directories', () => {
    expect(() => getManagedDownloadDirectory('relative/user-data')).toThrow('absolute')
    expect(() => new DownloadPathAllocator('relative/downloads')).toThrow('absolute')
  })
})
