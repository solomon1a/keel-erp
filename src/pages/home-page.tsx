import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  Check,
  FileText,
  Landmark,
  Package,
  Percent,
  Plus,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { moduleIconId, ModuleIcon, type ModuleIconId } from '../brand/module-icon.tsx'
import { HomeChart } from '../components/home-chart.tsx'
import { useToast } from '../components/toast.tsx'
import { Button } from '../components/ui/button.tsx'
import { useI18n, type Locale, type Translate } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import type { User } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'

type HomeRange = 'today' | 'week' | 'month' | 'year'
type OrderTab = 'all' | 'quotes' | 'invoice'
type OrderStatus = 'quotation' | 'sent' | 'confirmed' | 'to_invoice' | 'cancelled' | 'open'
type AttentionKind = 'purchase' | 'invoice' | 'expense' | 'leave'
type StepKey = 'company' | 'team' | 'contacts' | 'taxes' | 'bank' | 'quotation'

type Attention = {
  kind: AttentionKind
  id: number
  name: string
  partner: string
  amount: number | null
  days: number | null
  dateFrom: string | null
  dateTo: string | null
  href: string
}

type HomeOrder = {
  id: number
  name: string
  customer: string
  date: string
  amount: number
  status: OrderStatus
}

type HomeData = {
  range: HomeRange
  empty: boolean
  bank: { balance: number; accounts: number; changePct: number }
  kpis: {
    revenue: { amount: number; changePct: number }
    profit: { amount: number; margin: number; marginDelta: number }
    receivable: { amount: number; overdueCount: number; overdueAmount: number }
    payable: { amount: number; dueSoonAmount: number }
  }
  chart: { months: { month: string; income: number; expense: number }[] }
  pipeline: {
    openCount: number
    winRate: number
    stages: { stage: 'new' | 'qualified' | 'proposition' | 'won'; count: number; amount: number }[]
    openValue: number
    avgDeal: number
  }
  orders: HomeOrder[]
  attention: Attention[]
  attentionCount: number
  lowStock: { id: number; name: string; onHand: number; level: 'bad' | 'warn' }[]
  onboarding: {
    done: number
    total: number
    steps: { key: StepKey; done: boolean; href: string }[]
  } | null
}

const ranges: HomeRange[] = ['today', 'week', 'month', 'year']

const shortcuts: { id: ModuleIconId; to: string; color: string; label: MessageKey }[] = [
  { id: 'sales', to: '/orders', color: '#0E7C66', label: 'home.app.sales' },
  { id: 'purchase', to: '/purchases', color: '#7C3AED', label: 'home.app.purchase' },
  { id: 'inventory', to: '/inventory', color: '#C2410C', label: 'home.app.inventory' },
  { id: 'accounting', to: '/accounting', color: '#15803D', label: 'home.app.finance' },
  { id: 'hr', to: '/hr', color: '#4F46E5', label: 'home.app.hr' },
  { id: 'manufacturing', to: '/manufacturing', color: '#8A3E06', label: 'home.app.manufacturing' },
]

function greetingKey(hour: number): MessageKey {
  if (hour < 12) return 'apps.greeting.morning'
  if (hour < 18) return 'apps.greeting.afternoon'
  return 'apps.greeting.evening'
}

function rangeKey(range: HomeRange): MessageKey {
  switch (range) {
    case 'today':
      return 'home.range.today'
    case 'week':
      return 'home.range.week'
    case 'month':
      return 'home.range.month'
    case 'year':
      return 'home.range.year'
    default: {
      const unexpected: never = range
      return unexpected
    }
  }
}

function compareKey(range: HomeRange): MessageKey {
  switch (range) {
    case 'today':
      return 'home.compare.today'
    case 'week':
      return 'home.compare.week'
    case 'month':
      return 'home.compare.month'
    case 'year':
      return 'home.compare.year'
    default: {
      const unexpected: never = range
      return unexpected
    }
  }
}

