'use client'

import { Button } from '@/components/ui/button'
import { RefreshCw, Check, ArrowRight } from 'lucide-react'

interface ApprovalGateProps {
  onRegenerate: () => void
  onApprove: () => void
  isRegenerating?: boolean
  isApproving?: boolean
  canApprove?: boolean
  regenerateLabel?: string
  approveLabel?: string
}

export function ApprovalGate({
  onRegenerate,
  onApprove,
  isRegenerating = false,
  isApproving = false,
  canApprove = true,
  regenerateLabel = 'Regenerate',
  approveLabel = 'Approve & Continue',
}: ApprovalGateProps) {
  return (
    <div className="flex items-center justify-between p-4 border-t border-[rgb(45,45,55)] bg-[rgb(14,14,18)]">
      <Button
        variant="secondary"
        onClick={onRegenerate}
        isLoading={isRegenerating}
        disabled={isApproving}
      >
        <RefreshCw className="w-4 h-4 mr-2" />
        {regenerateLabel}
      </Button>

      <Button
        onClick={onApprove}
        isLoading={isApproving}
        disabled={!canApprove || isRegenerating}
      >
        <Check className="w-4 h-4 mr-2" />
        {approveLabel}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  )
}

