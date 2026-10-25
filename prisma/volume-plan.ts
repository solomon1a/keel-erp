import { roundMoney } from '../src/domain/money.ts'

/**
 * Jiangbei volume for the last twelve months.
 * Amounts are fixed. Dates are applied at seed time from the clock, so a demo
 * reset stays current without changing the books.
 */

const TAX = 0.13
const SALE_BASE = 82_000
const COST_RATIO = 0.4
const BILL_BASE = 24_000
const RENT = 8_500
const FREIGHT = 1_800
const UTILITIES = 1_200
const PAY_GROSS = 193_400
const PAY_DEDUCTION = 29_010
const PAY_NET = 164_390
const CLAIM = 240
const CLAIM_COUNT = 6
const CREDIT_UNTAXED = 4_800
const CREDIT_COST = 1_920

const seasonWeights = [0.72, 0.78, 0.88, 1.02, 1.12, 1.18, 0.96, 0.9, 1.08, 1.22, 1.4, 1.55] as const

const INCOME = new Set(['6001'])
const EXPENSE = new Set(['6401', '6601', '6602', '6603', '6604', '6605', '6608'])
const ASSET = new Set(['1002', '1122', '1405', '1601', '1602'])
const LIABILITY = new Set(['2202', '222101', '222102', '2241', '222103'])

export const volumeMarker = 'VOL Spring dispatch'

export type VolumePosting = {
  name: string
  monthsAgo: number
  day: number
  lines: Array<{ code: string; debit: number; credit: number; label: string }>
}

export type VolumeInvoiceSpec = {
  name: string
  moveType: 'out_invoice' | 'out_refund' | 'in_invoice'
  state: 'posted' | 'paid'
  monthsAgo: number
  day: number
  untaxed: number
  tax: number
  total: number
  residual: number
  paid: number
  description: string
}

export type VolumeBankLine = {
  label: string
  amount: number
  monthsAgo: number
  day: number
  reference: string
  matchedJournal: string | null
}

export type VolumeProduct = {
  sku: string
  name: string
  type: 'product' | 'service'
  kind: 'finished' | 'raw'
  category: 'Cloth' | 'Paper' | 'Home' | 'Service' | 'Packaging'
  list: number
  cost: number
  purchasable: boolean
  published: boolean
  main: number
  suzhou: number
  scrap: number
}

export type VolumeParty = {
  name: string
  email: string
  phone: string
  city: string
  street: string
  postal: string
  tags: string
  person: string
}

export type VolumeLeadSpec = {
  name: string
  contactName: string
  email: string
  stage: 'new' | 'qualified' | 'proposition' | 'won' | 'lost'
  expected: number
  source: 'website' | 'referral' | 'phone' | 'email'
  monthsAgo: number
}

const given = [
  'Lin', 'Wang', 'Zhang', 'Liu', 'Chen', 'Zhao', 'Sun', 'Wu', 'Xu', 'Huang',
  'Gao', 'Ma', 'Song', 'He', 'Luo', 'Clara', 'Hannah', 'Felix', 'Iris', 'Noah',
  'Ella', 'Samuel', 'Grace', 'Henry', 'Ayesha', 'Hamza', 'Sana', 'Bilal', 'Fatima', 'Omar',
  'Amara', 'Kenji', 'Sofia', 'Ingrid', 'Mateus', 'Priya',
]
const family = [
  'Mei', 'Hao', 'Yue', 'Fang', 'Wei', 'Min', 'Qiang', 'Yan', 'Jie', 'Ling',
  'Bo', 'Rui', 'Ping', 'Li', 'Ning', 'Bennett', 'Cole', 'Moore', 'Dalton', 'Grant',
  'Brooks', 'Wright', 'Palmer', 'Walsh', 'Khan', 'Iqbal', 'Malik', 'Ahmed', 'Noor', 'Sheikh',
  'Diallo', 'Sato', 'Almeida', 'Berg', 'Rocha', 'Nair',
]
const cities = [
  ['Shanghai', '88 Jiangbei Road', '200001'],
  ['Suzhou', '12 Pingjiang Lane', '215000'],
  ['Shenzhen', '6 Nanshan Bay', '518000'],
  ['Hangzhou', '41 West Lake Causeway', '310000'],
  ['Ningbo', '9 Sanjiangkou', '315000'],
  ['Qingdao', '18 Badaguan', '266000'],
  ['Chengdu', '27 Kuanzhai Alley', '610000'],
  ['London', '14 Rivington Street', 'EC2A 3DU'],
  ['Manchester', '3 Ancoats Walk', 'M4 6FN'],
  ['Singapore', '21 Duxton Hill', '089605'],
  ['Hamburg', '8 Speicherstadt', '20457'],
  ['Rotterdam', '5 Wijnhaven', '3011 WN'],
  ['Karachi', '44 Clifton Block 5', '75600'],
  ['Lahore', '17 Gulberg III', '54660'],
  ['Dubai', '2 Al Fahidi', '25314'],
  ['Melbourne', '11 Brunswick Street', '3065'],
  ['Toronto', '90 Ossington', 'M6J 2Z5'],
  ['Busan', '6 Haeundae', '48094'],
] as const
const suffixes = ['Trading', 'Atelier', 'Goods', 'Studio', 'Textiles', 'Home', 'Supply', 'Workshop']
const vendorTrades = ['Mill', 'Yarn', 'Dye Works', 'Packaging', 'Hardware', 'Trims', 'Paper', 'Logistics']

