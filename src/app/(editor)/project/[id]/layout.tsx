import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EditorSidebar } from '@/components/editor/editor-sidebar'
import { EditorHeader } from '@/components/editor/editor-header'

interface EditorLayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export default async function EditorLayout({ children, params }: EditorLayoutProps) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: project } = await supabase
    .from('projects')
    .select(`
      *,
      topics (*),
      scripts (*),
      shot_lists (*)
    `)
    .eq('id', id)
    .single()

  if (!project) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-[rgb(10,10,12)] flex">
      <EditorSidebar project={project} />
      <div className="flex-1 flex flex-col min-w-0">
        <EditorHeader project={project} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

