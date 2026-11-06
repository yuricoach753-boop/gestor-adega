import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster(props: ToasterProps) {
  return <Sonner position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} {...props} />
}

export { Toaster }
