'use client'

import { useMemo } from 'react'

export type EditorLanguage = 'zh-CN' | 'en'

function normalizeEditorLanguage(value: unknown): EditorLanguage {
  return typeof value === 'string' && value.toLowerCase().startsWith('en') ? 'en' : 'zh-CN'
}

function readEditorLanguage(): EditorLanguage {
  if (typeof window === 'undefined') {
    return 'zh-CN'
  }

  const params = new URLSearchParams(window.location.search)
  return normalizeEditorLanguage(params.get('lang'))
}

export function useEditorLanguage(): EditorLanguage {
  return useMemo(readEditorLanguage, [])
}