function pad(value: number, width: number) {
  return String(value).padStart(width, '0')
}

function personAt(index: number) {
  const name = `${given[index % given.length]} ${family[(index * 5) % family.length]}`
  return name
}

function party(index: number, kind: 'customer' | 'vendor'): VolumeParty {
  const who = personAt(index + (kind === 'vendor' ? 11 : 0))
  const place = cities[index % cities.length]!
  const trade = kind === 'customer' ? suffixes[index % suffixes.length] : vendorTrades[index % vendorTrades.length]
  const tags = kind === 'customer'
    ? ['wholesale', 'export', 'repeat', 'studio'][index % 4]!
    : ['mill', 'trim', 'packaging', 'dye'][index % 4]!
  return {
    name: `${who} ${trade}`,
    email: `${kind}${pad(index + 1, 2)}@volume.jiangbei.example`,
    phone: `+86 21 5500 ${pad(1000 + index, 4)}`,
    city: place[0],
    street: place[1],
    postal: place[2],
    tags,
    person: who,
  }
}

export const volumeCustomers: VolumeParty[] = Array.from({ length: 72 }, (_, index) => party(index, 'customer'))
export const volumeVendors: VolumeParty[] = Array.from({ length: 28 }, (_, index) => party(index, 'vendor'))

function stocked(index: number, low: boolean): Pick<VolumeProduct, 'main' | 'suzhou' | 'scrap'> {
  if (low) return { main: 2, suzhou: 0, scrap: 0 }
  return {
    main: 18 + (index % 6) * 8,
    suzhou: index % 3 === 0 ? 10 : 0,
    scrap: index % 7 === 0 ? 1 : 0,
  }
}

function product(
  sku: string,
  name: string,
  type: VolumeProduct['type'],
  kind: VolumeProduct['kind'],
  category: VolumeProduct['category'],
  list: number,
  cost: number,
  qty: Pick<VolumeProduct, 'main' | 'suzhou' | 'scrap'>,
  purchasable: boolean,
  published: boolean,
): VolumeProduct {
  return { sku, name, type, kind, category, list, cost, purchasable, published, ...qty }
}

