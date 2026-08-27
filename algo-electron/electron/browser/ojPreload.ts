import { contextBridge, ipcRenderer } from 'electron'
import {
  createOjSubmissionBridge,
  installOjSubmissionMessageForwarder,
  OJ_SUBMISSION_BRIDGE_CHANNEL,
  OJ_SUBMISSION_IPC_CHANNEL,
  OJ_SUBMISSION_TOKEN_CHANNEL,
} from './ojBridge'
import { OJ_CREDENTIAL_FILL_CHANNEL } from '../credentials/autofill/credentialAutofillBridge'
import { fillCredentialFormWithRetry, isCredentialFormFillPayload } from '../credentials/autofill/formFiller'
import { installCredentialCaptureListener } from '../credentials/captureForm'
import { OJ_CREDENTIAL_CAPTURE_CHANNEL } from '../credentials/captureBridge'

const DOCUMENT_TOKEN_PATTERN = /^[a-f0-9]{32}$/

// Requested once per document at preload time and retried on demand. Pulling
// removes the push race entirely: if the first request loses to webContents
// registration, the next submission report simply asks again.
let documentToken: Promise<string | null> = requestDocumentToken()

function requestDocumentToken(): Promise<string | null> {
  return ipcRenderer
    .invoke(OJ_SUBMISSION_TOKEN_CHANNEL)
    .then((token: unknown) => (
      typeof token === 'string' && DOCUMENT_TOKEN_PATTERN.test(token) ? token : null
    ))
    .catch(() => null)
}

function reportSubmission(payload: unknown): void {
  void documentToken.then((token) => {
    if (token) {
      ipcRenderer.send(OJ_SUBMISSION_IPC_CHANNEL, { token, payload })
      return
    }
    documentToken = requestDocumentToken()
    void documentToken.then((retriedToken) => {
      if (retriedToken) ipcRenderer.send(OJ_SUBMISSION_IPC_CHANNEL, { token: retriedToken, payload })
    })
  })
}

contextBridge.exposeInMainWorld(OJ_SUBMISSION_BRIDGE_CHANNEL, createOjSubmissionBridge(reportSubmission))
installOjSubmissionMessageForwarder(window, reportSubmission)

// This listener lives only in the isolated OJ preload. The shell renderer has
// no matching IPC method and never receives the password payload.
ipcRenderer.on(OJ_CREDENTIAL_FILL_CHANNEL, (_event, payload: unknown) => {
  if (!isCredentialFormFillPayload(payload)) return
  if (window.location.href !== payload.pageUrl) return
  void fillCredentialFormWithRetry(document, payload)
})

installCredentialCaptureListener(window, document, (payload) => {
  ipcRenderer.send(OJ_CREDENTIAL_CAPTURE_CHANNEL, payload)
})
