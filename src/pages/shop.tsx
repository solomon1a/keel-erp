import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { LanguageSwitcher } from '../components/language-switcher.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { addToCart, cartCount, readCart, writeCart, type CartLine } from '../lib/cart.ts'
import { api, ApiError } from '../lib/api.ts'
import { formatMoney } from '../lib/format.ts'

type ShopProduct = {
  id: number
  name: string
  sku: string
  description: string | null
  listPrice: number
  barcode: string | null
  categoryId: number | null
  categoryName: string | null
  onHand: number
}

type Catalog = {
  company: { name: string; city: string; currency: string; taxRate: number }
  warehouse: { id: number; name: string; code: string }
  categories: Array<{ id: number; name: string }>
  products: ShopProduct[]
}

type ShopAccount = {
  id: number
  name: string
  email: string
  phone: string | null
}

type ShopOrder = {
  name: string
  publicToken: string | null
  amountUntaxed: number
  amountTax: number
  amountTotal: number
  paymentMethod: string | null
  paymentState: string | null
  customer: { name: string }
  company: { currency: string }
  warehouse: { name: string } | null
  lines: Array<{ id: number; description: string; quantity: number; unitPrice: number; subtotal: number; taxAmount: number }>
}

function payLabel(method: string | null, t: ReturnType<typeof useI18n>['t']) {
  switch (method) {
    case 'wechat':
      return t('shop.wechat')
    case 'alipay':
      return t('shop.alipay')
    case 'card':
      return t('shop.card')
    case null:
      return ''
    default:
      return method
  }
}

function ShopFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const catalog = useQuery({ queryKey: ['shop-catalog'], queryFn: () => api<Catalog>('/api/shop/catalog') })
  const [count, setCount] = useState(() => cartCount(readCart()))
  useEffect(() => {
    const sync = () => setCount(cartCount(readCart()))
    window.addEventListener('keel-cart', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('keel-cart', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <Link to="/shop" className="font-serif text-3xl tracking-tight">
          {catalog.data?.company.name ?? t('shop.kicker')}
        </Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <Link className="rounded-md px-3 py-2 hover:bg-secondary" to="/shop">{t('shop.catalog')}</Link>
          <Link className="rounded-md px-3 py-2 hover:bg-secondary" to="/shop/cart">{t('shop.cart')} ({count})</Link>
          <Link className="rounded-md px-3 py-2 hover:bg-secondary" to="/shop/account">{t('shop.account')}</Link>
          <Link className="rounded-md px-3 py-2 text-muted-foreground hover:bg-secondary" to="/sign-in">{t('shop.desk')}</Link>
          <LanguageSwitcher />
        </nav>
      </header>
      <div className="py-6">{children}</div>
    </div>
  )
}

export function ShopCatalogPage() {
  const { t, locale } = useI18n()
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const catalog = useQuery({ queryKey: ['shop-catalog'], queryFn: () => api<Catalog>('/api/shop/catalog') })
  if (catalog.isLoading) return <ShopFrame><p className="text-sm text-muted-foreground">{t('shop.loading')}</p></ShopFrame>
  if (catalog.isError) return <ShopFrame><p className="text-sm text-destructive">{catalog.error.message}</p></ShopFrame>
  const data = catalog.data
  if (!data) return null
  const products = data.products.filter((product) => categoryId === null || product.categoryId === categoryId)
  return (
    <ShopFrame>
      <div className="grid gap-6">
        <div>
          <p className="text-sm text-muted-foreground">{data.company.city}</p>
          <h1 className="font-serif text-4xl tracking-tight">{t('shop.title')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('shop.lead')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('shop.warehouse', { name: data.warehouse.name })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={categoryId === null ? 'default' : 'outline'} onClick={() => setCategoryId(null)}>{t('shop.catalog')}</Button>
          {data.categories.map((category) => (
            <Button key={category.id} size="sm" variant={categoryId === category.id ? 'default' : 'outline'} onClick={() => setCategoryId(category.id)}>
              {category.name}
            </Button>
          ))}
        </div>
        {products.length === 0 ? <p className="text-sm text-muted-foreground">{t('shop.empty')}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Link key={product.id} to={`/shop/p/${product.id}`} className="rounded-lg border border-border bg-card p-4 hover:border-primary">
              <p className="text-xs text-muted-foreground">{product.categoryName ?? product.sku}</p>
              <h2 className="mt-1 font-serif text-2xl">{product.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>
              <p className="mt-4 font-semibold">{formatMoney(product.listPrice, data.company.currency, locale)}</p>
              <p className="text-sm text-muted-foreground">{t('shop.onHand', { count: product.onHand })}</p>
            </Link>
          ))}
        </div>
      </div>
    </ShopFrame>
  )
}

export function ShopProductPage() {
  const { id } = useParams()
  const { t, locale } = useI18n()
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const product = useQuery({
    queryKey: ['shop-product', id],
    queryFn: () => api<Catalog & { product: ShopProduct }>(`/api/shop/products/${id}`),
  })
  if (product.isLoading) return <ShopFrame><p className="text-sm text-muted-foreground">{t('shop.loading')}</p></ShopFrame>
  if (product.isError) return <ShopFrame><p className="text-sm text-destructive">{product.error.message}</p></ShopFrame>
  const row = product.data?.product
  if (!row || !product.data) return null
  return (
    <ShopFrame>
      <div className="mx-auto grid max-w-xl gap-4">
        <Link className="text-sm font-semibold text-primary" to="/shop">{t('shop.back')}</Link>
        <p className="text-sm text-muted-foreground">{row.categoryName ?? row.sku}</p>
        <h1 className="font-serif text-4xl tracking-tight">{row.name}</h1>
        <p className="text-muted-foreground">{row.description}</p>
        <p className="text-xl font-semibold">{formatMoney(row.listPrice, product.data.company.currency, locale)}</p>
        <p className="text-sm text-muted-foreground">{t('shop.onHand', { count: row.onHand })}</p>
        <p className="text-sm text-muted-foreground">{t('shop.vat', { rate: product.data.company.taxRate })}</p>
        <Field label={t('shop.qty')}>
          <Input type="number" min="1" max="999" value={qty} onChange={(event) => setQty(Number(event.target.value))} />
        </Field>
        {note ? <Notice message={note} /> : null}
        <Button
          onClick={() => {
            addToCart({ productId: row.id, name: row.name, unitPrice: row.listPrice, quantity: qty })
            setNote(t('shop.added'))
          }}
        >
          {t('shop.add')}
        </Button>
      </div>
    </ShopFrame>
  )
}

export function ShopCartPage() {
  const { t, locale } = useI18n()
  const catalog = useQuery({ queryKey: ['shop-catalog'], queryFn: () => api<Catalog>('/api/shop/catalog') })
  const [lines, setLines] = useState<CartLine[]>(() => readCart())
  const currency = catalog.data?.company.currency ?? 'CNY'
  const untaxed = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  return (
    <ShopFrame>
      <div className="grid gap-4">
        <h1 className="font-serif text-4xl tracking-tight">{t('shop.cart')}</h1>
        {lines.length === 0 ? <p className="text-sm text-muted-foreground">{t('shop.empty')}</p> : null}
        <ul className="grid gap-3">
          {lines.map((line) => (
            <li key={line.productId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <span>
                <span className="font-semibold">{line.name}</span>
                <span className="mt-1 block text-sm text-muted-foreground">× {line.quantity}</span>
              </span>
              <span className="flex items-center gap-3">
                <span>{formatMoney(line.unitPrice * line.quantity, currency, locale)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = lines.filter((row) => row.productId !== line.productId)
                    writeCart(next)
                    setLines(next)
                  }}
                >
                  {t('shop.remove')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
        {lines.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">{t('shop.total')} {formatMoney(untaxed, currency, locale)}</p>
            <Link to="/shop/checkout"><Button>{t('shop.checkout')}</Button></Link>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">{t('shop.vat', { rate: catalog.data?.company.taxRate ?? 13 })}</p>
      </div>
    </ShopFrame>
  )
}

export function ShopCheckoutPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const catalog = useQuery({ queryKey: ['shop-catalog'], queryFn: () => api<Catalog>('/api/shop/catalog') })
  const account = useQuery({
    queryKey: ['shop-me'],
    queryFn: () => api<ShopAccount>('/api/shop/me'),
    retry: false,
  })
  const [lines] = useState<CartLine[]>(() => readCart())
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    street: '',
    city: '上海',
    paymentMethod: 'wechat',
  })
  useEffect(() => {
    if (!account.data) return
    setForm((current) => ({
      ...current,
      name: current.name || account.data.name,
      email: current.email || account.data.email,
      phone: current.phone || account.data.phone || '',
    }))
  }, [account.data])

  const place = useMutation({
    mutationFn: () =>
      api<ShopOrder>('/api/shop/checkout', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        }),
      }),
    onSuccess: (order) => {
      writeCart([])
      if (order.publicToken) navigate(`/shop/thanks/${order.publicToken}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('signIn.failed')),
  })

  const currency = catalog.data?.company.currency ?? 'CNY'
  return (
    <ShopFrame>
      <form
        className="mx-auto grid max-w-xl gap-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          setError('')
          place.mutate()
        }}
      >
        <h1 className="font-serif text-4xl tracking-tight">{t('shop.checkout')}</h1>
        <p className="text-sm text-muted-foreground">{t('shop.guest')}</p>
        {lines.length === 0 ? <p className="text-sm text-muted-foreground">{t('shop.empty')}</p> : null}
        <ul className="text-sm">
          {lines.map((line) => (
            <li key={line.productId} className="flex justify-between gap-3 border-b border-border py-2">
              <span>{line.name} × {line.quantity}</span>
              <span>{formatMoney(line.unitPrice * line.quantity, currency, locale)}</span>
            </li>
          ))}
        </ul>
        {error ? <Notice message={error} /> : null}
        <Field label={t('shop.name')}><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label={t('shop.email')}><Input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
        <Field label={t('shop.phone')}><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        <Field label={t('shop.street')}><Input value={form.street} onChange={(event) => setForm({ ...form, street: event.target.value })} /></Field>
        <Field label={t('shop.city')}><Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>
        <Field label={t('shop.pay')} hint={t('shop.payNote')}>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
            <option value="wechat">{t('shop.wechat')}</option>
            <option value="alipay">{t('shop.alipay')}</option>
            <option value="card">{t('shop.card')}</option>
          </select>
        </Field>
        <Button type="submit" disabled={place.isPending || lines.length === 0}>{place.isPending ? t('shop.placing') : t('shop.place')}</Button>
      </form>
    </ShopFrame>
  )
}

export function ShopThanksPage() {
  const { token } = useParams()
  const { t, locale } = useI18n()
  const order = useQuery({
    queryKey: ['shop-order', token],
    queryFn: () => api<ShopOrder>(`/api/shop/orders/${token}`),
  })
  if (order.isLoading) return <ShopFrame><p className="text-sm text-muted-foreground">{t('shop.loading')}</p></ShopFrame>
  if (order.isError) return <ShopFrame><p className="text-sm text-destructive">{order.error.message}</p></ShopFrame>
  const row = order.data
  if (!row) return null
  return (
    <ShopFrame>
      <div className="mx-auto grid max-w-xl gap-3">
        <h1 className="font-serif text-4xl tracking-tight">{t('shop.thanks')}</h1>
        <p className="text-lg font-semibold">{row.name}</p>
        <p>{row.customer.name}</p>
        {row.warehouse ? <p className="text-sm text-muted-foreground">{t('shop.warehouse', { name: row.warehouse.name })}</p> : null}
        <p className="text-sm">{t('shop.paymentRecorded')} · {payLabel(row.paymentMethod, t)}</p>
        <ul>
          {row.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 border-b border-border py-2 text-sm">
              <span>{line.description} × {line.quantity}</span>
              <span>{formatMoney(line.subtotal + line.taxAmount, row.company.currency, locale)}</span>
            </li>
          ))}
        </ul>
        <p className="font-semibold">{t('shop.total')} {formatMoney(row.amountTotal, row.company.currency, locale)}</p>
        <Link className="text-sm font-semibold text-primary" to="/shop">{t('shop.back')}</Link>
      </div>
    </ShopFrame>
  )
}

export function ShopAccountPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const me = useQuery({ queryKey: ['shop-me'], queryFn: () => api<ShopAccount>('/api/shop/me'), retry: false })
  const orders = useQuery({
    queryKey: ['shop-orders'],
    queryFn: () => api<ShopOrder[]>('/api/shop/orders'),
    enabled: Boolean(me.data),
  })
  const submit = useMutation({
    mutationFn: () =>
      api<ShopAccount>(mode === 'login' ? '/api/shop/login' : '/api/shop/register', {
        method: 'POST',
        body: JSON.stringify(form),
      }),
    onSuccess: async (account) => {
      setError('')
      queryClient.setQueryData(['shop-me'], account)
      await queryClient.invalidateQueries({ queryKey: ['shop-orders'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('signIn.failed')),
  })

  return (
    <ShopFrame>
      <div className="mx-auto grid max-w-xl gap-4">
        <h1 className="font-serif text-4xl tracking-tight">{t('shop.account')}</h1>
        {me.data ? (
          <div className="grid gap-4">
            <p>{me.data.name} · {me.data.email}</p>
            <Button
              variant="outline"
              onClick={() => {
                void api('/api/shop/logout', { method: 'POST' }).finally(() => {
                  queryClient.removeQueries({ queryKey: ['shop-me'] })
                  queryClient.removeQueries({ queryKey: ['shop-orders'] })
                })
              }}
            >
              {t('shop.signOut')}
            </Button>
            <h2 className="font-serif text-2xl">{t('shop.myOrders')}</h2>
            {orders.data && orders.data.length === 0 ? <p className="text-sm text-muted-foreground">{t('shop.noOrders')}</p> : null}
            <ul>
              {orders.data?.map((order) => (
                <li key={order.name} className="border-b border-border py-2">
                  {order.publicToken ? (
                    <Link className="font-semibold hover:underline" to={`/shop/thanks/${order.publicToken}`}>{order.name}</Link>
                  ) : (
                    <span className="font-semibold">{order.name}</span>
                  )}
                  <span className="ml-3 text-sm">{formatMoney(order.amountTotal, order.company.currency, locale)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              setError('')
              submit.mutate()
            }}
          >
            {error ? <Notice message={error} /> : null}
            {mode === 'register' ? (
              <Field label={t('shop.name')}><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            ) : null}
            <Field label={t('shop.email')}><Input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
            <Field label={t('shop.password')}><Input type="password" required minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field>
            {mode === 'register' ? (
              <Field label={t('shop.phone')}><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            ) : null}
            <Button type="submit" disabled={submit.isPending}>{mode === 'login' ? t('shop.signIn') : t('shop.register')}</Button>
            <button
              type="button"
              className="text-left text-sm font-semibold text-primary"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? t('shop.needAccount') : t('shop.haveAccount')}
            </button>
          </form>
        )}
      </div>
    </ShopFrame>
  )
}
