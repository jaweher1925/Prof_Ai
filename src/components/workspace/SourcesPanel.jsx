import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sourceFilesService } from '@/services/sourceFiles'
import { agentsService } from '@/services/agents'
import { uploadFile } from '@/services/upload'
import { Upload, Link, Trash2, FileText, Globe, Loader2, Sparkles, CheckCircle, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'

const TYPE_ICON = { url: Globe }
const DEFAULT_ICON = FileText

export default function SourcesPanel({ project, onStageChange }) {
  const queryClient = useQueryClient()
  const [urlInput, setUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [generateDone, setGenerateDone] = useState(false)
  const [tab, setTab] = useState('file')

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['sourceFiles', project?.id],
    queryFn: () => sourceFilesService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const createMutation = useMutation({
    mutationFn: (data) => sourceFilesService.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sourceFiles', project.id] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => sourceFilesService.remove(id),
    onSuccess: () => {
      // Immediately refresh the file list after delete
      queryClient.invalidateQueries({ queryKey: ['sourceFiles', project.id] })
    },
    onError: (err) => {
      console.error('Delete failed:', err)
    },
  })

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { file_url, extracted_text } = await uploadFile(file)
      const ext = file.name.split('.').pop()?.toLowerCase()
      await createMutation.mutateAsync({
        project_id:     project.id,
        file_name:      file.name,
        file_url,
        file_type:      ['pdf','docx','xlsx','txt'].includes(ext) ? ext : 'other',
        file_size:      file.size,
        extracted_text: extracted_text ?? '',
      })
      e.target.value = ''
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleUrlAdd = async () => {
    if (!urlInput.trim()) return
    let name = urlInput
    try { name = new URL(urlInput).hostname } catch {}
    await createMutation.mutateAsync({
      project_id: project.id,
      file_name: name,
      file_url: urlInput,
      file_type: 'url',
    })
    setUrlInput('')
  }

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setGenerateError(null)
    setGenerateDone(false)
    try {
      await agentsService.runLibrarian(project.id)
      // Refresh project state
      await queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setGenerateDone(true)
      // Auto-navigate to Script stage after 1.5 seconds
      setTimeout(() => {
        onStageChange?.('script')
      }, 1500)
    } catch (e) {
      setGenerateError(e.message || 'Generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-white tracking-wide">Source Library</h2>
          <p className="text-xs text-slate-500 mt-0.5">{sources.length} file{sources.length !== 1 ? 's' : ''} added</p>
        </div>
        {sources.length > 0 && (
          <Button onClick={handleGenerate} disabled={generating}>
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing…</>
              : generateDone
              ? <><CheckCircle className="w-4 h-4" />Done! Going to Script…</>
              : <><Sparkles className="w-4 h-4" />Generate Journey</>}
          </Button>
        )}
      </div>

      {/* Error message */}
      {generateError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{generateError}</p>
        </div>
      )}

      {/* Success message */}
      {generateDone && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 mb-4">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-300">Learning Journey created! Moving to Script stage…</p>
        </div>
      )}

      {/* Upload area */}
      <div className="rounded-xl border border-white/[0.08] bg-slate-900/40 p-5 mb-5">
        <div className="flex gap-2 mb-4">
          {['file', 'url'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {t === 'file' ? 'Upload File' : 'Add URL'}
            </button>
          ))}
        </div>

        {tab === 'file' ? (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl p-8 cursor-pointer hover:border-indigo-500/50 transition-colors">
            {uploading
              ? <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-3" />
              : <Upload className="w-10 h-10 text-slate-600 mb-3" />}
            <p className="text-sm text-slate-400">{uploading ? 'Uploading…' : 'Click to upload'}</p>
            <p className="text-xs text-slate-600 mt-1">PDF, DOCX, XLSX, TXT · Max 50 MB</p>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.docx,.xlsx,.txt"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        ) : (
          <div className="flex gap-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/article"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleUrlAdd()}
            />
            <Button onClick={handleUrlAdd} disabled={!urlInput.trim() || createMutation.isPending} variant="secondary">
              <Link className="w-4 h-4" />
              Add
            </Button>
          </div>
        )}
      </div>

      {/* File list */}
      {sources.length > 0 && (
        <ul className="space-y-2">
          {sources.map((src) => {
            const Icon = TYPE_ICON[src.fileType] || DEFAULT_ICON
            const isDeleting = deleteMutation.isPending && deleteMutation.variables === src.id
            return (
              <li key={src.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/40 border border-white/[0.06] group transition-opacity ${isDeleting ? 'opacity-40' : ''}`}>
                <Icon className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{src.fileName}</p>
                  <p className="text-xs text-slate-600 capitalize">{src.fileType}</p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(src.id)}
                  disabled={isDeleting}
                  className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all disabled:cursor-not-allowed"
                >
                  {isDeleting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
