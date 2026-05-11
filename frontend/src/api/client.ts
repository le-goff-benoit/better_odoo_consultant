import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

export const health = () => api.get('/health')
export const listProfiles = () => api.get('/profiles/')
export const createProfile = (data: object) => api.post('/profiles/', data)
export const deleteProfile = (id: number) => api.delete(`/profiles/${id}`)
export const testProfile = (id: number) => api.post(`/profiles/${id}/test`)
export const listProjects = () => api.get('/projects/')
export const createProject = (data: object) => api.post('/projects/', data)
export const cloneProject = (id: number) => api.post(`/projects/${id}/clone`)
export const pullProject = (id: number) => api.post(`/projects/${id}/pull`)
export const listBranches = (id: number) => api.get(`/projects/${id}/branches`)
export const searchRecords = (data: object) => api.post('/queries/search', data)
export const getFields = (profileId: number, model: string) => api.get(`/queries/fields?profile_id=${profileId}&model=${model}`)
export const listHistory = (limit = 50) => api.get(`/history/?limit=${limit}`)
export const syncSource = (data: object) => api.post('/sources/sync', data)
export const testGithubSsh = () => api.get('/sources/test-github-ssh')
