import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sourceFilesService } from '@/services/sourceFiles'
import { scriptsService } from '@/services/scripts'
import { projectsService } from '@/services/projects'
import { agentsService } from '@/services/agents'
import { uploadFile } from '@/services/upload'
import { Upload, Link, Trash2, FileText, Globe, Loader2, Sparkles, CheckCircle, AlertTriangle, Library, Eye, X, ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import StageHeader from '@/components/workspace/StageHeader'

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
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { id, fileName }

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['sourceFiles', project?.id],
    queryFn: () => sourceFilesService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn: () => scriptsService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const createMutation = useMutation({
    mutationFn: (data) => sourceFilesService.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sourceFiles', project.id] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      // Delete the source file
      await sourceFilesService.remove(id)
      
      // If no more sources, cascade delete scripts and related data
      const remainingSources = sources.filter(s => s.id !== id)
      if (remainingSources.length === 0) {
        // Delete all scripts for this project
        const scripts = await scriptsService.listByProject(project.id)
        for (const script of scripts) {
          await scriptsService.remove(script.id)
        }
        
        // Reset project status to draft and clear all voice/avatar settings
        await projectsService.update(project.id, { 
          status: 'draft',
          defaultVoiceId: null,
          defaultAvatarId: null,
        })
      }
    },
    onSuccess: () => {
      // Refresh all related queries
      queryClient.invalidateQueries({ queryKey: ['sourceFiles', project.id] })
      queryClient.invalidateQueries({ queryKey: ['scripts', project.id] })
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      setDeleteConfirm(null)
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
      // Step 1: Run Librarian to create modules
      await agentsService.runLibrarian(project.id)
      
      // Step 2: Immediately run ScriptGenerator to create scripts
      await agentsService.runScriptGenerator(project.id, undefined)
      
      // Step 3: Refresh all queries to get the newly created scripts
      await queryClient.invalidateQueries({ 
        queryKey: ['project', project.id],
        refetchType: 'all',
      })
      await queryClient.invalidateQueries({ 
        queryKey: ['scripts', project.id],
        refetchType: 'all',
      })
      
      setGenerateDone(true)
      // Auto-navigate to Script stage after 1.5 seconds
      setTimeout(() => {
        onStageChange?.('scripts')
      }, 1500)
    } catch (e) {
      setGenerateError(e.message || 'Generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>

  // Library is complete when sources are uploaded AND scripts are generated
  const libraryComplete = sources.length > 0 && scripts.length > 0

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <StageHeader
        icon={Library}
        title="1. Library"
        subtitle="Upload sources • Generate Journey • Continue"
        complete={libraryComplete}
        onContinue={() => onStageChange?.('scripts')}
        continueLabel="Continue to Scripts"
      />

      {/* Error message */}
      {generateError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{generateError}</p>
        </div>
      )}

      {/* Success message */}
      {generateDone && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 mb-4">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-700 dark:text-green-300">Learning Journey created! Moving to Script stage…</p>
        </div>
      )}

      {/* Two-column layout — the panel used to be capped at max-w-2xl, leaving
          the whole right half of the screen empty. Add sources on the LEFT,
          the growing source list on the RIGHT, so the width is actually used. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5 items-start">

        {/* LEFT: add a source */}
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-slate-900/40 p-5 lg:sticky lg:top-6">
          <div className="flex gap-2 mb-4">
            {['file', 'url'].map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                {t === 'file' ? 'Upload File' : 'Add URL'}
              </button>
            ))}
          </div>

          {tab === 'file' ? (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 cursor-pointer hover:border-indigo-500/50 transition-colors">
              {uploading
                ? <Loader2 className="w-10 h-10 text-indigo-500 dark:text-indigo-400 animate-spin mb-3" />
                : <Upload className="w-10 h-10 text-slate-400 dark:text-slate-600 mb-3" />}
              <p className="text-sm text-slate-500 dark:text-slate-400">{uploading ? 'Uploading…' : 'Click to upload'}</p>
              <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">PDF, DOCX, XLSX, TXT · Max 50 MB</p>
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

          {/* Generate Journey — the primary action, given room on the left card */}
          <Button
            onClick={handleGenerate}
            disabled={generating || sources.length === 0}
            className="w-full gap-2 mt-4 justify-center"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing…</>
              : <><Sparkles className="w-4 h-4" />Generate Journey</>}
          </Button>
          {sources.length === 0 && (
            <p className="text-[11px] text-slate-400 dark:text-slate-600 text-center mt-2">
              Add at least one source to generate.
            </p>
          )}
        </div>

        {/* RIGHT: the sources you've added */}
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-slate-900/40 p-5 min-h-[16rem]">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Sources</p>
            <span className="text-xs text-slate-400 dark:text-slate-600 tabular-nums">
              {sources.length} {sources.length === 1 ? 'file' : 'files'}
            </span>
          </div>

          {sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-14 text-slate-400 dark:text-slate-600">
              <Library className="w-9 h-9 mb-3 opacity-40" />
              <p className="text-sm">No sources yet</p>
              <p className="text-xs mt-1">Upload a file or add a URL to get started.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sources.map((src) => {
                const Icon = TYPE_ICON[src.fileType] || DEFAULT_ICON
                const isDeleting = deleteMutation.isPending && deleteMutation.variables === src.id
                return (
                  <li key={src.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/[0.06] group transition-opacity ${isDeleting ? 'opacity-40' : ''}`}>
                    <Icon className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 dark:text-white truncate">{src.fileName}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-600 capitalize">{src.fileType}</p>
                    </div>
                    <button
                      onClick={() => setDeleteConfirm({ id: src.id, fileName: src.fileName })}
                      disabled={isDeleting}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-600 hover:text-red-400 transition-all disabled:cursor-not-allowed flex-shrink-0"
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
      </div>

      {/* Step Progression Navigation */}
      <div className="mt-5 p-4 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="font-medium">1. Library</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="text-slate-400 dark:text-slate-500">2. Scripts</span>
          </div>
          <button
            onClick={() => onStageChange?.('scripts')}
            disabled={sources.length === 0 || generating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-400 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0"
          >
            Continue
            <span className="text-base">→</span>
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete File?</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Deleting <strong>{deleteConfirm.fileName}</strong> will remove all scripts and related work from this project.
                  </p>
                </div>
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-6">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  ⚠️ <strong>This action is irreversible.</strong> All work from Steps 2+ will be deleted.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-red-400 text-white font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
