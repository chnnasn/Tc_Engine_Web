import { inject, type InjectionKey } from 'vue'

export type Navigate = (url: string) => void

export const navigationKey: InjectionKey<Navigate> = Symbol('tomcat-navigation')

export function useNavigation(): Navigate {
  const navigate = inject(navigationKey)
  if (!navigate) throw new Error('TomCat navigation provider is missing')
  return navigate
}
