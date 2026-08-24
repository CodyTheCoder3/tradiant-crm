'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const C = {
  cream: '#FBF7EF', card: '#FFFFFF', ink: '#2A2118', sub: '#7A6E5E',
  line: '#EBE1D2', orange: '#E8590C', orangeSoft: '#FBE3D4',
  green: '#2E7D4F', greenSoft: '#DCEEE3', red: '#B3402E', redSoft: '#F6DFDA',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const BUYER_STAGE_COLORS: Record<string, string> = {
  interested: '#7A6E5E', po: '#E8590C', invoice: '#7B5EA7',
  shipping: '#2563EB', delivered: '#2E7D4F',
}

type BuyerProduct = {
  id: string; deal_buyer_id: string; deal_product_id: string
  units_purchased: number; unit_sell: number | null
}
type Buyer = {
  id: string; deal_id: string; company: string | null
  contact_first_name: string | null; contact_last_name: string | null
  stage: string; freight_cost: number | null
  deal_buyer_products: BuyerProduct[]
}
type Product = {
  id: string; description: string | null
  unit_cost: number | null; unit_sell: number | null; units_available: number | null
}
type Deal = {
  id: string; company: string; value: number
  deal_number: number | null; close_date: string | null; stage: string; created_at: string
  deal_products: Product[]; deal_buyers: Buyer[]
}
type Profile = { id: string; first_name: string; last_name: string }

const fmtMoney = (n: number) =>
  '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

