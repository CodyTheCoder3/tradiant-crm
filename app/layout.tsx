import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tradiant Deal Pipeline',
  description: 'Shared team deal pipeline for Tradiant',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800;0,14..32,900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
