import { CheckCircle2, AlertTriangle, Info, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

/** バリアントに対応するアイコンを返す */
function getToastIcon(variant: string | undefined | null) {
  switch (variant) {
    case "success":
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 dark:text-emerald-400" />
    case "warning":
      return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400" />
    case "destructive":
      return <AlertCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400" />
    case "info":
      return <Info className="h-5 w-5 shrink-0 text-sky-500 dark:text-sky-400" />
    default:
      return <Info className="h-5 w-5 shrink-0 text-primary" />
  }
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            {getToastIcon(variant)}
            <div className="grid gap-0.5 flex-1 min-w-0">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
