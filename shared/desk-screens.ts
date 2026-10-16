export type DeskKind = 'list' | 'report' | 'settings' | 'accounts'

export type DeskSeed = {
  name: string
  state: string
  partner?: string
  owner?: string
  bucket?: string
  amount?: number
  notes?: string
  recordDate?: string
}

export type DeskSetting = {
  key: string
  labelEn: string
  labelZh: string
  value: string
  byCountry?: Record<string, string>
}

export type DeskScreen = {
  module: string
  screen: string
  kind: DeskKind
  kanban: boolean
  states: string[]
  titleEn: string
  titleZh: string
  leadEn: string
  leadZh: string
  rows: DeskSeed[]
  settings: DeskSetting[]
  /** When set, the seed writes these rows only for companies in these country codes. */
  countries?: string[]
}

const day = (iso: string) => iso

function list(
  module: string,
  screen: string,
  titleEn: string,
  titleZh: string,
  leadEn: string,
  leadZh: string,
  states: string[],
  rows: DeskSeed[],
  kanban = true,
): DeskScreen {
  return { module, screen, kind: 'list', kanban, states, titleEn, titleZh, leadEn, leadZh, rows, settings: [] }
}

function report(
  module: string,
  screen: string,
  titleEn: string,
  titleZh: string,
  leadEn: string,
  leadZh: string,
  rows: DeskSeed[],
): DeskScreen {
  return {
    module,
    screen,
    kind: 'report',
    kanban: false,
    states: [],
    titleEn,
    titleZh,
    leadEn,
    leadZh,
    rows,
    settings: [],
  }
}

function inCountries(screen: DeskScreen, countries: string[]) {
  return { ...screen, countries }
}

function settings(
  module: string,
  titleEn: string,
  titleZh: string,
  leadEn: string,
  leadZh: string,
  fields: DeskSetting[],
): DeskScreen {
  return {
    module,
    screen: 'settings',
    kind: 'settings',
    kanban: false,
    states: [],
    titleEn,
    titleZh,
    leadEn,
    leadZh,
    rows: [],
    settings: fields,
  }
}

