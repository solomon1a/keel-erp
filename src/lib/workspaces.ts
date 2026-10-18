export type Copy = { en: string; zh: string }

export type WsLabel = string | Copy

export type WsLink = { label: WsLabel; to: string; external?: boolean }

export type WsSide = { label: WsLabel; to?: string; children?: WsLink[] }

export type WsGroup = { title: WsLabel; links: WsLink[] }

export type WsKpi = { label: WsLabel; value: number; money?: boolean; to: string }

export type WsPoint = { en: string; zh: string; value: number }

export type WsStep = { label: Copy; to: string }

export type Workspace = {
  chartTitle: Copy
  chart: WsPoint[]
  kpis: WsKpi[]
  sidebar: WsSide[]
  groups: WsGroup[]
  steps: WsStep[]
}

const months = [
  ['May', '5月'],
  ['Jun', '6月'],
  ['Jul', '7月'],
  ['Aug', '8月'],
  ['Sep', '9月'],
  ['Oct', '10月'],
  ['Nov', '11月'],
  ['Dec', '12月'],
  ['Jan', '1月'],
  ['Feb', '2月'],
  ['Mar', '3月'],
  ['Apr', '4月'],
] as const

function series(values: number[]): WsPoint[] {
  return months.map(([en, zh], index) => ({ en, zh, value: values[index] ?? 0 }))
}

function copy(en: string, zh: string): Copy {
  return { en, zh }
}

const app = (module: string, screen: string) => `/app/${module}/${screen}`
const desk = (module: string, screen: string, external = false): WsLink => ({
  label: `desk.s.${module}.${screen}`,
  to: app(module, screen),
  external,
})

const produced = series([42, 38, 55, 48, 61, 52, 70, 66, 58, 74, 80, 69])

