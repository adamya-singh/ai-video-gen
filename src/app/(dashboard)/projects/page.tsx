import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProjectsList } from '@/components/projects/projects-list'
import { CreateProjectButton } from '@/components/projects/create-project-button'
import { UserMenu } from '@/components/layout/user-menu'
import { Film, Plus } from 'lucide-react'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false })

  return (
    <div className="min-h-screen bg-[rgb(10,10,12)]">
      {/* Header */}
      <header className="border-b border-[rgb(45,45,55)] bg-[rgb(18,18,22)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-600 to-violet-600 flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-white">AI Video Generator</span>
          </div>
          <UserMenu user={user} />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Your Projects</h1>
            <p className="text-gray-400 mt-1">Create and manage your documentary videos</p>
          </div>
          <CreateProjectButton />
        </div>

        {projects && projects.length > 0 ? (
          <ProjectsList projects={projects} />
        ) : (
          <div className="text-center py-24">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[rgb(30,30,36)] mb-6">
              <Film className="w-10 h-10 text-gray-500" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">No projects yet</h2>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              Create your first documentary video project and start generating content with AI.
            </p>
            <CreateProjectButton />
          </div>
        )}
      </main>
    </div>
  )
}

