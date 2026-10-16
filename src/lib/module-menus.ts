type MenuEntry = {
  label: string
  to?: string
  children?: { label: string; to: string }[]
}

const screen = (module: string, name: string) => `/app/${module}/${name}`
const label = (module: string, name: string) => `desk.s.${module}.${name}`

export const moduleMenus: Record<string, MenuEntry[]> = {
  dashboard: [
    { label: 'mod.dashboard', to: '/desk' },
    { label: label('dashboard', 'activities'), to: screen('dashboard', 'activities') },
    { label: 'menu.reporting', to: screen('dashboard', 'reporting') },
    { label: 'desk.g.configuration', children: [{ label: label('dashboard', 'settings'), to: screen('dashboard', 'settings') }] },
  ],
  contacts: [
    { label: 'mod.contacts', to: '/contacts' },
    { label: 'desk.g.configuration', children: [
      { label: label('contacts', 'settings'), to: screen('contacts', 'settings') },
      { label: label('contacts', 'tags'), to: screen('contacts', 'tags') },
      { label: label('contacts', 'industries'), to: screen('contacts', 'industries') },
    ] },
  ],
  sales: [
    { label: 'menu.orders', children: [
      { label: 'menu.quotations', to: '/orders?state=draft' },
      { label: 'menu.orders', to: '/orders' },
      { label: 'menu.customers', to: '/contacts' },
    ] },
    { label: 'desk.g.toInvoice', children: [
      { label: label('sales', 'to-invoice'), to: screen('sales', 'to-invoice') },
      { label: label('sales', 'to-upsell'), to: screen('sales', 'to-upsell') },
    ] },
    { label: 'menu.products', children: [
      { label: 'menu.products', to: '/products' },
      { label: label('sales', 'variants'), to: screen('sales', 'variants') },
      { label: label('sales', 'pricelists'), to: screen('sales', 'pricelists') },
    ] },
    { label: 'menu.reporting', children: [{ label: label('sales', 'analysis'), to: screen('sales', 'analysis') }] },
    { label: 'desk.g.configuration', children: [
      { label: label('sales', 'settings'), to: screen('sales', 'settings') },
      { label: label('sales', 'teams'), to: screen('sales', 'teams') },
      { label: label('sales', 'payment-terms'), to: screen('sales', 'payment-terms') },
      { label: label('sales', 'tags'), to: screen('sales', 'tags') },
    ] },
  ],
  crm: [
    { label: 'menu.pipeline', to: '/crm' },
    { label: label('crm', 'activities'), to: screen('crm', 'activities') },
    { label: 'menu.reporting', children: [
      { label: label('crm', 'pipeline-analysis'), to: screen('crm', 'pipeline-analysis') },
      { label: label('crm', 'leads-analysis'), to: screen('crm', 'leads-analysis') },
    ] },
    { label: 'desk.g.configuration', children: [
      { label: label('crm', 'settings'), to: screen('crm', 'settings') },
      { label: label('crm', 'teams'), to: screen('crm', 'teams') },
      { label: label('crm', 'tags'), to: screen('crm', 'tags') },
      { label: label('crm', 'lost-reasons'), to: screen('crm', 'lost-reasons') },
    ] },
  ],
  purchase: [
    { label: 'menu.orders', children: [
      { label: 'menu.rfq', to: '/purchases?state=draft' },
      { label: 'menu.orders', to: '/purchases?state=purchase' },
      { label: 'menu.vendors', to: '/vendors' },
    ] },
    { label: 'menu.products', to: '/products' },
    { label: 'menu.reporting', children: [{ label: label('purchase', 'analysis'), to: screen('purchase', 'analysis') }] },
    { label: 'desk.g.configuration', children: [
      { label: label('purchase', 'settings'), to: screen('purchase', 'settings') },
      { label: label('purchase', 'vendor-pricelists'), to: screen('purchase', 'vendor-pricelists') },
    ] },
  ],
  inventory: [
    { label: 'menu.operations', children: [
      { label: label('inventory', 'receipts'), to: screen('inventory', 'receipts') },
      { label: label('inventory', 'deliveries'), to: screen('inventory', 'deliveries') },
      { label: 'menu.transfers', to: '/inventory/transfers' },
      { label: label('inventory', 'adjustments'), to: screen('inventory', 'adjustments') },
      { label: label('inventory', 'scrap'), to: screen('inventory', 'scrap') },
    ] },
    { label: 'menu.products', to: '/products' },
    { label: 'menu.reporting', children: [
      { label: 'menu.onHand', to: '/inventory' },
      { label: 'menu.moves', to: '/inventory/moves' },
      { label: label('inventory', 'valuation'), to: screen('inventory', 'valuation') },
    ] },
    { label: 'desk.g.configuration', children: [
      { label: label('inventory', 'settings'), to: screen('inventory', 'settings') },
      { label: 'menu.warehouses', to: '/inventory/warehouses' },
      { label: label('inventory', 'locations'), to: screen('inventory', 'locations') },
      { label: label('inventory', 'routes'), to: screen('inventory', 'routes') },
    ] },
  ],
  manufacturing: [
    { label: 'menu.operations', children: [
      { label: 'menu.mo', to: '/manufacturing' },
      { label: label('manufacturing', 'unbuild'), to: screen('manufacturing', 'unbuild') },
    ] },
    { label: 'menu.products', children: [{ label: 'menu.boms', to: '/boms' }] },
    { label: 'desk.g.planning', to: screen('manufacturing', 'planning') },
    { label: 'menu.reporting', children: [{ label: label('manufacturing', 'analysis'), to: screen('manufacturing', 'analysis') }] },
    { label: 'desk.g.configuration', children: [
      { label: label('manufacturing', 'settings'), to: screen('manufacturing', 'settings') },
      { label: label('manufacturing', 'work-centers'), to: screen('manufacturing', 'work-centers') },
    ] },
  ],
  pos: [
    { label: 'menu.orders', children: [
      { label: 'menu.sessions', to: '/pos' },
      { label: 'menu.posOrders', to: '/pos/orders' },
    ] },
    { label: 'menu.products', to: '/products' },
    { label: 'menu.reporting', to: '/pos/report' },
    { label: 'desk.g.configuration', children: [
      { label: label('pos', 'settings'), to: screen('pos', 'settings') },
      { label: label('pos', 'payment-methods'), to: screen('pos', 'payment-methods') },
    ] },
  ],
  website: [
    { label: 'menu.websiteHome', to: '/website' },
    { label: 'menu.products', to: '/products' },
    { label: 'menu.storefront', to: '/shop' },
    { label: label('website', 'coupons'), to: screen('website', 'coupons') },
    { label: 'desk.g.configuration', children: [{ label: label('website', 'settings'), to: screen('website', 'settings') }] },
  ],
  accounting: [
    { label: 'desk.g.customers', children: [
      { label: 'menu.invoices', to: '/accounting?moveType=out_invoice' },
      { label: label('accounting', 'credit-notes'), to: screen('accounting', 'credit-notes') },
      { label: label('accounting', 'customer-payments'), to: screen('accounting', 'customer-payments') },
    ] },
    { label: 'desk.g.vendors', children: [
      { label: 'acct.in', to: '/accounting?moveType=in_invoice' },
      { label: label('accounting', 'vendor-refunds'), to: screen('accounting', 'vendor-refunds') },
      { label: label('accounting', 'vendor-payments'), to: screen('accounting', 'vendor-payments') },
    ] },
    { label: 'desk.g.accounting', children: [
      { label: 'desk.g.entries', to: '/accounting/ledger' },
      { label: label('accounting', 'accounts'), to: screen('accounting', 'accounts') },
      { label: label('accounting', 'reconcile'), to: screen('accounting', 'reconcile') },
    ] },
    { label: 'menu.reporting', children: [
      { label: 'acct.pnl', to: '/accounting/reports?view=pnl' },
      { label: 'acct.balance', to: '/accounting/reports?view=balance' },
      { label: label('accounting', 'aged-receivable'), to: screen('accounting', 'aged-receivable') },
      { label: label('accounting', 'aged-payable'), to: screen('accounting', 'aged-payable') },
      { label: 'acct.vat', to: '/accounting/reports?view=vat' },
    ] },
    { label: 'desk.g.configuration', children: [
      { label: label('accounting', 'settings'), to: screen('accounting', 'settings') },
      { label: label('accounting', 'journals'), to: screen('accounting', 'journals') },
    ] },
  ],
  hr: [
    { label: 'menu.employees', to: '/hr' },
    { label: label('hr', 'attendance'), to: screen('hr', 'attendance') },
    { label: label('hr', 'leave'), to: screen('hr', 'leave') },
    { label: 'menu.reporting', children: [{ label: label('hr', 'analysis'), to: screen('hr', 'analysis') }] },
    { label: 'desk.g.configuration', children: [{ label: label('hr', 'settings'), to: screen('hr', 'settings') }] },
  ],
  payroll: [
    { label: 'menu.payroll', to: '/hr/payroll' },
    { label: label('payroll', 'batches'), to: screen('payroll', 'batches') },
    { label: 'menu.reporting', children: [{ label: label('payroll', 'analysis'), to: screen('payroll', 'analysis') }] },
    { label: 'desk.g.configuration', children: [
      { label: label('payroll', 'settings'), to: screen('payroll', 'settings') },
      { label: label('payroll', 'structures'), to: screen('payroll', 'structures') },
      { label: label('payroll', 'rules'), to: screen('payroll', 'rules') },
    ] },
  ],
  expenses: [
    { label: 'menu.expenses', to: '/hr/expenses' },
    { label: label('expenses', 'reports'), to: screen('expenses', 'reports') },
    { label: 'menu.reporting', children: [{ label: label('expenses', 'analysis'), to: screen('expenses', 'analysis') }] },
    { label: 'desk.g.configuration', children: [
      { label: label('expenses', 'settings'), to: screen('expenses', 'settings') },
      { label: label('expenses', 'categories'), to: screen('expenses', 'categories') },
    ] },
  ],
}

export function menuPaths() {
  const paths: string[] = []
  for (const entries of Object.values(moduleMenus)) {
    for (const entry of entries) {
      if (entry.to) paths.push(entry.to)
      for (const child of entry.children ?? []) paths.push(child.to)
    }
  }
  return [...new Set(paths)]
}
