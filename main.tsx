import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/contexts/AuthProvider'
import { EmpresaProvider } from '@/contexts/EmpresaProvider'
import { supabaseConfigurado } from '@/lib/supabase'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
})

function FaltaConfiguracao() {
  return (
    <div className="mx-auto max-w-lg p-8 font-sans">
      <h1 className="text-xl font-semibold">Falta configurar o Supabase</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Copie o arquivo <code>.env.example</code> para <code>.env</code> e preencha <code>VITE_SUPABASE_URL</code> e{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> com os dados do seu projeto (Supabase → Project Settings → API).
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigurado ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <EmpresaProvider>
            <App />
            <Toaster />
          </EmpresaProvider>
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <FaltaConfiguracao />
    )}
  </StrictMode>,
)
