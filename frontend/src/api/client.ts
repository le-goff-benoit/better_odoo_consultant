import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

// Health
export const health = () => api.get('/health')

// App updates
export const getUpdateStatus = () => api.get('/update/status')
export const applyUpdate = () => api.post('/update/apply')

// Sources
export const listVersions = () => api.get('/sources/versions')
export const listSshKeys = () => api.get('/sources/ssh-keys')
export const testGithubSsh = () => api.get('/sources/test-github-ssh')
export const generateSshKey = () => api.post('/sources/generate-ssh-key')
export const syncSource = (data: object) => api.post('/sources/sync', data)
export const getGitStatus = (path: string) => api.get(`/sources/status?path=${encodeURIComponent(path)}`)
export const checkAllSources = () => api.get('/sources/check-all')
export const checkSingleVersion = (version: string) => api.get(`/sources/check/${version}`)
export const checkSourceUpdates = (version: string, path?: string) =>
  api.get(`/sources/check-updates/${version}${path ? `?path=${encodeURIComponent(path)}` : ''}`)
export const getCommitsSince = (path: string, days = 30) =>
  api.get(`/sources/commits-since?path=${encodeURIComponent(path)}&days=${days}`)

// Profiles
export const listProfiles = () => api.get('/profiles/')
export const createProfile = (data: object) => api.post('/profiles/', data)
export const updateProfile = (id: number, data: object) => api.patch(`/profiles/${id}`, data)
export const deleteProfile = (id: number) => api.delete(`/profiles/${id}`)
export const testProfile = (id: number) => api.post(`/profiles/${id}/test`)
export const getProfileApps = (id: number) => api.get(`/profiles/${id}/apps`)
export const diagnoseOdoo = (data: object) => api.post('/profiles/diagnose', data)
export const checkAccessRaw = (data: object) => api.post('/profiles/check-access-raw', data)
export const checkAccessProfile = (id: number) => api.post(`/profiles/${id}/check-access`)
export const refreshProfileLocalization = (id: number) => api.post(`/profiles/${id}/localization/refresh`)
export const refreshProfileComplexity = (id: number) => api.post(`/profiles/${id}/technical-complexity/refresh`)
export const getProfileContext = (id: number) => api.get(`/profiles/${id}/context`)
export const saveProfileContext = (id: number, content: string) => api.put(`/profiles/${id}/context`, { content })
export const autoFillContext = (id: number) => api.post(`/profiles/${id}/context/auto-fill`)

// Environments
export const addProfileEnv     = (id: number, data: object) => api.post(`/profiles/${id}/environments`, data)
export const updateProfileEnv  = (id: number, envId: string, data: object) => api.patch(`/profiles/${id}/environments/${envId}`, data)
export const deleteProfileEnv  = (id: number, envId: string) => api.delete(`/profiles/${id}/environments/${envId}`)
export const activateProfileEnv = (id: number, envId: string) => api.post(`/profiles/${id}/environments/${envId}/activate`)
export const testProfileEnv    = (id: number, envId: string) => api.post(`/profiles/${id}/environments/${envId}/test`)
export const getEnvRepoStatus  = (id: number, envId: string) => api.get(`/profiles/${id}/environments/${envId}/repo`)
export const syncEnvRepoUrl    = (id: number, envId: string) => `/api/profiles/${id}/environments/${envId}/repo/sync`
export const openProfileWorkspace = (id: number, envId?: string | null) => api.post(`/profiles/${id}/vscode`, { env_id: envId ?? undefined })

// Projects
export const listProjects = () => api.get('/projects/')
export const createProject = (data: object) => api.post('/projects/', data)
export const cloneProject = (id: number) => api.post(`/projects/${id}/clone`)
export const pullProject = (id: number) => api.post(`/projects/${id}/pull`)
export const listBranches = (id: number) => api.get(`/projects/${id}/branches`)
export const openProjectPath = (id: number) => api.post(`/projects/${id}/open`)

// Queries
export const searchRecords = (data: object) => api.post('/queries/search', data)
export const getFields = (profileId: number, model: string) => api.get(`/queries/fields?profile_id=${profileId}&model=${model}`)
export const getModules = (profileId: number) => api.get(`/queries/modules?profile_id=${profileId}`)

// History
export const listHistory = (limit = 50) => api.get(`/history/?limit=${limit}`)
export const deleteHistory = (id: number) => api.delete(`/history/${id}`)

// AI assistant
export const getAiProviders = () => api.get('/ai/providers')
export const saveAiKey = (provider: string, key: string) => api.post('/ai/key', { provider, key })
export const deleteAiKey = (provider: string) => api.delete(`/ai/key/${provider}`)
export const testAiKey = (provider: string) => api.post('/ai/test-key', { provider })
export const copilotLogin = () => api.post('/ai/copilot/login')
export const copilotPoll = (device_code: string) => api.post('/ai/copilot/poll', { device_code })
export const getModelConfig = () => api.get('/ai/model-config')
export const saveModelConfig = (config: Record<string, string[]>) => api.post('/ai/model-config', config)

// Context files
export const listContextFiles = (locale = 'fr') => api.get(`/context/?locale=${encodeURIComponent(locale)}`)
export const getContextFile = (name: string, locale = 'fr') => api.get(`/context/file/${name}?locale=${encodeURIComponent(locale)}`)
export const saveContextFile = (name: string, content: string, locale = 'fr') => api.put(`/context/file/${name}?locale=${encodeURIComponent(locale)}`, { content })
export const deleteContextFile = (name: string, locale = 'fr') => api.delete(`/context/file/${name}?locale=${encodeURIComponent(locale)}`)

// Creator
export const getCreatorProjects = () => api.get('/creator/projects')
export const dryRunCreatorChangeset = (data: object) => api.post('/creator/dry-run', data)
export const previewCreatorOperation = (data: object) => api.post('/creator/preview', data)
export const applyCreatorChangeset = (data: object) => api.post('/creator/apply', data)
export const rejectCreatorRequest = (data: object) => api.post('/creator/reject', data)
export const documentCreatorChange = (data: object) => api.post('/creator/document', data)
export const getCreatorHistory = (limit = 50) => api.get(`/creator/history?limit=${limit}`)
export const getCreatorHistoryEntry = (id: number) => api.get(`/creator/history/${id}`)

// User profile / settings
export const getUserProfile = () => api.get('/settings/user-profile')
export const saveUserProfile = (data: object) => api.post('/settings/user-profile', data)
export const getDataDir = () => api.get('/settings/data-dir')
export const openDataFolder = () => api.post('/settings/open-folder')
