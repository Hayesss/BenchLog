import { Toaster } from '@/components/ui/sonner'

/**
 * Page-local toast outlet (top-right slide-in, 250ms, 4s auto-dismiss — design §6).
 * Mounted per page because the app shell owns no global toaster.
 */
export default function ProtocolToaster() {
  return <Toaster position="top-right" duration={4000} richColors={false} closeButton={false} />
}
