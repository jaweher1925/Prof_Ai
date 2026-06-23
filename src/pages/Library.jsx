import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsService } from '@/services/projects'
import { sourceFilesService } from '@/services/sourceFiles'
import { uploadFile } from '@/services/upload'
import {
  BookOpen, FileText, Globe, FileSpreadsheet, Upload,
  Trash2, Loader2, Search, FolderOpen, Link, Eye
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { useNavigate } from 'react-router-dom'

const TYPE_CONFIG = {
  pdf:   { icon: FileText,        color: 'text-rose-500 dark:text-rose-400',    badge: 'red',     label: 'PDF' },
  docx:  { icon: FileText,        color: 'text-blue-600 dark:text-blue-400',    badge: 'blue',    label: 'DOCX' },
  xlsx:  { icon: FileSpreadsheet, color: 'text-emerald-500 dark:text-emerald-400', badge: 'green', label: 'XLSX' },
  txt:   { icon: FileText,        color: 'text-slate-400 dark:text-slate-500',  badge: 'default', label: 'TXT' },
  url:   { icon: Globe,           color: 'text-blue-600 dark:text-blue-400',    badge: 'indigo',  label: 'URL' },
  other: { icon: FileText,        color: 'text-slate-400 dark:text-slate-500',  badge: 'default', label: 'File' },
}

function formatSize(bytes) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ProjectSection({ project, onDeleted }) {
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['sourceFiles', project.id],
    queryFn: () => sourceFilesService.listByProject(project.id),
  })

  const createMutation = useMutation({
    mutationFn: (data) => sourceFilesService.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sourceFiles', project.id] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => sourceFilesService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourceFiles', project.id] })
      onDeleted?.()
    },
  })

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { file_url } = await uploadFile(file)
      const ext = file.name.split('.').pop()?.toLowerCase()
      await createMutation.mutateAsync({
        project_id: project.id,
        file_name: file.name,
        file_url,
        file_type: ['pdf','docx','xlsx','txt'].includes(ext) ? ext : 'other',
        file_size: file.size,
      })
      e.target.value = ''
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleAddUrl = async () => {
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
    setShowUrlInput(false)
  }

  return (
    <div className="mb-8">
      {/* Project header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-medium text-slate-900 dark:text-white tracking-wide">{project.title}</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">({sources.length} file{sources.length !== 1 ? 's' : ''})</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowUrlInput(v => !v)}
            className="text-xs"
          >
            <Link className="w-3.5 h-3.5" />
            Add URL
          </Button>
          <label className="cursor-pointer">
            <Button size="sm" variant="secondary" as="span" disabled={uploading}>
              {uploading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.docx,.xlsx,.txt"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* URL input */}
      {showUrlInput && (
        <div className="flex gap-2 mb-3">
          <Input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://example.com/article"
            onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
            className="flex-1"
            autoFocus
          />
          <Button size="sm" onClick={handleAddUrl} disabled={!urlInput.trim()}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowUrlInput(false); setUrlInput('') }}>Cancel</Button>
        </div>
      )}

      {/* File list */}
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner size="sm" /></div>
      ) : sources.length === 0 ? (
        <div className="flex items-center justify-center py-6 rounded-xl border border-dashed border-blue-200 dark:border-white/10 bg-blue-50/30 dark:bg-transparent text-slate-400 dark:text-slate-500 text-sm">
          No files yet — upload a PDF, DOCX, or add a URL
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map(src => {
            const cfg = TYPE_CONFIG[src.fileType] || TYPE_CONFIG.other
            const Icon = cfg.icon
            const size = formatSize(src.fileSize)
            return (
              <div
                key={src.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-br from-blue-50/70 to-sky-50/40 dark:bg-white/5 dark:from-transparent dark:to-transparent border border-blue-100/70 dark:border-white/10 group hover:border-blue-200 dark:hover:border-white/20 hover:shadow-sm transition-all"
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 dark:text-white truncate">{src.fileName}</p>
                  {src.fileType === 'url' && (
                    <a
                      href={src.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block"
                    >
                      {src.fileUrl}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {size && <span className="text-xs text-slate-400 dark:text-slate-500">{size}</span>}
                  <Badge variant={cfg.badge}>{cfg.label}</Badge>
                  {src.fileUrl && src.fileType !== 'url' && (
                    <a
                      href={src.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View file"
                      className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(src.id)}
                    disabled={deleteMutation.isPending}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition-all"
                  >
                    {deleteMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Library() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsService.list,
    retry: false,
  })
  const projects = Array.isArray(data) ? data : []

  const filtered = projects.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h1 className="text-2xl font-light text-slate-900 dark:text-white tracking-wide">Library</h1>
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
        All source files across your projects. Upload PDFs, docs, or web URLs to feed the AI agents.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400 mb-4">No projects yet. Create one first.</p>
            <Button onClick={() => navigate('/')}>
              Go to Projects
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {projects.length > 3 && (
            <div className="relative mb-6 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter by project name…"
                className="pl-9"
              />
            </div>
          )}

          {filtered.map(project => (
            <ProjectSection
              key={project.id}
              project={project}
              onDeleted={() => queryClient.invalidateQueries({ queryKey: ['projects'] })}
            />
          ))}

          {filtered.length === 0 && search && (
            <p className="text-slate-500 dark:text-slate-400 text-sm">No projects match "{search}"</p>
          )}
        </>
      )}
    </div>
  )
}
