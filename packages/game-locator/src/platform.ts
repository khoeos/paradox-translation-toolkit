export type Platform = 'win32' | 'darwin' | 'linux'

export const toPlatform = (value: string): Platform => {
  if (value === 'win32' || value === 'darwin') {
    return value
  }
  return 'linux'
}
