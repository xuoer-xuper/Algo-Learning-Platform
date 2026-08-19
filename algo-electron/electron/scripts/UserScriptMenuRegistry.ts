const MAX_COMMANDS_PER_PORT = 32
const MAX_COMMANDS_TOTAL = 256

export interface UserScriptMenuCommand {
  scriptName: string
  name: string
  invoke(): void
}

interface RegisteredUserScriptMenuCommand extends UserScriptMenuCommand {
  key: string
  portId: string
  webContentsId: number
  scriptId: string
  commandId: string
}

export class UserScriptMenuRegistry {
  private readonly commands = new Map<string, RegisteredUserScriptMenuCommand>()

  public register(input: {
    portId: string
    webContentsId: number
    scriptId: string
    scriptName: string
    commandId: string
    name: string
    invoke: () => void
  }): boolean {
    const key = commandKey(input.portId, input.scriptId, input.commandId)
    if (!this.commands.has(key)) {
      const perPort = Array.from(this.commands.values()).filter(command => command.portId === input.portId).length
      if (perPort >= MAX_COMMANDS_PER_PORT || this.commands.size >= MAX_COMMANDS_TOTAL) return false
    }
    this.commands.set(key, { ...input, key })
    return true
  }

  public unregister(portId: string, scriptId: string, commandId: string): boolean {
    return this.commands.delete(commandKey(portId, scriptId, commandId))
  }

  public clearPort(portId: string): void {
    for (const [key, command] of this.commands) {
      if (command.portId === portId) this.commands.delete(key)
    }
  }

  public getForWebContents(webContentsId: number): UserScriptMenuCommand[] {
    return Array.from(this.commands.values())
      .filter(command => command.webContentsId === webContentsId)
      .map(command => ({
        scriptName: command.scriptName,
        name: command.name,
        invoke: command.invoke,
      }))
  }

  public clear(): void {
    this.commands.clear()
  }
}

function commandKey(portId: string, scriptId: string, commandId: string): string {
  return `${portId}\u0000${scriptId}\u0000${commandId}`
}
