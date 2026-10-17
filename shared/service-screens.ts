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
  kanban = false,
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

const row = (name: string, state: string, extra: Partial<DeskSeed> = {}): DeskSeed => ({
  name,
  state,
  recordDate: day('2026-04-16'),
  ...extra,
})

export const serviceScreens: DeskScreen[] = [
  report('assets', 'dashboard', 'Asset dashboard', '资产看板', 'Gross value still on the books, by month.', '账上仍在的原值，按月。', [
    row('January', 'running', { bucket: 'Jan', amount: 22800, recordDate: day('2026-01-31') }),
    row('February', 'running', { bucket: 'Feb', amount: 22800, recordDate: day('2026-02-28') }),
    row('March', 'running', { bucket: 'Mar', amount: 23780, recordDate: day('2026-03-31') }),
    row('April', 'running', { bucket: 'Apr', amount: 23780, recordDate: day('2026-04-16') }),
  ]),
  list('assets', 'locations', 'Asset locations', '资产地点', 'Where a machine or a van sits.', '机器或车辆所在的地方。', ['active'], [
    row('Shanghai workshop', 'active', { owner: 'He Gong', notes: 'Loom 02 and the cutting table.' }),
    row('Shop yard', 'active', { owner: 'Lin Xiao', notes: 'The delivery van parks here.' }),
    row('Harbour workshop', 'active', { partner: 'Harbour & Line', owner: 'Amira Shah', notes: 'Cutting table while the blade is changed.' }),
  ]),
  list('assets', 'movements', 'Asset movements', '资产转移', 'A move from one location to another.', '从一个地点转到另一个地点。', ['draft', 'done'], [
    row('Cutting table to Harbour', 'done', { partner: 'Cutting table', owner: 'Amira Shah', bucket: 'Harbour workshop', notes: 'Sent for the blade change.', recordDate: day('2026-04-10') }),
    row('Van back to the yard', 'done', { partner: 'Delivery van', owner: 'Lin Xiao', bucket: 'Shop yard', notes: 'Returned after the service.', recordDate: day('2026-04-04') }),
    row('Loom stays', 'draft', { partner: 'Loom 02', owner: 'He Gong', bucket: 'Shanghai workshop', notes: 'No move planned.' }),
  ]),
  list('assets', 'disposals', 'Disposals', '处置', 'Assets taken off the register.', '从登记册上移除的资产。', ['draft', 'done'], [
    row('Office laptops', 'done', { owner: 'August', amount: 0, notes: 'Sold as a lot in March.', recordDate: day('2026-03-18') }),
    row('Old press', 'draft', { owner: 'He Gong', amount: 200, notes: 'Quote from the scrap yard. Not posted.' }),
  ]),
  report('assets', 'schedule', 'Depreciation schedule', '折旧计划', 'What each running asset still has to depreciate.', '每项在用资产还要计提的折旧。', [
    row('Loom 02', 'running', { bucket: 'Machinery', amount: 14880, partner: '8 years' }),
    row('Delivery van', 'running', { bucket: 'Vehicles', amount: 2520, partner: '5 years' }),
    row('Cutting table', 'progress', { bucket: 'Machinery', amount: 784, partner: 'Paused' }),
  ]),
  report('assets', 'maintenance-report', 'Maintenance analysis', '维护分析', 'Open and finished work on assets.', '资产上未完成和已完成的维修。', [
    row('Scheduled', 'scheduled', { bucket: 'Scheduled', amount: 40 }),
    row('In progress', 'progress', { bucket: 'In progress', amount: 30 }),
    row('Done', 'done', { bucket: 'Done', amount: 85 }),
  ]),

  report('projects', 'dashboard', 'Project dashboard', '项目看板', 'Hours logged against open projects.', '记在未完项目上的工时。', [
    row('February', 'done', { bucket: 'Feb', amount: 48, recordDate: day('2026-02-28') }),
    row('March', 'done', { bucket: 'Mar', amount: 60, recordDate: day('2026-03-31') }),
    row('April', 'progress', { bucket: 'Apr', amount: 38, recordDate: day('2026-04-16') }),
  ]),
  list('projects', 'updates', 'Updates', '进展', 'A short note on where a project stands.', '项目进展的简短记录。', ['open', 'done'], [
    row('Half the totes are cut', 'open', { partner: 'Spring tote run', owner: 'August', notes: '120 of 200 panels are on the bench.' }),
    row('Shelves ordered', 'open', { partner: 'Shop refit', owner: 'Lin Xiao', notes: 'Delivery in the first week of May.' }),
    row('Harbour kit closed', 'done', { partner: 'Harbour wholesale kit', owner: 'Amira Shah', notes: 'Invoiced and delivered.', recordDate: day('2026-03-20') }),
  ]),
  list('projects', 'activity-types', 'Activity types', '活动类型', 'What a timesheet line is for.', '工时行的用途。', ['active'], [
    row('Cutting', 'active', { notes: 'Shop-floor hours.', owner: 'Workshop' }),
    row('Buying', 'active', { notes: 'Vendor calls and receipts.', owner: 'Office' }),
    row('Shop', 'active', { notes: 'Counter and the refit.', owner: 'Shop' }),
  ]),
  list('projects', 'templates', 'Project templates', '项目模板', 'A starting set of tasks for a kind of job.', '一类工作的起始任务。', ['active', 'draft'], [
    row('Customer make-to-order', 'active', { notes: 'Cut, sew, inspect, deliver.', owner: 'August' }),
    row('Shop refit', 'draft', { notes: 'Not used yet.', owner: 'Lin Xiao' }),
  ]),
  report('projects', 'profitability', 'Project profitability', '项目利润', 'Billed and still to bill, against the hours.', '已开票和待开票，对照工时。', [
    row('Spring tote run', 'progress', { bucket: 'Open', amount: 1200, partner: 'Orchard School' }),
    row('Shop refit', 'planned', { bucket: 'Planned', amount: 0, partner: 'Internal' }),
    row('Harbour wholesale kit', 'done', { bucket: 'Done', amount: 1600, partner: 'Harbour & Line' }),
  ]),
  report('projects', 'delayed', 'Delayed tasks', '延期任务', 'Tasks still open past the date on the row.', '超过日期仍未完成的任务。', [
    row('Confirm dye lot', 'planned', { bucket: 'Buying', amount: 2, partner: 'Spring tote run', owner: 'Jonah Ellis' }),
    row('Cut canvas', 'progress', { bucket: 'Shop floor', amount: 1, partner: 'Spring tote run', owner: 'He Gong' }),
  ]),
  report('projects', 'timesheet-summary', 'Timesheet summary', '工时汇总', 'Posted hours by person this month.', '本月已过账的工时，按人。', [
    row('He Gong', 'posted', { bucket: 'Workshop', amount: 32 }),
    row('Jonah Ellis', 'draft', { bucket: 'Office', amount: 6 }),
    row('Lin Xiao', 'posted', { bucket: 'Shop', amount: 8 }),
  ]),

  report('quality', 'dashboard', 'Quality dashboard', '质量看板', 'Inspections finished this season.', '本季已完成的检验。', [
    row('February', 'pass', { bucket: 'Feb', amount: 5, recordDate: day('2026-02-28') }),
    row('March', 'pass', { bucket: 'Mar', amount: 7, recordDate: day('2026-03-31') }),
    row('April', 'fail', { bucket: 'Apr', amount: 4, recordDate: day('2026-04-16') }),
  ]),
  list('quality', 'goals', 'Quality goals', '质量目标', 'A target the floor is trying to hold.', '车间要守住的目标。', ['active', 'draft'], [
    row('Incoming shade match', 'active', { amount: 98, notes: 'Percent of rolls that pass the shade check.', owner: 'He Gong' }),
    row('Finished stitch', 'active', { amount: 99, notes: 'Percent of totes with a sound stitch.', owner: 'He Gong' }),
    row('Shop display', 'draft', { amount: 100, notes: 'Not published.', owner: 'Lin Xiao' }),
  ]),
  list('quality', 'teams', 'Quality teams', '质量团队', 'Who runs a check.', '谁来做检验。', ['active'], [
    row('Shop floor', 'active', { owner: 'He Gong', notes: 'In-process and finished goods.' }),
    row('Incoming', 'active', { owner: 'Jonah Ellis', notes: 'Vendor lots.' }),
  ]),
  report('quality', 'inspection-summary', 'Inspection summary', '检验汇总', 'Results by kind of check.', '按检验类型的结果。', [
    row('Incoming', 'pass', { bucket: 'Pass', amount: 6 }),
    row('In process', 'fail', { bucket: 'Fail', amount: 1 }),
    row('Final', 'draft', { bucket: 'Draft', amount: 1 }),
  ]),
  report('quality', 'alert-analysis', 'Alert analysis', '警报分析', 'Open alerts by cause.', '按原因的未关闭警报。', [
    row('Stitch', 'open', { bucket: 'Stitch', amount: 1, partner: 'NCR-014' }),
    row('Shade', 'done', { bucket: 'Shade', amount: 0, partner: 'NCR-011' }),
  ]),
  report('quality', 'by-product', 'Quality by product', '按产品的质量', 'Failed pieces by finished good.', '按成品的不合格件数。', [
    row('Canvas tote', 'fail', { bucket: 'Tote', amount: 6 }),
    row('Greige canvas', 'pass', { bucket: 'Fabric', amount: 0 }),
    row('Field notebook', 'pass', { bucket: 'Notebook', amount: 0 }),
  ]),

  report('subcontracting', 'dashboard', 'Subcontracting dashboard', '委外看板', 'Value still out with a workshop.', '仍在外部车间的金额。', [
    row('February', 'received', { bucket: 'Feb', amount: 220, recordDate: day('2026-02-28') }),
    row('March', 'received', { bucket: 'Mar', amount: 220, recordDate: day('2026-03-31') }),
    row('April', 'confirmed', { bucket: 'Apr', amount: 640, recordDate: day('2026-04-16') }),
  ]),
  list('subcontracting', 'pending', 'Pending receipts', '待收货', 'Orders confirmed and not back yet.', '已确认、尚未收回的订单。', ['ready', 'done'], [
    row('SC1102 dye lot', 'ready', { partner: 'Harbour Dye', owner: 'Jonah Ellis', amount: 40, notes: '40 rolls expected this week.' }),
    row('SC1098 hemming', 'done', { partner: 'West Stitch', owner: 'He Gong', amount: 80, notes: 'Already put away.', recordDate: day('2026-03-30') }),
  ]),
  list('subcontracting', 'boms', 'Subcontracting BOM', '委外物料清单', 'What goes out with an order, and what comes back.', '随订单发出的组件，以及收回的成品。', ['active', 'draft'], [
    row('Dyed canvas', 'active', { partner: 'Harbour Dye', owner: 'Jonah Ellis', notes: 'Greige out, dyed roll back.' }),
    row('School logo embroidery', 'draft', { partner: 'West Stitch', owner: 'August', notes: 'Not released.' }),
    row('Hemmed tote', 'active', { partner: 'West Stitch', owner: 'He Gong', notes: 'Cut panels out, hemmed tote back.' }),
  ]),
  report('subcontracting', 'order-summary', 'Subcontract order summary', '委外订单汇总', 'Orders by state.', '按状态的委外订单。', [
    row('Draft', 'draft', { bucket: 'Draft', amount: 180 }),
    row('Confirmed', 'confirmed', { bucket: 'Confirmed', amount: 640 }),
    row('Received', 'received', { bucket: 'Received', amount: 220 }),
  ]),
  report('subcontracting', 'consumed', 'Components sent', '发出组件', 'Material issued to a subcontractor.', '发给委外方的原料。', [
    row('Greige canvas', 'done', { bucket: 'Fabric', amount: 40, partner: 'Harbour Dye' }),
    row('Cut panels', 'done', { bucket: 'Panels', amount: 80, partner: 'West Stitch' }),
    row('Thread for the logo', 'draft', { bucket: 'Thread', amount: 2, partner: 'West Stitch' }),
  ]),
  report('subcontracting', 'cost', 'Subcontract cost', '委外成本', 'What each workshop has charged.', '各车间已收取的费用。', [
    row('Harbour Dye', 'confirmed', { bucket: 'Dye', amount: 640 }),
    row('West Stitch', 'received', { bucket: 'Sew', amount: 400 }),
  ]),

  report('helpdesk', 'dashboard', 'Helpdesk dashboard', '服务台看板', 'Tickets opened over the last months.', '近几个月新建的工单。', [
    row('February', 'done', { bucket: 'Feb', amount: 4, recordDate: day('2026-02-28') }),
    row('March', 'done', { bucket: 'Mar', amount: 6, recordDate: day('2026-03-31') }),
    row('April', 'open', { bucket: 'Apr', amount: 5, recordDate: day('2026-04-16') }),
  ]),
  list('helpdesk', 'types', 'Ticket types', '工单类型', 'What a new ticket is about.', '新工单的主题。', ['active'], [
    row('Delivery', 'active', { notes: 'Late or short shipments.', owner: 'Desk' }),
    row('Product', 'active', { notes: 'Shade, size, and quality.', owner: 'Desk' }),
    row('Billing', 'active', { notes: 'Invoices and copies.', owner: 'Desk' }),
  ]),
  list('helpdesk', 'priorities', 'Priorities', '优先级', 'How fast a ticket should move.', '工单该多快处理。', ['active'], [
    row('High', 'active', { amount: 1, notes: 'Same day.', owner: 'Desk' }),
    row('Normal', 'active', { amount: 2, notes: 'Two days.', owner: 'Desk' }),
    row('Low', 'active', { amount: 5, notes: 'This week.', owner: 'Desk' }),
  ]),
  list('helpdesk', 'replies', 'Canned replies', '常用回复', 'A reply the desk can paste onto a ticket.', '服务台可以贴到工单上的回复。', ['active', 'draft'], [
    row('Invoice copy sent', 'active', { notes: 'We have emailed a copy of the invoice.', owner: 'August' }),
    row('Shade sample', 'active', { notes: 'A swatch is in the post.', owner: 'Jonah Ellis' }),
    row('Delay apology', 'draft', { notes: 'Not approved yet.', owner: 'August' }),
  ]),
  report('helpdesk', 'summary', 'Ticket summary', '工单汇总', 'Open, in progress, and closed.', '未处理、处理中和已关闭。', [
    row('Open', 'open', { bucket: 'Open', amount: 1 }),
    row('In progress', 'progress', { bucket: 'In progress', amount: 1 }),
    row('Done', 'done', { bucket: 'Done', amount: 4 }),
  ]),
  report('helpdesk', 'sla-report', 'SLA status', '服务级别状态', 'Met and breached this month.', '本月达标和超时。', [
    row('Met', 'met', { bucket: 'Met', amount: 2 }),
    row('Breached', 'breached', { bucket: 'Breached', amount: 1 }),
  ]),
  report('helpdesk', 'by-team', 'Tickets by team', '按团队的工单', 'Who is holding the open tickets.', '未关闭工单在谁手里。', [
    row('Desk', 'open', { bucket: 'Desk', amount: 2, owner: 'August' }),
    row('Shop', 'done', { bucket: 'Shop', amount: 0, owner: 'Lin Xiao' }),
  ]),
]
