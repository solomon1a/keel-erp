import type { DeskScreen, DeskSeed } from './desk-screens.ts'

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
  return { module, screen, kind: 'report', kanban: false, states: [], titleEn, titleZh, leadEn, leadZh, rows, settings: [] }
}

export const depthScreens: DeskScreen[] = [
  list('sales', 'follow-ups', 'Follow-ups', '跟进', 'Calls still open on a quotation or a confirmed order.', '还挂在报价或已确认订单上的电话。', ['open', 'done'], [
    { name: 'Call Orchard about SO1108', state: 'open', partner: 'Orchard School', owner: 'Maya Chen', bucket: 'Call', notes: 'Ask when they can take the invoice.', recordDate: day('2026-04-16') },
    { name: 'Send swatches to Paper & Pine', state: 'open', partner: 'Paper & Pine', owner: 'Jonah Ellis', bucket: 'To-do', notes: 'Three shades of the spring tote.', recordDate: day('2026-04-15') },
    { name: 'Harbour price check', state: 'done', partner: 'Harbour & Line', owner: 'Amira Shah', bucket: 'Call', notes: 'Wholesale price agreed.', recordDate: day('2026-04-02') },
  ]),
  list('contacts', 'titles', 'Job titles', '职务', 'Titles you can put on a person at a company.', '可以标在公司联系人上的职务。', ['active'], [
    { name: 'Buyer', state: 'active', notes: 'Places the purchase orders.', recordDate: day('2026-01-01') },
    { name: 'Shop manager', state: 'active', notes: 'Runs the counter.', recordDate: day('2026-01-01') },
    { name: 'Accounts', state: 'active', notes: 'Receives the invoice.', recordDate: day('2026-01-01') },
  ], false),
  list('inventory', 'putaway', 'Putaway', '上架', 'Receipts waiting to be moved from the dock to a shelf.', '还在月台、等待放到货架的收货。', ['draft', 'ready', 'done'], [
    { name: 'PUT/1108 canvas', state: 'ready', partner: 'Harbour Dye', owner: 'He Gong', bucket: 'Dock', notes: '40 rolls. QC passed.', recordDate: day('2026-04-11') },
    { name: 'PUT/1112 yarn', state: 'draft', partner: 'North Yarn', owner: 'Jonah Ellis', bucket: 'Dock', notes: 'Not checked in yet.', recordDate: day('2026-04-16') },
    { name: 'PUT/1102 notebooks', state: 'done', partner: 'Paper Mill', owner: 'Lin Xiao', bucket: 'Shop', notes: 'On the shop shelf.', recordDate: day('2026-04-04') },
  ]),
  list('manufacturing', 'work-orders', 'Work orders', '工单', 'A step on a manufacturing order, at a work center.', '生产订单上的一道工序，在某个工作中心。', ['draft', 'progress', 'done'], [
    { name: 'WO/1104 cut', state: 'progress', partner: 'MO/0002', owner: 'He Gong', bucket: 'Cutting', amount: 12, notes: 'Hours booked this week.', recordDate: day('2026-04-14') },
    { name: 'WO/1104 sew', state: 'draft', partner: 'MO/0002', owner: 'He Gong', bucket: 'Sewing', notes: 'Starts after the cut.', recordDate: day('2026-04-16') },
    { name: 'WO/1098 pack', state: 'done', partner: 'MO/0001', owner: 'Lin Xiao', bucket: 'Packing', amount: 6, notes: 'Packed for the shop.', recordDate: day('2026-03-28') },
  ]),
  list('pos', 'floors', 'Floors', '楼层', 'Where a register sits.', '收银台所在的位置。', ['active'], [
    { name: 'Shop floor', state: 'active', owner: 'Lin Xiao', notes: 'The counter by the door.', recordDate: day('2026-01-01') },
    { name: 'Workshop hatch', state: 'active', owner: 'He Gong', notes: 'Used on open days.', recordDate: day('2026-01-01') },
    { name: 'Pop-up', state: 'active', owner: 'Maya Chen', notes: 'Taken to the spring fair.', recordDate: day('2026-03-01') },
  ], false),
  list('website', 'pages', 'Pages', '页面', 'Pages on the public shop, besides the product grid.', '网店上除了产品网格之外的页面。', ['draft', 'done'], [
    { name: 'Home', state: 'done', owner: 'Maya Chen', notes: 'The shop front.', recordDate: day('2026-01-01') },
    { name: 'About the workshop', state: 'done', owner: 'Maya Chen', notes: 'How the totes are cut.', recordDate: day('2026-02-12') },
    { name: 'Spring fair', state: 'draft', owner: 'Jonah Ellis', notes: 'Not published.', recordDate: day('2026-04-16') },
  ]),
  report('website', 'visitors', 'Visitors', '访客', 'A sample of shop visits. Nothing is collected from a browser.', '网店访问的示例。没有从浏览器采集。', [
    { name: 'Home', state: 'done', bucket: 'Home', amount: 420, recordDate: day('2026-04-16') },
    { name: 'Tote', state: 'done', bucket: 'Product', amount: 180, recordDate: day('2026-04-16') },
    { name: 'Notebook', state: 'done', bucket: 'Product', amount: 96, recordDate: day('2026-04-16') },
  ]),
  list('payroll', 'payslips', 'Payslips', '工资单', 'One row per person for the open month, beside the live payroll run.', '未结月份每人一行，与正式工资运行并列。', ['draft', 'posted', 'paid'], [
    { name: 'Maya Chen · April', state: 'posted', partner: 'Maya Chen', owner: 'Office', amount: 18000, notes: 'Posted with the April run.', recordDate: day('2026-04-30') },
    { name: 'Jonah Ellis · April', state: 'posted', partner: 'Jonah Ellis', owner: 'Office', amount: 9000, notes: 'Posted with the April run.', recordDate: day('2026-04-30') },
    { name: 'Lin Xiao · May', state: 'draft', partner: 'Lin Xiao', owner: 'Shop', amount: 0, notes: 'May is not opened yet.', recordDate: day('2026-05-01') },
  ], false),
  list('expenses', 'approvals', 'Approvals', '审批', 'Claims sitting with an approver.', '停在审批人那里的报销。', ['waiting', 'approved', 'refused'], [
    { name: 'Cafe receipt', state: 'waiting', partner: 'Jonah Ellis', owner: 'Maya Chen', amount: 46, notes: 'Waiting on Maya.', recordDate: day('2026-04-09') },
    { name: 'Client lunch', state: 'approved', partner: 'Maya Chen', owner: 'Maya Chen', amount: 28, notes: 'Approved and reimbursed.', recordDate: day('2026-04-03') },
    { name: 'Late taxi', state: 'refused', partner: 'Lin Xiao', owner: 'Maya Chen', amount: 18, notes: 'Not a company trip.', recordDate: day('2026-04-11') },
  ]),
  list('projects', 'milestones', 'Milestones', '里程碑', 'The points a project can be billed from.', '项目可以据此开票的节点。', ['planned', 'progress', 'done'], [
    { name: 'Half the totes cut', state: 'progress', partner: 'Spring tote run', owner: 'Maya Chen', amount: 1200, notes: '120 of 200.', recordDate: day('2026-04-16') },
    { name: 'Shelves delivered', state: 'planned', partner: 'Shop refit', owner: 'Lin Xiao', amount: 800, notes: 'Not started.', recordDate: day('2026-04-20') },
    { name: 'Kit handed over', state: 'done', partner: 'Harbour wholesale kit', owner: 'Amira Shah', amount: 1600, notes: 'Billed in March.', recordDate: day('2026-03-20') },
  ]),
  list('quality', 'alerts', 'Alerts', '警报', 'A failed check that still needs a person.', '未通过、还需要人处理的检查。', ['open', 'progress', 'done'], [
    { name: 'Loose stitch on 6 totes', state: 'open', partner: 'QC1112', owner: 'He Gong', amount: 6, notes: 'Pulled from the lot.', recordDate: day('2026-04-15') },
    { name: 'Shade drift', state: 'done', partner: 'QC1102', owner: 'Jonah Ellis', amount: 1, notes: 'Vendor replaced the roll.', recordDate: day('2026-03-28') },
    { name: 'Shop count not started', state: 'progress', partner: 'QC1116', owner: 'Lin Xiao', notes: 'Scheduled for Friday.', recordDate: day('2026-04-16') },
  ]),
  list('subcontracting', 'resupply', 'Resupply', '补料', 'Components sent out with a subcontracting order.', '随委外订单发出的组件。', ['draft', 'ready', 'done'], [
    { name: 'RS/1102 greige', state: 'ready', partner: 'Harbour Dye', owner: 'Jonah Ellis', amount: 40, notes: 'Rolls waiting on the dock.', recordDate: day('2026-04-09') },
    { name: 'RS/1104 logos', state: 'draft', partner: 'West Stitch', owner: 'Maya Chen', amount: 80, notes: 'Not sent. The order is still a quote.', recordDate: day('2026-04-16') },
    { name: 'RS/1098 panels', state: 'done', partner: 'West Stitch', owner: 'He Gong', amount: 80, notes: 'Sent in March.', recordDate: day('2026-03-18') },
  ]),
  list('helpdesk', 'stages', 'Stages', '阶段', 'The columns on the ticket board.', '工单看板上的列。', ['active'], [
    { name: 'New', state: 'active', notes: 'Just arrived.', recordDate: day('2026-01-01') },
    { name: 'In progress', state: 'active', notes: 'Someone owns it.', recordDate: day('2026-01-01') },
    { name: 'Solved', state: 'active', notes: 'The customer has an answer.', recordDate: day('2026-01-01') },
  ], false),
]
