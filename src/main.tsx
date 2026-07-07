import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initTooltips } from './lib/tooltips'
import './index.css'

initTooltips()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
