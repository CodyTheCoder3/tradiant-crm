'use client'
import { useState, useEffect, CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const C = {
  cream: '#FBF7EF', card: '#FFFFFF', ink: '#2A2118', sub: '#7A6E5E',
  line: '#EBE1D2', orange: '#E8590C', red: '#B3402E',
}

const EyeIcon = ({ open }: { open: boolean }) => open ? (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
) : (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export default function ResetPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabase puts the token in the URL hash as #access_token=...&type=recovery
    const hash = window.location.hash
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.replace('#', ''))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token') ?? ''
      if (accessToken) {
        const supabase = createClient()
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => setSessionReady(true))
          .catch(() => setError('Invalid or expired reset link. Please request a new one.'))
      }
    } else {
      // Already have a session (e.g. came from Supabase email link that set cookies)
      const supabase = createClient()
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setSessionReady(true)
        else setError('Invalid or expired reset link. Please request a new one.')
      })
    }
  }, [])

  const authInput: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10,
    border: `1px solid ${C.line}`, background: C.cream, color: C.ink,
    fontSize: 14, outline: 'none', fontFamily: 'inherit',
  }
  const labelStyle: CSSProperties = {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: C.sub, marginBottom: 4, display: 'block',
  }
  const eyeBtn: CSSProperties = {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
    color: C.sub, display: 'flex', alignItems: 'center',
  }

  const submit = async () => {
    if (busy || !sessionReady) return
    setBusy(true)
    setError('')
    try {
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) { setError(updateError.message); return }
      setDone(true)
      setTimeout(() => router.replace('/board'), 2000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: '30px 26px', width: '100%', maxWidth: 400, boxShadow: '0 2px 10px rgba(42,33,24,0.06)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tradiant-logo.webp" alt="Tradiant" style={{ height: 80, width: 'auto', marginBottom: 8 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.sub }}>Deal Pipeline</div>
          <div style={{ fontSize: 14, color: C.sub, marginTop: 14 }}>
            {done ? 'Password updated! Redirecting…' : !sessionReady && !error ? 'Verifying reset link…' : 'Choose a new password for your account.'}
          </div>
        </div>

        {error && !sessionReady && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: C.red, marginBottom: 16 }}>{error}</div>
            <button onClick={() => router.replace('/auth')} style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Back to sign in
            </button>
          </div>
        )}
        {!done && sessionReady && (
          <>
            <div>
              <span style={labelStyle}>New password</span>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...authInput, paddingRight: 42 }}
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="Choose a password (6+ chars)"
                  autoComplete="new-password"
                />
                <button type="button" style={eyeBtn} onClick={() => setShowPwd(s => !s)}>
                  <EyeIcon open={showPwd} />
                </button>
              </div>
            </div>

            {error && <div style={{ fontSize: 12, color: C.red, marginTop: 10, textAlign: 'center' }}>{error}</div>}

            <button
              onClick={submit}
              disabled={busy}
              style={{ width: '100%', marginTop: 16, background: C.orange, color: '#fff', border: 'none', borderRadius: 999, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}
            >
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
