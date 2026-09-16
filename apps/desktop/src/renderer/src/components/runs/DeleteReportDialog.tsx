import { isValidElement, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@ptt/ui/components/alert-dialog'

import { trpc } from '@renderer/lib/trpc'

interface DeleteReportDialogProps {
  file: string
  onDeleted?: () => void
  trigger: ReactNode
}

export function DeleteReportDialog({ file, onDeleted, trigger }: DeleteReportDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const utils = trpc.useUtils()

  const remove = trpc.runReports.remove.useMutation({
    onSuccess: () => {
      utils.runReports.list.invalidate()
      toast.success(t('runs.history.toast.deleted'))
      setOpen(false)
      onDeleted?.()
    },
    onError: err => toast.error(t('runs.history.toast.deleteError', { message: err.message }))
  })

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {isValidElement(trigger) ? (
        <AlertDialogTrigger render={trigger} />
      ) : (
        <AlertDialogTrigger>{trigger}</AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('runs.history.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('runs.history.delete.description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('runs.history.delete.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ file })}
          >
            {t('runs.history.delete.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
