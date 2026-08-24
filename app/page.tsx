'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function Root() {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      router.replace(session ? '/board' : '/auth')
    })
  }, [router])
  return <div style={{ minHeight: '100vh', background: '#FBF7EF' }} />
}
