'use client'
import { useState, CSSProperties } from 'react'
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

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signup' | 'signin' | 'forgot'>('signup')
  const [form, setForm] = useState({ first: '', last: '', email: '', password: '', code: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [k]: e.target.value }))
    setError('')
  }

  const sendReset = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    const supabase = createClient()
    try {
      const email = form.email.trim().toLowerCase()
      if (!email || !email.includes('@')) { setError('Enter a valid email address.'); return }
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      })
      if (resetError) { setError(resetError.message); return }
      setResetSent(true)
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    const supabase = createClient()
    try {
      const email = form.email.trim().toLowerCase()
      const password = form.password

      if (!email || !email.includes('@') || !password) {
        setError('Enter a valid email and password.')
        return
      }

      if (mode === 'signup') {
        if (!form.first.trim() || !form.last.trim()) { setError('First and last name are required.'); return }
        if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

        const res = await fetch('/api/check-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: form.code.trim() }),
        })
        if (!res.ok) { setError('Team access code is incorrect.'); return }

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { first_name: form.first.trim(), last_name: form.last.trim() },
          },
        })
        if (signUpError) { setError(signUpError.message); return }
        router.replace('/board')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) { setError('Email or password does not match.'); return }
        router.replace('/board')
      }
    } finally {
      setBusy(false)
    }
  }

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
  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'

  return (
    <div style={{ minHeight: '100vh', background: C.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: '30px 26px', width: '100%', maxWidth: 400, boxShadow: '0 2px 10px rgba(42,33,24,0.06)' }}>
        <div style={{ textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tradiant-logo.webp" alt="Tradiant" style={{ height: 80, width: 'auto', marginBottom: 8 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.sub }}>
            Deal Pipeline
          </div>
          <div style={{ fontSize: 14, color: C.sub, margin: '14px 0 18px' }}>
            {isSignup ? 'Create your team profile to access the board.' : isForgot ? 'Enter your email and we\'ll send a reset link.' : 'Sign in to your Tradiant profile.'}
          </div>
        </div>

        {isForgot && resetSent ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📬</div>
            <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, marginBottom: 6 }}>Check your email</div>
            <div style={{ fontSize: 13, color: C.sub, marginBottom: 20 }}>We sent a password reset link to <strong>{form.email}</strong></div>
            <button onClick={() => { setMode('signin'); setResetSent(false) }} style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              Back to sign in
            </button>
          </div>
        ) : isForgot ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div>
                <span style={labelStyle}>Email</span>
                <input style={authInput} type="email" value={form.email} onChange={f('email')} placeholder="you@gotradiant.com" autoComplete="email" onKeyDown={(e) => e.key === 'Enter' && sendReset()} />
              </div>
            </div>
            {error && <div style={{ fontSize: 12, color: C.red, marginTop: 10, textAlign: 'center' }}>{error}</div>}
            <button onClick={sendReset} disabled={busy} style={{ width: '100%', marginTop: 16, background: C.orange, color: '#fff', border: 'none', borderRadius: 999, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: C.sub }}>
              <button onClick={() => { setMode('signin'); setError('') }} style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                Back to sign in
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {isSignup && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <span style={labelStyle}>First name</span>
                    <input style={authInput} value={form.first} onChange={f('first')} placeholder="First" autoComplete="given-name" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={labelStyle}>Last name</span>
                    <input style={authInput} value={form.last} onChange={f('last')} placeholder="Last" autoComplete="family-name" />
                  </div>
                </div>
              )}
              <div>
                <span style={labelStyle}>Email</span>
                <input style={authInput} type="email" value={form.email} onChange={f('email')} placeholder="you@gotradiant.com" autoComplete="email" />
              </div>
              <div>
                <span style={labelStyle}>Password</span>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...authInput, paddingRight: 42 }}
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={f('password')}
                    onKeyDown={(e) => e.key === 'Enter' && !isSignup && submit()}
                    placeholder={isSignup ? 'Choose a password (6+ chars)' : 'Your password'}
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                  />
                  <button type="button" style={eyeBtn} onClick={() => setShowPwd(s => !s)} aria-label={showPwd ? 'Hide password' : 'Show password'}>
                    <EyeIcon open={showPwd} />
                  </button>
                </div>
                {!isSignup && (
                  <div style={{ textAlign: 'right', marginTop: 4 }}>
                    <button onClick={() => { setMode('forgot'); setError('') }} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>
              {isSignup && (
                <div>
                  <span style={labelStyle}>Team access code</span>
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{ ...authInput, paddingRight: 42 }}
                      type={showCode ? 'text' : 'password'}
                      value={form.code}
                      onChange={f('code')}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      placeholder="Provided by your team lead"
                      autoComplete="off"
                    />
                    <button type="button" style={eyeBtn} onClick={() => setShowCode(s => !s)} aria-label={showCode ? 'Hide code' : 'Show code'}>
                      <EyeIcon open={showCode} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div style={{ fontSize: 12, color: C.red, marginTop: 10, textAlign: 'center' }}>{error}</div>
            )}

            <button
              onClick={submit}
              disabled={busy}
              style={{ width: '100%', marginTop: 16, background: C.orange, color: '#fff', border: 'none', borderRadius: 999, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}
            >
              {busy ? 'One moment…' : isSignup ? 'Create profile & enter' : 'Sign in'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: C.sub }}>
              {isSignup ? 'Already have a profile? ' : 'New to the board? '}
              <button
                onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError('') }}
                style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
              >
                {isSignup ? 'Sign in' : 'Create your profile'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
