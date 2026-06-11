import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Temporary: isolate the production error by removing all app imports
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>Tempo Calendar</h1>
      <p>Diagnostic page — if you can read this, the build is healthy.</p>
      <p style={{ fontSize: 10, opacity: 0.3 }}>v0.2.1</p>
    </div>
  </StrictMode>,
)
