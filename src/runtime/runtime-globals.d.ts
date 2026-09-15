export {}

declare global {
  interface Window {
    TomCatEngineHost?: any
    TomCatWebModule?: any
    TomCatRuntime?: any
    TomCatRuntimeReady?: Promise<unknown>
    TomCatHubRuntime?: unknown
    TomCatStore?: any
    Module?: any
  }
}
