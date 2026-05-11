import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Sources from './pages/Sources'
import Profiles from './pages/Profiles'
import Assistant from './pages/Assistant'
import Query from './pages/Query'
import History from './pages/History'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/query" element={<Query />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </Layout>
  )
}
