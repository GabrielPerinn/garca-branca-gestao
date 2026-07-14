import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Garça Branca — Gestão Pecuária',
    short_name: 'Garça Branca',
    description: 'Gestão pecuária inteligente, multipropriedade e preparada para operação offline.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f8f5',
    theme_color: '#216a45',
    orientation: 'any',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}
