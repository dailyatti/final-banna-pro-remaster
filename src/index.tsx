import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './MainApp'
import './index.css'
import './services/i18n' // Import i18n configuration

import { ApiKeyProvider } from './context/ApiKeyContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ApiKeyProvider>
            <App />
        </ApiKeyProvider>
    </React.StrictMode>,
)
