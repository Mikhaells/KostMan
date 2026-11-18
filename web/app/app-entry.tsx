'use client'

import dynamic from 'next/dynamic'

// Seluruh SPA (termasuk BrowserRouter yang butuh `document`) hanya dirender di browser.
const Spa = dynamic(() => import('./spa'), { ssr: false })

export default function AppEntry() {
  return <Spa />
}
