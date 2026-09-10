'use client'
import { useState, useEffect, useCallback, CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

// ── Brand tokens ──────────────────────────────────────────────
const C = {
  cream: '#FBF7EF', card: '#FFFFFF', ink: '#2A2118', sub: '#7A6E5E',
  line: '#EBE1D2', orange: '#E8590C', orangeSoft: '#FBE3D4',
  green: '#2E7D4F', greenSoft: '#DCEEE3', red: '#B3402E', redSoft: '#F6DFDA',
}

const STAGES = [
  { id: 'inventory-followup',  label: 'Inventory Follow-Up', color: C.orange, soft: C.orangeSoft, outline: true,  closed: false },
  { id: 'inventory-secured',   label: 'Inventory Secured',   color: C.orange, soft: C.orangeSoft, outline: false, closed: false },
  { id: 'negotiating',         label: 'Negotiating',         color: '#C07A1A', soft: '#FDF3DC',   outline: false, closed: false },
  { id: 'buyer-secured',       label: 'Buyer Secured',       color: '#2563EB', soft: '#DBEAFE',   outline: false, closed: false },
  { id: 'po-signed',           label: 'PO Signed',           color: '#7B5EA7', soft: '#EDE9F6',   outline: false, closed: false },
  { id: 'shipped',             label: 'Shipped',             color: '#0D7490', soft: '#D0F0F8',   outline: false, closed: false },
  { id: 'delivered',           label: 'Delivered',           color: '#2E7D4F', soft: C.greenSoft, outline: false, closed: false },
  { id: 'paid',                label: 'Paid',                color: C.green,  soft: C.greenSoft,  outline: false, closed: true  },
  { id: 'lost',                label: 'Closed Lost',         color: C.red,    soft: C.redSoft,    outline: false, closed: true  },
]

const BUYER_STAGES = [
  { id: 'interested', label: 'Interested', color: '#7A6E5E' },
  { id: 'po',         label: 'PO',         color: '#E8590C' },
  { id: 'invoice',    label: 'Invoice',    color: '#7B5EA7' },
  { id: 'shipping',   label: 'Shipping',   color: '#2563EB' },
  { id: 'delivered',  label: 'Delivered',  color: '#2E7D4F' },
]

// ── Types ─────────────────────────────────────────────────────
type Note = { id: string; deal_id: string; author_name: string; text: string; created_at: string }
type Product = {
  id: string; deal_id: string; description: string | null
  unit_cost: number | null; unit_sell: number | null
  units_available: number | null; cases_available: number | null
  pallets_available: number | null; expiration_date: string | null; sort_order: number
}
type BuyerProduct = {
  id: string; deal_buyer_id: string; deal_product_id: string
  units_purchased: number; unit_sell: number | null
}
type Buyer = {
  id: string; deal_id: string; company: string | null
  contact_first_name: string | null; contact_last_name: string | null
  email: string | null; phone: string | null
  stage: string; freight_cost: number | null; sort_order: number
  deal_buyer_products: BuyerProduct[]
}
type Deal = {
  id: string; company: string; value: number; freight_cost: number | null; deal_number: number | null
  contact_first_name: string | null; contact_last_name: string | null
  contact_email: string | null; contact_phone: string | null
  close_date: string | null; stage: string; created_by: string | null; created_at: string
  sourced_by: string | null; sold_by: string | null
  deal_notes: Note[]
  deal_products: Product[]
  deal_buyers: Buyer[]
}
type Profile = { id: string; first_name: string; last_name: string; email: string }
type ProductForm = {
  id: string | null  // null = new
  description: string; unitCost: string; unitSell: string; unitsAvailable: string
  casesAvailable: string; palletsAvailable: string; expirationDate: string
}
type BuyerForm = {
  id: string | null  // null = new, string = existing id
  company: string; contactFirst: string; contactLast: string
  email: string; phone: string; stage: string; freight: string
  // keyed by deal_product_id → { units, sellPrice }
  productUnits: Record<string, string>
  productSell: Record<string, string>
}

// ── Helpers ───────────────────────────────────────────────────
const fmtMoney = (n: number) =>
  '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

const fmtMoneyExact = (n: number) =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtStamp = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const blankProduct = (): ProductForm => ({
  id: null, description: '', unitCost: '', unitSell: '', unitsAvailable: '',
  casesAvailable: '', palletsAvailable: '', expirationDate: '',
})

const blankBuyer = (): BuyerForm => ({
  id: null, company: '', contactFirst: '', contactLast: '',
  email: '', phone: '', stage: 'interested', freight: '', productUnits: {}, productSell: {},
})

// ── Sub-components ────────────────────────────────────────────
function MiniBtn({ children, color, ghost, onClick }: {
  children: React.ReactNode; color: string; ghost?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      background: ghost ? 'transparent' : color,
      color: ghost ? color : '#fff',
      border: ghost ? `1px solid ${color}40` : 'none',
      borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 700,
      cursor: 'pointer', fontFamily: 'inherit',
    }}>
      {children}
    </button>
  )
}

