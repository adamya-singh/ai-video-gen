'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tables } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { SettingsModal } from '@/components/editor/settings-modal'
import { Save, Settings, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface ProjectSettings {
  llm_model?: string
  [key: string]: unknown
}

interface EditorHeaderProps {
  project: Tables<'projects'>
}

export function EditorHeader({ project }: EditorHeaderProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [currentSettings, setCurrentSettings] = useState<ProjectSettings | null>(
    project.settings as ProjectSettings | null
  )
  const router = useRouter()
  const supabase = createClient()

  const handleSave = async () => {
    setIsSaving(true)
    // Trigger save across all components
    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', project.id)
    
    setLastSaved(new Date())
    setIsSaving(false)
  }

  const handleSettingsUpdate = (newSettings: ProjectSettings) => {
    setCurrentSettings(newSettings)
    // Refresh the page to ensure all components pick up the new settings
    router.refresh()
  }

  return (
    <>
      <header className="h-16 border-b border-[rgb(45,45,55)] bg-[rgb(14,14,18)] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Link 
            href="/projects"
            className="p-2 rounded-lg hover:bg-[rgb(30,30,36)] text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-white">{project.title}</h1>
            <p className="text-xs text-gray-500">
              {lastSaved 
                ? `Last saved ${lastSaved.toLocaleTimeString()}`
                : 'Not saved yet'
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Button size="sm" onClick={handleSave} isLoading={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </header>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        projectId={project.id}
        currentSettings={currentSettings}
        onSettingsUpdate={handleSettingsUpdate}
      />
    </>
  )
}
