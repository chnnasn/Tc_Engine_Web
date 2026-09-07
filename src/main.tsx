import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import RuntimeApp from './runtime/RuntimeApp'
import HubApp from './runtime/HubApp'
import EditorApp from './editor/EditorApp'
import { store } from './store'
import './runtime/compat/bridge'
import './runtime/compat/storage'
import './runtime/compat/platform'
import './runtime/compat/engine-runtime'

// The upstream JS runtime expects this host adapter. React owns the page shell,
// while the adapter keeps project metadata available to the WASM bridge.
Object.assign(window, { TomCatStore: store })

const path = window.location.pathname
const Root = path.startsWith('/editor-shell') ? EditorApp : path.startsWith('/runtime') || path.startsWith('/editor') ? RuntimeApp : path.startsWith('/manage') || path.startsWith('/auth') ? App : HubApp

createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>)