const rawNames = [
  'Cotton greige 40s', 'Cotton greige 60s', 'Linen slub', 'Wool yarn ecru', 'Wool yarn charcoal',
  'Silk noil', 'Indigo paste', 'Walnut buttons', 'Horn buttons', 'Brass snap',
  'Kraft board', 'Tissue wrap', 'Cotton tape', 'Elastic 20mm', 'Zipper coil',
  'Sewing thread black', 'Sewing thread natural', 'Fusible interlining', 'Canvas 12oz', 'Canvas 8oz',
  'Downproof cotton', 'Rib knit cuff', 'Drawcord', 'Eyelet tape', 'Bias binding',
  'Pearl snap', 'Label tape', 'Poly mailer', 'Tissue paper', 'Hang tag board',
]
const componentNames = [
  'Cut body panel', 'Cut pocket', 'Cut strap', 'Hemmed cuff', 'Dyed panel indigo',
  'Dyed panel sand', 'Quilted lining', 'Padded shoulder', 'Stitched handle', 'Turned collar',
  'Bound notebook block', 'Cover board', 'Elastic closure', 'Printed belly band', 'Woven label',
]
const finishedNames = [
  'Market tote sand', 'Market tote indigo', 'Shop apron natural', 'Shop apron indigo', 'Weekender charcoal',
  'Weekender sand', 'Field notebook A5', 'Field notebook A6', 'Cloth-bound journal', 'Linen cushion cover',
  'Wool throw ecru', 'Wool throw charcoal', 'Canvas pouch', 'Tool roll', 'Kids smock',
  'Cafe apron', 'Table runner', 'Napkin set', 'Quilted tote', 'Drawstring sack',
  'Sample swatch book', 'Hotel amenity pouch', 'Gift wrap set', 'Desk blotter', 'Pencil case',
  'Yoga strap', 'Market basket liner', 'Door curtain', 'Pot holder pair', 'Bread bag',
  'Library tote', 'Artist roll', 'Picnic cloth', 'Seat pad', 'Wall hanging',
  'Changing pouch', 'Recipe journal', 'Cloth calendar', 'Key fob set', 'Repair kit',
]
const serviceNames = [
  'Hemming hour', 'Dye lot fee', 'Embroidery setup', 'Pattern making', 'Showroom styling',
  'Delivery run', 'Quality inspection', 'Repair stitch', 'Monogram', 'Window dressing',
]
const consumableNames = ['Shop bag', 'Tissue sheet', 'Care card', 'Twine spool', 'Sticker sheet']

export const volumeProducts: VolumeProduct[] = [
  ...rawNames.map((name, index) => product(
    `VOL-RM-${pad(index + 1, 2)}`,
    name,
    'product',
    'raw',
    index % 5 === 0 ? 'Packaging' : 'Cloth',
    roundMoney((6 + (index % 7) * 3) * 2.2),
    6 + (index % 7) * 3,
    stocked(index, index % 19 === 0),
    true,
    false,
  )),
  ...componentNames.map((name, index) => product(
    `VOL-CP-${pad(index + 1, 2)}`,
    name,
    'product',
    'raw',
    'Cloth',
    roundMoney((10 + (index % 5) * 4) * 2.1),
    10 + (index % 5) * 4,
    stocked(index + 3, false),
    true,
    false,
  )),
  ...finishedNames.map((name, index) => product(
    `VOL-FG-${pad(index + 1, 2)}`,
    name,
    'product',
    'finished',
    index % 4 === 0 ? 'Home' : index % 4 === 1 ? 'Paper' : 'Cloth',
    roundMoney((36 + (index % 8) * 14) * 1),
    18 + (index % 8) * 6,
    stocked(index + 1, index % 10 === 0),
    false,
    false,
  )),
  ...serviceNames.map((name, index) => product(
    `VOL-SV-${pad(index + 1, 2)}`,
    name,
    'service',
    'finished',
    'Service',
    80 + index * 20,
    0,
    { main: 0, suzhou: 0, scrap: 0 },
    false,
    false,
  )),
  ...consumableNames.map((name, index) => product(
    `VOL-CN-${pad(index + 1, 2)}`,
    name,
    'product',
    'raw',
    'Packaging',
    4 + index,
    1 + (index % 3),
    { main: index === 0 ? 1 : 30 + index * 4, suzhou: 0, scrap: 0 },
    true,
    false,
  )),
]

export const volumeStockValue = roundMoney(volumeProducts.reduce((sum, row) => {
  return roundMoney(sum + row.cost * (row.main + row.suzhou + row.scrap))
}, 0))

