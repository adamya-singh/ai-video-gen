'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Select, SelectOption } from '@/components/ui/select'
import { X, Sparkles, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProjectSettings {
  llm_model?: string
  [key: string]: unknown
}

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  currentSettings: ProjectSettings | null
  onSettingsUpdate: (settings: ProjectSettings) => void
}

const LLM_OPTIONS: SelectOption[] = [
  { 
    value: 'claude-sonnet-4-5', 
    label: 'Claude Sonnet 4.5',
    description: 'Anthropic\'s latest model for coding and agents'
  },
  { 
    value: 'gpt-4-turbo', 
    label: 'GPT-4 Turbo',
    description: 'OpenAI\'s GPT-4 model with improved performance'
  },
]

export function SettingsModal({ 
  isOpen, 
  onClose, 
  projectId, 
  currentSettings,
  onSettingsUpdate 
}: SettingsModalProps) {
  const [selectedModel, setSelectedModel] = useState<string>(
    currentSettings?.llm_model || 'claude-sonnet-4-5'
  )
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()

  // Update local state when currentSettings changes
  useEffect(() => {
    if (currentSettings?.llm_model) {
      setSelectedModel(currentSettings.llm_model)
    }
  }, [currentSettings])

  const handleSave = async () => {
    setIsSaving(true)
    
    const newSettings: ProjectSettings = {
      ...currentSettings,
      llm_model: selectedModel,
    }

    const { error } = await supabase
      .from('projects')
      .update({ settings: newSettings })
      .eq('id', projectId)

    if (!error) {
      onSettingsUpdate(newSettings)
      onClose()
    }
    
    setIsSaving(false)
  }

  const selectedModelInfo = LLM_OPTIONS.find(o => o.value === selectedModel)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-[rgb(14,14,18)] border border-[rgb(45,45,55)] rounded-2xl shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[rgb(45,45,55)]">
          <h2 className="text-lg font-semibold text-white">Project Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgb(30,30,36)] text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* LLM Model Selection */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <Bot className="w-4 h-4 text-purple-400" />
              AI Model for Text Generation
            </label>
            <Select
              options={LLM_OPTIONS}
              value={selectedModel}
              onChange={setSelectedModel}
            />
            {selectedModelInfo?.description && (
              <p className="text-xs text-gray-500 pl-1">
                {selectedModelInfo.description}
              </p>
            )}
          </div>

          {/* Model Indicator */}
          <div className={cn(
            'p-4 rounded-xl border',
            selectedModel === 'claude-sonnet-4-5' 
              ? 'bg-orange-500/5 border-orange-500/20' 
              : 'bg-green-500/5 border-green-500/20'
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                selectedModel === 'claude-sonnet-4-5' 
                  ? 'bg-orange-500/20' 
                  : 'bg-green-500/20'
              )}>
                <Sparkles className={cn(
                  'w-5 h-5',
                  selectedModel === 'claude-sonnet-4-5' 
                    ? 'text-orange-400' 
                    : 'text-green-400'
                )} />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {selectedModelInfo?.label}
                </p>
                <p className="text-xs text-gray-500">
                  Will be used for Topic, Script, and Shot List generation
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[rgb(45,45,55)]">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={isSaving}>
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  )
}

