import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

// Health
export const health = () => api.get('/health')

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

// Profiles
export const listProfiles = () => api.get('/profiles/')
export const createProfile = (data: object) => api.post('/profiles/', data)
export const updateProfile = (id: number, data: object) => api.patch(`/profiles/${id}`, data)
export const deleteProfile = (id: number) => api.delete(`/profiles/${id}`)
export const testProfile = (id: number) => api.post(`/profiles/${id}/test`)
export const getProfileApps = (id: number) => api.get(`/profiles/${id}/apps`)
export const diagnoseOdoo = (data: object) => api.post('/profiles/diagnose', data)

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
export const listContextFiles = () => api.get('/context/')
export const getContextFile = (name: string) => api.get(`/context/file/${name}`)
export const saveContextFile = (name: string, content: string) => api.put(`/context/file/${name}`, { content })
export const deleteContextFile = (name: string) => api.delete(`/context/file/${name}`)
