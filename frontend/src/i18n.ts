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

export const commonUi = {
  fr: {
    add: 'Ajouter',
    cancel: 'Annuler',
    close: 'Fermer',
    copy: 'Copier',
    copied: 'Copié',
    delete: 'Supprimer',
    edit: 'Modifier',
    loading: 'Chargement…',
    save: 'Enregistrer',
    saved: 'Enregistré',
    saving: 'Enregistrement…',
    search: 'Rechercher',
    update: 'Mettre à jour',
    refresh: 'Actualiser',
    check: 'Vérifier',
    status: 'Statut',
    installed: 'Installé',
    missing: 'Absent',
    running: 'En cours',
    done: 'Terminé',
    error: 'Erreur',
    default: 'défaut',
    recommended: 'Recommandé',
    profile: 'Profil',
    project: 'Projet',
    projects: 'Projets',
    source: 'Source',
    sources: 'Sources',
    settings: 'Paramètres',
    version: 'Version',
    model: 'Modèle',
    provider: 'Fournisseur',
    environment: 'Environnement',
    company: 'Société',
    context: 'Contexte',
    language: 'Langue',
    yes: 'Oui',
    no: 'Non',
  },
  en: {
    add: 'Add',
    cancel: 'Cancel',
    close: 'Close',
    copy: 'Copy',
    copied: 'Copied',
    delete: 'Delete',
    edit: 'Edit',
    loading: 'Loading…',
    save: 'Save',
    saved: 'Saved',
    saving: 'Saving…',
    search: 'Search',
    update: 'Update',
    refresh: 'Refresh',
    check: 'Check',
    status: 'Status',
    installed: 'Installed',
    missing: 'Missing',
    running: 'Running',
    done: 'Done',
    error: 'Error',
    default: 'default',
    recommended: 'Recommended',
    profile: 'Profile',
    project: 'Project',
    projects: 'Projects',
    source: 'Source',
    sources: 'Sources',
    settings: 'Settings',
    version: 'Version',
    model: 'Model',
    provider: 'Provider',
    environment: 'Environment',
    company: 'Company',
    context: 'Context',
    language: 'Language',
    yes: 'Yes',
    no: 'No',
  },
} as const

export function useCommonUi() {
  return commonUi[useUiLanguage()]
}