const leadStages = ['new', 'qualified', 'proposition', 'won', 'lost'] as const
const leadRevenue: Record<(typeof leadStages)[number], number> = {
  new: 1800,
  qualified: 4200,
  proposition: 7600,
  won: 2400,
  lost: 900,
}
const leadSources = ['website', 'referral', 'phone', 'email'] as const
const leadTopics = [
  'linen program', 'shop apron reorder', 'hotel amenity kit', 'notebook term', 'throw blanket run',
  'showroom fit-out', 'cafe apron set', 'school tote trial', 'gift wrap season', 'swatch library',
  'weekend market stall', 'clinic textile refresh',
]

export const volumeLeads: VolumeLeadSpec[] = Array.from({ length: 130 }, (_, index) => {
  const stage = leadStages[index % leadStages.length]!
  const who = personAt(index + 3)
  return {
    name: `VOL-L-${pad(index + 1, 3)} ${leadTopics[index % leadTopics.length]}`,
    contactName: who,
    email: `lead${pad(index + 1, 3)}@volume.jiangbei.example`,
    stage,
    expected: leadRevenue[stage],
    source: leadSources[index % leadSources.length]!,
    monthsAgo: index % 12,
  }
})

const saleStates = ['draft', 'sent', 'sale', 'done', 'cancel'] as const
export const volumeDeskOrders = Array.from({ length: 160 }, (_, index) => ({
  name: `SOV${pad(index + 1, 4)}`,
  state: saleStates[index % saleStates.length]!,
  origin: 'desk' as const,
  monthsAgo: index % 12,
  qty: 2 + (index % 5),
}))
export const volumeShopOrders = Array.from({ length: 18 }, (_, index) => ({
  name: `SOV-SHOP-${pad(index + 1, 2)}`,
  state: 'done' as const,
  origin: 'shop' as const,
  monthsAgo: index % 12,
  qty: 1 + (index % 3),
}))

const quoteStates = ['draft', 'sent', 'ordered', 'cancel'] as const
export const volumeQuotations = Array.from({ length: 160 }, (_, index) => ({
  name: `QTV${pad(index + 1, 4)}`,
  state: quoteStates[index % quoteStates.length]!,
  monthsAgo: index % 12,
  qty: 3 + (index % 4),
}))

function purchaseState(index: number) {
  if (index < 80) return 'done' as const
  if (index < 92) return 'purchase' as const
  if (index < 104) return 'sent' as const
  if (index < 114) return 'draft' as const
  return 'cancel' as const
}

export const volumePurchases = Array.from({ length: 120 }, (_, index) => ({
  name: `POV${pad(index + 1, 4)}`,
  state: purchaseState(index),
  monthsAgo: index % 12,
  qty: 10 + (index % 8),
}))
export const volumeRfqs = Array.from({ length: 80 }, (_, index) => ({
  name: `RFQV${pad(index + 1, 4)}`,
  state: index % 3 === 0 ? 'draft' as const : 'received' as const,
  monthsAgo: index % 12,
  qty: 20 + (index % 6),
}))

const moStates = ['draft', 'confirmed', 'progress', 'done', 'cancel', 'stopped'] as const
export const volumeManufacturing = Array.from({ length: 48 }, (_, index) => ({
  name: `MOV-${pad(index + 1, 3)}`,
  state: moStates[index % moStates.length]!,
  qty: 4 + (index % 5),
  monthsAgo: index % 12,
}))

export const volumeEmployees = [
  'Amina Farooq', 'Bao Zhen', 'Cai Ling', 'Daniel Okonkwo', 'Eun Park', 'Farah Siddiqui',
  'Guo Yan', 'Hassan Raza', 'Ivy Chen', 'Jamal Rahman', 'Keiko Mori', 'Liang Yu',
  'Mei Calder', 'Nadia Qureshi', 'Owen Blake', 'Peng Rui', 'Qin Yue', 'Rosa Almeida',
  'Shen Bo', 'Tariq Hussain', 'Umair Shah', 'Vera Lind', 'Wei Jun', 'Xiao Lan',
  'Yasmin Noor', 'Zhuo Min', 'Adeel Khan', 'Bianca Rossi',
] as const

const volumeGrosses = [
  6800, 5600, 5400, 7600, 8200, 7800, 7200, 5800, 5600, 7400, 8600, 9200,
  6400, 5400, 5200, 7000, 8000, 8400, 6600, 5600, 5200, 7200, 8800, 9600,
  6200, 5800, 5000, 7800,
] as const

