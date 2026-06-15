declare module '../extension/ideaspeak-bridge' {
  export function isBridgeInstalled(): Promise<boolean>
  export function sendToLovable(prompt: string): Promise<{ success: boolean; error?: string }>
}