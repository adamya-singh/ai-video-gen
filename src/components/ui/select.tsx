'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  description?: string
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, value, onChange, placeholder, disabled, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className={cn(
            'w-full appearance-none px-4 py-2.5 pr-10 rounded-lg',
            'bg-[rgb(18,18,22)] border border-[rgb(45,45,55)]',
            'text-white text-sm font-medium',
            'focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500',
            'hover:border-gray-600 transition-colors duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'cursor-pointer',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown 
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none',
            disabled && 'opacity-50'
          )} 
        />
      </div>
    )
  }
)

Select.displayName = 'Select'

export { Select }