export const volumePayroll = volumeEmployees.map((name, index) => {
  const gross = volumeGrosses[index] ?? 0
  const deduction = roundMoney(gross * 0.15)
  const net = roundMoney(gross - deduction)
  return { name, gross, deduction, net }
})
export const volumeDraftLeaves = 3
export const volumeDepartments = ['Dye house', 'Stitching', 'Warehouse', 'Showroom', 'Accounts', 'Design'] as const

export const volumeProjects = [
  'Suzhou showroom fit-out',
  'Harbor Clinic amenity kit',
  'Autumn market stall',
  'Hotel linen trial',
  'Notebook term for schools',
  'Cafe apron rollout',
  'Gift wrap season',
  'Swatch library rebuild',
  'Warehouse aisle recount',
] as const

export const volumeTickets = Array.from({ length: 55 }, (_, index) => {
  const stage = (['new', 'progress', 'waiting', 'solved', 'closed'] as const)[index % 5]!
  return { number: `HDV-${pad(index + 1, 3)}`, stage, slot: index }
})

const openTicketStages = new Set(['new', 'progress', 'waiting'])
const volumeOverdueTickets = volumeTickets.filter((ticket) => openTicketStages.has(ticket.stage) && ticket.slot % 3 === 0).slice(0, 8)
const volumeOverdueNumbers = new Set(volumeOverdueTickets.map((ticket) => ticket.number))

export function volumeTicketBreached(number: string) {
  return volumeOverdueNumbers.has(number)
}

const baseHelpdesk = { tickets: 12, open: 6, overdue: 3, breached: 5 }
const extraOpen = volumeTickets.filter((ticket) => openTicketStages.has(ticket.stage)).length
const extraBreached = volumeOverdueNumbers.size
const helpdeskTickets = baseHelpdesk.tickets + volumeTickets.length
const helpdeskBreached = baseHelpdesk.breached + extraBreached

export const jiangbeiHelpdeskBoard = {
  tickets: helpdeskTickets,
  open: baseHelpdesk.open + extraOpen,
  overdue: baseHelpdesk.overdue + extraBreached,
  slaPercent: Math.round(((helpdeskTickets - helpdeskBreached) / helpdeskTickets) * 100),
}

const openLeadStages = new Set(['new', 'qualified', 'proposition'])
const addedPipeline = volumeLeads.filter((lead) => openLeadStages.has(lead.stage))
const addedOpenOrders = volumeDeskOrders.filter((order) => order.state === 'draft' || order.state === 'sent' || order.state === 'sale').length

export const volumeDesk = {
  openOrders: 14 + addedOpenOrders,
  pipelineValue: roundMoney(6200 + addedPipeline.reduce((sum, lead) => sum + lead.expected, 0)),
  pipelineCount: 7 + addedPipeline.length,
  shopOrders: 4 + volumeShopOrders.length,
  staff: 10 + volumeEmployees.length,
  leaveWaiting: 1 + volumeDraftLeaves,
}

export const volumeCrm = {
  open: addedPipeline.length,
  won: volumeLeads.filter((lead) => lead.stage === 'won').length,
  lost: volumeLeads.filter((lead) => lead.stage === 'lost').length,
  expected: roundMoney(volumeLeads.reduce((sum, lead) => sum + lead.expected, 0)),
  qualifiedExpected: roundMoney(volumeLeads.filter((lead) => lead.stage === 'qualified').reduce((sum, lead) => sum + lead.expected, 0)),
  pipelineCount: addedPipeline.length,
  pipelineValue: roundMoney(addedPipeline.reduce((sum, lead) => sum + lead.expected, 0)),
}

function line(code: string, debit: number, credit: number, label: string) {
  return { code, debit, credit, label }
}

function posting(name: string, monthsAgo: number, rows: VolumePosting['lines'], day = 8): VolumePosting {
  return {
    name,
    monthsAgo,
    day,
    lines: rows.filter((row) => row.debit !== 0 || row.credit !== 0),
  }
}

