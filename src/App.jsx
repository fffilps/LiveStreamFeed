import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import CameraStreamPage from './pages/CameraStreamPage'
import HomePage from './pages/HomePage'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white dark:bg-neutral-950">
        <header className="border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
          <nav className="mx-auto flex max-w-7xl items-center gap-8 px-4 py-3 text-sm font-medium">
            <Link
              to="/"
              className="text-neutral-700 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
            >
              Dashboard
            </Link>
            <Link
              to="/camera"
              className="text-neutral-700 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
            >
              Camera & stream
            </Link>
          </nav>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/camera" element={<CameraStreamPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