function trend(value: number) {
  const abs = Math.abs(value)
  const text = abs >= 100 ? abs.toFixed(0) : abs.toFixed(1)
  if (value > 0.05) return { tone: 'home-ok', text: `▲ ${text}%` }
  if (value < -0.05) return { tone: 'home-bad', text: `▼ ${text}%` }
  return { tone: 'home-mute', text: '0%' }
}

function points(delta: number) {
  const abs = Math.abs(delta).toFixed(1)
  if (delta > 0.05) return `▲ ${abs}`
  if (delta < -0.05) return `▼ ${abs}`
  return '0'
}

function dayLabel(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
}

function longDate(locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

function qtyLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function statusKey(status: OrderStatus): MessageKey {
  switch (status) {
    case 'quotation':
      return 'home.status.quotation'
    case 'sent':
      return 'home.status.sent'
    case 'confirmed':
      return 'home.status.confirmed'
    case 'to_invoice':
      return 'home.status.to_invoice'
    case 'cancelled':
      return 'home.status.cancelled'
    case 'open':
      return 'home.status.open'
    default: {
      const unexpected: never = status
      return unexpected
    }
  }
}

function statusClass(status: OrderStatus) {
  switch (status) {
    case 'confirmed':
      return 'home-ok'
    case 'quotation':
    case 'open':
      return 'home-mute'
    case 'sent':
    case 'to_invoice':
      return 'home-info'
    case 'cancelled':
      return 'home-bad'
    default: {
      const unexpected: never = status
      return unexpected
    }
  }
}

function tabKey(tab: OrderTab): MessageKey {
  switch (tab) {
    case 'all':
      return 'home.orders.all'
    case 'quotes':
      return 'home.orders.quotes'
    case 'invoice':
      return 'home.orders.invoice'
    default: {
      const unexpected: never = tab
      return unexpected
    }
  }
}

function matchesTab(status: OrderStatus, tab: OrderTab) {
  switch (tab) {
    case 'all':
      return true
    case 'quotes':
      return status === 'quotation' || status === 'sent'
    case 'invoice':
      return status === 'to_invoice'
    default: {
      const unexpected: never = tab
      return unexpected
    }
  }
}

function ordersHref(tab: OrderTab) {
  switch (tab) {
    case 'all':
      return '/orders'
    case 'quotes':
      return '/orders?state=draft'
    case 'invoice':
      return '/orders?state=sale'
    default: {
      const unexpected: never = tab
      return unexpected
    }
  }
}

function stageKey(stage: HomeData['pipeline']['stages'][number]['stage']): MessageKey {
  switch (stage) {
    case 'new':
      return 'home.pipeline.new'
    case 'qualified':
      return 'home.pipeline.qualified'
    case 'proposition':
      return 'home.pipeline.proposition'
    case 'won':
      return 'home.pipeline.won'
    default: {
      const unexpected: never = stage
      return unexpected
    }
  }
}

function attentionTitle(item: Attention, t: Translate) {
  switch (item.kind) {
    case 'purchase':
      return t('home.attention.po', { name: item.name })
    case 'invoice':
      return t('home.attention.overdue', { name: item.name })
    case 'expense':
      return t('home.attention.expense', { name: item.name })
    case 'leave':
      return t('home.attention.leave', { name: item.name })
    default: {
      const unexpected: never = item.kind
      return unexpected
    }
  }
}

function actionKey(kind: AttentionKind): MessageKey {
  switch (kind) {
    case 'purchase':
      return 'home.action.approve'
    case 'invoice':
      return 'home.action.remind'
    case 'expense':
    case 'leave':
      return 'home.action.review'
    default: {
      const unexpected: never = kind
      return unexpected
    }
  }
}

function actionClass(kind: AttentionKind) {
  switch (kind) {
    case 'purchase':
      return 'home-info'
    case 'invoice':
      return 'home-bad'
    case 'expense':
      return 'home-warn'
    case 'leave':
      return 'home-mute'
    default: {
      const unexpected: never = kind
      return unexpected
    }
  }
}

function attentionIcon(kind: AttentionKind) {
  switch (kind) {
    case 'purchase':
      return <Check className="size-4" />
    case 'invoice':
      return <AlertTriangle className="size-4" />
    case 'expense':
      return <FileText className="size-4" />
    case 'leave':
      return <Users className="size-4" />
    default: {
      const unexpected: never = kind
      return unexpected
    }
  }
}

function attentionColor(kind: AttentionKind) {
  switch (kind) {
    case 'purchase':
      return '#7C3AED'
    case 'invoice':
      return '#B42323'
    case 'expense':
      return '#B45309'
    case 'leave':
      return '#4F46E5'
    default: {
      const unexpected: never = kind
      return unexpected
    }
  }
}

function stepCopy(key: StepKey): { title: MessageKey; lead: MessageKey } {
  switch (key) {
    case 'company':
      return { title: 'home.step.company', lead: 'home.step.companyLead' }
    case 'team':
      return { title: 'home.step.team', lead: 'home.step.teamLead' }
    case 'contacts':
      return { title: 'home.step.contacts', lead: 'home.step.contactsLead' }
    case 'taxes':
      return { title: 'home.step.taxes', lead: 'home.step.taxesLead' }
    case 'bank':
      return { title: 'home.step.bank', lead: 'home.step.bankLead' }
    case 'quotation':
      return { title: 'home.step.quotation', lead: 'home.step.quotationLead' }
    default: {
      const unexpected: never = key
      return unexpected
    }
  }
}

function StepGlyph({ step }: { step: StepKey }) {
  switch (step) {
    case 'company':
      return <Building2 className="size-4" />
    case 'team':
      return <Users className="size-4" />
    case 'contacts':
      return <Upload className="size-4" />
    case 'taxes':
      return <Percent className="size-4" />
    case 'bank':
      return <Landmark className="size-4" />
    case 'quotation':
      return <FileText className="size-4" />
    default: {
      const unexpected: never = step
      return unexpected
    }
  }
}

function chartReady(months: HomeData['chart']['months']) {
  return months.some((month) => month.income !== 0 || month.expense !== 0)
}

export function HomePage() {
  const { locale, t } = useI18n()
  const money = useMoney()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const [range, setRange] = useState<HomeRange>('month')
  const [skipped, setSkipped] = useState(false)
  const home = useQuery({
    queryKey: ['home', range],
    queryFn: () => api<HomeData>(`/api/home?range=${range}`),
  })
  const name = (me.data?.name ?? '').split(/\s+/)[0] ?? ''
  const company = me.data?.company.name ?? ''
  const hour = new Date().getHours()

  return (
    <div className="keel-home mx-auto max-w-[1440px]">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">
            {home.data?.empty ? t('home.welcome', { name }) : name ? t(greetingKey(hour), { name }) : t('home.loading')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {longDate(locale)}
            {' · '}
            {home.data?.empty
              ? t('home.ready', { company })
              : home.data && home.data.attentionCount > 0
                ? t('home.attentionLine', { count: home.data.attentionCount })
                : home.data
                  ? t('home.clear')
                  : ''}
          </p>
        </div>
        {home.data?.empty ? (
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <Link to="/admin/users" className="home-secondary">{t('home.invite')}</Link>
            <Link to="/orders/new" className="home-primary"><Plus className="size-4" />{t('home.quote')}</Link>
          </div>
        ) : (
          <>
            <div className="home-tabs" role="tablist" aria-label={t('home.range.month')}>
              {ranges.map((item) => (
                <button key={item} type="button" role="tab" aria-selected={range === item} className="home-tab" onClick={() => setRange(item)}>
                  {t(rangeKey(item))}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 lg:ml-auto">
              <Link to="/orders/new" className="home-primary"><Plus className="size-4" />{t('home.quote')}</Link>
              <Link to="/accounting?moveType=out_invoice" className="home-secondary"><FileText className="size-4" />{t('home.invoice')}</Link>
              <Link to="/purchases" className="home-secondary"><Package className="size-4" />{t('home.receive')}</Link>
            </div>
          </>
        )}
      </header>

      {home.isError ? (
        <div className="keel-glass mt-5 rounded-[22px] p-8">
          <p className="font-semibold">{t('home.error')}</p>
          <Button className="mt-4" onClick={() => void home.refetch()}>{t('home.retry')}</Button>
        </div>
      ) : null}

      {!home.data && !home.isError ? (
        <div className="mt-5 grid gap-4" aria-busy="true" aria-label={t('home.loading')}>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="keel-glass h-32 animate-pulse rounded-[22px]" />)}
          </div>
          <div className="keel-glass h-64 animate-pulse rounded-[22px]" />
        </div>
      ) : null}

      {home.data?.empty ? <EmptyBoard data={home.data} company={company} skipped={skipped} onSkip={() => setSkipped(true)} /> : null}
      {home.data && !home.data.empty ? <LiveBoard data={home.data} range={range} locale={locale} money={money} t={t} busy={home.isFetching} /> : null}
    </div>
  )
}

function LiveBoard({
  data,
  range,
  locale,
  money,
  t,
  busy,
}: {
  data: HomeData
  range: HomeRange
  locale: Locale
  money: (value: number) => string
  t: Translate
  busy: boolean
}) {
  const bankTrend = trend(data.bank.changePct)
  const revenueTrend = trend(data.kpis.revenue.changePct)
  return (
    <div className="home-board mt-5" aria-busy={busy}>
      <div className="home-main">
        <section className="home-kpis grid grid-cols-2 gap-3 min-[1100px]:grid-cols-4">
          <Kpi icon={<TrendingUp className="size-5" />} color="#0E6B5C" label={t('home.kpi.revenue')} value={money(data.kpis.revenue.amount)}>
            <span className={cn('home-pill', revenueTrend.tone)}>{revenueTrend.text}</span>
            <span className="text-xs text-muted-foreground">{t(compareKey(range))}</span>
          </Kpi>
          <Kpi icon={<TrendingUp className="size-5" />} color="#15803D" label={t('home.kpi.profit')} value={money(data.kpis.profit.amount)}>
            <span className="home-pill home-teal">{t('home.kpi.margin', { margin: data.kpis.profit.margin.toFixed(1) })}</span>
            <span className="text-xs text-muted-foreground">{t('home.kpi.points', { delta: points(data.kpis.profit.marginDelta) })}</span>
          </Kpi>
          <Kpi icon={<ArrowDownToLine className="size-5" />} color="#2563EB" label={t('home.kpi.receivable')} value={money(data.kpis.receivable.amount)}>
            {data.kpis.receivable.overdueCount > 0 ? (
              <span className="home-pill home-warn">{t('home.kpi.overdue', { count: data.kpis.receivable.overdueCount })}</span>
            ) : (
              <span className="home-pill home-ok">{t('home.kpi.noneOverdue')}</span>
            )}
            <span className="text-xs text-muted-foreground">{data.kpis.receivable.overdueCount > 0 ? money(data.kpis.receivable.overdueAmount) : ''}</span>
          </Kpi>
          <Kpi icon={<ArrowUpFromLine className="size-5" />} color="#7C3AED" label={t('home.kpi.payable')} value={money(data.kpis.payable.amount)}>
            {data.kpis.payable.dueSoonAmount > 0 ? (
              <span className="home-pill home-info">{t('home.kpi.dueSoon')}</span>
            ) : (
              <span className="home-pill home-mute">{t('home.kpi.noneDue')}</span>
            )}
            <span className="text-xs text-muted-foreground">{data.kpis.payable.dueSoonAmount > 0 ? money(data.kpis.payable.dueSoonAmount) : ''}</span>
          </Kpi>
        </section>
        <section className="home-bank keel-glass flex items-center gap-3 rounded-[22px] px-4 py-3">
          <Landmark className="size-4 text-[#0891B2]" />
          <span className="text-sm text-muted-foreground">{t('home.bank')}</span>
          <span className="font-bold tabular-nums">{money(data.bank.balance)}</span>
          <span className={cn('home-pill', bankTrend.tone)}>{bankTrend.text}</span>
          <span className="text-xs text-muted-foreground">{t('home.accounts', { count: data.bank.accounts })}</span>
        </section>
        <section className="home-chart keel-glass min-w-0 rounded-[22px] p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">{t('home.chart.title')}</h2>
              <p className="text-xs text-muted-foreground">{t('home.chart.sub')}</p>
            </div>
            <div className="ml-auto flex gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--home-rev)]" />{t('home.chart.revenue')}</span>
              <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--home-exp)]" />{t('home.chart.expenses')}</span>
            </div>
          </div>
          {chartReady(data.chart.months) ? <HomeChart months={data.chart.months} locale={locale} /> : (
            <p className="py-16 text-center text-sm text-muted-foreground">{t('home.chart.empty')}</p>
          )}
        </section>
        <PipelineCard pipeline={data.pipeline} money={money} t={t} />
        <OrdersCard orders={data.orders} locale={locale} money={money} t={t} />
      </div>
      <div className="home-side">
        <AttentionCard items={data.attention} count={data.attentionCount} money={money} locale={locale} t={t} />
        <StockCard rows={data.lowStock} t={t} />
        <AppsCard t={t} />
      </div>
    </div>
  )
}

function Kpi({ icon, color, label, value, children }: { icon: ReactNode; color: string; label: string; value: string; children: ReactNode }) {
  return (
    <article className="home-kpi keel-glass min-w-0 rounded-[22px] px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2.5">
        <span className="home-icon grid size-10 shrink-0 place-items-center rounded-full" style={{ ['--c' as string]: color }}>{icon}</span>
        <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      </div>
      <p className="home-kpi-value mt-3 font-bold leading-none tracking-tight tabular-nums">{value}</p>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </article>
  )
}

function PipelineCard({ pipeline, money, t }: { pipeline: HomeData['pipeline']; money: (value: number) => string; t: Translate }) {
  const max = Math.max(...pipeline.stages.map((stage) => stage.count), 1)
  return (
    <section className="home-pipeline keel-glass rounded-[22px] p-4 sm:p-5">
      <div className="flex items-start gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">{t('home.pipeline.title')}</h2>
          <p className="text-xs text-muted-foreground">
            {pipeline.openCount > 0 ? t('home.pipeline.open', { count: pipeline.openCount }) : t('home.pipeline.none')}
          </p>
        </div>
        <span className="home-pill home-teal ml-auto">{t('home.pipeline.win', { rate: pipeline.winRate })}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {pipeline.stages.map((stage) => (
          <div key={stage.stage} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2">
            <span className="truncate text-xs text-muted-foreground">{t(stageKey(stage.stage))}</span>
            <div className="h-4 rounded-full bg-[var(--home-track)]">
              <div
                className="flex h-full items-center rounded-full bg-[color-mix(in_srgb,var(--home-rev)_55%,#d4ede7)] pl-2 text-[11px] font-bold text-[#0A4F45]"
                style={{ width: `${Math.max(stage.count === 0 ? 0 : 18, (stage.count / max) * 100)}%` }}
              >
                {stage.count > 0 ? stage.count : ''}
              </div>
            </div>
            <span className="text-right text-xs tabular-nums text-muted-foreground">{money(stage.amount)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2">
        <div className="home-chip rounded-2xl px-3 py-2">
          <p className="text-xs text-muted-foreground">{t('home.pipeline.value')}</p>
          <p className="mt-0.5 font-bold tabular-nums">{money(pipeline.openValue)}</p>
        </div>
        <div className="home-chip rounded-2xl px-3 py-2">
          <p className="text-xs text-muted-foreground">{t('home.pipeline.avg')}</p>
          <p className="mt-0.5 font-bold tabular-nums">{money(pipeline.avgDeal)}</p>
        </div>
      </div>
    </section>
  )
}

function OrdersCard({ orders, locale, money, t }: { orders: HomeOrder[]; locale: Locale; money: (value: number) => string; t: Translate }) {
  const [tab, setTab] = useState<OrderTab>('all')
  const rows = orders.filter((order) => matchesTab(order.status, tab)).slice(0, 5)
  const tabs: OrderTab[] = ['all', 'quotes', 'invoice']
  return (
    <section className="home-orders keel-glass min-w-0 rounded-[22px] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold">{t('home.orders')}</h2>
        <div className="home-tabs" role="tablist">
          {tabs.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} className="home-tab !h-7 !px-3 !text-xs" onClick={() => setTab(item)}>
              {t(tabKey(item))}
            </button>
          ))}
        </div>
        <Link to={ordersHref(tab)} className="home-link ml-auto text-xs">{t('home.orders.view')}</Link>
      </div>
      {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t('home.orders.tabEmpty')}</p> : (
        <>
          <ul className="mt-3 divide-y divide-[var(--kl-glass-border)] md:hidden">
            {rows.map((order) => (
              <li key={order.id}>
                <Link to={`/orders/${order.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{order.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{order.customer} · {dayLabel(order.date, locale)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{money(order.amount)}</p>
                    <span className={cn('home-pill mt-1', statusClass(order.status))}>{t(statusKey(order.status))}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <table className="mt-3 hidden w-full border-collapse md:table">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted-foreground">
                <th className="pb-2 font-semibold">{t('home.orders.col.order')}</th>
                <th className="pb-2 font-semibold">{t('home.orders.col.customer')}</th>
                <th className="pb-2 font-semibold">{t('home.orders.col.date')}</th>
                <th className="pb-2 pr-4 text-right font-semibold whitespace-nowrap">{t('home.orders.col.amount')}</th>
                <th className="pb-2 pl-2 font-semibold whitespace-nowrap">{t('home.orders.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id} className="border-t border-[var(--kl-glass-border)] text-sm">
                  <td className="h-11 pr-2 font-semibold"><Link to={`/orders/${order.id}`}>{order.name}</Link></td>
                  <td className="pr-2">{order.customer}</td>
                  <td className="pr-2 text-muted-foreground">{dayLabel(order.date, locale)}</td>
                  <td className="pr-4 text-right font-semibold whitespace-nowrap tabular-nums">{money(order.amount)}</td>
                  <td className="pl-2 whitespace-nowrap"><span className={cn('home-pill', statusClass(order.status))}>{t(statusKey(order.status))}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

function AttentionCard({
  items,
  count,
  money,
  locale,
  t,
}: {
  items: Attention[]
  count: number
  money: (value: number) => string
  locale: Locale
  t: Translate
}) {
  return (
    <section id="home-attention" className="home-attention keel-glass rounded-[22px] px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">{t('home.attention')}</h2>
        <span className={cn('home-pill ml-auto', count > 0 ? 'home-warn' : 'home-ok')}>{count}</span>
      </div>
      {items.length === 0 ? (
        <div className="py-8 text-center">
          <p className="font-semibold">{t('home.attention.caught')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('home.attention.caughtLead')}</p>
        </div>
      ) : (
        <ul className="mt-2">
          {items.map((item, index) => (
            <li key={`${item.kind}-${item.id}`} className={cn('flex items-center gap-3 py-2', index > 0 && 'border-t border-[var(--kl-glass-border)]')}>
              <span className="home-icon grid size-8 shrink-0 place-items-center rounded-full" style={{ ['--c' as string]: attentionColor(item.kind) }}>
                {attentionIcon(item.kind)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{attentionTitle(item, t)}</p>
                <p className="truncate text-xs text-muted-foreground">{attentionDetail(item, money, locale, t)}</p>
              </div>
              <Link to={item.href} className={cn('home-pill h-7 px-3', actionClass(item.kind))}>{t(actionKey(item.kind))}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function attentionDetail(item: Attention, money: (value: number) => string, locale: Locale, t: Translate) {
  switch (item.kind) {
    case 'purchase':
      return `${item.partner}${item.amount != null ? ` · ${money(item.amount)}` : ''}`
    case 'invoice':
      return `${item.partner} · ${t('home.attention.overdueDays', { days: item.days ?? 0 })}${item.amount != null ? ` · ${money(item.amount)}` : ''}`
    case 'expense':
      return `${item.partner}${item.amount != null ? ` · ${money(item.amount)}` : ''}`
    case 'leave':
      return `${item.dateFrom ? dayLabel(item.dateFrom, locale) : ''}${item.dateTo ? `–${dayLabel(item.dateTo, locale)}` : ''} · ${t('home.attention.leaveDays', { days: item.days ?? 0 })}`
    default: {
      const unexpected: never = item.kind
      return unexpected
    }
  }
}

function StockCard({ rows, t }: { rows: HomeData['lowStock']; t: Translate }) {
  return (
    <section className="home-stock keel-glass rounded-[22px] px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">{t('home.stock')}</h2>
        <span className={cn('home-pill ml-auto', rows.length > 0 ? 'home-bad' : 'home-ok')}>{t('home.stock.count', { count: rows.length })}</span>
      </div>
      {rows.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t('home.stock.clear')}</p> : (
        <ul className="mt-2">
          {rows.map((row, index) => (
            <li key={row.id} className={cn('flex h-8 items-center gap-2 text-sm', index > 0 && 'border-t border-[var(--kl-glass-border)]')}>
              <i className={cn('size-2 shrink-0 rounded-full', row.level === 'bad' ? 'bg-[#9F1D1D]' : 'bg-[#8A4A04]')} />
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className={cn('text-xs font-semibold tabular-nums', row.level === 'bad' ? 'home-bad-text' : 'home-warn-text')}>
                {t('home.stock.left', { count: qtyLabel(row.onHand) })}
              </span>
              <Link to="/inventory/replenish" className="home-link w-14 text-right text-xs">{t('home.stock.reorder')}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AppsCard({ t, installed = false }: { t: Translate; installed?: boolean }) {
  return (
    <section className="home-apps keel-glass rounded-[22px] px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">{t('home.apps')}</h2>
        {installed ? <span className="text-xs text-muted-foreground">{t('home.apps.installed', { count: shortcuts.length })}</span> : null}
        <Link to="/" className="home-link ml-auto text-xs">{t('home.apps.all')}</Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {shortcuts.map((app) => (
          <Link key={app.id} to={app.to} className="flex min-w-0 items-center gap-2.5 rounded-2xl">
            <span className="grid size-9 shrink-0 place-items-center rounded-[11px] text-white shadow-sm" style={{ background: app.color }}>
              <ModuleIcon id={moduleIconId(app.id)} className="size-[18px]" />
            </span>
            <span className="truncate text-sm font-medium text-muted-foreground">{t(app.label)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function EmptyBoard({ data, company, skipped, onSkip }: { data: HomeData; company: string; skipped: boolean; onSkip: () => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const toast = useToast()
  const steps = data.onboarding?.steps ?? []
  const done = data.onboarding?.done ?? 0
  const total = data.onboarding?.total ?? 6
  return (
    <div className="mt-5 grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {skipped ? null : (
          <section id="home-start" className="keel-glass rounded-[22px] p-5">
            <div className="flex items-start gap-3">
              <Ring done={done} total={total} />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold">{t('home.start')}</h2>
                <p className="text-sm text-muted-foreground">{t('home.startLead', { company })}</p>
              </div>
              <button type="button" className="home-link text-sm" onClick={onSkip}>{t('home.skip')}</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {steps.map((step, index) => {
                const copy = stepCopy(step.key)
                return (
                  <div key={step.key} className="flex items-center gap-3 rounded-2xl border border-[var(--kl-glass-border)] px-3 py-3">
                    <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold', step.done ? 'bg-[#11703A] text-white' : 'bg-[var(--home-track)] text-foreground')}>
                      {step.done ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--home-track)] text-[#0A5A4D]"><StepGlyph step={step.key} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{t(copy.title)}</p>
                      <p className="truncate text-xs text-muted-foreground">{t(copy.lead)}</p>
                    </div>
                    {step.done ? <span className="home-pill home-ok">{t('home.step.done')}</span> : (
                      <Link to={step.href} className="home-secondary h-8 px-3 text-xs">{t('home.step.start')}</Link>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
        <div className={cn('grid content-start gap-4', skipped && 'lg:col-span-2 lg:grid-cols-2')}>
          <section className="keel-glass rounded-[22px] px-5 py-8 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-[#DDF3E6] text-[#11703A]"><Check className="size-5" /></span>
            <h2 className="mt-3 text-[15px] font-semibold">{t('home.attention.caught')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('home.attention.caughtLead')}</p>
          </section>
          <AppsCard t={t} installed />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <ZeroKpi label={t('home.kpi.revenue')} value={money(0)} lead={t('home.kpi.zeroRevenue')} icon={<TrendingUp className="size-4" />} color="#0E6B5C" />
        <ZeroKpi label={t('home.kpi.profit')} value={money(0)} lead={t('home.kpi.zeroProfit')} icon={<TrendingUp className="size-4" />} color="#15803D" />
        <ZeroKpi label={t('home.kpi.receivable')} value={money(0)} lead={t('home.kpi.zeroReceivable')} icon={<ArrowDownToLine className="size-4" />} color="#2563EB" />
        <ZeroKpi label={t('home.kpi.payable')} value={money(0)} lead={t('home.kpi.zeroPayable')} icon={<ArrowUpFromLine className="size-4" />} color="#7C3AED" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="keel-glass rounded-[22px] p-5">
          <h2 className="text-[15px] font-semibold">{t('home.chart.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('home.chart.sub')}</p>
          <div className="mt-6 rounded-2xl border border-dashed border-[var(--kl-glass-border)] px-4 py-10 text-center">
            <p className="font-semibold">{t('home.chart.empty')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('home.chart.emptyLead')}</p>
          </div>
        </section>
        <section className="keel-glass rounded-[22px] p-5 text-center">
          <h2 className="text-left text-[15px] font-semibold">{t('home.orders')}</h2>
          <div className="py-8">
            <p className="font-semibold">{t('home.orders.empty')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('home.orders.emptyLead')}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link to="/orders/new" className="home-primary"><Plus className="size-4" />{t('home.quote')}</Link>
              <Link to="/contacts" className="home-secondary">{t('home.import')}</Link>
            </div>
          </div>
        </section>
        <section className="rounded-[22px] bg-[#0A4F45] p-5 text-white">
          <h2 className="text-[15px] font-semibold">{t('home.help')}</h2>
          <p className="mt-2 text-sm text-white/90">{t('home.helpLead')}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="#home-start" className="inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#0A4F45]">{t('home.tour')}</a>
            <button type="button" className="inline-flex h-9 items-center rounded-full border border-white/50 px-4 text-sm font-semibold text-white" onClick={() => toast(t('home.bookNote'))}>
              {t('home.book')}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function Ring({ done, total }: { done: number; total: number }) {
  const radius = 16
  const length = 2 * Math.PI * radius
  const offset = length - (total === 0 ? 0 : done / total) * length
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0 text-foreground">
      <circle cx="22" cy="22" r={radius} fill="none" stroke="var(--home-track)" strokeWidth="4" />
      <circle cx="22" cy="22" r={radius} fill="none" stroke="var(--home-rev)" strokeWidth="4" strokeDasharray={length} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">{done}/{total}</text>
    </svg>
  )
}

function ZeroKpi({ label, value, lead, icon, color }: { label: string; value: string; lead: string; icon: ReactNode; color: string }) {
  return (
    <article className="keel-glass flex items-center gap-3 rounded-[22px] px-4 py-3">
      <span className="home-icon grid size-9 place-items-center rounded-full" style={{ ['--c' as string]: color }}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{label} · {value}</p>
        <p className="truncate text-xs text-muted-foreground">{lead}</p>
      </div>
    </article>
  )
}