function buildJournals() {
  const journals: VolumePosting[] = []
  const invoices: VolumeInvoiceSpec[] = []
  const bank: VolumeBankLine[] = []
  let saleCost = 0
  for (let index = 0; index < seasonWeights.length; index += 1) {
    const weight = seasonWeights[index]!
    const monthsAgo = seasonWeights.length - 1 - index
    const n = pad(index + 1, 2)
    const untaxed = roundMoney(SALE_BASE * weight)
    const tax = roundMoney(untaxed * TAX)
    const total = roundMoney(untaxed + tax)
    const cost = roundMoney(untaxed * COST_RATIO)
    saleCost = roundMoney(saleCost + cost)
    const paid = monthsAgo >= 4 ? total : monthsAgo >= 2 ? roundMoney(total / 2) : 0
    const residual = roundMoney(total - paid)
    const label = `Volume sales ${n}`
    invoices.push({
      name: `INV-V-${n}`,
      moveType: 'out_invoice',
      state: residual === 0 ? 'paid' : 'posted',
      monthsAgo,
      day: 8,
      untaxed,
      tax,
      total,
      residual,
      paid,
      description: label,
    })
    journals.push(posting(`JE-V-S${n}`, monthsAgo, [
      line('1122', total, 0, label),
      line('6001', 0, untaxed, label),
      line('222101', 0, tax, label),
    ]))
    journals.push(posting(`JE-V-C${n}`, monthsAgo, [
      line('6401', cost, 0, label),
      line('1405', 0, cost, label),
    ], 9))
    if (paid > 0) {
      journals.push(posting(`JE-V-P${n}`, monthsAgo, [
        line('1002', paid, 0, label),
        line('1122', 0, paid, label),
      ], 18))
      bank.push({
        label: `Customer receipt ${n}`,
        amount: paid,
        monthsAgo,
        day: 18,
        reference: `INV-V-${n}`,
        matchedJournal: `JE-V-P${n}`,
      })
    }
    const billUntaxed = roundMoney(BILL_BASE * weight)
    const billTax = roundMoney(billUntaxed * TAX)
    const billTotal = roundMoney(billUntaxed + billTax)
    const billPaid = monthsAgo >= 3
    const billLabel = `Volume materials ${n}`
    invoices.push({
      name: `BILL-V-${n}`,
      moveType: 'in_invoice',
      state: billPaid ? 'paid' : 'posted',
      monthsAgo,
      day: 6,
      untaxed: billUntaxed,
      tax: billTax,
      total: billTotal,
      residual: billPaid ? 0 : billTotal,
      paid: billPaid ? billTotal : 0,
      description: billLabel,
    })
    journals.push(posting(`JE-V-B${n}`, monthsAgo, [
      line('1405', billUntaxed, 0, billLabel),
      line('222102', billTax, 0, billLabel),
      line('2202', 0, billTotal, billLabel),
    ], 6))
    if (billPaid) {
      journals.push(posting(`JE-V-BP${n}`, monthsAgo, [
        line('2202', billTotal, 0, billLabel),
        line('1002', 0, billTotal, billLabel),
      ], 20))
      bank.push({
        label: `Vendor payment ${n}`,
        amount: roundMoney(-billTotal),
        monthsAgo,
        day: 20,
        reference: `BILL-V-${n}`,
        matchedJournal: `JE-V-BP${n}`,
      })
    }
    journals.push(posting(`JE-V-R${n}`, monthsAgo, [
      line('6603', RENT, 0, 'Workshop rent'),
      line('1002', 0, RENT, 'Workshop rent'),
    ], 3))
    journals.push(posting(`JE-V-F${n}`, monthsAgo, [
      line('6604', FREIGHT, 0, 'Outbound freight'),
      line('1002', 0, FREIGHT, 'Outbound freight'),
    ], 11))
    journals.push(posting(`JE-V-U${n}`, monthsAgo, [
      line('6608', UTILITIES, 0, 'Workshop utilities'),
      line('1002', 0, UTILITIES, 'Workshop utilities'),
    ], 12))
    journals.push(posting(`JE-V-W${n}`, monthsAgo, [
      line('6601', PAY_GROSS, 0, 'Workshop payroll'),
      line('2241', 0, PAY_NET, 'Workshop payroll'),
      line('222103', 0, PAY_DEDUCTION, 'Workshop payroll'),
    ], 28))
    journals.push(posting(`JE-V-WP${n}`, monthsAgo, [
      line('2241', PAY_NET, 0, 'Payroll paid'),
      line('1002', 0, PAY_NET, 'Payroll paid'),
    ], 28))
    journals.push(posting(`JE-V-DV${n}`, monthsAgo, [
      line('6605', 1300, 0, 'Delivery van'),
      line('1602', 0, 1300, 'Delivery van'),
    ], 28))
    journals.push(posting(`JE-V-DM${n}`, monthsAgo, [
      line('6605', 875, 0, 'Embroidery machine'),
      line('1602', 0, 875, 'Embroidery machine'),
    ], 28))
  }
  const creditTax = roundMoney(CREDIT_UNTAXED * TAX)
  const creditTotal = roundMoney(CREDIT_UNTAXED + creditTax)
  invoices.push({
    name: 'CN-V-01',
    moveType: 'out_refund',
    state: 'posted',
    monthsAgo: 2,
    day: 14,
    untaxed: CREDIT_UNTAXED,
    tax: creditTax,
    total: creditTotal,
    residual: 0,
    paid: 0,
    description: 'Returned market totes',
  })
  journals.push(posting('JE-V-CN', 2, [
    line('6001', CREDIT_UNTAXED, 0, 'Returned market totes'),
    line('222101', creditTax, 0, 'Returned market totes'),
    line('1122', 0, creditTotal, 'Returned market totes'),
  ], 14))
  journals.push(posting('JE-V-CNC', 2, [
    line('1405', CREDIT_COST, 0, 'Returned market totes'),
    line('6401', 0, CREDIT_COST, 'Returned market totes'),
  ], 14))
  for (let index = 0; index < CLAIM_COUNT; index += 1) {
    const name = `JE-V-X${pad(index + 1, 2)}`
    journals.push(posting(name, index + 1, [
      line('6602', CLAIM, 0, 'Reimbursed expense'),
      line('1002', 0, CLAIM, 'Reimbursed expense'),
    ], 16))
  }
  const opening = roundMoney(volumeStockValue + saleCost - CREDIT_COST)
  journals.push(posting('JE-V-STK', 11, [
    line('1405', opening, 0, 'Volume stock on hand'),
    line('2202', 0, opening, 'Volume stock on hand'),
  ], 2))
  journals.push(posting('JE-V-A01', 11, [
    line('1601', 86_000, 0, 'Delivery van'),
    line('1002', 0, 86_000, 'Delivery van'),
  ], 4))
  journals.push(posting('JE-V-A02', 10, [
    line('1601', 42_000, 0, 'Embroidery machine'),
    line('1002', 0, 42_000, 'Embroidery machine'),
  ], 4))
  bank.push(
    { label: 'Unidentified receipt', amount: 860, monthsAgo: 1, day: 9, reference: 'UNMATCHED-IN', matchedJournal: null },
    { label: 'Card processor fee', amount: -45, monthsAgo: 0, day: 22, reference: 'UNMATCHED-FEE', matchedJournal: null },
    { label: 'Counter deposit', amount: 320, monthsAgo: 2, day: 5, reference: 'UNMATCHED-CASH', matchedJournal: null },
  )
  return { journals, invoices, bank }
}

