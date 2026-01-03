'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, X, Monitor, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CreateProjectButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Please enter a project title')
      return
    }

    setIsCreating(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be logged in')
      setIsCreating(false)
      return
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        title: title.trim(),
        aspect_ratio: aspectRatio,
        user_id: user.id,
        status: 'draft',
        current_step: 1,
        settings: {
          llm_model: 'gpt-4-turbo',
        },
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      setIsCreating(false)
    } else if (data) {
      router.push(`/project/${data.id}/topic`)
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        New Project
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative w-full max-w-lg rounded-2xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] p-6 shadow-2xl animate-slide-up">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 p-2 rounded-lg hover:bg-[rgb(30,30,36)] text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-semibold text-white mb-6">Create New Project</h2>

            <form onSubmit={handleCreate} className="space-y-6">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Project Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., The Mystery of Dark Matter"
                  autoFocus
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-300">Aspect Ratio</label>
                <p className="text-xs text-gray-500">This cannot be changed after creation</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAspectRatio('16:9')}
                    className={cn(
                      'p-4 rounded-xl border-2 transition-all duration-200 text-left',
                      aspectRatio === '16:9'
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-[rgb(45,45,55)] hover:border-gray-600'
                    )}
                  >
                    <Monitor className={cn(
                      'w-8 h-8 mb-2',
                      aspectRatio === '16:9' ? 'text-purple-400' : 'text-gray-500'
                    )} />
                    <p className="font-medium text-white">Landscape</p>
                    <p className="text-xs text-gray-500">16:9 • YouTube</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatio('9:16')}
                    className={cn(
                      'p-4 rounded-xl border-2 transition-all duration-200 text-left',
                      aspectRatio === '9:16'
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-[rgb(45,45,55)] hover:border-gray-600'
                    )}
                  >
                    <Smartphone className={cn(
                      'w-8 h-8 mb-2',
                      aspectRatio === '9:16' ? 'text-purple-400' : 'text-gray-500'
                    )} />
                    <p className="font-medium text-white">Portrait</p>
                    <p className="text-xs text-gray-500">9:16 • Shorts/TikTok</p>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isCreating}>
                  Create Project
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

