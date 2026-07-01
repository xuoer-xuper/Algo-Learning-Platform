import { contextBridge, ipcRenderer } from 'electron'
import {
  createOjSubmissionBridge,
  installOjSubmissionMessageForwarder,
  OJ_SUBMISSION_BRIDGE_CHANNEL,
  OJ_SUBMISSION_IPC_CHANNEL,
} from './ojBridge'

function reportSubmission(payload: unknown): void {
  ipcRenderer.send(OJ_SUBMISSION_IPC_CHANNEL, payload)
}

contextBridge.exposeInMainWorld(OJ_SUBMISSION_BRIDGE_CHANNEL, createOjSubmissionBridge(reportSubmission))
installOjSubmissionMessageForwarder(window, reportSubmission)