const built = buildJournals()
export const volumeJournals = built.journals
export const volumeInvoices = built.invoices
export const volumeBankLines = built.bank

function booksFromJournals() {
  let income = 0
  let expense = 0
  let assets = 0
  let liabilities = 0
  let outputVat = 0
  let inputVat = 0
  const names = new Set<string>()
  for (const entry of volumeJournals) {
    if (names.has(entry.name)) throw new Error(`Duplicate volume journal ${entry.name}`)
    names.add(entry.name)
    let debit = 0
    let credit = 0
    for (const row of entry.lines) {
      debit = roundMoney(debit + row.debit)
      credit = roundMoney(credit + row.credit)
      if (INCOME.has(row.code)) income = roundMoney(income + row.credit - row.debit)
      else if (EXPENSE.has(row.code)) expense = roundMoney(expense + row.debit - row.credit)
      else if (ASSET.has(row.code)) assets = roundMoney(assets + row.debit - row.credit)
      else if (LIABILITY.has(row.code)) liabilities = roundMoney(liabilities + row.credit - row.debit)
      else throw new Error(`Volume journal uses an unknown account ${row.code}`)
      if (row.code === '222101') outputVat = roundMoney(outputVat + row.credit - row.debit)
      if (row.code === '222102') inputVat = roundMoney(inputVat + row.debit - row.credit)
    }
    if (debit !== credit) throw new Error(`${entry.name} does not balance (${debit} vs ${credit})`)
  }
  const profit = roundMoney(income - expense)
  if (roundMoney(assets - liabilities - profit) !== 0) {
    throw new Error('Volume books do not balance.')
  }
  const invoiceOutput = roundMoney(volumeInvoices.reduce((sum, invoice) => {
    if (invoice.moveType === 'out_invoice') return roundMoney(sum + invoice.tax)
    if (invoice.moveType === 'out_refund') return roundMoney(sum - invoice.tax)
    return sum
  }, 0))
  const invoiceInput = roundMoney(volumeInvoices.filter((invoice) => invoice.moveType === 'in_invoice').reduce((sum, invoice) => roundMoney(sum + invoice.tax), 0))
  if (invoiceOutput !== outputVat) throw new Error('Volume output VAT does not match the invoices.')
  if (invoiceInput !== inputVat) throw new Error('Volume input VAT does not match the bills.')
  const receivable = roundMoney(volumeInvoices.filter((invoice) => invoice.moveType === 'out_invoice' && invoice.state === 'posted').reduce((sum, invoice) => roundMoney(sum + invoice.residual), 0))
  const payable = roundMoney(volumeInvoices.filter((invoice) => invoice.moveType === 'in_invoice' && invoice.state === 'posted').reduce((sum, invoice) => roundMoney(sum + invoice.residual), 0))
  return {
    income,
    expense,
    profit,
    assetDelta: assets,
    liabilityDelta: liabilities,
    outputVat,
    inputVat,
    receivable,
    payable,
  }
}