function dealFinancials(d: Deal) {
  const hasBuyers = d.deal_buyers.some(b => b.deal_buyer_products.length > 0)
  let rev = 0
  if (hasBuyers) {
    for (const b of d.deal_buyers) {
      for (const bp of b.deal_buyer_products) {
        const prod = d.deal_products.find(p => p.id === bp.deal_product_id)
        rev += (bp.unit_sell ?? prod?.unit_sell ?? 0) * Number(bp.units_purchased)
      }
    }
    // Won deals: unsold units = $0 revenue and $0 cost (broker model)
    if (d.stage !== 'won') {
      for (const p of d.deal_products) {
        const committed = d.deal_buyers.reduce((s, b) => {
          const bp = b.deal_buyer_products.find(x => x.deal_product_id === p.id)
          return s + (bp ? Number(bp.units_purchased) : 0)
        }, 0)
        const uncommitted = (p.units_available ?? 0) - committed
        if (uncommitted > 0) rev += (p.unit_sell ?? 0) * uncommitted
      }
    }
  } else {
    rev = d.deal_products.reduce((s, p) => s + (p.unit_sell ?? 0) * (p.units_available ?? 0), 0)
  }
  // Won deals: cost only on units actually sold (broker — no inventory risk on unsold)
  const cost = d.stage === 'won' && hasBuyers
    ? d.deal_products.reduce((s, p) => {
        const sold = d.deal_buyers.reduce((su, b) => {
          const bp = b.deal_buyer_products.find(x => x.deal_product_id === p.id)
          return su + (bp ? Number(bp.units_purchased) : 0)
        }, 0)
        return s + (p.unit_cost ?? 0) * sold
      }, 0)
    : d.deal_products.reduce((s, p) => s + (p.unit_cost ?? 0) * (p.units_available ?? 0), 0)
  const freight = d.deal_buyers.reduce((s, b) => s + Number(b.freight_cost ?? 0), 0)
  const units = d.deal_buyers.reduce((s, b) =>
    s + b.deal_buyer_products.reduce((s2, bp) => s2 + Number(bp.units_purchased), 0), 0)
  return { rev, cost, freight, profit: rev - cost - freight, units }
}

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [selMonth, setSelMonth] = useState(now.getMonth())
  const [selYear, setSelYear] = useState(now.getFullYear())

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return }

      // Load profile
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (prof) setProfile(prof)

      // Load deals
      const { data, error } = await supabase
        .from('deals')
        .select('*, deal_products(*), deal_buyers(*, deal_buyer_products(*))')
        .order('created_at', { ascending: false })
      if (error) console.error('Dashboard fetch error:', error)
      setDeals((data ?? []).map((d: Deal) => ({
        ...d,
        deal_products: d.deal_products ?? [],
        deal_buyers: (d.deal_buyers ?? []).map((b: Buyer) => ({
          ...b, deal_buyer_products: b.deal_buyer_products ?? []
        })),
      })))
      setLoading(false)
    })
  }, [router])

  const prevMonth = () => {
    if (selMonth === 0) { setSelMonth(11); setSelYear(y => y - 1) }
    else setSelMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (selMonth === 11) { setSelMonth(0); setSelYear(y => y + 1) }
    else setSelMonth(m => m + 1)
  }

  const inMonth = (d: Deal) => {
    if (!d.close_date) return false
    const dt = new Date(d.close_date + 'T12:00:00')
    return dt.getMonth() === selMonth && dt.getFullYear() === selYear
  }

  const wonDeals   = deals.filter(d => d.stage === 'won'  && inMonth(d))
  const lostDeals  = deals.filter(d => d.stage === 'lost' && inMonth(d))
  const activeDeals = deals.filter(d => d.stage === 'open' || d.stage === 'progress')

  const totalRevenue  = wonDeals.reduce((s, d) => s + dealFinancials(d).rev, 0)
  const totalProfit   = wonDeals.reduce((s, d) => s + dealFinancials(d).profit, 0)
  const pipelineValue = activeDeals.reduce((s, d) => s + dealFinancials(d).rev, 0)
  const unitsMoved    = wonDeals.reduce((s, d) => s + dealFinancials(d).units, 0)
  const totalClosed   = wonDeals.length + lostDeals.length
  const winRate       = totalClosed > 0 ? Math.round((wonDeals.length / totalClosed) * 100) : 0

  // Last 12 months for bar chart
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    let m = selMonth - 11 + i
    let y = selYear
    while (m < 0) { m += 12; y-- }
    const monthWon = deals.filter(d => {
      if (d.stage !== 'won' || !d.close_date) return false
      const dt = new Date(d.close_date + 'T12:00:00')
      return dt.getMonth() === m && dt.getFullYear() === y
    })
    const profit = monthWon.reduce((s, d) => s + dealFinancials(d).profit, 0)
    const revenue = monthWon.reduce((s, d) => s + dealFinancials(d).rev, 0)
    return { label: MONTHS[m], year: y, profit, revenue, isSel: m === selMonth && y === selYear }
  })
  const maxVal = Math.max(...monthlyData.map(m => Math.max(m.profit, 0)), 1)

  // Top buyers all-time
  const buyerMap: Record<string, { name: string; revenue: number; units: number; vendors: Set<string> }> = {}
  for (const d of deals.filter(d => d.stage === 'won')) {
    for (const b of d.deal_buyers) {
      const name = b.company || [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ') || 'Unknown'
      const key = name.toLowerCase().trim()
      if (!buyerMap[key]) buyerMap[key] = { name, revenue: 0, units: 0, vendors: new Set() }
      for (const bp of b.deal_buyer_products) {
        const prod = d.deal_products.find(p => p.id === bp.deal_product_id)
        buyerMap[key].revenue += (bp.unit_sell ?? prod?.unit_sell ?? 0) * Number(bp.units_purchased)
        buyerMap[key].units += Number(bp.units_purchased)
      }
      buyerMap[key].vendors.add(d.company)
    }
  }
  const topBuyers = Object.values(buyerMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8)

  // Buyer × Vendor activity rows
  type BVRow = { buyer: string; vendor: string; dealNum: number | null; units: number; revenue: number; stage: string }
  const bvRows: BVRow[] = []
  for (const d of deals) {
    for (const b of d.deal_buyers) {
      const name = b.company || [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ') || 'Unknown'
      let rev = 0, units = 0
      for (const bp of b.deal_buyer_products) {
        const prod = d.deal_products.find(p => p.id === bp.deal_product_id)
        rev += (bp.unit_sell ?? prod?.unit_sell ?? 0) * Number(bp.units_purchased)
        units += Number(bp.units_purchased)
      }
      bvRows.push({ buyer: name, vendor: d.company, dealNum: d.deal_number, units, revenue: rev, stage: b.stage })
    }
  }
  bvRows.sort((a, b) => b.revenue - a.revenue)

  const signOut = async () => {
    await createClient().auth.signOut()
    router.replace('/auth')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.cream, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.sub, fontSize: 13 }}>Loading…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: "'Inter', ui-sans-serif, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.cream, padding: '14px 20px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <img src="/tradiant-logo.webp" alt="Tradiant" style={{ height: 38, width: 'auto' }} />
            <div style={{ display: 'flex', gap: 1, background: '#EDE4D8', borderRadius: 10, padding: 4 }}>
              <a href="/board" style={{ padding: '5px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, textDecoration: 'none', color: C.sub }}>Board</a>
              <span style={{ padding: '6px 18px', borderRadius: 7, fontSize: 13, fontWeight: 700, color: C.ink, background: C.card, boxShadow: '0 1px 3px rgba(42,33,24,0.10)' }}>Dashboard</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: C.sub }}>
              <b style={{ color: C.ink }}>{profile?.first_name} {profile?.last_name}</b>
            </span>
            <button onClick={signOut} style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* Month selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={prevMonth} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <div style={{ fontSize: 22, fontWeight: 800, minWidth: 170, textAlign: 'center' }}>{MONTHS[selMonth]} {selYear}</div>
          <button onClick={nextMonth} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          <span style={{ fontSize: 12, color: C.sub, marginLeft: 4 }}>
            {wonDeals.length} deal{wonDeals.length !== 1 ? 's' : ''} closed this month
          </span>
        </div>

        {/* KPI row */}
        {(() => {
          const netMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0
          const kpis = [
            { label: 'Revenue Won',    value: fmtMoney(totalRevenue),       color: C.green,                              bg: '#EAF6EE', icon: '↑' },
            { label: 'Total Profit',   value: fmtMoney(totalProfit),        color: totalProfit >= 0 ? '#B7860B' : C.red, bg: totalProfit >= 0 ? '#FEF9E7' : '#FDECEA', icon: '$' },
            { label: 'Net Margin',     value: `${netMargin}%`,              color: netMargin >= 10 ? C.green : netMargin >= 0 ? '#B7860B' : C.red, bg: netMargin >= 10 ? '#EAF6EE' : netMargin >= 0 ? '#FEF9E7' : '#FDECEA', icon: '%' },
            { label: 'Pipeline Value', value: fmtMoney(pipelineValue),      color: C.orange,                             bg: '#FBE3D4', icon: '◎' },
            { label: 'Units Moved',    value: unitsMoved.toLocaleString(),  color: '#2563EB',                            bg: '#EEF2FF', icon: '⬡' },
            { label: 'Win Rate',       value: `${winRate}%`,                color: winRate >= 50 ? C.green : C.red,      bg: winRate >= 50 ? '#EAF6EE' : '#FDECEA', icon: '✓' },
          ]
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
              {kpis.map(k => (
                <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: '18px 18px 16px', border: `1.5px solid ${k.color}18`, boxShadow: '0 1px 4px rgba(42,33,24,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: k.color }}>{k.label}</div>
                    <div style={{ fontSize: 14, color: k.color, opacity: 0.7, fontWeight: 700 }}>{k.icon}</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1, letterSpacing: '-0.02em' }}>{k.value}</div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Chart + Top Buyers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, marginBottom: 12 }}>

          {/* Bar chart */}
          <div style={{ background: C.card, borderRadius: 14, padding: '22px 22px 16px', border: `1.5px solid ${C.line}`, boxShadow: '0 1px 4px rgba(42,33,24,0.05)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Profit by Month</div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 18 }}>Last 12 months · Closed Won deals</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 150, paddingBottom: 24, position: 'relative' }}>
              {/* Zero line */}
              <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, height: 1, background: C.line }} />
              {monthlyData.map((m, i) => {
                const barH = m.profit > 0 ? (m.profit / maxVal) * 120 : 0
                return (
                  <div key={i} title={`${m.label} ${m.year}: ${fmtMoney(m.profit)}`}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, height: '100%', justifyContent: 'flex-end' }}>
                    {m.profit > 0 && (
                      <div style={{ fontSize: 8, color: m.isSel ? C.orange : C.sub, marginBottom: 2, textAlign: 'center' }}>
                        {m.profit >= 1000 ? `$${(m.profit / 1000).toFixed(0)}k` : `$${m.profit}`}
                      </div>
                    )}
                    <div style={{
                      width: '100%', height: barH || 2,
                      background: m.isSel ? C.orange : C.green,
                      borderRadius: '4px 4px 0 0',
                      opacity: m.isSel ? 1 : 0.55,
                      transition: 'height .3s',
                    }} />
                    <div style={{ fontSize: 9, color: m.isSel ? C.orange : C.sub, fontWeight: m.isSel ? 700 : 400, marginTop: 5, textAlign: 'center' }}>
                      {m.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top buyers */}
          <div style={{ background: C.card, borderRadius: 14, padding: '22px', border: `1.5px solid ${C.line}`, boxShadow: '0 1px 4px rgba(42,33,24,0.05)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Top Buyers</div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 16 }}>All time · Closed Won</div>
            {topBuyers.length === 0 ? (
              <div style={{ fontSize: 12, color: C.sub }}>No closed deals yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topBuyers.map((b, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{b.name}</span>
                        <span style={{ fontSize: 10, color: C.sub, marginLeft: 6 }}>{b.units.toLocaleString()} units</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{fmtMoney(b.revenue)}</span>
                    </div>
                    <div style={{ height: 3, background: C.line, borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(b.revenue / (topBuyers[0]?.revenue || 1)) * 100}%`, background: C.green, borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Buyer × Vendor table */}
        <div style={{ background: C.card, borderRadius: 14, border: `1.5px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(42,33,24,0.05)' }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Buyer × Vendor Activity</div>
            <div style={{ fontSize: 11, color: C.sub }}>who is buying from which vendor across all deals</div>
          </div>
          {bvRows.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12, color: C.sub }}>No buyer activity yet — add buyers to your deals</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.cream }}>
                    {['Buyer', 'Vendor', 'Deal', 'Units', 'Revenue', 'Stage'].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.sub, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bvRows.map((row, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 === 0 ? C.card : '#FDFAF6' }}>
                      <td style={{ padding: '11px 16px', fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' }}>{row.buyer}</td>
                      <td style={{ padding: '11px 16px', color: C.sub }}>{row.vendor}</td>
                      <td style={{ padding: '11px 16px' }}>
                        {row.dealNum != null
                          ? <span style={{ color: C.orange, fontWeight: 700 }}>#{row.dealNum}</span>
                          : <span style={{ color: C.sub }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 16px', color: C.sub }}>{row.units > 0 ? row.units.toLocaleString() : '—'}</td>
                      <td style={{ padding: '11px 16px', fontWeight: 700, color: row.revenue > 0 ? C.green : C.sub }}>
                        {row.revenue > 0 ? fmtMoney(row.revenue) : '—'}
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{
                          background: (BUYER_STAGE_COLORS[row.stage] ?? '#7A6E5E') + '18',
                          color: BUYER_STAGE_COLORS[row.stage] ?? '#7A6E5E',
                          border: `1px solid ${(BUYER_STAGE_COLORS[row.stage] ?? '#7A6E5E')}40`,
                          borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                        }}>
                          {row.stage.charAt(0).toUpperCase() + row.stage.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
