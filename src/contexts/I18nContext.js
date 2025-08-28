import { createContext } from 'react'

export const I18nContext = createContext({ lang: 'en', setLang: () => {}, t: () => {} })
