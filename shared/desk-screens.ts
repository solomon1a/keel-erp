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
]

export function findDeskScreen(module: string, screen: string) {
  return deskScreens.find((row) => row.module === module && row.screen === screen) ?? null
}

export function settingsScreen(module: string) {
  return deskScreens.find((row) => row.module === module && row.kind === 'settings') ?? null
}