export const deskScreens: DeskScreen[] = [
  list('dashboard', 'activities', 'Activities', '活动', 'Calls, meetings, and to-dos across the company.', '公司里的电话、会议和待办。', ['open', 'done'], [
    { name: 'Call Cedar & Co', state: 'open', partner: 'Cedar & Co', owner: 'Maya Chen', bucket: 'Call', notes: 'Confirm the April blanket order.', recordDate: day('2026-04-16') },
    { name: 'Workshop count', state: 'open', partner: 'Jiangbei Goods Co.', owner: 'He Gong', bucket: 'To-do', notes: 'Count greige canvas before the next cutting order.', recordDate: day('2026-04-15') },
    { name: 'Harbour pricing review', state: 'done', partner: 'Harbour & Line', owner: 'Amira Shah', bucket: 'Meeting', notes: 'Wholesale prices for the spring tote.', recordDate: day('2026-04-02') },
  ]),
  report('dashboard', 'reporting', 'Company snapshot', '公司快照', 'A short read of pipeline, stock, and cash.', '管道、库存和现金的简表。', [
    { name: 'Open pipeline', state: 'open', bucket: 'Pipeline', amount: 6200, recordDate: day('2026-04-01') },
    { name: 'Customers owe', state: 'open', bucket: 'Receivable', amount: 266.68, recordDate: day('2026-04-01') },
    { name: 'Vendors to pay', state: 'open', bucket: 'Payable', amount: 90.4, recordDate: day('2026-04-01') },
    { name: 'Low stock lines', state: 'open', bucket: 'Stock', amount: 2, recordDate: day('2026-04-01') },
  ]),
  settings('dashboard', 'Dashboard settings', '仪表板设置', 'What the home page emphasises.', '首页强调的内容。', [
    { key: 'currency', labelEn: 'Show amounts in the company currency', labelZh: '金额使用公司货币', value: 'yes' },
    { key: 'range', labelEn: 'Default date range', labelZh: '默认日期范围', value: 'This month' },
  ]),

  list('sales', 'to-invoice', 'Orders to invoice', '待开票订单', 'Confirmed orders that still need a customer invoice.', '已确认、尚未给客户开票的订单。', ['to_invoice', 'invoiced'], [
    { name: 'SO1108', state: 'to_invoice', partner: 'Orchard School', owner: 'Maya Chen', amount: 84.75, notes: 'Delivered. Invoice not posted.', recordDate: day('2026-04-11') },
    { name: 'SO1110', state: 'to_invoice', partner: 'Paper & Pine', owner: 'Jonah Ellis', amount: 27.12, notes: 'Shop delivery, waiting on the invoice.', recordDate: day('2026-04-10') },
    { name: 'SO1104', state: 'invoiced', partner: 'Field Office', owner: 'Maya Chen', amount: 62.15, notes: 'Invoice posted.', recordDate: day('2026-04-07') },
  ]),
  list('sales', 'to-upsell', 'Orders to upsell', '可追加销售', 'Delivered orders where a second offer still makes sense.', '已交付、仍适合追加报价的订单。', ['open', 'done'], [
    { name: 'SO0002 blanket care', state: 'open', partner: 'Lin Xiao', owner: 'Jonah Ellis', amount: 36, notes: 'Offer a second throw after the WeChat order.', recordDate: day('2026-04-12') },
    { name: 'SO1121 notebook refill', state: 'open', partner: 'Field Office', owner: 'Maya Chen', amount: 18, notes: 'Refill pack for the field notebook.', recordDate: day('2026-04-12') },
    { name: 'SO1101 closed', state: 'done', partner: 'Cedar & Co', owner: 'Maya Chen', amount: 0, notes: 'Customer declined a second quote.', recordDate: day('2026-03-20') },
  ]),
  list('sales', 'variants', 'Product variants', '产品变体', 'Size and colour variants behind the published goods.', '在售商品下的尺码和颜色。', ['active', 'archived'], [
    { name: 'Field notebook / A5 ruled', state: 'active', partner: 'Field notebook', owner: 'Sales', amount: 18, bucket: 'A5', notes: 'Default shop variant.', recordDate: day('2026-01-08') },
    { name: 'Canvas tote / Natural', state: 'active', partner: 'Canvas tote', owner: 'Sales', amount: 24, bucket: 'Natural', notes: 'Wholesale and shop.', recordDate: day('2026-01-08') },
    { name: 'Greige canvas / 1.5m', state: 'active', partner: 'Greige canvas', owner: 'Sales', amount: 12, bucket: 'Roll', notes: 'Sold by the metre to the workshop.', recordDate: day('2026-01-08') },
  ], false),
  list('sales', 'pricelists', 'Pricelists', '价格表', 'Customer prices. The public shop still uses the product list price.', '客户价格。网店仍使用产品标价。', ['active', 'draft'], [
    { name: 'Public', state: 'active', partner: 'All customers', owner: 'Maya Chen', amount: 0, notes: 'List price. Used on the shop.', recordDate: day('2026-01-01') },
    { name: 'Wholesale 15%', state: 'active', partner: 'Cedar & Co', owner: 'Maya Chen', amount: 15, notes: 'Fifteen percent off list for the house account.', recordDate: day('2026-02-01') },
    { name: 'Spring sample', state: 'draft', partner: 'Harbour & Line', owner: 'Jonah Ellis', amount: 10, notes: 'Not applied yet.', recordDate: day('2026-04-01') },
  ]),
  report('sales', 'analysis', 'Sales analysis', '销售分析', 'Invoiced and open sales by month. Figures follow the sample book.', '按月的已开票和未结销售。数字来自示例账。', [
    { name: 'January', state: 'done', bucket: 'Jan', amount: 420, recordDate: day('2026-01-31') },
    { name: 'February', state: 'done', bucket: 'Feb', amount: 610, recordDate: day('2026-02-28') },
    { name: 'March', state: 'done', bucket: 'Mar', amount: 380, recordDate: day('2026-03-31') },
    { name: 'April', state: 'open', bucket: 'Apr', amount: 540, recordDate: day('2026-04-16') },
  ]),
  settings('sales', 'Sales settings', '销售设置', 'Defaults for quotations and teams.', '报价和团队的默认值。', [
    { key: 'validity', labelEn: 'Quotation validity (days)', labelZh: '报价有效天数', value: '30' },
    { key: 'team', labelEn: 'Default sales team', labelZh: '默认销售团队', value: 'Direct' },
    { key: 'online', labelEn: 'Online payment on quotations', labelZh: '报价单上的在线付款', value: 'off' },
  ]),
  list('sales', 'teams', 'Sales teams', '销售团队', 'Who owns new quotations.', '新报价单归谁。', ['active', 'archived'], [
    { name: 'Direct', state: 'active', owner: 'Maya Chen', partner: 'Shanghai', notes: 'House accounts and the shop.', recordDate: day('2026-01-01') },
    { name: 'Wholesale', state: 'active', owner: 'Jonah Ellis', partner: 'Shanghai', notes: 'Cedar & Co and the schools.', recordDate: day('2026-01-01') },
    { name: 'Pop-up', state: 'archived', owner: 'Lin Xiao', partner: 'Shanghai', notes: 'Last winter market. Closed.', recordDate: day('2026-02-01') },
  ], false),
  list('sales', 'payment-terms', 'Payment terms', '付款条款', 'When a customer invoice falls due.', '客户发票何时到期。', ['active'], [
    { name: 'Immediate', state: 'active', notes: 'Due on the invoice date.', amount: 0, recordDate: day('2026-01-01') },
    { name: '15 days', state: 'active', notes: 'Due fifteen days after the invoice.', amount: 15, recordDate: day('2026-01-01') },
    { name: '30 days', state: 'active', notes: 'Used for Cedar & Co.', amount: 30, recordDate: day('2026-01-01') },
  ], false),
  list('sales', 'tags', 'Sales tags', '销售标签', 'Labels on quotations and customers.', '标在报价和客户上的标签。', ['active'], [
    { name: 'Wholesale', state: 'active', bucket: 'Blue', notes: 'House wholesale accounts.', recordDate: day('2026-01-01') },
    { name: 'Shop', state: 'active', bucket: 'Teal', notes: 'Came from the public shop.', recordDate: day('2026-01-01') },
    { name: 'Sample', state: 'active', bucket: 'Brass', notes: 'A sample, not a repeat order.', recordDate: day('2026-01-01') },
  ], false),

  list('crm', 'activities', 'Activities', '活动', 'Follow-ups sitting on open leads.', '挂在未结线索上的跟进。', ['open', 'done'], [
    { name: 'Call Chen Wei', state: 'open', partner: 'Chen Wei', owner: 'Maya Chen', bucket: 'Call', notes: 'Tote opportunity, still in qualified.', recordDate: day('2026-04-14') },
    { name: 'Send the school lookbook', state: 'open', partner: 'Orchard School', owner: 'Jonah Ellis', bucket: 'Email', notes: 'After the April delivery.', recordDate: day('2026-04-18') },
    { name: 'Lost: winter market', state: 'done', partner: 'Sunday Market', owner: 'Maya Chen', bucket: 'Note', notes: 'Marked lost. No second quote.', recordDate: day('2026-03-12') },
  ]),
  report('crm', 'pipeline-analysis', 'Pipeline analysis', '管道分析', 'Open leads by stage.', '按阶段的未结线索。', [
    { name: 'New', state: 'open', bucket: 'New', amount: 2, recordDate: day('2026-04-16') },
    { name: 'Qualified', state: 'open', bucket: 'Qualified', amount: 2, recordDate: day('2026-04-16') },
    { name: 'Proposition', state: 'open', bucket: 'Proposition', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Won', state: 'done', bucket: 'Won', amount: 2, recordDate: day('2026-04-16') },
  ]),
  report('crm', 'leads-analysis', 'Leads analysis', '线索分析', 'Expected revenue by owner.', '按负责人的预计收入。', [
    { name: 'Maya Chen', state: 'open', bucket: 'Maya Chen', owner: 'Maya Chen', amount: 4200, recordDate: day('2026-04-16') },
    { name: 'Jonah Ellis', state: 'open', bucket: 'Jonah Ellis', owner: 'Jonah Ellis', amount: 2000, recordDate: day('2026-04-16') },
  ]),
  settings('crm', 'CRM settings', '客户关系设置', 'How new leads are assigned.', '新线索如何分配。', [
    { key: 'alias', labelEn: 'Lead email alias', labelZh: '线索邮箱别名', value: 'leads@northline.example' },
    { key: 'assign', labelEn: 'Assign new leads to', labelZh: '新线索分配给', value: 'Direct' },
  ]),
  list('crm', 'teams', 'Sales teams', '销售团队', 'Teams that own leads.', '负责线索的团队。', ['active'], [
    { name: 'Direct', state: 'active', owner: 'Maya Chen', notes: 'Default team on new leads.', recordDate: day('2026-01-01') },
    { name: 'Wholesale', state: 'active', owner: 'Jonah Ellis', notes: 'Schools and house accounts.', recordDate: day('2026-01-01') },
  ], false),
  list('crm', 'tags', 'Lead tags', '线索标签', 'Tags on the pipeline.', '管道上的标签。', ['active'], [
    { name: 'Inbound', state: 'active', bucket: 'Teal', recordDate: day('2026-01-01') },
    { name: 'Referral', state: 'active', bucket: 'Blue', recordDate: day('2026-01-01') },
    { name: 'Cold', state: 'active', bucket: 'Slate', recordDate: day('2026-01-01') },
  ], false),
  list('crm', 'lost-reasons', 'Lost reasons', '丢失原因', 'Why a lead was marked lost.', '线索被标为丢失的原因。', ['active'], [
    { name: 'Price', state: 'active', notes: 'Too expensive against a local maker.', recordDate: day('2026-01-01') },
    { name: 'Timing', state: 'active', notes: 'They will buy next season.', recordDate: day('2026-01-01') },
    { name: 'No reply', state: 'active', notes: 'Three calls, no answer.', recordDate: day('2026-01-01') },
  ], false),

  report('purchase', 'analysis', 'Purchase analysis', '采购分析', 'Bills and open receipts by month.', '按月的账单和未结收货。', [
    { name: 'February cloth', state: 'done', bucket: 'Feb', amount: 240, recordDate: day('2026-02-28') },
    { name: 'March thread', state: 'done', bucket: 'Mar', amount: 90, recordDate: day('2026-03-31') },
    { name: 'April open', state: 'open', bucket: 'Apr', amount: 160, recordDate: day('2026-04-16') },
  ]),
  settings('purchase', 'Purchase settings', '采购设置', 'Defaults for requests.', '询价的默认值。', [
    { key: 'receipt', labelEn: 'Control received bills', labelZh: '按收货控制账单', value: 'yes' },
    { key: 'terms', labelEn: 'Default vendor terms', labelZh: '默认供应商条款', value: '30 days' },
  ]),
  list('purchase', 'vendor-pricelists', 'Vendor pricelists', '供应商价格表', 'What each vendor charges for a product.', '每位供应商对产品的报价。', ['active', 'draft'], [
    { name: 'Mill cloth / Greige canvas', state: 'active', partner: 'West Mill', amount: 9.5, notes: 'Per metre, 30 day terms.', recordDate: day('2026-02-01') },
    { name: 'Thread house / Cotton thread', state: 'active', partner: 'Thread House', amount: 3.2, notes: 'Per cone.', recordDate: day('2026-02-01') },
    { name: 'Spring dye trial', state: 'draft', partner: 'Harbour Dye', amount: 14, notes: 'Not confirmed.', recordDate: day('2026-04-04') },
  ]),

  list('inventory', 'receipts', 'Receipts', '收货', 'Incoming transfers from vendors.', '来自供应商的入库。', ['draft', 'ready', 'done'], [
    { name: 'WH/IN/1101', state: 'done', partner: 'West Mill', owner: 'Main warehouse', amount: 40, notes: 'Greige canvas received.', recordDate: day('2026-03-18') },
    { name: 'WH/IN/1102', state: 'ready', partner: 'Thread House', owner: 'Main warehouse', amount: 12, notes: 'Waiting on the dock.', recordDate: day('2026-04-14') },
    { name: 'WH/IN/1103', state: 'draft', partner: 'Harbour Dye', owner: 'Main warehouse', amount: 6, notes: 'Not sent to the vendor yet.', recordDate: day('2026-04-16') },
  ]),
  list('inventory', 'deliveries', 'Deliveries', '发货', 'Outgoing transfers to customers.', '发给客户的出库。', ['draft', 'ready', 'done'], [
    { name: 'WH/OUT/1108', state: 'done', partner: 'Orchard School', owner: 'Main warehouse', amount: 4, notes: 'Delivered with SO1108.', recordDate: day('2026-04-11') },
    { name: 'WH/OUT/0002', state: 'done', partner: 'Lin Xiao', owner: 'Online', amount: 1, notes: 'Shop order SO0002.', recordDate: day('2026-04-12') },
    { name: 'WH/OUT/1116', state: 'draft', partner: 'Quiet Room', owner: 'Main warehouse', amount: 2, notes: 'Quotation, not reserved.', recordDate: day('2026-04-19') },
  ]),
  list('inventory', 'adjustments', 'Adjustments', '盘点调整', 'Counted quantities that differ from the book.', '实盘与账面的差异。', ['draft', 'done'], [
    { name: 'ADJ/1101 canvas', state: 'done', partner: 'Greige canvas', owner: 'He Gong', amount: -2, notes: 'Two metres short at the April count.', recordDate: day('2026-04-08') },
    { name: 'ADJ/1102 notebooks', state: 'draft', partner: 'Field notebook', owner: 'Lin Xiao', amount: 1, notes: 'One extra on the shop shelf. Not posted.', recordDate: day('2026-04-15') },
  ]),
  list('inventory', 'scrap', 'Scrap', '报废', 'Goods written off the shelf.', '从货架上核销的货。', ['draft', 'done'], [
    { name: 'SP/1101 stained tote', state: 'done', partner: 'Canvas tote', owner: 'He Gong', amount: 1, notes: 'Dye stain. Scrapped from stock.', recordDate: day('2026-03-22') },
    { name: 'SP/1102 short roll', state: 'draft', partner: 'Greige canvas', owner: 'He Gong', amount: 0.4, notes: 'End of roll. Not posted.', recordDate: day('2026-04-09') },
  ]),
  report('inventory', 'valuation', 'Stock valuation', '库存计价', 'On-hand value at cost for the sample goods.', '示例商品按成本计算的在手价值。', [
    { name: 'Field notebook', state: 'done', bucket: 'Notebook', amount: 72, recordDate: day('2026-04-16') },
    { name: 'Canvas tote', state: 'done', bucket: 'Tote', amount: 96, recordDate: day('2026-04-16') },
    { name: 'Greige canvas', state: 'done', bucket: 'Canvas', amount: 140, recordDate: day('2026-04-16') },
  ]),
  list('inventory', 'locations', 'Locations', '库位', 'Shelves inside the warehouses.', '仓库里的货位。', ['active'], [
    { name: 'MAIN/Stock', state: 'active', partner: 'Main warehouse', notes: 'Internal stock shelf.', recordDate: day('2026-01-01') },
    { name: 'MAIN/Input', state: 'active', partner: 'Main warehouse', notes: 'Vendor receipts land here.', recordDate: day('2026-01-01') },
    { name: 'SHOP/Stock', state: 'active', partner: 'Online', notes: 'Shelf that fills the public shop.', recordDate: day('2026-01-01') },
  ], false),
  list('inventory', 'routes', 'Routes', '路线', 'How a product moves. Buy or make.', '产品如何流动：外购或自制。', ['active'], [
    { name: 'Buy', state: 'active', notes: 'Replenish from a vendor.', recordDate: day('2026-01-01') },
    { name: 'Make', state: 'active', notes: 'Replenish with a manufacturing order.', recordDate: day('2026-01-01') },
    { name: 'Deliver online', state: 'active', notes: 'Ship from the online warehouse.', recordDate: day('2026-01-01') },
  ], false),
  settings('inventory', 'Inventory settings', '库存设置', 'Warehouses and the online shelf.', '仓库和网店货架。', [
    { key: 'multi', labelEn: 'Storage locations', labelZh: '使用库位', value: 'yes' },
    { key: 'online', labelEn: 'Online warehouse', labelZh: '网店仓库', value: 'Online' },
  ]),

  list('manufacturing', 'unbuild', 'Unbuild orders', '拆解单', 'Finished goods taken back into components.', '把成品拆回组件。', ['draft', 'done'], [
    { name: 'UB/1101 tote', state: 'draft', partner: 'Canvas tote', owner: 'He Gong', amount: 1, notes: 'One stained tote to unbuild. Not started.', recordDate: day('2026-04-13') },
    { name: 'UB/1001 sample', state: 'done', partner: 'Canvas tote', owner: 'He Gong', amount: 1, notes: 'Sample unbuild in March.', recordDate: day('2026-03-05') },
  ]),
  list('manufacturing', 'planning', 'Planning', '计划', 'What the workshop should cut next.', '车间下一步该裁什么。', ['open', 'done'], [
    { name: 'Week 16 totes', state: 'open', partner: 'Canvas tote', owner: 'He Gong', amount: 20, notes: 'Cover the open shop orders.', recordDate: day('2026-04-16') },
    { name: 'Week 16 notebooks', state: 'open', partner: 'Field notebook', owner: 'He Gong', amount: 30, notes: 'School refill.', recordDate: day('2026-04-16') },
    { name: 'Week 15', state: 'done', partner: 'Canvas tote', owner: 'He Gong', amount: 12, notes: 'Finished.', recordDate: day('2026-04-09') },
  ]),
  report('manufacturing', 'analysis', 'Manufacturing analysis', '制造分析', 'Orders finished by month.', '按月完工的制造单。', [
    { name: 'February', state: 'done', bucket: 'Feb', amount: 8, recordDate: day('2026-02-28') },
    { name: 'March', state: 'done', bucket: 'Mar', amount: 11, recordDate: day('2026-03-31') },
    { name: 'April', state: 'open', bucket: 'Apr', amount: 6, recordDate: day('2026-04-16') },
  ]),
  settings('manufacturing', 'Manufacturing settings', '制造设置', 'How the workshop confirms work.', '车间如何确认工单。', [
    { key: 'lock', labelEn: 'Lock confirmed orders', labelZh: '锁定已确认的工单', value: 'yes' },
    { key: 'center', labelEn: 'Default work center', labelZh: '默认工作中心', value: 'Cutting table' },
  ]),
  list('manufacturing', 'work-centers', 'Work centers', '工作中心', 'Benches on the shop floor.', '车间里的工位。', ['active'], [
    { name: 'Cutting table', state: 'active', owner: 'He Gong', notes: 'Canvas and notebook covers.', recordDate: day('2026-01-01') },
    { name: 'Stitching', state: 'active', owner: 'He Gong', notes: 'Two machines.', recordDate: day('2026-01-01') },
    { name: 'Packing', state: 'active', owner: 'Lin Xiao', notes: 'Shop parcels.', recordDate: day('2026-01-01') },
  ], false),

  settings('pos', 'Point of Sale settings', '收银设置', 'The register and how it closes.', '收银台以及如何日结。', [
    { key: 'shop', labelEn: 'Default shop', labelZh: '默认门店', value: 'Shop' },
    { key: 'cash', labelEn: 'Cash control', labelZh: '现金核对', value: 'yes' },
  ]),
  list('pos', 'payment-methods', 'Payment methods', '付款方式', 'Ways a register can take money. Nothing is sent to a bank.', '收银台收款方式。不会送到银行。', ['active'], [
    { name: 'Cash', state: 'active', notes: 'Counted at close.', recordDate: day('2026-01-01') },
    { name: 'Card', state: 'active', notes: 'Recorded only.', recordDate: day('2026-01-01') },
    { name: 'WeChat Pay', state: 'active', notes: 'Recorded only.', recordDate: day('2026-01-01') },
    { name: 'Alipay', state: 'active', notes: 'Recorded only.', recordDate: day('2026-01-01') },
  ], false),

  settings('website', 'eCommerce settings', '电商设置', 'The public shop.', '公开商店。', [
    { key: 'published', labelEn: 'Shop is published', labelZh: '商店已发布', value: 'yes' },
    { key: 'warehouse', labelEn: 'Ship from', labelZh: '发货仓库', value: 'Online' },
  ]),
  list('website', 'coupons', 'Coupons', '优惠券', 'Codes the shop can accept. Checkout does not apply them yet.', '商店可以收下的优惠码。结账尚未抵扣。', ['active', 'archived'], [
    { name: 'SPRING10', state: 'active', amount: 10, notes: 'Ten off a tote. Not applied at checkout.', recordDate: day('2026-04-01') },
    { name: 'WELCOME', state: 'archived', amount: 5, notes: 'Last year. Closed.', recordDate: day('2026-01-15') },
  ], false),

  list('accounting', 'credit-notes', 'Credit notes', '贷项通知单', 'Customer refunds against an invoice.', '冲减客户发票的贷项。', ['draft', 'posted'], [
    { name: 'RINV1101', state: 'draft', partner: 'Quiet Room', owner: 'Maya Chen', amount: 12, notes: 'One notebook returned. Not posted.', recordDate: day('2026-04-18') },
    { name: 'RINV1001', state: 'posted', partner: 'Sunday Market', owner: 'Maya Chen', amount: 24, notes: 'Posted in March.', recordDate: day('2026-03-19') },
  ]),
  list('accounting', 'customer-payments', 'Customer payments', '客户收款', 'Money received against customer invoices.', '收到的客户货款。', ['posted', 'draft'], [
    { name: 'PAY/1101', state: 'posted', partner: 'Cedar & Co', owner: 'Bank', amount: 113, notes: 'Clears INV1101.', recordDate: day('2026-04-08') },
    { name: 'PAY/1102', state: 'draft', partner: 'Field Office', owner: 'Bank', amount: 62.15, notes: 'Not matched yet.', recordDate: day('2026-04-16') },
  ]),
  list('accounting', 'vendor-refunds', 'Vendor refunds', '供应商退款', 'Credit from a vendor.', '供应商给的贷项。', ['draft', 'posted'], [
    { name: 'RBILL1101', state: 'draft', partner: 'Thread House', owner: 'Maya Chen', amount: 6.4, notes: 'Two cones returned.', recordDate: day('2026-04-12') },
  ]),
  list('accounting', 'vendor-payments', 'Vendor payments', '供应商付款', 'Money sent to vendors.', '付给供应商的钱。', ['posted', 'draft'], [
    { name: 'BILLPAY/1101', state: 'posted', partner: 'West Mill', owner: 'Bank', amount: 90.4, notes: 'Part of the cloth bill.', recordDate: day('2026-04-06') },
    { name: 'BILLPAY/1102', state: 'draft', partner: 'Thread House', owner: 'Bank', amount: 32, notes: 'Waiting on approval.', recordDate: day('2026-04-16') },
  ]),
  report('accounting', 'reconcile', 'Bank reconciliation', '银行对账', 'Statement lines against the bank journal. Nothing is fetched from a bank.', '银行日记账的对账单行。没有连接银行。', [
    { name: 'Stmt 14 Apr deposit', state: 'posted', partner: 'Cedar & Co', bucket: 'Matched', amount: 113, recordDate: day('2026-04-14') },
    { name: 'Stmt 15 Apr card', state: 'open', partner: 'Shop', bucket: 'Open', amount: 48, recordDate: day('2026-04-15') },
    { name: 'Stmt 16 Apr fee', state: 'open', partner: 'Bank', bucket: 'Open', amount: 2.5, recordDate: day('2026-04-16') },
  ]),
  report('accounting', 'aged-receivable', 'Aged receivable', '应收账龄', 'What customers still owe, by age.', '客户仍欠的钱，按账龄。', [
    { name: 'Not due', state: 'open', bucket: 'Not due', amount: 120, recordDate: day('2026-04-16') },
    { name: '1–30 days', state: 'open', bucket: '1–30', amount: 86.68, recordDate: day('2026-04-16') },
    { name: '31–60 days', state: 'open', bucket: '31–60', amount: 60, recordDate: day('2026-04-16') },
    { name: 'Older', state: 'open', bucket: 'Older', amount: 0, recordDate: day('2026-04-16') },
  ]),
  report('accounting', 'aged-payable', 'Aged payable', '应付账龄', 'What the company still owes vendors, by age.', '公司仍欠供应商的钱，按账龄。', [
    { name: 'Not due', state: 'open', bucket: 'Not due', amount: 40, recordDate: day('2026-04-16') },
    { name: '1–30 days', state: 'open', bucket: '1–30', amount: 50.4, recordDate: day('2026-04-16') },
    { name: '31–60 days', state: 'open', bucket: '31–60', amount: 0, recordDate: day('2026-04-16') },
  ]),
  {
    module: 'accounting',
    screen: 'accounts',
    kind: 'accounts',
    kanban: false,
    states: [],
    titleEn: 'Chart of accounts',
    titleZh: '会计科目表',
    leadEn: 'The accounts this company posts to.',
    leadZh: '这家公司过账使用的科目。',
    rows: [],
    settings: [],
  },
  settings('accounting', 'Accounting settings', '会计设置', 'Journals and the tax report.', '日记账和税务报表。', [
    { key: 'receivable', labelEn: 'Receivable account', labelZh: '应收账款科目', value: '1122' },
    { key: 'payable', labelEn: 'Payable account', labelZh: '应付账款科目', value: '2202' },
    { key: 'tax', labelEn: 'Tax return status', labelZh: '纳税申报状态', value: 'Not submitted' },
  ]),
  list('accounting', 'journals', 'Journals', '日记账', 'The books the company posts into.', '公司过账使用的日记账。', ['active'], [
    { name: 'SAL Sales', state: 'active', notes: 'Customer invoices.', recordDate: day('2026-01-01') },
    { name: 'PUR Purchases', state: 'active', notes: 'Vendor bills.', recordDate: day('2026-01-01') },
    { name: 'BNK Bank', state: 'active', notes: 'Payments.', recordDate: day('2026-01-01') },
    { name: 'GEN General', state: 'active', notes: 'Manual entries.', recordDate: day('2026-01-01') },
  ], false),

  settings('contacts', 'Contact settings', '联系人设置', 'How contacts are kept.', '如何保存联系人。', [
    { key: 'unique', labelEn: 'Warn on duplicate email', labelZh: '邮箱重复时提醒', value: 'yes' },
  ]),
  list('contacts', 'tags', 'Contact tags', '联系人标签', 'Labels on customers and vendors.', '客户和供应商上的标签。', ['active'], [
    { name: 'Customer', state: 'active', bucket: 'Teal', recordDate: day('2026-01-01') },
    { name: 'Vendor', state: 'active', bucket: 'Purple', recordDate: day('2026-01-01') },
    { name: 'Employee', state: 'active', bucket: 'Indigo', recordDate: day('2026-01-01') },
  ], false),
  list('contacts', 'industries', 'Industries', '行业', 'What a company contact does.', '公司联系人的行业。', ['active'], [
    { name: 'Retail', state: 'active', notes: 'Shops and markets.', recordDate: day('2026-01-01') },
    { name: 'Education', state: 'active', notes: 'Schools.', recordDate: day('2026-01-01') },
    { name: 'Textile', state: 'active', notes: 'Mills and dyers.', recordDate: day('2026-01-01') },
  ], false),

  list('hr', 'attendance', 'Attendance', '考勤', 'Daily marks. The employee form still records the live mark.', '每日考勤。员工表单仍记录当天的打卡。', ['present', 'late', 'absent'], [
    { name: 'Zhou Ning · 14 Apr', state: 'present', partner: 'Zhou Ning', owner: 'Sales', recordDate: day('2026-04-14') },
    { name: 'He Gong · 14 Apr', state: 'present', partner: 'He Gong', owner: 'Workshop', recordDate: day('2026-04-14') },
    { name: 'Lin Xiao · 15 Apr', state: 'late', partner: 'Lin Xiao', owner: 'Shop', notes: 'Opened the shop twenty minutes late.', recordDate: day('2026-04-15') },
  ], false),
  list('hr', 'leave', 'Time off', '请假', 'Leave that is waiting or already decided.', '待审批或已决定的请假。', ['waiting', 'approved', 'refused'], [
    { name: 'Zhou Ning sick day', state: 'waiting', partner: 'Zhou Ning', owner: 'Sales', notes: 'One day. Still waiting.', recordDate: day('2026-04-20') },
    { name: 'He Gong annual', state: 'approved', partner: 'He Gong', owner: 'Workshop', notes: '1–3 May.', recordDate: day('2026-04-01') },
    { name: 'Lin Xiao personal', state: 'refused', partner: 'Lin Xiao', owner: 'Shop', notes: 'Shop needed cover.', recordDate: day('2026-03-28') },
  ]),
  report('hr', 'analysis', 'Employee analysis', '员工分析', 'Headcount by department.', '按部门的人数。', [
    { name: 'Sales', state: 'active', bucket: 'Sales', amount: 4, recordDate: day('2026-04-16') },
    { name: 'Workshop', state: 'active', bucket: 'Workshop', amount: 3, recordDate: day('2026-04-16') },
    { name: 'Shop', state: 'active', bucket: 'Shop', amount: 3, recordDate: day('2026-04-16') },
  ]),
  settings('hr', 'Employee settings', '员工设置', 'The working week.', '工作周。', [
    { key: 'week', labelEn: 'Working days', labelZh: '工作日', value: 'Mon–Fri' },
    { key: 'leave', labelEn: 'New leave starts as', labelZh: '新请假的初始状态', value: 'waiting' },
  ]),

  list('payroll', 'batches', 'Pay batches', '工资批次', 'A month of payslips, beside the live payroll runs.', '一个月的工资单，与正式工资运行并列。', ['draft', 'posted', 'paid'], [
    { name: 'February 2026', state: 'paid', owner: 'Maya Chen', amount: 48000, notes: 'Posted and paid.', recordDate: day('2026-02-28') },
    { name: 'March 2026', state: 'posted', owner: 'Maya Chen', amount: 48000, notes: 'Posted. Payment recorded on the run.', recordDate: day('2026-03-31') },
    { name: 'May 2026 draft', state: 'draft', owner: 'Maya Chen', amount: 0, notes: 'Not created as a run yet.', recordDate: day('2026-05-01') },
  ]),
  report('payroll', 'analysis', 'Payroll analysis', '工资分析', 'Gross pay by month. Deductions are the demo approximation.', '按月的应发工资。扣除额是示例近似值。', [
    { name: 'February', state: 'paid', bucket: 'Feb', amount: 48000, recordDate: day('2026-02-28') },
    { name: 'March', state: 'posted', bucket: 'Mar', amount: 48000, recordDate: day('2026-03-31') },
    { name: 'April', state: 'posted', bucket: 'Apr', amount: 48000, recordDate: day('2026-04-30') },
  ]),
  settings('payroll', 'Payroll settings', '工资设置', 'How a run is posted. An admin posts and pays.', '工资运行如何过账。管理员过账并发放。', [
    { key: 'journal', labelEn: 'Payroll journal', labelZh: '工资日记账', value: 'GEN' },
    { key: 'country', labelEn: 'Deduction rules', labelZh: '扣除规则', value: 'Company country' },
  ]),
  list('payroll', 'structures', 'Salary structures', '薪资结构', 'The structure used to build a payslip.', '用来生成工资单的结构。', ['active'], [
    { name: 'China monthly', state: 'active', notes: 'Social insurance, housing fund, and a sample income tax.', recordDate: day('2026-01-01') },
    { name: 'UK monthly', state: 'active', notes: 'Flat PAYE and National Insurance estimate.', recordDate: day('2026-01-01') },
    { name: 'US monthly', state: 'active', notes: 'Flat federal, FICA, and New York.', recordDate: day('2026-01-01') },
  ], false),
  list('payroll', 'rules', 'Salary rules', '薪资规则', 'Lines that make up a payslip.', '组成工资单的项目。', ['active'], [
    { name: 'BASIC', state: 'active', bucket: 'Earning', notes: 'Monthly gross.', recordDate: day('2026-01-01') },
    { name: 'TAX', state: 'active', bucket: 'Deduction', notes: 'Sample income tax.', recordDate: day('2026-01-01') },
    { name: 'NET', state: 'active', bucket: 'Net', notes: 'Take-home.', recordDate: day('2026-01-01') },
  ], false),

  list('expenses', 'reports', 'Expense reports', '费用报告', 'Claims grouped for approval. An admin approves and reimburses.', '待审批的报销汇总。管理员审批并付款。', ['submitted', 'approved', 'reimbursed', 'refused'], [
    { name: 'EX1102 City travel', state: 'approved', partner: 'Jonah Ellis', owner: 'Maya Chen', amount: 46, notes: 'Approved. Not reimbursed yet.', recordDate: day('2026-04-09') },
    { name: 'EX1101 Client lunch', state: 'reimbursed', partner: 'Maya Chen', owner: 'Maya Chen', amount: 28, notes: 'Paid back.', recordDate: day('2026-04-03') },
    { name: 'EX1103 Late taxi', state: 'refused', partner: 'Lin Xiao', owner: 'Maya Chen', amount: 18, notes: 'Refused. Not a company trip.', recordDate: day('2026-04-11') },
  ]),
  report('expenses', 'analysis', 'Expense analysis', '费用分析', 'Claims by state.', '按状态的报销。', [
    { name: 'Submitted', state: 'submitted', bucket: 'Submitted', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Approved', state: 'approved', bucket: 'Approved', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Reimbursed', state: 'reimbursed', bucket: 'Reimbursed', amount: 2, recordDate: day('2026-04-16') },
    { name: 'Refused', state: 'refused', bucket: 'Refused', amount: 1, recordDate: day('2026-04-16') },
  ]),
  settings('expenses', 'Expense settings', '费用设置', 'Who can approve a claim.', '谁可以审批报销。', [
    { key: 'approver', labelEn: 'Approver', labelZh: '审批人', value: 'Admin' },
    { key: 'journal', labelEn: 'Expense journal', labelZh: '费用日记账', value: 'GEN' },
  ]),
  list('expenses', 'categories', 'Expense categories', '费用类别', 'What a claim is for.', '报销的用途。', ['active'], [
    { name: 'Travel', state: 'active', recordDate: day('2026-01-01') },
    { name: 'Meals', state: 'active', recordDate: day('2026-01-01') },
    { name: 'Supplies', state: 'active', recordDate: day('2026-01-01') },
  ], false),

  list('assets', 'register', 'Asset register', '资产登记', 'Equipment the company owns and still depreciates.', '公司拥有并仍在折旧的设备。', ['running', 'progress', 'disposed'], [
    { name: 'Loom 02', state: 'running', partner: 'Jiangbei Goods Co.', owner: 'He Gong', bucket: 'Machinery', amount: 18600, notes: 'Rapier loom. Straight-line, 8 years.', recordDate: day('2024-03-01') },
    { name: 'Delivery van', state: 'running', partner: 'Jiangbei Goods Co.', owner: 'Lin Xiao', bucket: 'Vehicles', amount: 4200, notes: 'Shop deliveries inside the city.', recordDate: day('2023-11-12') },
    { name: 'Cutting table', state: 'progress', partner: 'Harbour & Line', owner: 'Amira Shah', bucket: 'Machinery', amount: 980, notes: 'Out for a blade change.', recordDate: day('2025-06-02') },
    { name: 'Office laptops', state: 'disposed', owner: 'Maya Chen', bucket: 'IT', amount: 0, notes: 'Sold as a lot in March.', recordDate: day('2022-01-15') },
  ]),
  list('assets', 'depreciation', 'Depreciation', '折旧', 'Posted depreciation runs. Figures are samples.', '已过账的折旧。数字是示例。', ['draft', 'posted'], [
    { name: 'DEP/2026/04', state: 'posted', bucket: 'April', amount: 246.5, notes: 'Loom 02 and the van.', recordDate: day('2026-04-30') },
    { name: 'DEP/2026/03', state: 'posted', bucket: 'March', amount: 246.5, notes: 'Same assets as April.', recordDate: day('2026-03-31') },
    { name: 'DEP/2026/05', state: 'draft', bucket: 'May', amount: 210, notes: 'Cutting table paused while it is in maintenance.', recordDate: day('2026-05-31') },
  ], false),
  list('assets', 'maintenance', 'Maintenance', '维护', 'Work orders on assets.', '资产上的维修单。', ['scheduled', 'progress', 'done'], [
    { name: 'Loom belt', state: 'scheduled', partner: 'Loom 02', owner: 'He Gong', amount: 40, notes: 'Replace the drive belt before the next cutting order.', recordDate: day('2026-04-22') },
    { name: 'Van service', state: 'done', partner: 'Delivery van', owner: 'Lin Xiao', amount: 85, notes: 'Oil and brakes.', recordDate: day('2026-04-04') },
    { name: 'Blade change', state: 'progress', partner: 'Cutting table', owner: 'Amira Shah', amount: 30, notes: 'Waiting on the blade.', recordDate: day('2026-04-16') },
  ]),
  report('assets', 'analysis', 'Asset analysis', '资产分析', 'Gross value still on the register, by group.', '登记册上仍在的原值，按分组。', [
    { name: 'Machinery', state: 'running', bucket: 'Machinery', amount: 19580, recordDate: day('2026-04-16') },
    { name: 'Vehicles', state: 'running', bucket: 'Vehicles', amount: 4200, recordDate: day('2026-04-16') },
    { name: 'IT', state: 'disposed', bucket: 'IT', amount: 0, recordDate: day('2026-04-16') },
  ]),
  settings('assets', 'Asset settings', '资产设置', 'How depreciation is posted.', '折旧如何过账。', [
    { key: 'method', labelEn: 'Depreciation method', labelZh: '折旧方法', value: 'Straight line' },
    { key: 'journal', labelEn: 'Asset journal', labelZh: '资产日记账', value: 'GEN' },
  ]),
  list('assets', 'categories', 'Asset categories', '资产类别', 'Groups on the register.', '登记册上的分组。', ['active'], [
    { name: 'Machinery', state: 'active', notes: '8 year life.', recordDate: day('2026-01-01') },
    { name: 'Vehicles', state: 'active', notes: '5 year life.', recordDate: day('2026-01-01') },
    { name: 'IT', state: 'active', notes: '3 year life.', recordDate: day('2026-01-01') },
  ], false),

  list('projects', 'projects', 'Projects', '项目', 'Jobs the company is running for itself or a customer.', '公司为自己或客户进行的工作。', ['planned', 'progress', 'done'], [
    { name: 'Spring tote run', state: 'progress', partner: 'Orchard School', owner: 'Maya Chen', amount: 2400, notes: 'Cut, sew, and deliver 200 totes.', recordDate: day('2026-04-02') },
    { name: 'Shop refit', state: 'planned', partner: 'Jiangbei Goods Co.', owner: 'Lin Xiao', amount: 800, notes: 'New shelves before May.', recordDate: day('2026-04-18') },
    { name: 'Harbour wholesale kit', state: 'done', partner: 'Harbour & Line', owner: 'Amira Shah', amount: 1600, notes: 'Delivered in March.', recordDate: day('2026-03-12') },
  ]),
  list('projects', 'tasks', 'Tasks', '任务', 'The work inside a project.', '项目里的工作。', ['planned', 'progress', 'done'], [
    { name: 'Cut canvas', state: 'progress', partner: 'Spring tote run', owner: 'He Gong', bucket: 'Shop floor', notes: '120 of 200 cut.', recordDate: day('2026-04-14') },
    { name: 'Confirm dye lot', state: 'planned', partner: 'Spring tote run', owner: 'Jonah Ellis', bucket: 'Buying', notes: 'Waiting on Harbour Dye.', recordDate: day('2026-04-16') },
    { name: 'Photograph samples', state: 'done', partner: 'Harbour wholesale kit', owner: 'Priya Nair', bucket: 'Shop', notes: 'Used on the storefront.', recordDate: day('2026-03-08') },
  ]),
  list('projects', 'timesheets', 'Timesheets', '工时表', 'Hours recorded against a project.', '记在项目上的工时。', ['draft', 'posted'], [
    { name: 'He Gong week 16', state: 'posted', partner: 'Spring tote run', owner: 'He Gong', amount: 32, notes: 'Hours, not money.', recordDate: day('2026-04-17') },
    { name: 'Jonah Ellis week 16', state: 'draft', partner: 'Spring tote run', owner: 'Jonah Ellis', amount: 6, notes: 'Buyer calls.', recordDate: day('2026-04-17') },
  ], false),
  list('projects', 'billing', 'To bill', '待开票', 'Project work that can become a customer invoice.', '可以开给客户的项目工作。', ['to_bill', 'billed'], [
    { name: 'Spring tote milestone', state: 'to_bill', partner: 'Orchard School', owner: 'Maya Chen', amount: 1200, notes: 'Half the run is cut.', recordDate: day('2026-04-16') },
    { name: 'Harbour kit', state: 'billed', partner: 'Harbour & Line', owner: 'Amira Shah', amount: 1600, notes: 'Invoiced in March.', recordDate: day('2026-03-20') },
  ], false),
  report('projects', 'analysis', 'Project analysis', '项目分析', 'Open project value by status.', '按状态的未完项目金额。', [
    { name: 'In progress', state: 'progress', bucket: 'In progress', amount: 2400, recordDate: day('2026-04-16') },
    { name: 'Planned', state: 'planned', bucket: 'Planned', amount: 800, recordDate: day('2026-04-16') },
    { name: 'Done', state: 'done', bucket: 'Done', amount: 1600, recordDate: day('2026-04-16') },
  ]),
  settings('projects', 'Project settings', '项目设置', 'How time and billing are recorded.', '如何记录工时和开票。', [
    { key: 'billing', labelEn: 'Bill from', labelZh: '开票依据', value: 'Milestones' },
    { key: 'hours', labelEn: 'Timesheet unit', labelZh: '工时单位', value: 'Hours' },
  ]),

  list('quality', 'inspections', 'Inspections', '检验', 'Checks on a lot before it is sold or received.', '销售或收货前对批次的检查。', ['draft', 'pass', 'fail'], [
    { name: 'QC1108 canvas lot', state: 'pass', partner: 'Harbour Dye', owner: 'He Gong', bucket: 'Incoming', notes: 'Shade matches the standard.', recordDate: day('2026-04-11') },
    { name: 'QC1112 tote stitch', state: 'fail', partner: 'Spring tote run', owner: 'He Gong', bucket: 'In process', notes: 'Loose stitch on 6 pieces.', recordDate: day('2026-04-15') },
    { name: 'QC1116 shop count', state: 'draft', partner: 'Shop', owner: 'Lin Xiao', bucket: 'Final', notes: 'Not started.', recordDate: day('2026-04-16') },
  ]),
  list('quality', 'nonconformance', 'Non-conformance', '不合格', 'Something that failed a check.', '未通过检查的事项。', ['open', 'progress', 'done'], [
    { name: 'NCR-014 loose stitch', state: 'open', partner: 'Spring tote run', owner: 'Maya Chen', amount: 6, notes: 'Six totes pulled from the lot.', recordDate: day('2026-04-15') },
    { name: 'NCR-011 shade drift', state: 'done', partner: 'Harbour Dye', owner: 'Jonah Ellis', amount: 1, notes: 'Vendor replaced the roll.', recordDate: day('2026-03-28') },
  ]),
  list('quality', 'procedures', 'Procedures', '规程', 'The written checks.', '书面检验规程。', ['active', 'draft'], [
    { name: 'Incoming fabric', state: 'active', notes: 'Shade, width, and faults per roll.', recordDate: day('2026-01-01') },
    { name: 'Finished tote', state: 'active', notes: 'Stitch, handles, and count.', recordDate: day('2026-01-01') },
    { name: 'Shop display', state: 'draft', notes: 'Not published yet.', recordDate: day('2026-04-01') },
  ], false),
  report('quality', 'analysis', 'Quality analysis', '质量分析', 'Inspections by result.', '按结果的检验。', [
    { name: 'Pass', state: 'pass', bucket: 'Pass', amount: 8, recordDate: day('2026-04-16') },
    { name: 'Fail', state: 'fail', bucket: 'Fail', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Draft', state: 'draft', bucket: 'Draft', amount: 2, recordDate: day('2026-04-16') },
  ]),
  settings('quality', 'Quality settings', '质量设置', 'When a failed check blocks stock.', '不合格时是否冻结库存。', [
    { key: 'block', labelEn: 'Block failed lots', labelZh: '冻结不合格批次', value: 'yes' },
    { key: 'team', labelEn: 'Default team', labelZh: '默认团队', value: 'Shop floor' },
  ]),

  list('subcontracting', 'orders', 'Subcontracting orders', '委外订单', 'Work sent to another workshop.', '发给其他车间的加工。', ['draft', 'confirmed', 'received'], [
    { name: 'SC1102 dye lot', state: 'confirmed', partner: 'Harbour Dye', owner: 'Jonah Ellis', amount: 640, notes: '40 rolls. Not back yet.', recordDate: day('2026-04-09') },
    { name: 'SC1104 embroidery', state: 'draft', partner: 'West Stitch', owner: 'Maya Chen', amount: 180, notes: 'Quote for the school logo.', recordDate: day('2026-04-16') },
    { name: 'SC1098 hemming', state: 'received', partner: 'West Stitch', owner: 'He Gong', amount: 220, notes: 'Received in full.', recordDate: day('2026-03-30') },
  ]),
  list('subcontracting', 'receipts', 'Subcontract receipts', '委外收货', 'Goods coming back from a subcontractor.', '从委外方收回的货物。', ['ready', 'done'], [
    { name: 'WH/SUB/1102', state: 'ready', partner: 'Harbour Dye', owner: 'He Gong', amount: 40, notes: 'Expected this week. Rolls, not money.', recordDate: day('2026-04-18') },
    { name: 'WH/SUB/1098', state: 'done', partner: 'West Stitch', owner: 'He Gong', amount: 80, notes: 'Hemmed totes put away.', recordDate: day('2026-03-30') },
  ]),
  report('subcontracting', 'analysis', 'Subcontracting analysis', '委外分析', 'Open and received subcontract value.', '未完成和已收回的委外金额。', [
    { name: 'Confirmed', state: 'confirmed', bucket: 'Confirmed', amount: 640, recordDate: day('2026-04-16') },
    { name: 'Draft', state: 'draft', bucket: 'Draft', amount: 180, recordDate: day('2026-04-16') },
    { name: 'Received', state: 'received', bucket: 'Received', amount: 220, recordDate: day('2026-04-16') },
  ]),
  settings('subcontracting', 'Subcontracting settings', '委外设置', 'Where finished goods land.', '完工品进入哪个库位。', [
    { key: 'location', labelEn: 'Receipt location', labelZh: '收货库位', value: 'Stock' },
    { key: 'resupply', labelEn: 'Send components', labelZh: '发出组件', value: 'yes' },
  ]),

  list('helpdesk', 'tickets', 'Tickets', '工单', 'Questions and problems from customers.', '客户的问题和请求。', ['open', 'progress', 'done', 'cancel'], [
    { name: 'T1108 late delivery', state: 'progress', partner: 'Orchard School', owner: 'Maya Chen', bucket: 'Delivery', notes: 'Tote run is a week behind.', recordDate: day('2026-04-14') },
    { name: 'T1110 shade question', state: 'open', partner: 'Paper & Pine', owner: 'Jonah Ellis', bucket: 'Product', notes: 'Photo looks darker than the sample.', recordDate: day('2026-04-16') },
    { name: 'T1102 invoice copy', state: 'done', partner: 'Field Office', owner: 'Maya Chen', bucket: 'Billing', notes: 'Copy sent.', recordDate: day('2026-04-08') },
    { name: 'T1099 spam', state: 'cancel', partner: 'Unknown', owner: 'Lin Xiao', bucket: 'Other', notes: 'Not a customer.', recordDate: day('2026-04-01') },
  ]),
  list('helpdesk', 'sla', 'SLA', '服务级别', 'Whether a ticket met its time.', '工单是否按时处理。', ['met', 'breached'], [
    { name: 'Delivery — 2 days', state: 'breached', partner: 'T1108 late delivery', owner: 'Maya Chen', amount: 2, notes: 'Still open after two days.', recordDate: day('2026-04-16') },
    { name: 'Billing — 1 day', state: 'met', partner: 'T1102 invoice copy', owner: 'Maya Chen', amount: 1, notes: 'Answered the same day.', recordDate: day('2026-04-08') },
    { name: 'Product — 1 day', state: 'met', partner: 'T1110 shade question', owner: 'Jonah Ellis', notes: 'Clock still running.', recordDate: day('2026-04-16') },
  ], false),
  report('helpdesk', 'analysis', 'Ticket analysis', '工单分析', 'Open tickets by topic.', '按主题的未关闭工单。', [
    { name: 'Delivery', state: 'open', bucket: 'Delivery', amount: 3, recordDate: day('2026-04-16') },
    { name: 'Product', state: 'open', bucket: 'Product', amount: 2, recordDate: day('2026-04-16') },
    { name: 'Billing', state: 'done', bucket: 'Billing', amount: 1, recordDate: day('2026-04-16') },
  ]),
  settings('helpdesk', 'Helpdesk settings', '服务台设置', 'Who sees a new ticket.', '新工单先到谁。', [
    { key: 'team', labelEn: 'Default team', labelZh: '默认团队', value: 'Desk' },
    { key: 'hours', labelEn: 'Working hours', labelZh: '工作时间', value: '09:00–18:00' },
  ]),
  list('helpdesk', 'teams', 'Helpdesk teams', '服务团队', 'Who answers.', '谁来回复。', ['active'], [
    { name: 'Desk', state: 'active', owner: 'Maya Chen', notes: 'Orders and billing.', recordDate: day('2026-01-01') },
    { name: 'Shop', state: 'active', owner: 'Lin Xiao', notes: 'The counter.', recordDate: day('2026-01-01') },
  ], false),
  list('helpdesk', 'tags', 'Ticket tags', '工单标签', 'Topics on a ticket.', '工单上的主题。', ['active'], [
    { name: 'Delivery', state: 'active', recordDate: day('2026-01-01') },
    { name: 'Product', state: 'active', recordDate: day('2026-01-01') },
    { name: 'Billing', state: 'active', recordDate: day('2026-01-01') },
  ], false),

  inCountries(list('compliance', 'fapiao', 'Fapiao', '发票', 'Sample fapiao for this company. Nothing is sent to the tax authority.', '这家公司的发票示例。不会提交给税务机关。', ['issued', 'waiting', 'void'], [
    { name: 'FP20260411001', state: 'issued', partner: 'Orchard School', owner: 'Maya Chen', amount: 84.75, notes: 'Electronic, general. Buyer tax id on the order.', recordDate: day('2026-04-11') },
    { name: 'FP20260416002', state: 'waiting', partner: 'Paper & Pine', owner: 'Jonah Ellis', amount: 27.12, notes: 'Draft. Not issued.', recordDate: day('2026-04-16') },
    { name: 'FP20260302008', state: 'void', partner: 'Field Office', owner: 'Maya Chen', amount: 62.15, notes: 'Voided. A replacement was issued.', recordDate: day('2026-03-02') },
  ]), ['CN']),
  inCountries(report('compliance', 'fapiao-report', 'Fapiao report', '发票报表', 'Issued fapiao by month. A sample, not a filing.', '按月的已开发票。示例，不是申报。', [
    { name: 'April', state: 'issued', bucket: 'April', amount: 111.87, recordDate: day('2026-04-16') },
    { name: 'March', state: 'issued', bucket: 'March', amount: 240, recordDate: day('2026-03-31') },
    { name: 'February', state: 'issued', bucket: 'February', amount: 180, recordDate: day('2026-02-28') },
  ]), ['CN']),
  inCountries(list('compliance', 'mtd', 'MTD VAT return', 'MTD 增值税申报', 'Making Tax Digital periods. Nothing is sent to HMRC.', 'Making Tax Digital 的申报期。不会提交给 HMRC。', ['open', 'submitted'], [
    { name: 'Q1 2026', state: 'open', partner: 'HMRC', owner: 'Amira Shah', amount: 420, notes: 'Boxes are a sample. Not submitted.', recordDate: day('2026-03-31') },
    { name: 'Q4 2025', state: 'submitted', partner: 'HMRC', owner: 'Amira Shah', amount: 380, notes: 'Marked submitted in this sample only.', recordDate: day('2025-12-31') },
  ], false), ['GB']),
  inCountries(report('compliance', 'mtd-report', 'VAT report', '增值税报表', 'Output and input tax for the open period.', '当前申报期的销项和进项税。', [
    { name: 'Output tax', state: 'open', bucket: 'Output', amount: 640, recordDate: day('2026-03-31') },
    { name: 'Input tax', state: 'open', bucket: 'Input', amount: 220, recordDate: day('2026-03-31') },
    { name: 'Payable', state: 'open', bucket: 'Payable', amount: 420, recordDate: day('2026-03-31') },
  ]), ['GB']),
  inCountries(report('compliance', 'sales-tax', 'Sales tax report', '销售税报表', 'Sample sales tax by state. Nothing is filed.', '按州的销售税示例。不会申报。', [
    { name: 'New York', state: 'open', bucket: 'New York', amount: 186.4, recordDate: day('2026-04-16') },
    { name: 'New Jersey', state: 'open', bucket: 'New Jersey', amount: 42, recordDate: day('2026-04-16') },
    { name: 'Other', state: 'open', bucket: 'Other', amount: 0, recordDate: day('2026-04-16') },
  ]), ['US']),
  inCountries(list('compliance', 'jurisdictions', 'Tax jurisdictions', '税区', 'Where this company collects sales tax.', '这家公司代收销售税的地方。', ['active'], [
    { name: 'New York', state: 'active', amount: 8.875, notes: 'State and city sample rate.', recordDate: day('2026-01-01') },
    { name: 'New Jersey', state: 'active', amount: 6.625, notes: 'State rate sample.', recordDate: day('2026-01-01') },
  ], false), ['US']),
  inCountries(list('compliance', 'fbr', 'FBR e-invoicing', 'FBR 电子发票', 'Sample invoices for the Federal Board of Revenue. Nothing is transmitted.', '联邦税务局的发票示例。不会发送。', ['waiting', 'validated', 'rejected'], [
    { name: 'INV-FBR-1042', state: 'validated', partner: 'Lahore Cloth House', owner: 'Sana Iqbal', amount: 18500, notes: 'Sample IRN stored on the row. Not sent to FBR.', recordDate: day('2026-04-12') },
    { name: 'INV-FBR-1048', state: 'waiting', partner: 'Karachi Uniforms', owner: 'Sana Iqbal', amount: 9200, notes: 'Queued in this sample.', recordDate: day('2026-04-16') },
    { name: 'INV-FBR-1033', state: 'rejected', partner: 'Multan Dye', owner: 'Sana Iqbal', amount: 4100, notes: 'Sample rejection: buyer NTN missing.', recordDate: day('2026-04-02') },
  ]), ['PK']),
  inCountries(report('compliance', 'sales-tax-pk', 'Sales tax return', '销售税申报', 'Output and input sales tax. A sample return, not a filing.', '销项和进项销售税。示例申报，不是正式申报。', [
    { name: 'Output tax', state: 'open', bucket: 'Output', amount: 4986, recordDate: day('2026-04-16') },
    { name: 'Input tax', state: 'open', bucket: 'Input', amount: 1260, recordDate: day('2026-04-16') },
    { name: 'Payable', state: 'open', bucket: 'Payable', amount: 3726, recordDate: day('2026-04-16') },
  ]), ['PK']),
  inCountries(list('compliance', 'withholding', 'Withholding tax', '预扣税', 'Sample withholding on payments to vendors.', '付给供应商时的预扣税示例。', ['draft', 'posted'], [
    { name: 'WHT 153(1)(a) goods', state: 'posted', partner: 'Multan Dye', owner: 'Sana Iqbal', amount: 410, notes: 'Section 153 on a goods payment. Sample rate.', recordDate: day('2026-04-08') },
    { name: 'WHT 153(1)(b) services', state: 'draft', partner: 'Karachi Stitch', owner: 'Sana Iqbal', amount: 220, notes: 'Not posted.', recordDate: day('2026-04-16') },
  ], false), ['PK']),
  inCountries(report('compliance', 'summary', 'Tax summary', '税务摘要', 'A short tax read for a company outside the prepared countries.', '未单独配置国家时的税务简表。', [
    { name: 'Output tax', state: 'open', bucket: 'Output', amount: 0, recordDate: day('2026-04-16') },
    { name: 'Input tax', state: 'open', bucket: 'Input', amount: 0, recordDate: day('2026-04-16') },
  ]), ['OTHER']),
  settings('compliance', 'Compliance settings', '合规设置', 'The registration this company would file under. Nothing is submitted.', '这家公司申报时使用的登记号。不会提交。', [
    { key: 'authority', labelEn: 'Filing authority', labelZh: '申报机关', value: 'Local tax office', byCountry: { CN: 'STA', GB: 'HMRC', US: 'State department of revenue', PK: 'FBR', OTHER: 'Local tax office' } },
    { key: 'registration', labelEn: 'Registration number', labelZh: '登记号', value: '—', byCountry: { CN: '91310000SAMPLE', GB: 'GB123456789', US: 'NY-45821', PK: '1234567-8', OTHER: '—' } },
    { key: 'status', labelEn: 'Filing status', labelZh: '申报状态', value: 'Not submitted' },
  ]),
]

export function findDeskScreen(module: string, screen: string) {
  return deskScreens.find((row) => row.module === module && row.screen === screen) ?? null
}

export function settingsScreen(module: string) {
  return deskScreens.find((row) => row.module === module && row.kind === 'settings') ?? null
}
