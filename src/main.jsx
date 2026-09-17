import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './Assessment.css'
import './Results.css'
import App from './App.jsx'

const root = createRoot(document.getElementById('root'))

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Allow the Dashboard's "Restart assessment" action to return
// an authenticated user directly to the assessment setup screen.
if (localStorage.getItem('carbonai_restart_assessment') === '1') {
  setTimeout(() => {
    const startButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim().toLowerCase().includes('get started')
    )

    if (startButton) {
      localStorage.removeItem('carbonai_restart_assessment')
      startButton.click()
    }
  }, 250)
}
