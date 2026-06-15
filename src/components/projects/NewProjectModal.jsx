import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { projectsService } from '@/services/projects'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function NewProjectModal({ open, onClose, onCreated }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')

  const mutation = useMutation({
    mutationFn: () => projectsService.create({ title: title.trim() }),
    onSuccess: (project) => {
      onCreated?.()
      onClose()
      setTitle('')
      navigate(`/workspace?project_id=${project.id}`)
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (title.trim()) mutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Learning Journey">
      <p className="text-sm text-slate-400 mb-5 -mt-2">
        Give your project a name. You'll upload source materials next.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 tracking-wide">Project Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Onboarding for New Sales Reps"
            autoFocus
            required
          />
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" type="button" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim() || mutation.isPending} className="flex-1">
            {mutation.isPending ? 'Creating…' : 'Create & Open'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
