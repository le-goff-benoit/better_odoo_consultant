import { useQuery } from '@tanstack/react-query'
import { getUserProfile } from './api/client'

export type UiLanguage = 'fr' | 'en'

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return value === 'en' ? 'en' : 'fr'
}

export function useUiLanguage(): UiLanguage {
  const { data } = useQuery({ queryKey: ['user-profile'], queryFn: getUserProfile, staleTime: 60_000 })
  return normalizeUiLanguage(data?.data?.language)
}
