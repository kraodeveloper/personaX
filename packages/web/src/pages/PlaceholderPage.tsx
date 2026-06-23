import React from 'react'
import { Construction } from 'lucide-react'

interface Props {
  name: string
  slice: number
}

/** 尚未实现的页面占位组件 (agentX light theme) */
const PlaceholderPage: React.FC<Props> = ({ name, slice }) => {
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center gap-4 select-none"
      style={{ background: '#f8f9fa' }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <Construction size={28} style={{ color: '#c9a227', opacity: 0.7 }} />
      </div>
      <div>
        <h2 className="font-semibold text-lg" style={{ color: '#111827' }}>{name}</h2>
        <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>即将到来 · Slice {slice}</p>
      </div>
    </div>
  )
}

export default PlaceholderPage