export const volumeBooks = booksFromJournals()

const customerNames = new Set(volumeCustomers.map((row) => row.name))
const vendorNames = new Set(volumeVendors.map((row) => row.name))
const productSkus = new Set(volumeProducts.map((row) => row.sku))
if (customerNames.size !== volumeCustomers.length) throw new Error('Volume customers are not unique.')
if (vendorNames.size !== volumeVendors.length) throw new Error('Volume vendors are not unique.')
if (productSkus.size !== volumeProducts.length) throw new Error('Volume products are not unique.')
if (!productSkus.has('VOL-FG-01')) throw new Error('Volume marker product is missing.')
if (volumeProducts.length < 80 || volumeProducts.length > 120) throw new Error('Volume product count is out of range.')
if (volumeCrm.won !== volumeCrm.lost) throw new Error('Volume won and lost leads must stay level so conversion holds.')
if (volumePayroll.length !== volumeEmployees.length) throw new Error('Every Jiangbei employee needs a salary.')
if (roundMoney(volumePayroll.reduce((sum, row) => sum + row.gross, 0)) !== PAY_GROSS) throw new Error('Volume payslips do not add up to the payroll journal.')
if (roundMoney(volumePayroll.reduce((sum, row) => sum + row.deduction, 0)) !== PAY_DEDUCTION) throw new Error('Volume payroll deductions do not add up.')
if (roundMoney(volumePayroll.reduce((sum, row) => sum + row.net, 0)) !== PAY_NET) throw new Error('Volume payroll net does not add up.')
if (jiangbeiHelpdeskBoard.tickets !== 12 + volumeTickets.length) throw new Error('Volume helpdesk board drifted.')

export function volumeDate(monthsAgo: number, day: number, now = new Date()) {
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1))
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
  const picked = Math.min(Math.max(day, 1), last)
  return new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), picked))
}
