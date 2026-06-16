import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sourceFilesService } from '@/services/sourceFiles'
import { agentsService } from '@/services/agents'
import { uploadFile } from '@/services/upload'
import {
  Upload, Link, Trash2, FileText, Globe, Loader2, Sparkles,
  CheckCircle, AlertTriangle, Eye, Video, ExternalLink
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'avi']
const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'txt']
const ACCEPTED_EXTENSIONS = [...DOCUMENT_EXTENSIONS, ...VIDEO_EXTENSIONS]
const FILE_ACCEPT = ACCEPTED_EXTENSIONS.map(ext => `.${ext}`).join(',')

const TYPE_ICON = {
  pdf: FileText,
  docx: FileText,
  xlsx: FileText,
  txt: FileText,
  url: Globe,
  video: Video,
}
const DEFAULT_ICON = FileText

function getSourceType(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  if (DOCUMENT_EXTENSIONS.includes(ext)) return ext
  return 'other'
}

function canPreview(source) {
  return ['pdf', 'url', 'video'].includes(source.fileType)
}

function SourcePreview({ source }) {
  if (!source) return null

  if (source.fileType === 'pdf') {
    return (
      <iframe
        title={source.fileName}
        src={source.fileUrl}
        className="h-[70vh] w-full rounded-xl border border-white/[0.08] bg-slate-950"
      />
    )
  }

  if (source.fileType === 'video') {
    return (
      <video
        src={source.fileUrl}
        controls
        className="max-h-[70vh] w-full rounded-xl border border-white/[0.08] bg-black"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/[0.08] bg-slate-950 p-4">
        <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">URL</p>
        <a
          href={source.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-indigo-300 hover:text-indigo-200 break-all"
        >
          {source.fileUrl}
        </a>
      </div>
      <a
        href={source.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium tracking-wide text-slate-200 border border-white/10 hover:bg-slate-700 transition-all"
      >
        <ExternalLink className="w-4 h-4" />
        Open URL
      </a>
    </div>
  )
}

export default function SourcesPanel({ project, onStageChange }) {
  const queryClient = useQueryClient()
  const [urlInput, setUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [generateDone, setGenerateDone] = useState(false)
  const [tab, setTab] = useState('file')
  const [previewSource, setPreviewSource] = useState(null)

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sourceFiles', project.id] }),
    onError: (err) => console.error('Delete failed:', err),
  })

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { file_url } = await uploadFile(file)
      await createMutation.mutateAsync({
        project_id: project.id,
        file_name: file.name,
        file_url,
        file_type: getSourceType(file.name),
        file_size: file.size,
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
    const trimmedUrl = urlInput.trim()
    let name = trimmedUrl
    try { name = new URL(trimmedUrl).hostname } catch {}
    await createMutation.mutateAsync({
      project_id: project.id,
      file_name: name,
      file_url: trimmedUrl,
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
      await queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setGenerateDone(true)
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
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-medium text-white tracking-wide">Source Library</h2>
          <p className="text-xs text-slate-500 mt-0.5">{sources.length} file{sources.length !== 1 ? 's' : ''} added</p>
        </div>
        {sources.length > 0 && (
          <Button onClick={handleGenerate} disabled={generating}>
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</>
              : generateDone
              ? <><CheckCircle className="w-4 h-4" />Done! Going to Script...</>
              : <><Sparkles className="w-4 h-4" />Generate Journey</>}
          </Button>
        )}
      </div>

      {generateError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{generateError}</p>
        </div>
      )}

      {generateDone && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 mb-4">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-300">Learning Journey created! Moving to Script stage...</p>
        </div>
      )}

      <div className="rounded-xl border border-white/[0.08] bg-slate-900/40 p-5 mb-5">
        <div className="flex gap-2 mb-4">
          {['file', 'url'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {t === 'file' ? 'Upload File' : 'Add URL'}
            </button>
          ))}
        </div>

        {tab === 'file' ? (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl p-8 cursor-pointer hover:border-indigo-500/50 transition-colors">
            {uploading
              ? <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-3" />
              : <Upload className="w-10 h-10 text-slate-600 mb-3" />}
            <p className="text-sm text-slate-400">{uploading ? 'Uploading...' : 'Click to upload'}</p>
            <p className="text-xs text-slate-600 mt-1">PDF, DOCX, XLSX, TXT, MP4, MOV, WEBM / Max 200 MB</p>
            <input
              type="file"
              className="hidden"
              accept={FILE_ACCEPT}
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        ) : (
          <div className="space-y-3"