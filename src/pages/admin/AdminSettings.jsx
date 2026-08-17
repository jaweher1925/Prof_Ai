import React, { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Settings as SettingsIcon, Save } from 'lucide-react'
import { adminService } from '@/services/admin'
import TiltCard from '@/components/auth/TiltCard'
import Spinner from '@/components/ui/Spinner'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function AdminSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: adminService.getSettings,
    retry: false,
  })

  const [defaultAvatarId, setDefaultAvatarId] = useState('')
  const [defaultVoiceId, setDefaultVoiceId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) {
      setDefaultAvatarId(data.defaultAvatarId || '')
      setDefaultVoiceId(data.defaultVoiceId || '')
    }
  }, [data])

  async function handleSave() {
    setSaving(true)
    try {
      await adminService.updateSettings({ defaultAvatarId, defaultVoiceId })
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err?.message || 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Platform-wide defaults, applied when a new project doesn't set its own.</p>
      </motion.div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <TiltCard className="mt-8 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl p-7 shadow-xl shadow-slate-200/50 dark:shadow-black/30">
          <div style={{ transform: 'translateZ(20px)' }}>
            <div className="flex items-center gap-2 mb-6">
              <SettingsIcon className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Defaults</h2>
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Default HeyGen avatar ID</span>
                <Input
                  value={defaultAvatarId}
                  onChange={(e) => setDefaultAvatarId(e.target.value)}
                  placeholder="e.g. Judy_Teacher_Sitting_public"
                />
                <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 block">Applied to new projects that haven't cast their own avatar yet.</span>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Default ElevenLabs voice ID</span>
                <Input
                  value={defaultVoiceId}
                  onChange={(e) => setDefaultVoiceId(e.target.value)}
                  placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                />
              </label>
            </div>

            <div className="flex justify-end mt-7">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Spinner size="sm" className="border-white/30 border-t-white" /> : <><Save className="w-4 h-4" /> Save settings</>}
              </Button>
            </div>
          </div>
        </TiltCard>
      )}
    </div>
  )
}
