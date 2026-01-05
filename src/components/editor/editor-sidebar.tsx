'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Tables } from '@/types/database'
import { cn } from '@/lib/utils'
import { 
  Lightbulb, 
  FileText, 
  LayoutGrid, 
  Image, 
  Mic, 
  Download,
  Check,
  Lock,
  Film
} from 'lucide-react'

interface Project extends Tables<'projects'> {
  topics: Tables<'topics'> | null
  scripts: Tables<'scripts'> | null
  shot_lists: Tables<'shot_lists'> | null
}

interface EditorSidebarProps {
  project: Project
}

const STEPS = [
  { number: 1, name: 'Topic', path: 'topic', icon: Lightbulb, description: 'Define your documentary topic' },
  { number: 2, name: 'Script', path: 'script', icon: FileText, description: 'Write the narration script' },
  { number: 3, name: 'Shot List', path: 'shot-list', icon: LayoutGrid, description: 'Plan visual scenes' },
  { number: 4, name: 'Visuals', path: 'visuals', icon: Image, description: 'Generate images & videos' },
  { number: 5, name: 'Voice', path: 'voice', icon: Mic, description: 'Generate voiceover' },
  { number: 6, name: 'Export', path: 'export', icon: Download, description: 'Assemble & download' },
]

function getStepStatus(project: Project, stepNumber: number): 'locked' | 'current' | 'completed' | 'available' {
  const currentStep = project.current_step || 1
  
  if (stepNumber < currentStep) return 'completed'
  if (stepNumber === currentStep) return 'current'
  if (stepNumber === currentStep + 1) return 'available'
  return 'locked'
}

export function EditorSidebar({ project }: EditorSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="w-72 border-r border-[rgb(45,45,55)] bg-[rgb(14,14,18)] flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-[rgb(45,45,55)]">
        <Link href="/projects" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-600 to-violet-600 flex items-center justify-center">
            <Film className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-white group-hover:text-purple-400 transition-colors">
            AI Video Gen
          </span>
        </Link>
      </div>

      {/* Steps */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {STEPS.map((step) => {
          const status = getStepStatus(project, step.number)
          const isActive = pathname?.includes(step.path)
          const isLocked = status === 'locked'
          const isCompleted = status === 'completed'
          const Icon = step.icon

          return (
            <Link
              key={step.path}
              href={isLocked ? '#' : `/project/${project.id}/${step.path}`}
              className={cn(
                'flex items-start gap-3 px-3 py-3 rounded-xl transition-all duration-200 group',
                isActive && 'bg-purple-500/10 border border-purple-500/30',
                !isActive && !isLocked && 'hover:bg-[rgb(30,30,36)]',
                isLocked && 'opacity-50 cursor-not-allowed'
              )}
              onClick={(e) => isLocked && e.preventDefault()}
            >
              {/* Step number / status */}
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium shrink-0 transition-colors',
                isActive && 'bg-purple-600 text-white',
                isCompleted && !isActive && 'bg-green-500/20 text-green-400',
                !isActive && !isCompleted && 'bg-[rgb(30,30,36)] text-gray-400'
              )}>
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : isLocked ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  step.number
                )}
              </div>

              {/* Step info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon className={cn(
                    'w-4 h-4 shrink-0',
                    isActive ? 'text-purple-400' : 'text-gray-500'
                  )} />
                  <span className={cn(
                    'font-medium truncate',
                    isActive ? 'text-white' : 'text-gray-300'
                  )}>
                    {step.name}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {step.description}
                </p>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Project info */}
      <div className="p-4 border-t border-[rgb(45,45,55)]">
        <div className="px-3 py-3 rounded-xl bg-[rgb(18,18,22)]">
          <p className="text-xs text-gray-500 mb-1">Current Project</p>
          <p className="text-sm font-medium text-white truncate">{project.title}</p>
          <p className="text-xs text-gray-500 mt-1">{project.aspect_ratio}</p>
        </div>
      </div>
    </aside>
  )
}