const manufacturing: Workspace = {
  chartTitle: copy('Produced Quantity', '完工数量'),
  chart: produced,
  kpis: [
    { label: copy('Open Work Orders', '未完工单'), value: 2, to: '/manufacturing' },
    { label: copy('WIP Work Orders', '在制工单'), value: 1, to: '/manufacturing' },
    { label: copy('Manufactured value', '完工金额'), value: 18420, money: true, to: app('manufacturing', 'analytics') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/manufacturing' },
    { label: 'ws.dashboard', to: app('manufacturing', 'dashboard') },
    { label: copy('BOM', '物料清单'), to: '/boms' },
    { label: copy('Work Order', '工单'), to: '/manufacturing' },
    { label: desk('manufacturing', 'job-card').label, to: app('manufacturing', 'job-card') },
    { label: desk('manufacturing', 'stock-entry').label, to: app('manufacturing', 'stock-entry') },
    {
      label: 'ws.planning',
      children: [
        desk('manufacturing', 'production-plan'),
        desk('manufacturing', 'lead-time'),
        desk('manufacturing', 'mps'),
        desk('manufacturing', 'forecast'),
      ],
    },
    { label: 'ws.tools', children: [desk('manufacturing', 'bom-update')] },
    {
      label: 'menu.reporting',
      children: [
        desk('manufacturing', 'planning-report'),
        desk('manufacturing', 'mrp'),
        desk('manufacturing', 'wo-summary'),
        desk('manufacturing', 'quality-summary'),
        desk('manufacturing', 'downtime-analysis'),
        desk('manufacturing', 'job-summary'),
        desk('manufacturing', 'bom-search'),
        desk('manufacturing', 'analytics'),
        desk('manufacturing', 'bom-time'),
        desk('manufacturing', 'consumed'),
      ],
    },
    {
      label: 'ws.setup',
      children: [
        desk('manufacturing', 'workstation-type'),
        desk('manufacturing', 'workstation'),
        desk('manufacturing', 'operation'),
        desk('manufacturing', 'routing'),
      ],
    },
    { label: 'hub.settings', to: app('manufacturing', 'settings') },
  ],
  groups: [
    {
      title: copy('Production', '生产'),
      links: [
        { label: copy('Work Order', '工单'), to: '/manufacturing' },
        desk('manufacturing', 'production-plan'),
        desk('manufacturing', 'stock-entry'),
        desk('manufacturing', 'job-card'),
        desk('manufacturing', 'lead-time'),
        desk('manufacturing', 'mps'),
        desk('manufacturing', 'downtime'),
        desk('manufacturing', 'forecast'),
      ],
    },
    {
      title: copy('Bill of Materials', '物料清单'),
      links: [
        { label: copy('Item', '物料'), to: '/products', external: true },
        { label: 'menu.boms', to: '/boms' },
        desk('manufacturing', 'workstation-type'),
        desk('manufacturing', 'workstation'),
        desk('manufacturing', 'operation'),
        desk('manufacturing', 'routing'),
      ],
    },
    {
      title: copy('Subcontracting', '委外'),
      links: [
        { label: 'menu.boms', to: '/boms' },
        desk('subcontracting', 'orders', true),
        desk('subcontracting', 'receipts', true),
        desk('subcontracting', 'analysis', true),
        desk('subcontracting', 'resupply', true),
      ],
    },
    {
      title: 'hub.reports',
      links: [
        desk('manufacturing', 'planning-report'),
        desk('manufacturing', 'mrp'),
        desk('manufacturing', 'wo-summary'),
        desk('manufacturing', 'quality-summary'),
        desk('manufacturing', 'downtime-analysis'),
        desk('manufacturing', 'job-summary'),
        desk('manufacturing', 'bom-search'),
        desk('manufacturing', 'analytics'),
        desk('manufacturing', 'bom-time'),
        desk('manufacturing', 'consumed'),
      ],
    },
    { title: 'ws.tools', links: [desk('manufacturing', 'bom-update')] },
    { title: 'hub.settings', links: [desk('manufacturing', 'settings'), desk('manufacturing', 'work-centers')] },
  ],
  steps: [
    { label: copy('Create Raw Material', '创建原材料'), to: '/products/new' },
    { label: copy('Create Finished Good', '创建成品'), to: '/products/new' },
    { label: copy('Create Operation', '创建工序'), to: app('manufacturing', 'operation') },
    { label: copy('Create Bill of Materials', '创建物料清单'), to: '/boms/new' },
    { label: copy('Create Work Order', '创建工单'), to: '/manufacturing/new' },
    { label: copy('View Work Order Summary', '查看工单汇总'), to: app('manufacturing', 'wo-summary') },
    { label: copy('Review Manufacturing Settings', '检查制造设置'), to: app('manufacturing', 'settings') },
  ],
}

const sales: Workspace = {
  chartTitle: copy('Invoiced sales', '已开票销售'),
  chart: series([420, 380, 510, 460, 540, 490, 610, 580, 530, 640, 700, 540]),
  kpis: [
    { label: copy('Open quotations', '未结报价'), value: 3, to: '/orders?state=draft' },
    { label: copy('Sales orders', '销售订单'), value: 4, to: '/orders' },
    { label: copy('To invoice', '待开票'), value: 52031.98, money: true, to: app('sales', 'to-invoice') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/sales' },
    { label: 'ws.dashboard', to: app('sales', 'analysis') },
    { label: 'menu.quotations', to: '/orders?state=draft' },
    { label: 'menu.orders', to: '/orders' },
    { label: 'menu.customers', to: '/contacts' },
    { label: 'menu.products', to: '/products' },
    { label: 'desk.g.toInvoice', children: [desk('sales', 'to-invoice'), desk('sales', 'to-upsell'), desk('sales', 'follow-ups')] },
    { label: 'menu.reporting', children: [desk('sales', 'analysis')] },
    { label: 'ws.setup', children: [desk('sales', 'pricelists'), desk('sales', 'teams'), desk('sales', 'payment-terms'), desk('sales', 'tags'), desk('sales', 'variants')] },
    { label: 'hub.settings', to: app('sales', 'settings') },
  ],
  groups: [
    {
      title: copy('Selling', '销售'),
      links: [
        { label: 'menu.quotations', to: '/orders?state=draft' },
        { label: 'menu.orders', to: '/orders' },
        { label: 'menu.customers', to: '/contacts', external: true },
        desk('sales', 'follow-ups'),
        desk('sales', 'to-invoice'),
        desk('sales', 'to-upsell'),
      ],
    },
    {
      title: copy('Products', '产品'),
      links: [
        { label: 'menu.products', to: '/products' },
        desk('sales', 'variants'),
        desk('sales', 'pricelists'),
      ],
    },
    { title: 'hub.reports', links: [desk('sales', 'analysis')] },
    {
      title: 'ws.setup',
      links: [desk('sales', 'teams'), desk('sales', 'payment-terms'), desk('sales', 'tags')],
    },
    { title: 'hub.settings', links: [desk('sales', 'settings')] },
  ],
  steps: [
    { label: copy('Add a customer', '添加客户'), to: '/contacts/new' },
    { label: copy('Add a product', '添加产品'), to: '/products/new' },
    { label: copy('Create a quotation', '创建报价'), to: '/orders/new' },
    { label: copy('Review pricelists', '检查价格表'), to: app('sales', 'pricelists') },
    { label: copy('Open sales analysis', '打开销售分析'), to: app('sales', 'analysis') },
    { label: copy('Review sales settings', '检查销售设置'), to: app('sales', 'settings') },
  ],
}

const crm: Workspace = {
  chartTitle: copy('Expected revenue', '预计收入'),
  chart: series([800, 920, 760, 1100, 980, 1240, 1400, 1180, 1320, 1500, 1420, 1600]),
  kpis: [
    { label: copy('Open leads', '未结线索'), value: 6, to: '/crm' },
    { label: copy('Pipeline value', '管道金额'), value: 6200, money: true, to: app('crm', 'pipeline-analysis') },
    { label: copy('Activities due', '待办活动'), value: 2, to: app('crm', 'activities') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/crm' },
    { label: 'ws.dashboard', to: app('crm', 'pipeline-analysis') },
    { label: 'menu.pipeline', to: '/crm' },
    { label: desk('crm', 'activities').label, to: app('crm', 'activities') },
    { label: 'menu.reporting', children: [desk('crm', 'pipeline-analysis'), desk('crm', 'leads-analysis')] },
    { label: 'ws.setup', children: [desk('crm', 'teams'), desk('crm', 'tags'), desk('crm', 'lost-reasons')] },
    { label: 'hub.settings', to: app('crm', 'settings') },
  ],
  groups: [
    { title: copy('Pipeline', '管道'), links: [{ label: 'menu.pipeline', to: '/crm' }, desk('crm', 'activities')] },
    { title: 'hub.reports', links: [desk('crm', 'pipeline-analysis'), desk('crm', 'leads-analysis')] },
    { title: 'ws.setup', links: [desk('crm', 'teams'), desk('crm', 'tags'), desk('crm', 'lost-reasons')] },
    { title: 'hub.settings', links: [desk('crm', 'settings')] },
  ],
  steps: [
    { label: copy('Add a lead', '添加线索'), to: '/crm' },
    { label: copy('Log an activity', '记录活动'), to: app('crm', 'activities') },
    { label: copy('Set a lost reason', '设置丢失原因'), to: app('crm', 'lost-reasons') },
    { label: copy('Read the pipeline', '查看管道'), to: app('crm', 'pipeline-analysis') },
    { label: copy('Review CRM settings', '检查客户关系设置'), to: app('crm', 'settings') },
  ],
}

const purchase: Workspace = {
  chartTitle: copy('Purchase spend', '采购支出'),
  chart: series([1200, 980, 1400, 1100, 1600, 1500, 1320, 1700, 1480, 1800, 1650, 1420]),
  kpis: [
    { label: copy('Open requests', '未结询价'), value: 2, to: '/purchases?state=draft' },
    { label: copy('Orders to receive', '待收货订单'), value: 1, to: app('purchase', 'receipts') },
    { label: copy('Bills to pay', '待付账单'), value: 34031.08, money: true, to: app('purchase', 'bills') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/purchase' },
    { label: 'ws.dashboard', to: app('purchase', 'dashboard') },
    { label: desk('purchase', 'requisitions').label, to: app('purchase', 'requisitions') },
    { label: 'menu.rfq', to: '/purchases?state=draft' },
    { label: 'menu.orders', to: '/purchases?state=purchase' },
    { label: 'menu.vendors', to: '/vendors' },
    { label: 'menu.products', to: '/products' },
    { label: 'menu.reporting', children: [desk('purchase', 'analysis'), desk('purchase', 'spend'), desk('purchase', 'cycle')] },
    { label: 'ws.setup', children: [desk('purchase', 'vendor-pricelists'), desk('purchase', 'approvals'), desk('purchase', 'evaluation')] },
    { label: 'hub.settings', to: app('purchase', 'settings') },
  ],
  groups: [
    {
      title: copy('Buying', '采购'),
      links: [
        desk('purchase', 'requisitions'),
        { label: 'menu.rfq', to: '/purchases?state=draft' },
        desk('purchase', 'comparison'),
        { label: 'menu.orders', to: '/purchases?state=purchase' },
        desk('purchase', 'approvals'),
        desk('purchase', 'receipts'),
        desk('purchase', 'bills'),
      ],
    },
    {
      title: copy('Vendors', '供应商'),
      links: [
        { label: 'menu.vendors', to: '/vendors' },
        { label: 'menu.products', to: '/products', external: true },
        desk('purchase', 'vendor-pricelists'),
        desk('purchase', 'evaluation'),
      ],
    },
    { title: 'hub.reports', links: [desk('purchase', 'analysis'), desk('purchase', 'spend'), desk('purchase', 'cycle')] },
    { title: 'hub.settings', links: [desk('purchase', 'settings')] },
  ],
  steps: [
    { label: copy('Add a vendor', '添加供应商'), to: '/contacts/new' },
    { label: copy('Raise a requisition', '提交请购'), to: app('purchase', 'requisitions') },
    { label: copy('Send a request', '发出询价'), to: '/purchases/new' },
    { label: copy('Compare quotations', '比较报价'), to: app('purchase', 'comparison') },
    { label: copy('Receive the goods', '收货'), to: app('purchase', 'receipts') },
    { label: copy('Review buying settings', '检查采购设置'), to: app('purchase', 'settings') },
  ],
}

const inventory: Workspace = {
  chartTitle: copy('Units moved', '移动数量'),
  chart: series([80, 64, 90, 72, 110, 96, 120, 88, 102, 130, 118, 96]),
  kpis: [
    { label: copy('On-hand lines', '在手行'), value: 8, to: '/inventory' },
    { label: copy('Transfers to do', '待处理调拨'), value: 2, to: '/inventory/transfers' },
    { label: copy('Stock value', '库存金额'), value: 4040, money: true, to: '/inventory/valuation' },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/inventory' },
    { label: 'ws.dashboard', to: app('inventory', 'valuation') },
    { label: desk('inventory', 'receipts').label, to: app('inventory', 'receipts') },
    { label: desk('inventory', 'deliveries').label, to: app('inventory', 'deliveries') },
    { label: 'menu.transfers', to: '/inventory/transfers' },
    { label: 'menu.products', to: '/products' },
    {
      label: 'menu.reporting',
      children: [
        { label: 'menu.onHand', to: '/inventory' },
        { label: 'menu.moves', to: '/inventory/moves' },
        desk('inventory', 'valuation'),
        { label: 'menu.layers', to: '/inventory/valuation' },
      ],
    },
    {
      label: 'ws.setup',
      children: [
        { label: 'menu.warehouses', to: '/inventory/warehouses' },
        desk('inventory', 'locations'),
        desk('inventory', 'routes'),
        { label: 'menu.stockRoutes', to: '/inventory/routes' },
        desk('inventory', 'putaway'),
      ],
    },
    { label: 'hub.settings', to: app('inventory', 'settings') },
  ],
  groups: [
    {
      title: copy('Stock', '库存'),
      links: [
        desk('inventory', 'receipts'),
        desk('inventory', 'deliveries'),
        { label: 'menu.transfers', to: '/inventory/transfers' },
        desk('inventory', 'adjustments'),
        desk('inventory', 'scrap'),
        desk('inventory', 'putaway'),
      ],
    },
    { title: copy('Products', '产品'), links: [{ label: 'menu.products', to: '/products', external: true }, { label: 'menu.replenish', to: '/inventory/replenish' }] },
    {
      title: 'hub.reports',
      links: [
        { label: 'menu.onHand', to: '/inventory' },
        { label: 'menu.moves', to: '/inventory/moves' },
        desk('inventory', 'valuation'),
        { label: 'menu.layers', to: '/inventory/valuation' },
      ],
    },
    {
      title: 'ws.setup',
      links: [
        { label: 'menu.warehouses', to: '/inventory/warehouses' },
        desk('inventory', 'locations'),
        desk('inventory', 'routes'),
        { label: 'menu.stockRoutes', to: '/inventory/routes', external: true },
      ],
    },
    { title: 'hub.settings', links: [desk('inventory', 'settings')] },
  ],
  steps: [
    { label: copy('Add a warehouse', '添加仓库'), to: '/inventory/warehouses/new' },
    { label: copy('Add a product', '添加产品'), to: '/products/new' },
    { label: copy('Receive stock', '收货入库'), to: app('inventory', 'receipts') },
    { label: copy('Set a route', '设置路线'), to: '/inventory/routes' },
    { label: copy('Review on-hand', '查看在手'), to: '/inventory' },
    { label: copy('Review stock settings', '检查库存设置'), to: app('inventory', 'settings') },
  ],
}

const wastage: Workspace = {
  chartTitle: copy('Scrap cost', '报废成本'),
  chart: series([40, 22, 60, 18, 35, 48, 27, 55, 30, 42, 38, 24]),
  kpis: [
    { label: copy('Open records', '未结记录'), value: 2, to: '/manufacturing/wastage' },
    { label: copy('Waiting approval', '待审批'), value: 1, to: '/manufacturing/wastage' },
    { label: copy('Scrap cost', '报废成本'), value: 186, money: true, to: '/manufacturing/wastage' },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/wastage' },
    { label: 'ws.dashboard', to: app('wastage', 'dashboard') },
    { label: desk('wastage', 'records').label, to: app('wastage', 'records') },
    { label: desk('wastage', 'inventory').label, to: app('wastage', 'inventory') },
    { label: desk('wastage', 'manufacturing').label, to: app('wastage', 'manufacturing') },
    { label: 'menu.reporting', children: [desk('wastage', 'by-product'), desk('wastage', 'by-reason'), desk('wastage', 'by-period')] },
    { label: 'ws.setup', children: [desk('wastage', 'reasons')] },
    { label: 'hub.settings', to: app('wastage', 'settings') },
  ],
  groups: [
    { title: copy('Records', '记录'), links: [desk('wastage', 'records'), desk('wastage', 'inventory'), desk('wastage', 'manufacturing')] },
    { title: 'hub.reports', links: [desk('wastage', 'by-product'), desk('wastage', 'by-reason'), desk('wastage', 'by-period')] },
    { title: 'ws.setup', links: [desk('wastage', 'reasons')] },
    { title: 'hub.settings', links: [desk('wastage', 'settings')] },
  ],
  steps: [
    { label: copy('Add a reason', '添加原因'), to: app('wastage', 'reasons') },
    { label: copy('Record shelf scrap', '登记货架报废'), to: app('wastage', 'inventory') },
    { label: copy('Record floor scrap', '登记车间报废'), to: app('wastage', 'manufacturing') },
    { label: copy('Approve a record', '审批一条记录'), to: app('wastage', 'records') },
    { label: copy('Review wastage settings', '检查报废设置'), to: app('wastage', 'settings') },
  ],
}

const pos: Workspace = {
  chartTitle: copy('Register takings', '收银台收款'),
  chart: series([210, 180, 240, 200, 260, 230, 280, 250, 220, 300, 270, 240]),
  kpis: [
    { label: copy('Open registers', '营业中的收银台'), value: 1, to: '/pos' },
    { label: copy('Receipts', '小票'), value: 6, to: '/pos/orders' },
    { label: copy('Takings', '收款'), value: 480, money: true, to: '/pos/report' },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/pos' },
    { label: 'ws.dashboard', to: '/pos/report' },
    { label: 'menu.sessions', to: '/pos' },
    { label: 'menu.posOrders', to: '/pos/orders' },
    { label: 'menu.products', to: '/products' },
    { label: desk('pos', 'floors').label, to: app('pos', 'floors') },
    { label: 'menu.reporting', to: '/pos/report' },
    { label: 'ws.setup', children: [desk('pos', 'payment-methods'), desk('pos', 'floors')] },
    { label: 'hub.settings', to: app('pos', 'settings') },
  ],
  groups: [
    { title: copy('Register', '收银台'), links: [{ label: 'menu.sessions', to: '/pos' }, { label: 'menu.posOrders', to: '/pos/orders' }, desk('pos', 'floors')] },
    { title: copy('Products', '产品'), links: [{ label: 'menu.products', to: '/products', external: true }] },
    { title: 'hub.reports', links: [{ label: 'menu.reporting', to: '/pos/report' }] },
    { title: 'ws.setup', links: [desk('pos', 'payment-methods')] },
    { title: 'hub.settings', links: [desk('pos', 'settings')] },
  ],
  steps: [
    { label: copy('Open a register', '打开收银台'), to: '/pos' },
    { label: copy('Add a product', '添加产品'), to: '/products/new' },
    { label: copy('Set a payment method', '设置付款方式'), to: app('pos', 'payment-methods') },
    { label: copy('Read the daily sales', '查看日销售'), to: '/pos/report' },
    { label: copy('Review register settings', '检查收银台设置'), to: app('pos', 'settings') },
  ],
}

const website: Workspace = {
  chartTitle: copy('Shop orders', '网店订单'),
  chart: series([4, 6, 5, 8, 7, 9, 6, 10, 8, 11, 9, 7]),
  kpis: [
    { label: copy('Published goods', '在售商品'), value: 4, to: '/products' },
    { label: copy('Shop orders', '网店订单'), value: 3, to: '/website' },
    { label: copy('Visitors', '访客'), value: 120, to: app('website', 'visitors') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/website' },
    { label: 'ws.dashboard', to: app('website', 'visitors') },
    { label: 'menu.websiteHome', to: '/website' },
    { label: 'menu.products', to: '/products' },
    { label: 'menu.storefront', to: '/shop' },
    { label: desk('website', 'coupons').label, to: app('website', 'coupons') },
    { label: 'menu.reporting', children: [desk('website', 'visitors')] },
    { label: 'hub.settings', to: app('website', 'settings') },
  ],
  groups: [
    {
      title: copy('Shop', '商店'),
      links: [
        { label: 'menu.websiteHome', to: '/website' },
        { label: 'menu.storefront', to: '/shop', external: true },
        desk('website', 'coupons'),
      ],
    },
    { title: copy('Products', '产品'), links: [{ label: 'menu.products', to: '/products', external: true }] },
    { title: 'hub.reports', links: [desk('website', 'visitors')] },
    { title: 'hub.settings', links: [desk('website', 'settings')] },
  ],
  steps: [
    { label: copy('Publish a product', '上架产品'), to: '/products' },
    { label: copy('Add a coupon', '添加优惠券'), to: app('website', 'coupons') },
    { label: copy('Check the shop visitors', '查看网店访客'), to: app('website', 'visitors') },
    { label: copy('Open the storefront', '打开商店前台'), to: '/shop' },
    { label: copy('Review shop settings', '检查商店设置'), to: app('website', 'settings') },
  ],
}

const sites: Workspace = {
  chartTitle: copy('Site messages', '网站留言'),
  chart: series([1, 2, 1, 3, 2, 4, 3, 2, 5, 3, 4, 2]),
  kpis: [
    { label: copy('Pages', '页面'), value: 4, to: '/sites' },
    { label: copy('Blog posts', '博客文章'), value: 1, to: '/sites/blog' },
    { label: copy('Messages', '留言'), value: 2, to: '/sites/inbox' },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/sites' },
    { label: 'menu.sitePages', to: '/sites' },
    { label: 'menu.blog', to: '/sites/blog' },
    { label: 'menu.theme', to: '/sites/theme' },
    { label: 'menu.navigation', to: '/sites/menu' },
    { label: 'menu.inbox', to: '/sites/inbox' },
  ],
  groups: [
    {
      title: copy('Content', '内容'),
      links: [
        { label: 'menu.sitePages', to: '/sites' },
        { label: 'menu.blog', to: '/sites/blog' },
      ],
    },
    {
      title: copy('Design', '设计'),
      links: [
        { label: 'menu.theme', to: '/sites/theme' },
        { label: 'menu.navigation', to: '/sites/menu' },
      ],
    },
    { title: copy('Messages', '留言'), links: [{ label: 'menu.inbox', to: '/sites/inbox' }] },
  ],
  steps: [
    { label: copy('Edit the home page', '编辑首页'), to: '/sites' },
    { label: copy('Pick a theme', '选择主题'), to: '/sites/theme' },
    { label: copy('Arrange the menu', '整理菜单'), to: '/sites/menu' },
    { label: copy('Write a blog post', '撰写博客文章'), to: '/sites/blog' },
    { label: copy('Answer site messages', '回复网站留言'), to: '/sites/inbox' },
  ],
}

const contacts: Workspace = {
  chartTitle: copy('New contacts', '新联系人'),
  chart: series([2, 1, 3, 2, 4, 2, 3, 1, 2, 3, 2, 1]),
  kpis: [
    { label: copy('Companies', '公司'), value: 6, to: '/contacts' },
    { label: copy('People', '人员'), value: 4, to: '/contacts' },
    { label: copy('Tags', '标签'), value: 3, to: app('contacts', 'tags') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/contacts' },
    { label: 'mod.contacts', to: '/contacts' },
    { label: 'menu.customers', to: '/contacts' },
    { label: 'menu.vendors', to: '/vendors' },
    { label: 'ws.setup', children: [desk('contacts', 'tags'), desk('contacts', 'industries'), desk('contacts', 'titles')] },
    { label: 'hub.settings', to: app('contacts', 'settings') },
  ],
  groups: [
    {
      title: copy('Address book', '通讯录'),
      links: [
        { label: 'mod.contacts', to: '/contacts' },
        { label: 'menu.customers', to: '/contacts' },
        { label: 'menu.vendors', to: '/vendors' },
      ],
    },
    { title: 'ws.setup', links: [desk('contacts', 'tags'), desk('contacts', 'industries'), desk('contacts', 'titles')] },
    { title: 'hub.settings', links: [desk('contacts', 'settings')] },
  ],
  steps: [
    { label: copy('Add a company', '添加公司'), to: '/contacts/new' },
    { label: copy('Add a person', '添加人员'), to: '/contacts/new' },
    { label: copy('Tag a contact', '给联系人加标签'), to: app('contacts', 'tags') },
    { label: copy('Set an industry', '设置行业'), to: app('contacts', 'industries') },
    { label: copy('Review contact settings', '检查联系人设置'), to: app('contacts', 'settings') },
  ],
}

const accounting: Workspace = {
  chartTitle: copy('Cash movement', '现金变动'),
  chart: series([120, 80, 210, 90, 160, 140, 200, 110, 180, 220, 150, 130]),
  kpis: [
    { label: copy('Receivable', '应收'), value: 52031.98, money: true, to: '/accounting?moveType=out_invoice' },
    { label: copy('Payable', '应付'), value: 34031.08, money: true, to: '/accounting?moveType=in_invoice' },
    { label: copy('Bank balance', '银行余额'), value: 24358, money: true, to: app('accounting', 'bank') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/accounting' },
    { label: 'ws.dashboard', to: app('accounting', 'dashboard') },
    { label: 'menu.invoices', to: '/accounting?moveType=out_invoice' },
    { label: 'acct.in', to: '/accounting?moveType=in_invoice' },
    { label: 'desk.g.entries', to: '/accounting/ledger' },
    { label: desk('accounting', 'accounts').label, to: app('accounting', 'accounts') },
    { label: desk('accounting', 'bank').label, to: app('accounting', 'bank') },
    {
      label: 'menu.reporting',
      children: [
        { label: 'acct.pnl', to: '/accounting/reports?view=pnl' },
        { label: 'acct.balance', to: '/accounting/reports?view=balance' },
        desk('accounting', 'cash-flow'),
        desk('accounting', 'aged-receivable'),
        desk('accounting', 'aged-payable'),
        { label: 'acct.vat', to: '/accounting/reports?view=vat' },
      ],
    },
    { label: 'ws.setup', children: [desk('accounting', 'journals'), desk('accounting', 'budgets'), desk('accounting', 'cost-centres')] },
    { label: 'hub.settings', to: app('accounting', 'settings') },
  ],
  groups: [
    {
      title: copy('Receivables', '应收'),
      links: [
        { label: 'menu.invoices', to: '/accounting?moveType=out_invoice' },
        desk('accounting', 'credit-notes'),
        desk('accounting', 'customer-payments'),
      ],
    },
    {
      title: copy('Payables', '应付'),
      links: [
        { label: 'acct.in', to: '/accounting?moveType=in_invoice' },
        desk('accounting', 'vendor-refunds'),
        desk('accounting', 'vendor-payments'),
        { label: 'menu.expenses', to: '/hr/expenses', external: true },
      ],
    },
    {
      title: copy('Accounting', '会计'),
      links: [
        { label: 'desk.g.entries', to: '/accounting/ledger' },
        desk('accounting', 'accounts'),
        desk('accounting', 'journals'),
        desk('accounting', 'reconcile'),
        { label: 'menu.statements', to: '/accounting/statements' },
        desk('accounting', 'bank'),
        desk('accounting', 'budgets'),
        desk('accounting', 'cost-centres'),
      ],
    },
    {
      title: 'hub.reports',
      links: [
        { label: 'acct.pnl', to: '/accounting/reports?view=pnl' },
        { label: 'acct.balance', to: '/accounting/reports?view=balance' },
        desk('accounting', 'cash-flow'),
        desk('accounting', 'aged-receivable'),
        desk('accounting', 'aged-payable'),
        { label: 'acct.vat', to: '/accounting/reports?view=vat' },
      ],
    },
    { title: 'hub.settings', links: [desk('accounting', 'settings')] },
  ],
  steps: [
    { label: copy('Review the chart', '检查科目表'), to: app('accounting', 'accounts') },
    { label: copy('Post an invoice', '过账发票'), to: '/accounting?moveType=out_invoice' },
    { label: copy('Record a bill', '登记账单'), to: '/accounting?moveType=in_invoice' },
    { label: copy('Import a statement', '导入对账单'), to: '/accounting/statements' },
    { label: copy('Open the profit and loss', '打开损益表'), to: '/accounting/reports?view=pnl' },
    { label: copy('Review finance settings', '检查财务设置'), to: app('accounting', 'settings') },
  ],
}

const hr: Workspace = {
  chartTitle: copy('Headcount', '人数'),
  chart: series([8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12, 12]),
  kpis: [
    { label: copy('Employees', '员工'), value: 4, to: '/hr' },
    { label: copy('Open jobs', '在招职位'), value: 2, to: app('hr', 'jobs') },
    { label: copy('Leave waiting', '待批假期'), value: 1, to: app('hr', 'approvals') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/hr' },
    { label: 'ws.dashboard', to: app('hr', 'dashboard') },
    { label: 'menu.employees', to: '/hr' },
    {
      label: copy('Recruitment', '招聘'),
      children: [desk('hr', 'jobs'), desk('hr', 'applicants'), desk('hr', 'onboarding'), desk('hr', 'appraisals')],
    },
    { label: copy('Leaves', '假期'), children: [desk('hr', 'leave-types'), desk('hr', 'leave'), desk('hr', 'approvals')] },
    { label: 'menu.payroll', to: '/hr/payroll' },
    { label: 'menu.expenses', to: '/hr/expenses' },
    { label: 'menu.reporting', children: [desk('hr', 'analysis'), desk('hr', 'recruitment-report'), desk('hr', 'leave-report')] },
    { label: 'hub.settings', to: app('hr', 'settings') },
  ],
  groups: [
    {
      title: copy('Employee', '员工'),
      links: [
        { label: 'menu.employees', to: '/hr' },
        desk('hr', 'departments'),
        desk('hr', 'designations'),
        desk('hr', 'org'),
        desk('hr', 'contracts'),
      ],
    },
    {
      title: copy('Recruitment', '招聘'),
      links: [desk('hr', 'jobs'), desk('hr', 'applicants'), desk('hr', 'onboarding'), desk('hr', 'appraisals')],
    },
    { title: copy('Leaves', '假期'), links: [desk('hr', 'leave-types'), desk('hr', 'leave'), desk('hr', 'approvals')] },
    { title: 'hub.reports', links: [desk('hr', 'analysis'), desk('hr', 'recruitment-report'), desk('hr', 'leave-report')] },
    { title: 'hub.settings', links: [desk('hr', 'settings')] },
  ],
  steps: [
    { label: copy('Add a department', '添加部门'), to: app('hr', 'departments') },
    { label: copy('Add an employee', '添加员工'), to: '/hr' },
    { label: copy('Write a contract', '写一份合同'), to: app('hr', 'contracts') },
    { label: copy('Open a job', '发布职位'), to: app('hr', 'jobs') },
    { label: copy('Approve leave', '审批请假'), to: app('hr', 'approvals') },
    { label: copy('Review HR settings', '检查人事设置'), to: app('hr', 'settings') },
  ],
}

const attendance: Workspace = {
  chartTitle: copy('Days present', '出勤天数'),
  chart: series([18, 19, 20, 18, 21, 19, 20, 17, 21, 20, 19, 16]),
  kpis: [
    { label: copy('Present', '出勤'), value: 3, to: app('attendance', 'check-in') },
    { label: copy('Late', '迟到'), value: 1, to: app('attendance', 'late') },
    { label: copy('Overtime hours', '加班小时'), value: 6, to: app('attendance', 'overtime') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/attendance' },
    { label: 'ws.dashboard', to: app('attendance', 'dashboard') },
    { label: desk('attendance', 'check-in').label, to: app('attendance', 'check-in') },
    { label: desk('attendance', 'shifts').label, to: app('attendance', 'shifts') },
    { label: desk('attendance', 'rosters').label, to: app('attendance', 'rosters') },
    { label: desk('attendance', 'sheet').label, to: app('attendance', 'sheet') },
    { label: 'menu.reporting', children: [desk('attendance', 'rate'), desk('attendance', 'late-report'), desk('attendance', 'overtime-report')] },
    { label: 'hub.settings', to: app('attendance', 'settings') },
  ],
  groups: [
    {
      title: copy('Time', '考勤'),
      links: [
        desk('attendance', 'check-in'),
        desk('attendance', 'shifts'),
        desk('attendance', 'rosters'),
        desk('attendance', 'sheet'),
        desk('attendance', 'late'),
        desk('attendance', 'absent'),
        desk('attendance', 'overtime'),
        desk('attendance', 'calendar'),
      ],
    },
    { title: 'hub.reports', links: [desk('attendance', 'rate'), desk('attendance', 'late-report'), desk('attendance', 'overtime-report')] },
    { title: 'hub.settings', links: [desk('attendance', 'settings')] },
  ],
  steps: [
    { label: copy('Define a shift', '定义班次'), to: app('attendance', 'shifts') },
    { label: copy('Publish a roster', '发布排班'), to: app('attendance', 'rosters') },
    { label: copy('Check someone in', '给某人打卡'), to: app('attendance', 'check-in') },
    { label: copy('Open the monthly sheet', '打开月度考勤表'), to: app('attendance', 'sheet') },
    { label: copy('Review attendance settings', '检查考勤设置'), to: app('attendance', 'settings') },
  ],
}

const payroll: Workspace = {
  chartTitle: copy('Gross pay', '应发工资'),
  chart: series([8200, 8200, 8400, 8400, 8600, 8600, 8800, 8800, 9000, 9000, 9200, 9200]),
  kpis: [
    { label: copy('Open batches', '未结批次'), value: 1, to: app('payroll', 'batches') },
    { label: copy('Payslips', '工资单'), value: 4, to: app('payroll', 'payslips') },
    { label: copy('Gross this month', '本月应发'), value: 9200, money: true, to: '/hr/payroll' },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/payroll' },
    { label: 'ws.dashboard', to: app('payroll', 'analysis') },
    { label: 'menu.payroll', to: '/hr/payroll' },
    { label: desk('payroll', 'batches').label, to: app('payroll', 'batches') },
    { label: desk('payroll', 'payslips').label, to: app('payroll', 'payslips') },
    { label: 'menu.reporting', children: [desk('payroll', 'analysis')] },
    { label: 'ws.setup', children: [desk('payroll', 'structures'), desk('payroll', 'rules')] },
    { label: 'hub.settings', to: app('payroll', 'settings') },
  ],
  groups: [
    { title: copy('Pay', '工资'), links: [{ label: 'menu.payroll', to: '/hr/payroll' }, desk('payroll', 'batches'), desk('payroll', 'payslips')] },
    { title: 'ws.setup', links: [desk('payroll', 'structures'), desk('payroll', 'rules')] },
    { title: 'hub.reports', links: [desk('payroll', 'analysis')] },
    { title: 'hub.settings', links: [desk('payroll', 'settings')] },
  ],
  steps: [
    { label: copy('Set a salary structure', '设置薪资结构'), to: app('payroll', 'structures') },
    { label: copy('Check the rules', '检查薪资规则'), to: app('payroll', 'rules') },
    { label: copy('Open payslips', '打开工资单'), to: app('payroll', 'payslips') },
    { label: copy('Run payroll', '运行工资'), to: '/hr/payroll' },
    { label: copy('Review payroll settings', '检查工资设置'), to: app('payroll', 'settings') },
  ],
}

const expenses: Workspace = {
  chartTitle: copy('Claims', '报销金额'),
  chart: series([120, 80, 200, 60, 140, 90, 160, 110, 70, 180, 130, 95]),
  kpis: [
    { label: copy('Submitted', '已提交'), value: 2, to: '/hr/expenses' },
    { label: copy('To approve', '待审批'), value: 1, to: app('expenses', 'approvals') },
    { label: copy('To reimburse', '待付款'), value: 86, money: true, to: app('expenses', 'reports') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/expenses' },
    { label: 'ws.dashboard', to: app('expenses', 'analysis') },
    { label: 'menu.expenses', to: '/hr/expenses' },
    { label: desk('expenses', 'reports').label, to: app('expenses', 'reports') },
    { label: desk('expenses', 'approvals').label, to: app('expenses', 'approvals') },
    { label: 'menu.reporting', children: [desk('expenses', 'analysis')] },
    { label: 'ws.setup', children: [desk('expenses', 'categories')] },
    { label: 'hub.settings', to: app('expenses', 'settings') },
  ],
  groups: [
    { title: copy('Claims', '报销'), links: [{ label: 'menu.expenses', to: '/hr/expenses' }, desk('expenses', 'reports'), desk('expenses', 'approvals')] },
    { title: 'hub.reports', links: [desk('expenses', 'analysis')] },
    { title: 'ws.setup', links: [desk('expenses', 'categories')] },
    { title: 'hub.settings', links: [desk('expenses', 'settings')] },
  ],
  steps: [
    { label: copy('Add a category', '添加类别'), to: app('expenses', 'categories') },
    { label: copy('Submit a claim', '提交报销'), to: '/hr/expenses' },
    { label: copy('Approve a claim', '审批报销'), to: app('expenses', 'approvals') },
    { label: copy('Read the analysis', '查看分析'), to: app('expenses', 'analysis') },
    { label: copy('Review expense settings', '检查报销设置'), to: app('expenses', 'settings') },
  ],
}

const assets: Workspace = {
  chartTitle: copy('Asset value', '资产原值'),
  chart: series([12000, 12000, 12500, 12500, 12500, 14000, 14000, 14000, 13800, 13800, 13600, 13600]),
  kpis: [
    { label: copy('Running assets', '在用资产'), value: 3, to: '/assets' },
    { label: copy('In maintenance', '维修中'), value: 1, to: app('assets', 'maintenance') },
    { label: copy('Gross value', '原值'), value: 23780, money: true, to: app('assets', 'analysis') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/assets' },
    { label: 'ws.dashboard', to: app('assets', 'dashboard') },
    { label: desk('assets', 'register').label, to: '/assets' },
    { label: desk('assets', 'categories').label, to: app('assets', 'categories') },
    { label: desk('assets', 'movements').label, to: app('assets', 'movements') },
    { label: desk('assets', 'depreciation').label, to: app('assets', 'depreciation') },
    { label: desk('assets', 'maintenance').label, to: app('assets', 'maintenance') },
    { label: 'menu.reporting', children: [desk('assets', 'analysis'), desk('assets', 'schedule'), desk('assets', 'maintenance-report')] },
    { label: 'ws.setup', children: [desk('assets', 'locations'), desk('assets', 'categories'), desk('assets', 'disposals')] },
    { label: 'hub.settings', to: app('assets', 'settings') },
  ],
  groups: [
    { title: copy('Assets', '资产'), links: [{ ...desk('assets', 'register'), to: '/assets' }, desk('assets', 'categories'), desk('assets', 'locations'), desk('assets', 'movements'), desk('assets', 'disposals')] },
    { title: copy('Depreciation', '折旧'), links: [desk('assets', 'depreciation'), desk('assets', 'schedule'), desk('assets', 'analysis')] },
    { title: copy('Maintenance', '维护'), links: [desk('assets', 'maintenance'), desk('assets', 'maintenance-report')] },
    { title: 'hub.reports', links: [desk('assets', 'analysis'), desk('assets', 'schedule'), desk('assets', 'maintenance-report'), desk('assets', 'dashboard')] },
    { title: 'hub.settings', links: [desk('assets', 'settings')] },
  ],
  steps: [
    { label: copy('Add a category', '添加类别'), to: app('assets', 'categories') },
    { label: copy('Add a location', '添加地点'), to: app('assets', 'locations') },
    { label: copy('Register an asset', '登记资产'), to: '/assets' },
    { label: copy('Post depreciation', '过账折旧'), to: app('assets', 'depreciation') },
    { label: copy('Schedule maintenance', '安排维护'), to: app('assets', 'maintenance') },
    { label: copy('Read the schedule', '查看折旧计划'), to: app('assets', 'schedule') },
    { label: copy('Review asset settings', '检查资产设置'), to: app('assets', 'settings') },
  ],
}

const projects: Workspace = {
  chartTitle: copy('Hours logged', '登记工时'),
  chart: series([40, 36, 48, 42, 55, 50, 46, 60, 52, 58, 44, 49]),
  kpis: [
    { label: copy('Open projects', '进行中的项目'), value: 2, to: '/projects' },
    { label: copy('Open tasks', '未完成任务'), value: 4, to: '/projects' },
    { label: copy('To bill', '待开票'), value: 1200, money: true, to: app('projects', 'billing') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/projects' },
    { label: 'ws.dashboard', to: app('projects', 'dashboard') },
    { label: desk('projects', 'projects').label, to: '/projects' },
    { label: desk('projects', 'tasks').label, to: '/projects' },
    { label: desk('projects', 'timesheets').label, to: app('projects', 'timesheets') },
    { label: desk('projects', 'billing').label, to: app('projects', 'billing') },
    { label: 'menu.reporting', children: [desk('projects', 'analysis'), desk('projects', 'profitability'), desk('projects', 'delayed'), desk('projects', 'timesheet-summary')] },
    { label: 'ws.setup', children: [desk('projects', 'templates'), desk('projects', 'activity-types'), desk('projects', 'milestones')] },
    { label: 'hub.settings', to: app('projects', 'settings') },
  ],
  groups: [
    { title: copy('Projects', '项目'), links: [desk('projects', 'projects'), desk('projects', 'tasks'), desk('projects', 'milestones'), desk('projects', 'updates'), desk('projects', 'templates')] },
    { title: copy('Time', '工时'), links: [desk('projects', 'timesheets'), desk('projects', 'activity-types'), desk('projects', 'billing')] },
    { title: 'hub.reports', links: [desk('projects', 'analysis'), desk('projects', 'profitability'), desk('projects', 'delayed'), desk('projects', 'timesheet-summary'), desk('projects', 'dashboard')] },
    { title: 'hub.settings', links: [desk('projects', 'settings')] },
  ],
  steps: [
    { label: copy('Pick a template', '选择模板'), to: app('projects', 'templates') },
    { label: copy('Open a project', '新建项目'), to: app('projects', 'projects') },
    { label: copy('Add a task', '添加任务'), to: app('projects', 'tasks') },
    { label: copy('Set a milestone', '设置里程碑'), to: app('projects', 'milestones') },
    { label: copy('Log time', '登记工时'), to: app('projects', 'timesheets') },
    { label: copy('Read profitability', '查看项目利润'), to: app('projects', 'profitability') },
    { label: copy('Review project settings', '检查项目设置'), to: app('projects', 'settings') },
  ],
}

const quality: Workspace = {
  chartTitle: copy('Inspections', '检验'),
  chart: series([6, 4, 8, 5, 7, 9, 6, 8, 5, 10, 7, 6]),
  kpis: [
    { label: copy('Open inspections', '未结检验'), value: 2, to: '/quality' },
    { label: copy('Failed lots', '不合格批次'), value: 1, to: '/quality/alerts' },
    { label: copy('Open alerts', '未关闭警报'), value: 1, to: '/quality/alerts' },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/quality' },
    { label: 'ws.dashboard', to: app('quality', 'dashboard') },
    { label: desk('quality', 'inspections').label, to: '/quality' },
    { label: desk('quality', 'alerts').label, to: '/quality/alerts' },
    { label: desk('quality', 'goals').label, to: app('quality', 'goals') },
    { label: 'menu.reporting', children: [desk('quality', 'analysis'), desk('quality', 'inspection-summary'), desk('quality', 'alert-analysis'), desk('quality', 'by-product')] },
    { label: 'ws.setup', children: [desk('quality', 'procedures'), desk('quality', 'teams'), desk('quality', 'goals')] },
    { label: 'hub.settings', to: app('quality', 'settings') },
  ],
  groups: [
    { title: copy('Inspections', '检验'), links: [desk('quality', 'inspections'), desk('quality', 'procedures'), desk('quality', 'goals'), desk('quality', 'teams')] },
    { title: copy('Issues', '问题'), links: [desk('quality', 'nonconformance'), desk('quality', 'alerts')] },
    { title: 'hub.reports', links: [desk('quality', 'analysis'), desk('quality', 'inspection-summary'), desk('quality', 'alert-analysis'), desk('quality', 'by-product'), desk('quality', 'dashboard')] },
    { title: 'hub.settings', links: [desk('quality', 'settings')] },
  ],
  steps: [
    { label: copy('Add a team', '添加团队'), to: app('quality', 'teams') },
    { label: copy('Write a procedure', '写一份规程'), to: app('quality', 'procedures') },
    { label: copy('Set a goal', '设定目标'), to: app('quality', 'goals') },
    { label: copy('Inspect a lot', '检验一个批次'), to: app('quality', 'inspections') },
    { label: copy('Log a failure', '登记不合格'), to: app('quality', 'nonconformance') },
    { label: copy('Read the summary', '查看检验汇总'), to: app('quality', 'inspection-summary') },
    { label: copy('Review quality settings', '检查质量设置'), to: app('quality', 'settings') },
  ],
}

const subcontracting: Workspace = {
  chartTitle: copy('Sent out', '发出金额'),
  chart: series([200, 180, 240, 160, 300, 220, 260, 190, 280, 310, 240, 200]),
  kpis: [
    { label: copy('Open orders', '未结订单'), value: 2, to: '/subcontracting' },
    { label: copy('To receive', '待收货'), value: 1, to: app('subcontracting', 'pending') },
    { label: copy('Open value', '未结金额'), value: 820, money: true, to: app('subcontracting', 'analysis') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/subcontracting' },
    { label: 'ws.dashboard', to: app('subcontracting', 'dashboard') },
    { label: desk('subcontracting', 'orders').label, to: '/subcontracting' },
    { label: desk('subcontracting', 'receipts').label, to: app('subcontracting', 'receipts') },
    { label: desk('subcontracting', 'resupply').label, to: app('subcontracting', 'resupply') },
    { label: desk('subcontracting', 'boms').label, to: app('subcontracting', 'boms') },
    { label: 'menu.reporting', children: [desk('subcontracting', 'analysis'), desk('subcontracting', 'order-summary'), desk('subcontracting', 'consumed'), desk('subcontracting', 'cost')] },
    { label: 'hub.settings', to: app('subcontracting', 'settings') },
  ],
  groups: [
    { title: copy('Orders', '订单'), links: [{ ...desk('subcontracting', 'orders'), to: '/subcontracting' }, desk('subcontracting', 'receipts'), desk('subcontracting', 'pending'), desk('subcontracting', 'resupply')] },
    { title: copy('Materials', '原料'), links: [desk('subcontracting', 'boms'), desk('subcontracting', 'consumed'), desk('subcontracting', 'resupply'), { label: 'menu.boms', to: '/boms', external: true }] },
    { title: 'hub.reports', links: [desk('subcontracting', 'analysis'), desk('subcontracting', 'order-summary'), desk('subcontracting', 'consumed'), desk('subcontracting', 'cost'), desk('subcontracting', 'dashboard')] },
    { title: 'hub.settings', links: [desk('subcontracting', 'settings')] },
  ],
  steps: [
    { label: copy('Write a subcontract BOM', '写一份委外物料清单'), to: app('subcontracting', 'boms') },
    { label: copy('Send an order', '发出委外单'), to: '/subcontracting' },
    { label: copy('Resupply components', '补发组件'), to: app('subcontracting', 'resupply') },
    { label: copy('Receive the goods', '收回货物'), to: app('subcontracting', 'receipts') },
    { label: copy('Read the order summary', '查看订单汇总'), to: app('subcontracting', 'order-summary') },
    { label: copy('Review subcontracting settings', '检查委外设置'), to: app('subcontracting', 'settings') },
  ],
}

const helpdesk: Workspace = {
  chartTitle: copy('Tickets opened', '新建工单'),
  chart: series([3, 2, 4, 3, 5, 2, 4, 3, 2, 5, 4, 3]),
  kpis: [
    { label: copy('Open tickets', '未关闭工单'), value: 2, to: app('helpdesk', 'tickets') },
    { label: copy('Breached SLA', '超时'), value: 1, to: app('helpdesk', 'sla') },
    { label: copy('Teams', '团队'), value: 2, to: app('helpdesk', 'teams') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/helpdesk' },
    { label: 'ws.dashboard', to: app('helpdesk', 'dashboard') },
    { label: desk('helpdesk', 'tickets').label, to: app('helpdesk', 'tickets') },
    { label: desk('helpdesk', 'sla').label, to: app('helpdesk', 'sla') },
    { label: 'menu.reporting', children: [desk('helpdesk', 'analysis'), desk('helpdesk', 'summary'), desk('helpdesk', 'sla-report'), desk('helpdesk', 'by-team')] },
    { label: 'ws.setup', children: [desk('helpdesk', 'teams'), desk('helpdesk', 'stages'), desk('helpdesk', 'types'), desk('helpdesk', 'priorities'), desk('helpdesk', 'tags'), desk('helpdesk', 'replies')] },
    { label: 'hub.settings', to: app('helpdesk', 'settings') },
  ],
  groups: [
    { title: copy('Tickets', '工单'), links: [desk('helpdesk', 'tickets'), desk('helpdesk', 'types'), desk('helpdesk', 'priorities'), desk('helpdesk', 'stages')] },
    { title: copy('Service', '服务'), links: [desk('helpdesk', 'sla'), desk('helpdesk', 'teams'), desk('helpdesk', 'tags'), desk('helpdesk', 'replies')] },
    { title: 'hub.reports', links: [desk('helpdesk', 'analysis'), desk('helpdesk', 'summary'), desk('helpdesk', 'sla-report'), desk('helpdesk', 'by-team'), desk('helpdesk', 'dashboard')] },
    { title: 'hub.settings', links: [desk('helpdesk', 'settings')] },
  ],
  steps: [
    { label: copy('Add a team', '添加团队'), to: app('helpdesk', 'teams') },
    { label: copy('Set the stages', '设置阶段'), to: app('helpdesk', 'stages') },
    { label: copy('Add a ticket type', '添加工单类型'), to: app('helpdesk', 'types') },
    { label: copy('Write a canned reply', '写一条常用回复'), to: app('helpdesk', 'replies') },
    { label: copy('Open a ticket', '新建工单'), to: app('helpdesk', 'tickets') },
    { label: copy('Check the SLA', '检查服务级别'), to: app('helpdesk', 'sla-report') },
    { label: copy('Review helpdesk settings', '检查服务台设置'), to: app('helpdesk', 'settings') },
  ],
}

const email: Workspace = {
  chartTitle: copy('Opens', '打开'),
  chart: series([4, 6, 5, 8, 7, 9, 6, 10, 8, 11, 9, 7]),
  kpis: [
    { label: copy('Campaigns', '活动'), value: 2, to: '/email' },
    { label: copy('Lists', '名单'), value: 1, to: '/email/lists' },
    { label: copy('Suppressed', '退订'), value: 0, to: '/email/suppression' },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/email' },
    { label: 'menu.campaigns', to: '/email' },
    { label: 'menu.lists', to: '/email/lists' },
    { label: 'menu.suppression', to: '/email/suppression' },
  ],
  groups: [
    { title: copy('Mail', '邮件'), links: [
      { label: 'menu.campaigns', to: '/email' },
      { label: 'menu.lists', to: '/email/lists' },
      { label: 'menu.suppression', to: '/email/suppression' },
    ] },
    { title: copy('Write', '撰写'), links: [
      { label: copy('New campaign', '新建活动'), to: '/email/campaigns/new' },
      { label: 'menu.lists', to: '/email/lists' },
      { label: 'menu.suppression', to: '/email/suppression' },
    ] },
    { title: 'hub.reports', links: [{ label: copy('Open rate', '打开率'), to: '/email' }] },
  ],
  steps: [
    { label: copy('Build a list', '建立名单'), to: '/email/lists' },
    { label: copy('Write a campaign', '写一封活动邮件'), to: '/email/campaigns/new' },
    { label: copy('Read the stats', '看统计'), to: '/email' },
    { label: copy('Check suppression', '检查退订'), to: '/email/suppression' },
  ],
}

const dashboard: Workspace = {
  chartTitle: copy('Open pipeline', '未结管道'),
  chart: series([4200, 4600, 4400, 5100, 4800, 5600, 5900, 5400, 6000, 6200, 5800, 6200]),
  kpis: [
    { label: copy('Open orders', '未结订单'), value: 3, to: '/orders' },
    { label: copy('Customers owe', '客户欠款'), value: 52031.98, money: true, to: '/accounting?moveType=out_invoice' },
    { label: copy('Activities', '活动'), value: 2, to: app('dashboard', 'activities') },
  ],
  sidebar: [
    { label: 'ws.home', to: '/go/dashboard' },
    { label: 'mod.dashboard', to: '/desk' },
    { label: desk('dashboard', 'activities').label, to: app('dashboard', 'activities') },
    { label: 'menu.reporting', to: app('dashboard', 'reporting') },
    { label: 'hub.settings', to: app('dashboard', 'settings') },
  ],
  groups: [
    { title: copy('Today', '今天'), links: [{ label: 'mod.dashboard', to: '/desk' }, desk('dashboard', 'activities')] },
    { title: 'hub.reports', links: [desk('dashboard', 'reporting')] },
    { title: 'hub.settings', links: [desk('dashboard', 'settings')] },
  ],
  steps: [
    { label: copy('Read the desk', '查看工作台'), to: '/desk' },
    { label: copy('Close an activity', '完成一项活动'), to: app('dashboard', 'activities') },
    { label: copy('Open the snapshot', '打开快照'), to: app('dashboard', 'reporting') },
    { label: copy('Review dashboard settings', '检查仪表板设置'), to: app('dashboard', 'settings') },
  ],
}

export const workspaces: Record<string, Workspace> = {
  manufacturing,
  sales,
  crm,
  purchase,
  inventory,
  wastage,
  pos,
  website,
  sites,
  contacts,
  accounting,
  hr,
  attendance,
  payroll,
  expenses,
  assets,
  projects,
  quality,
  subcontracting,
  helpdesk,
  email,
  dashboard,
}

export function workspaceFor(moduleId: string) {
  return workspaces[moduleId] ?? null
}

export function workspaceLinks(workspace: Workspace): WsLink[] {
  const links: WsLink[] = []
  for (const item of workspace.sidebar) {
    if (item.to) links.push({ label: item.label, to: item.to })
    for (const child of item.children ?? []) links.push(child)
  }
  for (const group of workspace.groups) links.push(...group.links)
  for (const kpi of workspace.kpis) links.push({ label: kpi.label, to: kpi.to })
  for (const step of workspace.steps) links.push({ label: step.label, to: step.to })
  return links
}
