import { contextBridge, ipcRenderer } from 'electron'
import {
  createOjSubmissionBridge,
  installOjSubmissionMessageForwarder,
  OJ_SUBMISSION_BRIDGE_CHANNEL,
  OJ_SUBMISSION_IPC_CHANNEL,
} from './ojBridge'
import { OJ_CREDENTIAL_FILL_CHANNEL } from '../credentials/autofill/credentialAutofillBridge'
import { fillCredentialFormWithRetry, isCredentialFormFillPayload } from '../credentials/autofill/formFiller'

function reportSubmission(payload: unknown): void {
  ipcRenderer.send(OJ_SUBMISSION_IPC_CHANNEL, payload)
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
