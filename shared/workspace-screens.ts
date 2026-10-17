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

export const workspaceScreens: DeskScreen[] = [
  report('manufacturing', 'dashboard', 'Manufacturing dashboard', '制造看板', 'Produced quantity for the last twelve months.', '最近十二个月的完工数量。', [
    row('May', 'done', { bucket: 'May', amount: 42, recordDate: day('2025-05-31') }),
    row('June', 'done', { bucket: 'Jun', amount: 38, recordDate: day('2025-06-30') }),
    row('July', 'done', { bucket: 'Jul', amount: 55, recordDate: day('2025-07-31') }),
    row('August', 'done', { bucket: 'Aug', amount: 48, recordDate: day('2025-08-31') }),
    row('September', 'done', { bucket: 'Sep', amount: 61, recordDate: day('2025-09-30') }),
    row('October', 'done', { bucket: 'Oct', amount: 52, recordDate: day('2025-10-31') }),
    row('November', 'done', { bucket: 'Nov', amount: 70, recordDate: day('2025-11-30') }),
    row('December', 'done', { bucket: 'Dec', amount: 66, recordDate: day('2025-12-31') }),
    row('January', 'done', { bucket: 'Jan', amount: 58, recordDate: day('2026-01-31') }),
    row('February', 'done', { bucket: 'Feb', amount: 74, recordDate: day('2026-02-28') }),
    row('March', 'done', { bucket: 'Mar', amount: 80, recordDate: day('2026-03-31') }),
    row('April', 'open', { bucket: 'Apr', amount: 69, recordDate: day('2026-04-16') }),
  ]),
  list('manufacturing', 'production-plan', 'Production Plan', '生产计划', 'What the workshop will make this month.', '本月车间要生产的内容。', ['draft', 'confirmed', 'done'], [
    row('April totes', 'confirmed', { partner: 'Canvas tote', owner: 'He Gong', amount: 40, notes: 'Shop and Cedar wholesale.' }),
    row('April notebooks', 'draft', { partner: 'Field notebook', owner: 'He Gong', amount: 80, notes: 'Waiting on cover stock.' }),
    row('March blankets', 'done', { partner: 'Wool blanket', owner: 'He Gong', amount: 24, notes: 'Finished in March.', recordDate: day('2026-03-28') }),
  ], true),
  list('manufacturing', 'stock-entry', 'Stock Entry', '库存分录', 'Material issued to the floor and finished goods received back.', '发到车间的原料，以及收回的成品。', ['draft', 'done'], [
    row('Issue yarn to cutting', 'done', { partner: 'Wool yarn', owner: 'He Gong', amount: 12, bucket: 'Material issue', notes: 'Twelve kilos for the April blankets.' }),
    row('Receive canvas totes', 'done', { partner: 'Canvas tote', owner: 'He Gong', amount: 20, bucket: 'Manufacture', notes: 'Twenty totes into finished goods.' }),
    row('Return leftover canvas', 'draft', { partner: 'Greige canvas', owner: 'He Gong', amount: 3, bucket: 'Material return', notes: 'Three metres back to the shelf.' }),
  ]),
  list('manufacturing', 'job-card', 'Job Card', '工序卡', 'One card for a step on a work order.', '工单上的一道工序一张卡。', ['open', 'progress', 'done'], [
    row('Cut tote panels', 'progress', { partner: 'Canvas tote', owner: 'He Gong', amount: 20, bucket: 'Cutting', notes: 'Cutting bench, morning shift.' }),
    row('Sew tote handles', 'open', { partner: 'Canvas tote', owner: 'Lin Xiao', amount: 20, bucket: 'Sewing', notes: 'Starts after cutting.' }),
    row('Bind notebook covers', 'done', { partner: 'Field notebook', owner: 'He Gong', amount: 40, bucket: 'Binding', notes: 'March batch.', recordDate: day('2026-03-20') }),
  ], true),
  list('manufacturing', 'lead-time', 'Item Lead Time', '物料提前期', 'Days from order to a finished good on the shelf.', '从下单到成品上架的天数。', ['active'], [
    row('Canvas tote', 'active', { amount: 5, notes: 'Cut, sew, and pack.', owner: 'Workshop' }),
    row('Wool blanket', 'active', { amount: 8, notes: 'Includes yarn issue and binding.', owner: 'Workshop' }),
    row('Field notebook', 'active', { amount: 3, notes: 'Cover and binding.', owner: 'Workshop' }),
  ]),
  list('manufacturing', 'mps', 'Master Production Schedule', '主生产计划', 'Finished goods the plan says to build, by week.', '计划要求按周生产的成品。', ['planned', 'progress', 'done'], [
    row('Week 16 — totes', 'progress', { partner: 'Canvas tote', owner: 'He Gong', amount: 40, notes: 'Shanghai warehouse.' }),
    row('Week 16 — notebooks', 'planned', { partner: 'Field notebook', owner: 'He Gong', amount: 80, notes: 'After the cover receipt.' }),
    row('Week 12 — blankets', 'done', { partner: 'Wool blanket', owner: 'He Gong', amount: 24, recordDate: day('2026-03-22') }),
  ]),
  list('manufacturing', 'forecast', 'Sales Forecast', '销售预测', 'What sales expects to ship, used by planning.', '销售预计要发出的数量，供计划使用。', ['draft', 'confirmed'], [
    row('Cedar — Q2 totes', 'confirmed', { partner: 'Cedar & Co', owner: 'August', amount: 60, notes: 'Wholesale blanket order plus totes.' }),
    row('Shop — April notebooks', 'confirmed', { partner: 'The shop', owner: 'Lin Xiao', amount: 40, notes: 'Counter and the website.' }),
    row('Harbour — sample totes', 'draft', { partner: 'Harbour & Line', owner: 'Jonah Ellis', amount: 12, notes: 'Not confirmed.' }),
  ]),
  list('manufacturing', 'downtime', 'Downtime Entry', '停机记录', 'Minutes a workstation was not cutting or sewing.', '工位没有裁剪或缝纫的分钟数。', ['open', 'done'], [
    row('Cutting bench — needle', 'done', { partner: 'Cutting bench', owner: 'He Gong', amount: 40, bucket: 'Breakdown', notes: 'Needle replaced before lunch.', recordDate: day('2026-04-14') }),
    row('Sewing — power', 'open', { partner: 'Sewing bench', owner: 'Lin Xiao', amount: 25, bucket: 'Power', notes: 'Short cut on the 14th, still to close.' }),
    row('Press — changeover', 'done', { partner: 'Press', owner: 'He Gong', amount: 15, bucket: 'Changeover', notes: 'Tote to notebook.', recordDate: day('2026-04-09') }),
  ]),
  list('manufacturing', 'workstation-type', 'Workstation Type', '工位类型', 'The kind of bench, before a named workstation.', '具体工位之前的工位类型。', ['active'], [
    row('Cutting', 'active', { notes: 'Shears and the long table.', owner: 'Workshop' }),
    row('Sewing', 'active', { notes: 'Machines and handles.', owner: 'Workshop' }),
    row('Press', 'active', { notes: 'Finish and fold.', owner: 'Workshop' }),
  ]),
  list('manufacturing', 'workstation', 'Workstation', '工位', 'A named bench on the floor.', '车间里有名字的工位。', ['active'], [
    row('Cutting bench', 'active', { partner: 'Cutting', owner: 'He Gong', notes: 'Shanghai workshop.' }),
    row('Sewing bench', 'active', { partner: 'Sewing', owner: 'Lin Xiao', notes: 'Two machines.' }),
    row('Press', 'active', { partner: 'Press', owner: 'He Gong', notes: 'Shared with finishing.' }),
  ]),
  list('manufacturing', 'operation', 'Operation', '工序', 'A step a routing can call.', '工艺路线可以调用的工序。', ['active'], [
    row('Cut', 'active', { partner: 'Cutting', amount: 12, notes: 'Minutes for one tote.', owner: 'Workshop' }),
    row('Sew', 'active', { partner: 'Sewing', amount: 18, notes: 'Handles and seams.', owner: 'Workshop' }),
    row('Pack', 'active', { partner: 'Press', amount: 6, notes: 'Fold and bag.', owner: 'Workshop' }),
  ]),
  list('manufacturing', 'routing', 'Routing', '工艺路线', 'The operations that make a finished good.', '做成一件成品的工序顺序。', ['active', 'draft'], [
    row('Tote — standard', 'active', { partner: 'Canvas tote', owner: 'He Gong', notes: 'Cut, sew, pack.' }),
    row('Notebook — standard', 'active', { partner: 'Field notebook', owner: 'He Gong', notes: 'Cut cover, bind, pack.' }),
    row('Blanket — trial', 'draft', { partner: 'Wool blanket', owner: 'He Gong', notes: 'Not released.' }),
  ]),
  report('manufacturing', 'planning-report', 'Production Planning Report', '生产计划报表', 'Planned quantity against what the floor has finished.', '计划数量和车间已完工的对比。', [
    row('Canvas tote', 'open', { bucket: 'Tote', amount: 40 }),
    row('Field notebook', 'open', { bucket: 'Notebook', amount: 80 }),
    row('Wool blanket', 'done', { bucket: 'Blanket', amount: 24 }),
  ]),
  report('manufacturing', 'mrp', 'Material Requirements Planning', '物料需求计划', 'Material the open plans still need.', '未完成计划还需要的原料。', [
    row('Greige canvas', 'open', { bucket: 'Fabric', amount: 48, partner: 'Metres' }),
    row('Wool yarn', 'open', { bucket: 'Yarn', amount: 12, partner: 'Kilos' }),
    row('Notebook covers', 'open', { bucket: 'Cover', amount: 80, partner: 'Pieces' }),
  ]),
  report('manufacturing', 'wo-summary', 'Work Order Summary', '工单汇总', 'Open, in progress, and finished work orders.', '未开工、在制和已完工的工单。', [
    row('Open', 'open', { bucket: 'Open', amount: 2 }),
    row('In progress', 'progress', { bucket: 'WIP', amount: 1 }),
    row('Done this month', 'done', { bucket: 'Done', amount: 4 }),
  ]),
  report('manufacturing', 'quality-summary', 'Quality Inspection Summary', '质量检验汇总', 'Checks on the last finished lots.', '最近完工批次的检验。', [
    row('Tote lot T-16', 'pass', { bucket: 'Pass', amount: 20, partner: 'Canvas tote' }),
    row('Notebook lot N-12', 'pass', { bucket: 'Pass', amount: 40, partner: 'Field notebook' }),
    row('Blanket lot B-09', 'fail', { bucket: 'Fail', amount: 2, partner: 'Wool blanket' }),
  ]),
  report('manufacturing', 'downtime-analysis', 'Downtime Analysis', '停机分析', 'Lost minutes by cause.', '按原因的损失分钟。', [
    row('Breakdown', 'done', { bucket: 'Breakdown', amount: 40 }),
    row('Power', 'open', { bucket: 'Power', amount: 25 }),
    row('Changeover', 'done', { bucket: 'Changeover', amount: 15 }),
  ]),
  report('manufacturing', 'job-summary', 'Job Card Summary', '工序卡汇总', 'Cards open on the floor.', '车间上未关闭的工序卡。', [
    row('Cutting', 'progress', { bucket: 'Cutting', amount: 1 }),
    row('Sewing', 'open', { bucket: 'Sewing', amount: 1 }),
    row('Binding', 'done', { bucket: 'Binding', amount: 1 }),
  ]),
  list('manufacturing', 'bom-search', 'BOM Search', '物料清单搜索', 'Find a bill of materials by the finished good.', '按成品查找物料清单。', ['active'], [
    row('Canvas tote', 'active', { partner: 'BOM-TOTE', owner: 'He Gong', amount: 1, notes: 'One tote from canvas and handles.' }),
    row('Field notebook', 'active', { partner: 'BOM-NOTE', owner: 'He Gong', amount: 1, notes: 'Cover, paper, and binding.' }),
    row('Wool blanket', 'active', { partner: 'BOM-BLANK', owner: 'He Gong', amount: 1, notes: 'Yarn and binding tape.' }),
  ]),
  report('manufacturing', 'analytics', 'Production Analytics', '生产分析', 'Finished quantity by month.', '按月的完工数量。', [
    row('February', 'done', { bucket: 'Feb', amount: 74 }),
    row('March', 'done', { bucket: 'Mar', amount: 80 }),
    row('April', 'open', { bucket: 'Apr', amount: 69 }),
  ]),
  report('manufacturing', 'bom-time', 'BOM Operations Time', '物料清单工序时间', 'Minutes on the routing for one piece.', '一件成品的工艺分钟数。', [
    row('Cut', 'active', { bucket: 'Cut', amount: 12 }),
    row('Sew', 'active', { bucket: 'Sew', amount: 18 }),
    row('Pack', 'active', { bucket: 'Pack', amount: 6 }),
  ]),
  report('manufacturing', 'consumed', 'Work Order Consumed Materials', '工单耗用原料', 'Material issued to open and recent work orders.', '发给未完和近期工单的原料。', [
    row('Greige canvas', 'done', { bucket: 'Fabric', amount: 30, partner: 'Metres' }),
    row('Wool yarn', 'done', { bucket: 'Yarn', amount: 8, partner: 'Kilos' }),
    row('Notebook covers', 'open', { bucket: 'Cover', amount: 40, partner: 'Pieces' }),
  ]),
  list('manufacturing', 'bom-update', 'BOM Update Tool', '物料清单更新', 'A draft change to a bill of materials, applied by the workshop lead.', '物料清单的草稿变更，由车间负责人应用。', ['draft', 'done'], [
    row('Tote — extra stitch', 'draft', { partner: 'Canvas tote', owner: 'He Gong', notes: 'Add a second handle stitch. Not applied.' }),
    row('Notebook — lighter cover', 'done', { partner: 'Field notebook', owner: 'He Gong', notes: 'Cover weight updated in March.', recordDate: day('2026-03-02') }),
  ]),
]
