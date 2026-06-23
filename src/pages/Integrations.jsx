import React from 'react'
import { Settings, CheckCircle, Circle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'

const INTEGRATIONS = [
  { name: 'Azure ', key: 'AZURE_OPENAI_KEY', description: 'Powers all AI agent generation — scripts, visuals, summaries.', configured: !!import.meta.env.VITE_AZURE_OPENAI_CONFIGURED },
  { name: 'Avatar Video', key: 'HEYGEN_API_KEY', description: 'Generates presenter avatar videos from script + voice.', configured: !!import.meta.env.VITE_HEYGEN_CONFIGURED },
  { name: 'Voice Synthesis', key: 'ELEVENLABS_API_KEY', description: 'Text-to-speech voiceover generation.', configured: !!import.meta.env.VITE_ELEVENLABS_CONFIGURED },
  { name: 'Azure Blob Storage', key: 'AZURE_STORAGE_CONNECTION_STRING', description: 'Stores all uploaded files, audio, and generated assets.', configured: !!import.meta.env.VITE_STORAGE_CONFIGURED },
  { name: 'PostgreSQL (PgBouncer)', key: 'DATABASE_URL', description: 'Primary database for all project data via Prisma.', configured: !!import.meta.env.VITE_DB_CONFIGURED },
]

export default function Integrations() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h1 className="text-2xl font-light text-slate-900 dark:text-white tracking-wide">Integrations</h1>
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
        All service keys are configured as Azure SWA Application Settings — never exposed to the browser.
      </p>

      <div className="space-y-3">
        {INTEGRATIONS.map((item) => (
          <Card key={item.name}>
            <CardContent className="p-4 flex items-start gap-4">
              <div className="mt-0.5">
                {item.configured
                  ? <CheckCircle className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                  : <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                }
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{item.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.description}</p>
                <code className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">{item.key}</code>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          To configure: go to your <strong className="text-slate-900 dark:text-white">Azure Static Web App → Settings → Environment variables</strong> and add the keys listed above.
          They are injected securely into the backend Azure Functions at runtime.
        </p>
      </div>
    </div>
  )
}
