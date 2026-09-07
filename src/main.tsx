import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import RuntimeApp from './runtime/RuntimeApp'
import HubApp from './runtime/HubApp'
import './runtime/compat/bridge'
import './runtime/compat/storage'
import './runtime/compat/platform'
import './runtime/compat/engine-runtime'

const path = window.location.pathname
const isEditor = path === '/editor' || path.startsWith('/editor/')
const Root = isEditor ? RuntimeApp : HubApp

createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>)