function BuyerStagePill({ stageId }: { stageId: string }) {
  const s = BUYER_STAGES.find(b => b.id === stageId) ?? BUYER_STAGES[0]
  return (
    <span style={{
      background: s.color + '18', color: s.color,
      border: `1px solid ${s.color}40`,
      borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

// ── Main board ────────────────────────────────────────────────
export default function BoardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)

  // Deal form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formCompany, setFormCompany] = useState('')
  const [formContactFirst, setFormContactFirst] = useState('')
  const [formContactLast, setFormContactLast] = useState('')
  const [formContactEmail, setFormContactEmail] = useState('')
  const [formContactPhone, setFormContactPhone] = useState('')
  const [formDealNumber, setFormDealNumber] = useState('')
  const [formValue, setFormValue] = useState('')
  const [formFreight, setFormFreight] = useState('')
  const [formCloseDate, setFormCloseDate] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formSourcedBy, setFormSourcedBy] = useState('')
  const [formSoldBy, setFormSoldBy] = useState('')
  const [products, setProducts] = useState<ProductForm[]>([blankProduct()])
  const [buyers, setBuyers] = useState<BuyerForm[]>([])

  const [originalBuyerIds, setOriginalBuyerIds] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [knownBuyers, setKnownBuyers] = useState<{ company: string; contactFirst: string; contactLast: string; email: string; phone: string }[]>([])
  const [buyerSuggestIdx, setBuyerSuggestIdx] = useState<number | null>(null)
  const [knownVendors, setKnownVendors] = useState<{ company: string; contactFirst: string; contactLast: string; email: string; phone: string }[]>([])
  const [showVendorSuggest, setShowVendorSuggest] = useState(false)

  const firstName = profile?.first_name ?? 'Someone'

  // ── Auth guard ────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return }
      setUser(session.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/auth')
      else setUser(session.user)
    })
    return () => subscription.unsubscribe()
  }, [router])

  // ── Load profile ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [user])

  // ── Fetch deals ───────────────────────────────────────────
  const fetchDeals = useCallback(async () => {
    if (!user) return
    const supabase = createClient()
    const { data, error } = await supabase
      .from('deals')
      .select('*, deal_notes(*), deal_products(*), deal_buyers(*, deal_buyer_products(*))')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
    if (error) { console.error(error); return }
    const normalized = (data ?? []).map((d: Deal) => ({
      ...d,
      deal_notes: [...(d.deal_notes ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
      deal_products: [...(d.deal_products ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      deal_buyers: [...(d.deal_buyers ?? [])].sort((a, b) => a.sort_order - b.sort_order)
        .map((b: Buyer) => ({ ...b, deal_buyer_products: b.deal_buyer_products ?? [] })),
    }))
    setDeals(normalized)
    setLoading(false)

    // Build known buyers index
    const seen = new Map<string, { company: string; contactFirst: string; contactLast: string; email: string; phone: string }>()
    for (const d of normalized) {
      for (const b of d.deal_buyers) {
        const key = (b.company ?? '').toLowerCase().trim()
        if (key && !seen.has(key)) {
          seen.set(key, {
            company: b.company ?? '',
            contactFirst: b.contact_first_name ?? '',
            contactLast: b.contact_last_name ?? '',
            email: b.email ?? '',
            phone: b.phone ?? '',
          })
        }
      }
    }
    setKnownBuyers(Array.from(seen.values()))

    // Build known vendors index
    const vendorSeen = new Map<string, { company: string; contactFirst: string; contactLast: string; email: string; phone: string }>()
    for (const d of normalized) {
      const key = (d.company ?? '').toLowerCase().trim()
      if (key && !vendorSeen.has(key)) {
        vendorSeen.set(key, {
          company: d.company ?? '',
          contactFirst: d.contact_first_name ?? '',
          contactLast: d.contact_last_name ?? '',
          email: d.contact_email ?? '',
          phone: d.contact_phone ?? '',
        })
      }
    }
    setKnownVendors(Array.from(vendorSeen.values()))
  }, [user])

  useEffect(() => { if (user) fetchDeals() }, [user, fetchDeals])

  // ── Realtime ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const channel = supabase.channel('board-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, fetchDeals)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_notes' }, fetchDeals)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_products' }, fetchDeals)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_buyers' }, fetchDeals)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, fetchDeals])

  // ── Derived ───────────────────────────────────────────────
  const byStage = (id: string) => deals.filter(d => d.stage === id)
  const calcRevenue = (d: Deal) => {
    const hasBuyerAllocations = d.deal_buyers.some(b => b.deal_buyer_products.length > 0)
    if (hasBuyerAllocations) {
      let rev = 0
      for (const b of d.deal_buyers) {
        for (const bp of b.deal_buyer_products) {
          const prod = d.deal_products.find(p => p.id === bp.deal_product_id)
          rev += (bp.unit_sell ?? prod?.unit_sell ?? 0) * Number(bp.units_purchased)
        }
      }
      // Only count uncommitted units as revenue for open/in-progress deals
      // Paid deals: unsold inventory = loss (cost with no revenue)
      if (d.stage !== 'paid') {
        for (const p of d.deal_products) {
          const committed = d.deal_buyers.reduce((s, b) => {
            const bp = b.deal_buyer_products.find(x => x.deal_product_id === p.id)
            return s + (bp ? Number(bp.units_purchased) : 0)
          }, 0)
          const uncommitted = (p.units_available ?? 0) - committed
          if (uncommitted > 0) rev += (p.unit_sell ?? 0) * uncommitted
        }
      }
      return rev
    }
    return d.deal_products.reduce((s, p) => s + (p.unit_sell ?? 0) * (p.units_available ?? 0), 0)
  }
  const stageValue = (id: string) => byStage(id).reduce((s, d) => s + calcRevenue(d), 0)
  const activeValue = STAGES.filter(s => !s.closed).reduce((sum, s) => sum + stageValue(s.id), 0)
  const totalValue = deals.reduce((s, d) => s + calcRevenue(d), 0)

  // ── Product form helpers ──────────────────────────────────
  const updateProduct = (i: number, field: keyof ProductForm, val: string) => {
    setProducts(ps => ps.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }
  const addProduct = () => setProducts(ps => [...ps, blankProduct()])
  const removeProduct = (i: number) => setProducts(ps => ps.filter((_, idx) => idx !== i))

  // ── Buyer form helpers ────────────────────────────────────
  const updateBuyer = (i: number, field: keyof BuyerForm, val: string) => {
    setBuyers(bs => bs.map((b, idx) => idx === i ? { ...b, [field]: val } : b))
  }
  const addBuyer = () => setBuyers(bs => [...bs, blankBuyer()])
  const removeBuyer = (i: number) => setBuyers(bs => bs.filter((_, idx) => idx !== i))

  // ── Open form ─────────────────────────────────────────────
  const openAdd = () => {
    setFormDealNumber(''); setFormCompany(''); setFormContactFirst(''); setFormContactLast('')
    setFormContactEmail(''); setFormContactPhone(''); setFormValue('')
    setFormFreight(''); setFormCloseDate(''); setFormNote('')
    setFormSourcedBy(profile ? `${profile.first_name} ${profile.last_name}` : '')
    setFormSoldBy('')
    setProducts([blankProduct()])
    setBuyers([])
    setOriginalBuyerIds([])
    setEditingId(null); setShowForm(true)
  }

  const openEdit = (d: Deal) => {
    setFormDealNumber(d.deal_number != null ? String(d.deal_number) : '')
    setFormCompany(d.company)
    setFormContactFirst(d.contact_first_name ?? '')
    setFormContactLast(d.contact_last_name ?? '')
    setFormContactEmail(d.contact_email ?? '')
    setFormContactPhone(d.contact_phone ?? '')
    setFormValue(String(d.value))
    setFormFreight(d.freight_cost != null ? String(d.freight_cost) : '')
    setFormCloseDate(d.close_date ?? ''); setFormNote('')
    setFormSourcedBy(d.sourced_by ?? '')
    setFormSoldBy(d.sold_by ?? '')
    setProducts(
      d.deal_products.length > 0
        ? d.deal_products.map(p => ({
            id: p.id,
            description: p.description ?? '',
            unitCost: p.unit_cost != null ? String(p.unit_cost) : '',
            unitSell: p.unit_sell != null ? String(p.unit_sell) : '',
            unitsAvailable: p.units_available != null ? String(p.units_available) : '',
            casesAvailable: p.cases_available != null ? String(p.cases_available) : '',
            palletsAvailable: p.pallets_available != null ? String(p.pallets_available) : '',
            expirationDate: p.expiration_date ?? '',
          }))
        : [blankProduct()]
    )
    setBuyers(
      d.deal_buyers.map(b => {
        const productUnits: Record<string, string> = {}
        const productSell: Record<string, string> = {}
        for (const bp of b.deal_buyer_products) {
          productUnits[bp.deal_product_id] = String(bp.units_purchased)
          if (bp.unit_sell != null) productSell[bp.deal_product_id] = String(bp.unit_sell)
        }
        return {
          id: b.id,
          company: b.company ?? '',
          contactFirst: b.contact_first_name ?? '',
          contactLast: b.contact_last_name ?? '',
          email: b.email ?? '',
          phone: b.phone ?? '',
          stage: b.stage,
          freight: b.freight_cost != null ? String(b.freight_cost) : '',
          productUnits,
          productSell,
        }
      })
    )
    setOriginalBuyerIds(d.deal_buyers.map(b => b.id))
    setEditingId(d.id); setShowForm(true)
  }

  // ── Save form ─────────────────────────────────────────────
  const saveForm = async () => {
    if (!formCompany.trim()) return
    const supabase = createClient()

    const dealPayload: Record<string, unknown> & { value: number } = {
      deal_number: formDealNumber !== '' ? Number(formDealNumber) : null,
      company: formCompany.trim(),
      contact_first_name: formContactFirst.trim() || null,
      contact_last_name: formContactLast.trim() || null,
      contact_email: formContactEmail.trim() || null,
      contact_phone: formContactPhone.trim() || null,
      value: Number(formValue || 0),
      freight_cost: formFreight !== '' ? Number(formFreight) : null,
      close_date: formCloseDate || null,
      sourced_by: formSourcedBy.trim() || null,
      sold_by: formSoldBy.trim() || null,
    }

    const validProducts = products.filter(p =>
      p.description.trim() || p.unitCost !== '' || p.unitSell !== '' || p.unitsAvailable !== '' || p.casesAvailable !== '' || p.palletsAvailable !== '' || p.expirationDate !== ''
    )

    const autoRevenue = validProducts.reduce((sum, p) => {
      const sell = p.unitSell !== '' ? Number(p.unitSell) : 0
      const units = p.unitsAvailable !== '' ? Number(p.unitsAvailable) : 0
      return sum + sell * units
    }, 0)
    if (autoRevenue > 0) dealPayload.value = autoRevenue

    const validBuyers = buyers.filter(b =>
      b.company.trim() || b.contactFirst.trim() || b.contactLast.trim() || b.email.trim() ||
      Object.values(b.productUnits).some(v => v !== '')
    )

    if (editingId) {
      const { error: dealErr } = await supabase.from('deals').update(dealPayload).eq('id', editingId)
      if (dealErr) { alert('Deal save error: ' + dealErr.message); return }

      // Products: update existing (preserve IDs for buyer FK refs), insert new, delete removed
      const keptProductIds = validProducts.filter(p => p.id).map(p => p.id as string)
      const existingProductIds = products.filter(p => p.id).map(p => p.id as string)
      const removedProductIds = existingProductIds.filter(id => !keptProductIds.includes(id))
      if (removedProductIds.length > 0) {
        await supabase.from('deal_products').delete().in('id', removedProductIds)
      }
      for (let i = 0; i < validProducts.length; i++) {
        const p = validProducts[i]
        const productRow = {
          deal_id: editingId,
          description: p.description.trim() || null,
          unit_cost: p.unitCost !== '' ? Number(p.unitCost) : null,
          unit_sell: p.unitSell !== '' ? Number(p.unitSell) : null,
          units_available: p.unitsAvailable !== '' ? Number(p.unitsAvailable) : null,
          cases_available: p.casesAvailable !== '' ? Number(p.casesAvailable) : null,
          pallets_available: p.palletsAvailable !== '' ? Number(p.palletsAvailable) : null,
          expiration_date: p.expirationDate || null,
          sort_order: i,
        }
        if (p.id) {
          const { error } = await supabase.from('deal_products').update(productRow).eq('id', p.id)
          if (error) { alert('Product update error: ' + error.message); return }
        } else {
          const { error } = await supabase.from('deal_products').insert(productRow)
          if (error) { alert('Product insert error: ' + error.message); return }
        }
      }

      // Buyers: delete removed (compare against original IDs from when form opened)
      const keptIds = validBuyers.filter(b => b.id).map(b => b.id as string)
      const removedIds = originalBuyerIds.filter(id => !keptIds.includes(id))
      if (removedIds.length > 0) {
        await supabase.from('deal_buyers').delete().in('id', removedIds)
      }

      for (let i = 0; i < validBuyers.length; i++) {
        const b = validBuyers[i]
        const buyerRow = {
          deal_id: editingId,
          company: b.company.trim() || null,
          contact_first_name: b.contactFirst.trim() || null,
          contact_last_name: b.contactLast.trim() || null,
          email: b.email.trim() || null,
          phone: b.phone.trim() || null,
          stage: b.stage,
          freight_cost: b.freight !== '' ? Number(b.freight) : null,
          sort_order: i,
        }
        let buyerId = b.id
        if (b.id) {
          const { error } = await supabase.from('deal_buyers').update(buyerRow).eq('id', b.id)
          if (error) { alert('Buyer update error: ' + error.message); return }
        } else {
          const { data: nb, error } = await supabase.from('deal_buyers').insert(buyerRow).select().single()
          if (error || !nb) { alert('Buyer insert error: ' + error?.message); return }
          buyerId = nb.id
        }
        // Save product allocations for this buyer
        await supabase.from('deal_buyer_products').delete().eq('deal_buyer_id', buyerId)
        const allocations = Object.entries(b.productUnits)
          .filter(([, v]) => v !== '' && Number(v) > 0)
          .map(([productId, units]) => ({
            deal_buyer_id: buyerId,
            deal_product_id: productId,
            units_purchased: Number(units),
            unit_sell: b.productSell[productId] !== '' && b.productSell[productId] != null
              ? Number(b.productSell[productId]) : null,
          }))
        if (allocations.length > 0) {
          const { error } = await supabase.from('deal_buyer_products').insert(allocations)
          if (error) { alert('Product allocation error: ' + error.message); return }
        }
      }
    } else {
      const { data: deal, error } = await supabase.from('deals').insert({
        ...dealPayload, stage: 'inventory-followup', created_by: user?.id ?? null,
      }).select().single()
      if (error || !deal) { alert('Deal create error: ' + error?.message); return }

      if (validProducts.length > 0) {
        await supabase.from('deal_products').insert(
          validProducts.map((p, i) => ({
            deal_id: deal.id,
            description: p.description.trim() || null,
            unit_cost: p.unitCost !== '' ? Number(p.unitCost) : null,
            unit_sell: p.unitSell !== '' ? Number(p.unitSell) : null,
            units_available: p.unitsAvailable !== '' ? Number(p.unitsAvailable) : null,
            cases_available: p.casesAvailable !== '' ? Number(p.casesAvailable) : null,
            pallets_available: p.palletsAvailable !== '' ? Number(p.palletsAvailable) : null,
            expiration_date: p.expirationDate || null,
            sort_order: i,
          }))
        )
      }

      for (let i = 0; i < validBuyers.length; i++) {
        const b = validBuyers[i]
        const { data: nb, error: bErr } = await supabase.from('deal_buyers').insert({
          deal_id: deal.id,
          company: b.company.trim() || null,
          contact_first_name: b.contactFirst.trim() || null,
          contact_last_name: b.contactLast.trim() || null,
          email: b.email.trim() || null,
          phone: b.phone.trim() || null,
          stage: b.stage,
          freight_cost: b.freight !== '' ? Number(b.freight) : null,
          sort_order: i,
        }).select().single()
        if (bErr || !nb) { alert('Buyer insert error: ' + bErr?.message); return }
        const allocations = Object.entries(b.productUnits)
          .filter(([, v]) => v !== '' && Number(v) > 0)
          .map(([productId, units]) => ({
            deal_buyer_id: nb.id,
            deal_product_id: productId,
            units_purchased: Number(units),
          }))
        if (allocations.length > 0) {
          await supabase.from('deal_buyer_products').insert(allocations)
        }
      }

      const notes = [{ deal_id: deal.id, author_name: firstName, text: `${firstName} created this deal in Inventory Follow-Up` }]
      if (formNote.trim()) notes.unshift({ deal_id: deal.id, author_name: firstName, text: formNote.trim() })
      await supabase.from('deal_notes').insert(notes)
    }

    setShowForm(false)
    fetchDeals()
  }

  // ── Move / delete / notes ─────────────────────────────────
  const moveDeal = async (id: string, stageId: string) => {
    const label = STAGES.find(s => s.id === stageId)!.label
    const supabase = createClient()
    const update: Record<string, string> = { stage: stageId }
    if (stageId === 'inventory-secured') {
      const fullName = profile ? `${profile.first_name} ${profile.last_name}` : firstName
      update.sold_by = fullName
    }
    await supabase.from('deals').update(update).eq('id', id)
    await supabase.from('deal_notes').insert({ deal_id: id, author_name: firstName, text: `${firstName} moved to ${label}` })
    fetchDeals()
  }

  const deleteDeal = async (id: string) => {
    const supabase = createClient()
    await supabase.from('deals').delete().eq('id', id)
    if (expandedId === id) setExpandedId(null)
    fetchDeals()
  }

  const addNote = async (id: string) => {
    if (!noteDraft.trim() || savingNote) return
    setSavingNote(true)
    const supabase = createClient()
    await supabase.from('deal_notes').insert({ deal_id: id, author_name: firstName, text: noteDraft.trim() })
    setNoteDraft('')
    setSavingNote(false)
    fetchDeals()
  }

  const saveNoteEdit = async (noteId: string) => {
    if (!editingNoteText.trim()) return
    const supabase = createClient()
    await supabase.from('deal_notes').update({ text: editingNoteText.trim() }).eq('id', noteId)
    setEditingNoteId(null)
    setEditingNoteText('')
    fetchDeals()
  }

  const deleteNote = async (noteId: string) => {
    if (!confirm('Delete this note?')) return
    const supabase = createClient()
    await supabase.from('deal_notes').delete().eq('id', noteId)
    fetchDeals()
  }

  const splitDeal = async (d: Deal, p: Product, remaining: number) => {
    const nextNum = d.deal_number != null ? d.deal_number + 1 : null
    const label = nextNum ? `#${nextNum} ` : ''
    if (!confirm(`Split ${remaining.toLocaleString()} remaining units of "${p.description || 'product'}" into a new deal?\n\nThis will:\n• Reduce current deal units to committed amount\n• Create ${label}${d.company} with the remaining ${remaining.toLocaleString()} units`)) return

    const supabase = createClient()

    // 1. Update current product units_available to committed amount
    const committed = d.deal_buyers.reduce((s, b) => {
      const bp = b.deal_buyer_products.find(x => x.deal_product_id === p.id)
      return s + (bp ? Number(bp.units_purchased) : 0)
    }, 0)
    await supabase.from('deal_products').update({ units_available: committed }).eq('id', p.id)

    // 2. Create new deal with same vendor info
    const { data: newDeal, error } = await supabase.from('deals').insert({
      deal_number: nextNum,
      company: d.company,
      contact_first_name: d.contact_first_name,
      contact_last_name: d.contact_last_name,
      contact_email: d.contact_email,
      contact_phone: d.contact_phone,
      stage: 'inventory-followup',
      sourced_by: d.sourced_by,
      value: (p.unit_sell ?? 0) * remaining,
      created_by: user?.id ?? null,
    }).select().single()
    if (error || !newDeal) { alert('Split error: ' + error?.message); return }

    // 3. Copy product with remaining units
    await supabase.from('deal_products').insert({
      deal_id: newDeal.id,
      description: p.description,
      unit_cost: p.unit_cost,
      unit_sell: p.unit_sell,
      units_available: remaining,
      cases_available: p.cases_available,
      pallets_available: p.pallets_available,
      expiration_date: p.expiration_date,
      sort_order: 0,
    })

    // 4. Add notes linking the two deals
    const dealLabel = d.deal_number ? `Deal #${d.deal_number}` : d.company
    const newLabel = nextNum ? `Deal #${nextNum}` : 'new deal'
    await supabase.from('deal_notes').insert([
      { deal_id: d.id, author_name: firstName, text: `${remaining.toLocaleString()} units of "${p.description || 'product'}" split into ${newLabel}` },
      { deal_id: newDeal.id, author_name: firstName, text: `Created from ${dealLabel} — ${remaining.toLocaleString()} remaining units of "${p.description || 'product'}"` },
    ])

    fetchDeals()
  }

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/auth')
  }

  // ── CSV export ────────────────────────────────────────────
  const exportCSV = () => {
    const rows: string[][] = [
      ['Company', 'Contact First', 'Contact Last', 'Contact Email', 'Contact Phone',
       'Deal Value', 'Freight', 'Close Date', 'Stage',
       'Product #', 'Description', 'Cost/Unit', 'Sell/Unit', 'Units', 'Cases', 'Pallets', 'Expiration',
       'Buyer #', 'Buyer Company', 'Buyer Contact', 'Buyer Email', 'Buyer Stage', 'Units Committed',
       'Latest Note Date'],
    ]
    for (const d of deals) {
      const noteDate = d.deal_notes[0]?.created_at ? fmtStamp(d.deal_notes[0].created_at) : ''
      const maxRows = Math.max(1, d.deal_products.length, d.deal_buyers.length)
      for (let i = 0; i < maxRows; i++) {
        const p = d.deal_products[i]
        const b = d.deal_buyers[i]
        rows.push([
          i === 0 ? d.company : '',
          i === 0 ? (d.contact_first_name ?? '') : '',
          i === 0 ? (d.contact_last_name ?? '') : '',
          i === 0 ? (d.contact_email ?? '') : '',
          i === 0 ? (d.contact_phone ?? '') : '',
          i === 0 ? String(d.value) : '',
          i === 0 ? String(d.freight_cost ?? '') : '',
          i === 0 ? (d.close_date ?? '') : '',
          i === 0 ? d.stage : '',
          p ? String(i + 1) : '',
          p?.description ?? '',
          p?.unit_cost != null ? String(p.unit_cost) : '',
          p?.unit_sell != null ? String(p.unit_sell) : '',
          p?.units_available != null ? String(p.units_available) : '',
          p?.cases_available != null ? String(p.cases_available) : '',
          p?.pallets_available != null ? String(p.pallets_available) : '',
          p?.expiration_date ?? '',
          b ? String(i + 1) : '',
          b?.company ?? '',
          b ? [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ') : '',
          b?.email ?? '',
          b?.stage ?? '',
          b ? String(b.deal_buyer_products.reduce((s, bp) => s + Number(bp.units_purchased), 0)) : '',
          i === 0 ? noteDate : '',
        ])
      }
    }
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'tradiant-deals.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Shared styles ─────────────────────────────────────────
  const inputStyle: CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: `1.5px solid ${C.line}`, background: '#FDFAF6', color: C.ink,
    fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
    transition: 'border-color .15s',
  }
  const labelStyle: CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
    color: C.sub, marginBottom: 5, display: 'block',
  }
  const smInput: CSSProperties = { ...inputStyle, padding: '8px 10px', fontSize: 13 }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.cream, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, color: C.sub, letterSpacing: '0.05em' }}>Loading…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: "'Inter', ui-sans-serif, -apple-system, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.cream, padding: '20px 20px 0' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/tradiant-logo.webp" alt="Tradiant" style={{ height: 38, width: 'auto' }} />
              <div style={{ display: 'flex', gap: 1, background: '#EDE4D8', borderRadius: 10, padding: 4 }}>
                <span style={{ padding: '6px 18px', borderRadius: 7, fontSize: 13, fontWeight: 700, color: C.ink, background: C.card, boxShadow: '0 1px 3px rgba(42,33,24,0.10)' }}>Board</span>
                <a href="/dashboard" style={{ padding: '6px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, textDecoration: 'none', color: C.sub }}>Dashboard</a>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: C.sub, marginRight: 4 }}>
                <b style={{ color: C.ink, fontWeight: 600 }}>{profile?.first_name} {profile?.last_name}</b>
              </span>
              <button
                onClick={() => setShowClosed(s => !s)}
                style={{ background: showClosed ? C.ink : C.card, color: showClosed ? '#fff' : C.sub, border: `1.5px solid ${showClosed ? C.ink : C.line}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                {showClosed ? '← Board' : `Closed (${deals.filter(d => d.stage === 'paid' || d.stage === 'lost').length})`}
              </button>
              <button onClick={exportCSV} style={{ background: C.card, color: C.sub, border: `1.5px solid ${C.line}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                ↓ CSV
              </button>
              <button onClick={fetchDeals} style={{ background: C.card, color: C.sub, border: `1.5px solid ${C.line}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                ↻
              </button>
              <button onClick={signOut} style={{ background: 'none', border: 'none', color: C.orange, fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: '8px 4px' }}>Sign out</button>
              {!showClosed && (
                <button onClick={openAdd} style={{ background: C.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(232,89,12,0.30)' }}>
                  + New deal
                </button>
              )}
            </div>
          </div>

          {/* Pipeline rail */}
          <div style={{ margin: '16px 0 0', paddingBottom: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.sub, marginBottom: 8 }}>
              <span><b style={{ color: C.ink, fontWeight: 700 }}>{fmtMoney(activeValue)}</b> active in pipeline</span>
              <span>{fmtMoney(totalValue)} all-time tracked</span>
            </div>
            <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: '#EDE4D8' }}>
              {STAGES.map(s => {
                const v = stageValue(s.id)
                const w = totalValue ? (v / totalValue) * 100 : 0
                return w > 0 ? (
                  <div key={s.id} title={`${s.label}: ${fmtMoney(v)}`}
                    style={{ width: w + '%', background: s.outline ? '#F3A468' : s.color, transition: 'width .3s' }} />
                ) : null
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Closed deals list ── */}
      {showClosed && (
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 60px' }}>
          {(['paid', 'lost'] as const).map(stageId => {
            const stageConf = STAGES.find(s => s.id === stageId)!
            const list = byStage(stageId)
            return (
              <div key={stageId} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: stageConf.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{stageConf.label}</span>
                  <span style={{ fontSize: 13, color: C.sub }}>{list.length} deal{list.length !== 1 ? 's' : ''}</span>
                </div>
                {list.length === 0 ? (
                  <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: 16, fontSize: 12, color: C.sub }}>None yet</div>
                ) : (
                  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: C.cream }}>
                          {['Deal', 'Vendor', 'Products', 'Revenue', 'Profit', 'Closed', ''].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.sub }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((d, i) => {
                          const hasBuyers = d.deal_buyers.some(b => b.deal_buyer_products.length > 0)
                          let rev = 0
                          if (hasBuyers) {
                            for (const b of d.deal_buyers) {
                              for (const bp of b.deal_buyer_products) {
                                const prod = d.deal_products.find(p => p.id === bp.deal_product_id)
                                rev += (bp.unit_sell ?? prod?.unit_sell ?? 0) * Number(bp.units_purchased)
                              }
                            }
                          } else {
                            rev = d.deal_products.reduce((s, p) => s + (p.unit_sell ?? 0) * (p.units_available ?? 0), 0)
                          }
                          // Broker model: cost only on units actually sold, unsold = $0 cost
                          const cost = hasBuyers
                            ? d.deal_products.reduce((s, p) => {
                                const sold = d.deal_buyers.reduce((su, b) => {
                                  const bp = b.deal_buyer_products.find(x => x.deal_product_id === p.id)
                                  return su + (bp ? Number(bp.units_purchased) : 0)
                                }, 0)
                                return s + (p.unit_cost ?? 0) * sold
                              }, 0)
                            : d.deal_products.reduce((s, p) => s + (p.unit_cost ?? 0) * (p.units_available ?? 0), 0)
                          const freight = d.deal_buyers.reduce((s, b) => s + Number(b.freight_cost ?? 0), 0)
                          const profit = rev - cost - freight
                          return (
                            <tr key={d.id} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 === 0 ? C.card : '#FDFAF6' }}>
                              <td style={{ padding: '11px 14px', fontWeight: 700, color: C.orange, whiteSpace: 'nowrap' }}>
                                {d.deal_number != null ? `#${d.deal_number}` : '—'}
                              </td>
                              <td style={{ padding: '11px 14px', fontWeight: 700, color: C.ink }}>{d.company}</td>
                              <td style={{ padding: '11px 14px', color: C.sub, fontSize: 12 }}>
                                {d.deal_products.map(p => p.description).filter(Boolean).join(', ') || '—'}
                              </td>
                              <td style={{ padding: '11px 14px', fontWeight: 700, color: C.ink }}>{fmtMoney(rev)}</td>
                              <td style={{ padding: '11px 14px', fontWeight: 700, color: profit >= 0 ? C.green : C.red }}>{fmtMoney(profit)}</td>
                              <td style={{ padding: '11px 14px', color: C.sub, fontSize: 12 }}>{fmtDate(d.close_date)}</td>
                              <td style={{ padding: '11px 14px' }}>
                                <button onClick={() => openEdit(d)} style={{ background: 'none', border: `1px solid ${C.line}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: C.sub, fontFamily: 'inherit' }}>
                                  Edit
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Board ── */}
      {!showClosed && (
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 16px 60px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 14, minWidth: 920, alignItems: 'flex-start' }}>
          {STAGES.filter(s => !s.closed).map(stage => {
            const list = byStage(stage.id)
            return (
              <div key={stage.id} style={{ flex: 1, minWidth: 240 }}>
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '10px 14px', background: C.card, borderRadius: 10, border: `1.5px solid ${C.line}`, boxShadow: '0 1px 3px rgba(42,33,24,0.05)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: stage.outline ? 'transparent' : stage.color, border: `2px solid ${stage.color}`, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{stage.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.card, background: C.sub, borderRadius: 999, padding: '1px 7px' }}>{list.length}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: stage.color }}>{fmtMoney(stageValue(stage.id))}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {list.length === 0 && (
                    <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: '24px 10px', textAlign: 'center', fontSize: 12, color: C.sub }}>
                      No deals here yet
                    </div>
                  )}
                  {list.map(d => {
                    const isOpen = expandedId === d.id
                    // Revenue: use buyer negotiated price where set, else product default
                    const hasBuyerAllocations = d.deal_buyers.some(b => b.deal_buyer_products.length > 0)
                    let rev = 0
                    if (hasBuyerAllocations) {
                      for (const b of d.deal_buyers) {
                        for (const bp of b.deal_buyer_products) {
                          const prod = d.deal_products.find(p => p.id === bp.deal_product_id)
                          const price = bp.unit_sell ?? prod?.unit_sell ?? 0
                          rev += price * Number(bp.units_purchased)
                        }
                      }
                      // Add uncommitted units only for open/in-progress deals
                      // Won deals: unsold inventory counts as loss (cost, no revenue)
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
                    // For Won deals: cost only on units actually sold (broker model — no inventory risk)
                    const cost = d.stage === 'won' && hasBuyerAllocations
                      ? d.deal_products.reduce((s, p) => {
                          const soldUnits = d.deal_buyers.reduce((su, b) => {
                            const bp = b.deal_buyer_products.find(x => x.deal_product_id === p.id)
                            return su + (bp ? Number(bp.units_purchased) : 0)
                          }, 0)
                          return s + (p.unit_cost ?? 0) * soldUnits
                        }, 0)
                      : d.deal_products.reduce((s, p) => s + (p.unit_cost ?? 0) * (p.units_available ?? 0), 0)
                    const freight = d.deal_buyers.reduce((s, b) => s + Number(b.freight_cost ?? 0), 0)
                    const profit = rev - cost - freight
                    const hasFinancials = d.deal_products.some(p => p.unit_sell != null || p.unit_cost != null)
                    return (
                      <div key={d.id} style={{ background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: '16px 16px 14px', boxShadow: '0 2px 8px rgba(42,33,24,0.07), 0 1px 2px rgba(42,33,24,0.04)', transition: 'box-shadow .15s' }}>

                        {/* Company header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25, color: C.ink }}>
                            {d.deal_number != null && (
                              <span style={{ color: C.orange, fontWeight: 700, marginRight: 6 }}>#{d.deal_number}</span>
                            )}
                            {d.company}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: stage.color, whiteSpace: 'nowrap', marginTop: 1 }}>
                            {hasFinancials ? fmtMoney(rev) : fmtMoney(d.value)}
                          </div>
                        </div>

                        {/* Vendor contact */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 8 }}>
                          {(d.contact_first_name || d.contact_last_name) && (
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>
                              {[d.contact_first_name, d.contact_last_name].filter(Boolean).join(' ')}
                            </div>
                          )}
                          {d.contact_email && <div style={{ fontSize: 12, color: C.sub }}>{d.contact_email}</div>}
                          {d.contact_phone && <div style={{ fontSize: 12, color: C.sub }}>{d.contact_phone}</div>}
                          {d.close_date && (
                            <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                              Close <b style={{ color: C.ink }}>{fmtDate(d.close_date)}</b>
                            </div>
                          )}
                        </div>

                        {/* Revenue / Cost / Profit */}
                        {hasFinancials && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 10 }}>
                            <div style={{ background: '#EAF6EE', borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.green, marginBottom: 3 }}>Revenue</div>
                              <div style={{ fontWeight: 800, fontSize: 15, color: C.green, lineHeight: 1 }}>{fmtMoney(rev)}</div>
                            </div>
                            <div style={{ background: '#FDECEA', borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.red, marginBottom: 3 }}>Cost</div>
                              <div style={{ fontWeight: 800, fontSize: 15, color: C.red, lineHeight: 1 }}>{fmtMoney(cost)}</div>
                            </div>
                            <div style={{ background: profit >= 0 ? '#FEF9E7' : '#FDECEA', borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: profit >= 0 ? '#B7860B' : C.red, marginBottom: 3 }}>Profit</div>
                              <div style={{ fontWeight: 800, fontSize: 15, color: profit >= 0 ? '#B7860B' : C.red, lineHeight: 1 }}>{fmtMoney(profit)}</div>
                            </div>
                          </div>
                        )}

                        {/* Inventory */}
                        {d.deal_products.length > 0 && d.deal_buyers.length > 0 && (
                          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, marginBottom: 10 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.sub, marginBottom: 8 }}>Inventory</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {d.deal_products.map(p => {
                                const avail = p.units_available ?? 0
                                const committed = d.deal_buyers.reduce((s, b) => {
                                  const bp = b.deal_buyer_products.find(x => x.deal_product_id === p.id)
                                  return s + (bp ? Number(bp.units_purchased) : 0)
                                }, 0)
                                const remaining = avail - committed
                                const pct = avail > 0 ? Math.min((committed / avail) * 100, 100) : 0
                                const soldOut = remaining <= 0
                                return (
                                  <div key={p.id}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                                      <span style={{ fontSize: 11, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{p.description || 'Product'}</span>
                                      <span style={{ fontSize: 10, color: C.sub, whiteSpace: 'nowrap', marginLeft: 8 }}>
                                        {committed.toLocaleString()}<span style={{ color: C.sub }}> / {avail.toLocaleString()} · </span>
                                        <b style={{ color: soldOut ? C.green : C.orange }}>{soldOut ? 'Sold out' : `${remaining.toLocaleString()} left`}</b>
                                      </span>
                                    </div>
                                    <div style={{ height: 4, borderRadius: 999, background: C.line, overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: pct + '%', background: soldOut ? C.green : C.orange, borderRadius: 999, transition: 'width .3s' }} />
                                    </div>
                                    {!soldOut && committed > 0 && (
                                      <button
                                        onClick={() => splitDeal(d, p, remaining)}
                                        style={{ marginTop: 5, background: 'none', border: `1px solid ${C.orange}`, color: C.orange, borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                                      >
                                        Split {remaining.toLocaleString()} remaining →
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Buyers */}
                        {d.deal_buyers.length > 0 && (
                          <div style={{ borderTop: d.deal_buyers.length > 0 && !(d.deal_products.length > 0) ? `1px solid ${C.line}` : 'none', paddingTop: d.deal_products.length > 0 && d.deal_buyers.length > 0 ? 0 : 10, marginBottom: 10 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.sub, marginBottom: 6 }}>
                              Buyers ({d.deal_buyers.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {d.deal_buyers.map(b => {
                                const totalUnits = b.deal_buyer_products.reduce((s, bp) => s + Number(bp.units_purchased), 0)
                                return (
                                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: C.cream, borderRadius: 8, padding: '7px 10px' }}>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {b.company || [b.contact_first_name, b.contact_last_name].filter(Boolean).join(' ') || 'Unnamed buyer'}
                                      </div>
                                      <div style={{ display: 'flex', gap: 8, marginTop: 1 }}>
                                        {totalUnits > 0 && <span style={{ fontSize: 10, color: C.sub }}>{totalUnits.toLocaleString()} units</span>}
                                        {b.freight_cost != null && b.freight_cost > 0 && (
                                          <span style={{ fontSize: 10, color: C.red }}>+{fmtMoney(b.freight_cost)} freight</span>
                                        )}
                                      </div>
                                    </div>
                                    <BuyerStagePill stageId={b.stage} />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Sourced by / Sold by */}
                        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                          {d.sourced_by && <span style={{ fontSize: 11, color: C.sub }}>Sourced by <b style={{ color: C.ink }}>{d.sourced_by}</b></span>}
                          {d.sold_by && <span style={{ fontSize: 11, color: C.sub }}>Sold by <b style={{ color: C.ink }}>{d.sold_by}</b></span>}
                        </div>

                        {/* Move controls */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
                          <select
                            value={d.stage}
                            onChange={e => moveDeal(d.id, e.target.value)}
                            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.line}`, background: C.cream, color: C.ink, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            {STAGES.map(s => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                          <MiniBtn color={C.sub} ghost onClick={() => { setExpandedId(isOpen ? null : d.id); setNoteDraft('') }}>
                            {isOpen ? 'Hide notes' : `Notes (${d.deal_notes.length})`}
                          </MiniBtn>
                        </div>

                        {/* Notes */}
                        {isOpen && (
                          <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input
                                style={{ ...inputStyle, padding: '8px 10px', fontSize: 13 }}
                                placeholder="Add a note…"
                                value={noteDraft}
                                onChange={e => setNoteDraft(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addNote(d.id)}
                              />
                              <MiniBtn color={C.orange} onClick={() => addNote(d.id)}>Add</MiniBtn>
                            </div>
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                              {d.deal_notes.map(n => (
                                <div key={n.id} style={{ fontSize: 12, marginBottom: 6 }}>
                                  <span style={{ color: C.sub }}>{fmtStamp(n.created_at)} · </span>
                                  {editingNoteId === n.id ? (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                      <input
                                        style={{ flex: 1, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.line}`, background: C.cream, color: C.ink, fontFamily: 'inherit' }}
                                        value={editingNoteText}
                                        onChange={e => setEditingNoteText(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') saveNoteEdit(n.id); if (e.key === 'Escape') setEditingNoteId(null) }}
                                        autoFocus
                                      />
                                      <button onClick={() => saveNoteEdit(n.id)} style={{ background: 'none', border: 'none', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Save</button>
                                      <button onClick={() => setEditingNoteId(null)} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Cancel</button>
                                    </div>
                                  ) : (
                                    <span>
                                      {n.text}
                                      <button onClick={() => { setEditingNoteId(n.id); setEditingNoteText(n.text) }} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 11, cursor: 'pointer', marginLeft: 6, padding: 0, fontFamily: 'inherit' }}>Edit</button>
                                      <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 11, cursor: 'pointer', marginLeft: 4, padding: 0, fontFamily: 'inherit' }}>Delete</button>
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                              <button onClick={() => openEdit(d)} style={{ background: 'none', border: 'none', color: C.orange, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Edit deal</button>
                              <button onClick={() => deleteDeal(d.id)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      )}

      {/* ── Add / Edit modal ── */}
      {showForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 22, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>
              {editingId ? 'Edit deal' : 'New deal'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Vendor info */}
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 90 }}>
                    <span style={labelStyle}>Deal #</span>
                    <input style={inputStyle} type="number" min="1" value={formDealNumber} onChange={e => setFormDealNumber(e.target.value)} placeholder="1" />
                  </div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <span style={labelStyle}>Company (vendor) *</span>
                    <input
                      style={inputStyle}
                      value={formCompany}
                      onChange={e => { setFormCompany(e.target.value); setShowVendorSuggest(true) }}
                      onFocus={() => setShowVendorSuggest(true)}
                      onBlur={() => setTimeout(() => setShowVendorSuggest(false), 150)}
                      placeholder="e.g. Summit Beverage Co."
                      autoComplete="off"
                    />
                    {showVendorSuggest && formCompany.length > 0 && (() => {
                      const matches = knownVendors.filter(v =>
                        v.company.toLowerCase().includes(formCompany.toLowerCase()) &&
                        v.company.toLowerCase() !== formCompany.toLowerCase()
                      ).slice(0, 6)
                      if (matches.length === 0) return null
                      return (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, zIndex: 100, boxShadow: '0 4px 16px rgba(42,33,24,0.12)', overflow: 'hidden' }}>
                          {matches.map((v, i) => (
                            <div
                              key={i}
                              onMouseDown={() => {
                                setFormCompany(v.company)
                                setFormContactFirst(v.contactFirst)
                                setFormContactLast(v.contactLast)
                                setFormContactEmail(v.email)
                                setFormContactPhone(v.phone)
                                setShowVendorSuggest(false)
                              }}
                              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, borderBottom: `1px solid ${C.line}` }}
                              onMouseEnter={e => (e.currentTarget.style.background = C.cream)}
                              onMouseLeave={e => (e.currentTarget.style.background = C.card)}
                            >
                              <div style={{ fontWeight: 700, color: C.ink }}>{v.company}</div>
                              {(v.contactFirst || v.contactLast) && (
                                <div style={{ color: C.sub, fontSize: 11 }}>{[v.contactFirst, v.contactLast].filter(Boolean).join(' ')}{v.email ? ` · ${v.email}` : ''}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.sub, marginBottom: 10 }}>Vendor Contact</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <span style={labelStyle}>First name</span>
                      <input style={inputStyle} value={formContactFirst} onChange={e => setFormContactFirst(e.target.value)} placeholder="First" autoComplete="off" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={labelStyle}>Last name</span>
                      <input style={inputStyle} value={formContactLast} onChange={e => setFormContactLast(e.target.value)} placeholder="Last" autoComplete="off" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <span style={labelStyle}>Email</span>
                      <input style={inputStyle} type="email" value={formContactEmail} onChange={e => setFormContactEmail(e.target.value)} placeholder="contact@company.com" autoComplete="off" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={labelStyle}>Phone</span>
                      <input style={inputStyle} type="tel" value={formContactPhone} onChange={e => setFormContactPhone(e.target.value)} placeholder="(555) 000-0000" autoComplete="off" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <span style={labelStyle}>Expected close</span>
                <input style={inputStyle} type="date" value={formCloseDate} onChange={e => setFormCloseDate(e.target.value)} />
              </div>

              {/* Products section */}
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, marginTop: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.sub }}>
                    Products ({products.length})
                  </span>
                  <button
                    onClick={addProduct}
                    style={{ background: 'none', border: `1px solid ${C.orange}`, color: C.orange, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    + Add product
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {products.map((p, i) => (
                    <div key={i} style={{ background: C.cream, borderRadius: 10, padding: '12px 12px 10px', position: 'relative' }}>
                      {products.length > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>PRODUCT {i + 1}</span>
                          <button onClick={() => removeProduct(i)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Remove</button>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div>
                          <span style={labelStyle}>Description</span>
                          <input style={smInput} value={p.description} onChange={e => updateProduct(i, 'description', e.target.value)} placeholder="e.g. Organic oat milk, 32 oz cartons" />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <span style={labelStyle}>Our cost/unit ($)</span>
                            <input style={smInput} type="number" min="0" step="0.01" value={p.unitCost} onChange={e => updateProduct(i, 'unitCost', e.target.value)} placeholder="4.50" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={labelStyle}>Sell price/unit ($)</span>
                            <input style={smInput} type="number" min="0" step="0.01" value={p.unitSell} onChange={e => updateProduct(i, 'unitSell', e.target.value)} placeholder="6.00" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={labelStyle}>Expiration</span>
                            <input style={smInput} type="date" value={p.expirationDate} onChange={e => updateProduct(i, 'expirationDate', e.target.value)} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <span style={labelStyle}>Units</span>
                            <input style={smInput} type="number" min="0" value={p.unitsAvailable} onChange={e => updateProduct(i, 'unitsAvailable', e.target.value)} placeholder="0" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={labelStyle}>Cases</span>
                            <input style={smInput} type="number" min="0" value={p.casesAvailable} onChange={e => updateProduct(i, 'casesAvailable', e.target.value)} placeholder="0" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={labelStyle}>Pallets</span>
                            <input style={smInput} type="number" min="0" value={p.palletsAvailable} onChange={e => updateProduct(i, 'palletsAvailable', e.target.value)} placeholder="0" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Buyers section */}
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, marginTop: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.sub }}>
                    Buyers ({buyers.length})
                  </span>
                  <button
                    onClick={addBuyer}
                    style={{ background: 'none', border: `1px solid ${C.green}`, color: C.green, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    + Add buyer
                  </button>
                </div>
                {buyers.length === 0 && (
                  <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', padding: '10px 0' }}>No buyers yet — click + Add buyer</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {buyers.map((b, i) => (
                    <div key={i} style={{ background: '#F0FAF4', borderRadius: 10, padding: '12px 12px 10px', border: `1px solid #C8E6D4` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>BUYER {i + 1}</span>
                        <button onClick={() => removeBuyer(i)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Remove</button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ position: 'relative' }}>
                          <span style={labelStyle}>Buyer company</span>
                          <input
                            style={smInput}
                            value={b.company}
                            onChange={e => {
                              updateBuyer(i, 'company', e.target.value)
                              setBuyerSuggestIdx(i)
                            }}
                            onFocus={() => setBuyerSuggestIdx(i)}
                            onBlur={() => setTimeout(() => setBuyerSuggestIdx(null), 150)}
                            placeholder="e.g. Fresh Market Co."
                            autoComplete="off"
                          />
                          {buyerSuggestIdx === i && b.company.length > 0 && (() => {
                            const matches = knownBuyers.filter(k =>
                              k.company.toLowerCase().includes(b.company.toLowerCase()) &&
                              k.company.toLowerCase() !== b.company.toLowerCase()
                            ).slice(0, 6)
                            if (matches.length === 0) return null
                            return (
                              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, zIndex: 100, boxShadow: '0 4px 16px rgba(42,33,24,0.12)', overflow: 'hidden' }}>
                                {matches.map((m, mi) => (
                                  <div
                                    key={mi}
                                    onMouseDown={() => {
                                      setBuyers(bs => bs.map((bx, bxi) => bxi === i ? {
                                        ...bx,
                                        company: m.company,
                                        contactFirst: m.contactFirst,
                                        contactLast: m.contactLast,
                                        email: m.email,
                                        phone: m.phone,
                                      } : bx))
                                      setBuyerSuggestIdx(null)
                                    }}
                                    style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 12, borderBottom: `1px solid ${C.line}` }}
                                    onMouseEnter={e => (e.currentTarget.style.background = C.cream)}
                                    onMouseLeave={e => (e.currentTarget.style.background = C.card)}
                                  >
                                    <div style={{ fontWeight: 700, color: C.ink }}>{m.company}</div>
                                    {(m.contactFirst || m.contactLast) && (
                                      <div style={{ color: C.sub, fontSize: 11 }}>{[m.contactFirst, m.contactLast].filter(Boolean).join(' ')}{m.email ? ` · ${m.email}` : ''}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <span style={labelStyle}>First name</span>
                            <input style={smInput} value={b.contactFirst} onChange={e => updateBuyer(i, 'contactFirst', e.target.value)} placeholder="First" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={labelStyle}>Last name</span>
                            <input style={smInput} value={b.contactLast} onChange={e => updateBuyer(i, 'contactLast', e.target.value)} placeholder="Last" />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <span style={labelStyle}>Email</span>
                            <input style={smInput} type="email" value={b.email} onChange={e => updateBuyer(i, 'email', e.target.value)} placeholder="buyer@company.com" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={labelStyle}>Phone</span>
                            <input style={smInput} type="tel" value={b.phone} onChange={e => updateBuyer(i, 'phone', e.target.value)} placeholder="(555) 000-0000" />
                          </div>
                        </div>
                        <div>
                          <span style={labelStyle}>Stage</span>
                          <select style={{ ...smInput }} value={b.stage} onChange={e => updateBuyer(i, 'stage', e.target.value)}>
                            {BUYER_STAGES.map(s => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* Products purchased — only show when editing (products have real IDs) */}
                        {editingId && products.filter(p => p.id && (p.description.trim() || p.unitsAvailable !== '')).length > 0 && (
                          <div>
                            <span style={labelStyle}>Products purchased</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {products.map((p, pi) => {
                                if (!p.id || (!p.description.trim() && p.unitsAvailable === '')) return null
                                const avail = p.unitsAvailable !== '' ? Number(p.unitsAvailable) : null
                                const committedByOthers = buyers.reduce((s, ob, oi) => {
                                  if (oi === i) return s
                                  const v = ob.productUnits[p.id!]
                                  return s + (v !== '' && v !== undefined ? Number(v) : 0)
                                }, 0)
                                const remaining = avail != null ? avail - committedByOthers : null
                                return (
                                  <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.cream, borderRadius: 6, padding: '6px 10px' }}>
                                    <span style={{ flex: 1, fontSize: 12, color: C.ink }}>
                                      {p.description || `Product ${pi + 1}`}
                                      {remaining != null && <span style={{ color: C.sub, marginLeft: 6 }}>{remaining.toLocaleString()} avail</span>}
                                    </span>
                                    <input
                                      style={{ ...smInput, width: 80 }}
                                      type="number" min="0"
                                      placeholder="units"
                                      value={b.productUnits[p.id!] ?? ''}
                                      onChange={e => {
                                        const updated = { ...b.productUnits, [p.id!]: e.target.value }
                                        updateBuyer(i, 'productUnits', updated as unknown as string)
                                      }}
                                    />
                                    <input
                                      style={{ ...smInput, width: 90 }}
                                      type="number" min="0" step="0.01"
                                      placeholder={p.unitSell !== '' ? `$${p.unitSell} default` : 'sell $'}
                                      value={b.productSell[p.id!] ?? ''}
                                      onChange={e => {
                                        const updated = { ...b.productSell, [p.id!]: e.target.value }
                                        updateBuyer(i, 'productSell', updated as unknown as string)
                                      }}
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {!editingId && products.some(p => p.description.trim() || p.unitsAvailable !== '') && (
                          <div style={{ fontSize: 11, color: C.sub, background: C.cream, borderRadius: 6, padding: '7px 10px' }}>
                            Save the deal first, then edit to assign products to this buyer.
                          </div>
                        )}
                        <div>
                          <span style={labelStyle}>Freight cost ($)</span>
                          <input style={smInput} type="number" min="0" step="0.01" value={b.freight} onChange={e => updateBuyer(i, 'freight', e.target.value)} placeholder="0.00" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <span style={labelStyle}>Sourced by</span>
                    <input style={inputStyle} value={formSourcedBy} onChange={e => setFormSourcedBy(e.target.value)} placeholder="Your name" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={labelStyle}>Sold by</span>
                    <input style={inputStyle} value={formSoldBy} onChange={e => setFormSoldBy(e.target.value)} placeholder="Auto-fills on In Progress" />
                  </div>
                </div>
              </div>

              {!editingId && (
                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                  <span style={labelStyle}>First note (optional)</span>
                  <input style={inputStyle} value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="How did this opportunity come in?" />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: `1px solid ${C.line}`, borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: C.sub, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={saveForm} style={{ background: C.orange, color: '#fff', border: 'none', borderRadius: 999, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: formCompany.trim() ? 1 : 0.5, fontFamily: 'inherit' }}>
                {editingId ? 'Save changes' : 'Add to Open'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
