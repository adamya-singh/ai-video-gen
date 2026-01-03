'use client'

import Link from 'next/link'
import { Tables } from '@/types/database'
import { Film, MoreVertical, Trash2, Clock } from 'lucide-react'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface ProjectsListProps {
  projects: Tables<'projects'>[]
}

const STEP_NAMES = ['Topic', 'Script', 'Shot List', 'Visuals', 'Voice', 'Export']

function getStepProgress(step: number) {
  return Math.round((step / 6) * 100)
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ProjectsList({ projects }: ProjectsListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project, index) => (
        <ProjectCard key={project.id} project={project} index={index} />
      ))}
    </div>
  )
}

function ProjectCard({ project, index }: { project: Tables<'projects'>; index: number }) {
  const [showMenu, setShowMenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!confirm('Are you sure you want to delete this project?')) return
    
    setIsDeleting(true)
    await supabase.from('projects').delete().eq('id', project.id)
    router.refresh()
  }

  const currentStep = project.current_step || 1
  const progress = getStepProgress(currentStep)

  return (
    <Link
      href={`/project/${project.id}/topic`}
      className={`group relative block rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] p-5 hover:border-purple-500/50 transition-all duration-300 animate-slide-up opacity-0`}
      style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
    >
      {/* Thumbnail placeholder */}
      <div className="aspect-video rounded-lg bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] mb-4 flex items-center justify-center overflow-hidden">
        <Film className="w-10 h-10 text-gray-600" />
      </div>

      {/* Content */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-white group-hover:text-purple-400 transition-colors line-clamp-1">
            {project.title}
          </h3>
          <div className="relative">
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="p-1 rounded hover:bg-[rgb(30,30,36)] text-gray-500 hover:text-white"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] shadow-xl py-1 z-10">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-[rgb(30,30,36)] flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Step {currentStep}: {STEP_NAMES[currentStep - 1]}</span>
            <span className="text-purple-400">{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[rgb(30,30,36)] overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-purple-600 to-violet-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(project.updated_at || project.created_at || '')}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[rgb(30,30,36)] text-gray-400">
            {project.aspect_ratio}
          </span>
        </div>
      </div>
    </Link>
  )
}

