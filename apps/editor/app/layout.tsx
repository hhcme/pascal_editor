import { Agentation } from 'agentation'
import { GeistPixelSquare } from 'geist/font/pixel'
import localFont from 'next/font/local'
import Script from 'next/script'
import './globals.css'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
})
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} ${GeistPixelSquare.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <Script src="/translate-inject.js" strategy="afterInteractive" />
        {process.env.NODE_ENV === 'development' && (
          <Script
            crossOrigin="anonymous"
            src="//unpkg.com/react-scan/dist/auto.global.js"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body className="font-sans" suppressHydrationWarning>
        {children}
        {process.env.NODE_ENV === 'development' && <Agentation />}
      </body>
    </html>
  )
}
