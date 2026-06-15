import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsService } from '@/services/projects'
import { agentsService } from '@/services/agents'
import { Video, Sparkles, BookOpen, FileText, Palette, CheckCircle, AlertTriangle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { useNavigate } from 'react-router-dom'

export default function Director() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsService.list,
    retry: false,
  })
  const projects = Array.isArray(data) ? data : []

  const [selectedId, setSelectedId] = useState(null)
  const [runningAgent, setRunningAgent] = useState(null)
  const [agentError, setAgentError] = useState(null)
  const [agentSuccess, setAgentSuccess] = useState(null)

  const selected = projects.find(p => p.id === selectedId)

  const runAgent = async (agentName, fn) => {
    setRunningAgent(agentName)
    setAgentError(null)
    setAgentSuccess(null)
    try {
      await fn()
      setAgentSuccess(`${agentName} completed successfully!`)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    } catch (e) {
      setAgentError(e.message || `${agentName} failed`)
    } finally {
      setRunningAgent(null)
    }
  }

  const agents = [
    {
      id: 'librarian',
      name: 'The Librarian',
      icon: BookOpen,
      color: 'blue',
      description: 'Analyzes your source files and creates the Learning Journey module structure.',
      canRun: selected?.status === 'draft' || selected?.status === 'ingesting_sources',
      run: () => runAgent('The Librarian', () => agentsService.runLibrarian(selected.id)),
    },
    {
      id: 'scriptwriter',
      name: 'Script Generator',
      icon: FileText,
      color: 'indigo',
      description: 'Generates full scene-by-scene scripts from your approved modules.',
      canRun: selected?.status === 'journey_approved',
      run: () => runAgent('Script Generator', () => agentsService.runScriptGenerator(selected.id)),
    },
    {
      id: 'creative',
      name: 'Creative Duo',
      icon: Palette,
      color: 'green',
      description: 'Generates ElevenLabs voiceover audio and DALL-E visual assets for each scene.',
      canRun: false,
      comingSoon: true,
    },
    {
      id: 'editor',
      name: 'Final Editor',
      icon: Video,
      color: 'yellow',
      description: 'Triggers HeyGen to render final avatar videos for all approved scenes.',
      canRun: false,
      comingSoon: true,
    },
  ]

  const colorMap = {
    blue:   'bg-blue-500/10 text-blue-300 border-blue-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    green:  'bg-green-500/10 text-green-300 border-green-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Video className="w-5 h-5 text-indigo-400" />
        <h1 className="text-2xl font-light text-white tracking-wide">Director</h1>
      </div>
      <p className="text-slate-500 text-sm mb-8">
        Select a project and run AI agents to generate your learning content.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project selector */}
        <div className="lg:col-span-1">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Select Project</p>
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 text-sm mb-4">No projects yet.</p>
              <Button size="sm" onClick={() => navigate('/')}>Create one</Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {projects.map(p => (
                <li
                  key={p.id}
                  onClick={() => { setSelectedId(p.id); setAgentError(null); setAgentSuccess(null) }}
                  className={`flex items-center justify-between px-3 py-3 rounded-xl border cursor-pointer transition-all ${
                    selectedId === p.id
                      ? 'bg-indigo-600/20 border-indigo-500/30 text-white'
                      : 'bg-slate-900/40 border-white/[0.06] text-slate-400 hover:text-white hover:border-white/20'
                  }`}
                >
                  <span className="text-sm truncate">{p.title}</span>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Agent pipeline */}
        <div className="lg:col-span-2">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Agent Pipeline</p>

          {!selected ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Sparkles className="w-10 h-10 text-slate-700 mb-3" />
                <p className="text-slate-500 text-sm">Select a project to see the agent pipeline.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {agentError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">{agentError}</p>
                </div>
              )}
              {agentSuccess && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-300">{agentSuccess}</p>
                </div>
              )}

              {agents.map((agent, i) => {
                const Icon = agent.icon
                const isRunning = runningAgent === agent.name
                return (
                  <div key={agent.id} className={`p-4 rounded-xl border transition-all ${
                    isRunning
                      ? 'bg-indigo-500/10 border-indigo-500/30'
                      : 'bg-slate-900/40 border-white/[0.06]'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg border ${colorMap[agent.color]}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white">{agent.name}</p>
                            {agent.comingSoon && (
                              <Badge variant="default">Coming soon</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{agent.description}</p>
                        </div>
                      </div>

                      {!agent.comingSoon && (
                        <Button
                          size="sm"
                          disabled={!agent.canRun || !!runningAgent}
                          variant={agent.canRun ? 'primary' : 'secondary'}
                          onClick={agent.run}
                        >
                          {isRunning ? 'Running…' : 'Run'}
                        </Button>
                      )}
                    </div>

                    {i < agents.length - 1 && (
                      <div className="flex items-center gap-2 mt-3 ml-11 text-xs text-slate-600">
                        <CheckCircle className="w-3 h-3" />
                        <span>Human approval checkpoint</span>
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => navigate(`/workspace?project_id=${selected.id}`)}
                >
                  Open full workspace for "{selected.title}"
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
