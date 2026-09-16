interface RunEmptyStateProps {
  message: string
}

export function RunEmptyState({ message }: RunEmptyStateProps) {
  return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{message}</p>
}
