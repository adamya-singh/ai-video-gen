'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { LogOut, User as UserIcon, Settings } from 'lucide-react'

interface UserMenuProps {
  user: User
}

export function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = user.email?.slice(0, 2).toUpperCase() || 'U'

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-violet-600 flex items-center justify-center text-sm font-medium text-white hover:opacity-90 transition-opacity"
      >
        {initials}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] shadow-xl py-2 animate-fade-in">
          <div className="px-4 py-3 border-b border-[rgb(45,45,55)]">
            <p className="text-sm text-white font-medium truncate">{user.email}</p>
            <p className="text-xs text-gray-500">Free Plan</p>
          </div>
          
          <div className="py-1">
            <button
              onClick={() => {}}
              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[rgb(30,30,36)] flex items-center gap-3"
            >
              <UserIcon className="w-4 h-4" />
              Profile
            </button>
            <button
              onClick={() => {}}
              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[rgb(30,30,36)] flex items-center gap-3"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>

          <div className="border-t border-[rgb(45,45,55)] py-1">
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-[rgb(30,30,36)] flex items-center gap-3"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

