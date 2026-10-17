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

function settings(
  module: string,
  titleEn: string,
  titleZh: string,
  leadEn: string,
  leadZh: string,
  fields: { key: string; labelEn: string; labelZh: string; value: string }[],
): DeskScreen {
  return { module, screen: 'settings', kind: 'settings', kanban: false, states: [], titleEn, titleZh, leadEn, leadZh, rows: [], settings: fields }
}

export const priorityScreens: DeskScreen[] = [
  report('hr', 'dashboard', 'HR dashboard', '人事看板', 'Headcount, open jobs, and leave still waiting on a decision.', '人数、在招职位，以及还没批的请假。', [
    { name: 'Headcount', state: 'active', bucket: 'People', amount: 10, recordDate: day('2026-04-16') },
    { name: 'Open jobs', state: 'open', bucket: 'Hiring', amount: 2, recordDate: day('2026-04-16') },
    { name: 'Leave waiting', state: 'waiting', bucket: 'Leave', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Probation', state: 'probation', bucket: 'Contracts', amount: 1, recordDate: day('2026-04-16') },
  ]),
  list('hr', 'departments', 'Departments', '部门', 'Where people sit. The org chart uses these names.', '人员所在的部门。组织架构使用这些名称。', ['active'], [
    { name: 'Sales', state: 'active', owner: 'Jonah Ellis', notes: 'Quotations and customers.', recordDate: day('2026-01-01') },
    { name: 'Workshop', state: 'active', owner: 'He Gong', notes: 'Cutting and sewing.', recordDate: day('2026-01-01') },
    { name: 'Shop', state: 'active', owner: 'Lin Xiao', notes: 'The counter and the storefront.', recordDate: day('2026-01-01') },
    { name: 'Office', state: 'active', owner: 'August', notes: 'Books, payroll, and hiring.', recordDate: day('2026-01-01') },
  ], false),
  list('hr', 'designations', 'Designations', '职位', 'Job titles on the roster and on a contract.', '花名册和合同上的职务。', ['active'], [
    { name: 'General manager', state: 'active', bucket: 'Office', notes: 'August.', recordDate: day('2026-01-01') },
    { name: 'Sales lead', state: 'active', bucket: 'Sales', notes: 'Jonah Ellis.', recordDate: day('2026-01-01') },
    { name: 'Cutter', state: 'active', bucket: 'Workshop', notes: 'He Gong.', recordDate: day('2026-01-01') },
    { name: 'Shop lead', state: 'active', bucket: 'Shop', notes: 'Lin Xiao.', recordDate: day('2026-01-01') },
    { name: 'Buyer', state: 'active', bucket: 'Sales', notes: 'Open. See the sewing job.', recordDate: day('2026-01-01') },
  ], false),
  list('hr', 'org', 'Org chart', '组织架构', 'Each column is a department. The partner is who they report to.', '每一列是一个部门。伙伴栏是汇报对象。', ['dept_sales', 'dept_workshop', 'dept_shop', 'dept_office'], [
    { name: 'August', state: 'dept_office', partner: '—', owner: 'General manager', notes: 'Runs Jiangbei Goods Co.', recordDate: day('2024-01-01') },
    { name: 'Jonah Ellis', state: 'dept_sales', partner: 'August', owner: 'Sales lead', notes: 'Pipeline and quotations.', recordDate: day('2024-03-01') },
    { name: 'Zhou Ning', state: 'dept_sales', partner: 'Jonah Ellis', owner: 'Sales', notes: 'School and office accounts.', recordDate: day('2025-02-01') },
    { name: 'He Gong', state: 'dept_workshop', partner: 'August', owner: 'Cutter', notes: 'Shop floor.', recordDate: day('2023-06-01') },
    { name: 'Lin Xiao', state: 'dept_shop', partner: 'August', owner: 'Shop lead', notes: 'Counter and shop orders.', recordDate: day('2024-08-01') },
  ]),
  list('hr', 'contracts', 'Contracts', '合同', 'The paper a person is employed under. Nothing is filed with a labour bureau.', '员工的用工合同。不会提交给劳动部门。', ['draft', 'probation', 'active', 'done'], [
    { name: 'August · open term', state: 'active', partner: 'August', owner: 'Office', bucket: 'Full time', amount: 18000, notes: 'Monthly gross. Started January 2024.', recordDate: day('2024-01-01') },
    { name: 'Zhou Ning · 2025', state: 'probation', partner: 'Zhou Ning', owner: 'Sales', bucket: 'Full time', amount: 9000, notes: 'Probation ends 31 May 2026.', recordDate: day('2026-02-01') },
    { name: 'He Gong · 2023', state: 'active', partner: 'He Gong', owner: 'Workshop', bucket: 'Full time', amount: 11000, notes: 'Renewed last June.', recordDate: day('2025-06-01') },
    { name: 'Summer intern draft', state: 'draft', partner: '—', owner: 'Shop', bucket: 'Fixed term', amount: 4000, notes: 'Not signed. For the May shop rush.', recordDate: day('2026-04-16') },
  ]),
  list('hr', 'jobs', 'Jobs', '招聘职位', 'Roles the company is hiring for.', '公司正在招聘的岗位。', ['open', 'done', 'archived'], [
    { name: 'Sewing machinist', state: 'open', partner: 'Workshop', owner: 'He Gong', amount: 1, notes: 'One seat. Day shift.', recordDate: day('2026-04-02') },
    { name: 'Wholesale buyer', state: 'open', partner: 'Sales', owner: 'Jonah Ellis', amount: 1, notes: 'Harbour and school accounts.', recordDate: day('2026-04-08') },
    { name: 'Shop Saturday cover', state: 'done', partner: 'Shop', owner: 'Lin Xiao', amount: 1, notes: 'Filled in March.', recordDate: day('2026-03-01') },
  ]),
  list('hr', 'applicants', 'Applicants', '应聘者', 'The hiring pipeline, from a new CV to a signed contract.', '招聘管道，从新简历到签合同。', ['open', 'screening', 'interview', 'offer', 'hired', 'refused'], [
    { name: 'Chen Wei', state: 'interview', partner: 'Sewing machinist', owner: 'He Gong', notes: 'Shop-floor trial on 21 April.', recordDate: day('2026-04-14') },
    { name: 'Priya Nair', state: 'offer', partner: 'Wholesale buyer', owner: 'Jonah Ellis', amount: 12000, notes: 'Offer sent. Waiting on a reply.', recordDate: day('2026-04-15') },
    { name: 'Sam Ortiz', state: 'screening', partner: 'Sewing machinist', owner: 'August', notes: 'CV in. Not called yet.', recordDate: day('2026-04-16') },
    { name: 'Lin Qiao', state: 'hired', partner: 'Shop Saturday cover', owner: 'Lin Xiao', notes: 'Started 1 March.', recordDate: day('2026-03-01') },
    { name: 'Unknown agency', state: 'refused', partner: 'Wholesale buyer', owner: 'Jonah Ellis', notes: 'No textile experience.', recordDate: day('2026-04-06') },
    { name: 'New CV · dye lab', state: 'open', partner: 'Sewing machinist', owner: 'He Gong', notes: 'Arrived this morning.', recordDate: day('2026-04-16') },
  ]),
  list('hr', 'onboarding', 'Onboarding', '入职', 'What a new hire still has to finish.', '新员工还要完成的事项。', ['planned', 'progress', 'done'], [
    { name: 'Priya Nair · desk and email', state: 'planned', partner: 'Priya Nair', owner: 'August', notes: 'Starts when the offer is accepted.', recordDate: day('2026-04-20') },
    { name: 'Lin Qiao · shop keys', state: 'progress', partner: 'Lin Qiao', owner: 'Lin Xiao', notes: 'Till training done. Keys not issued.', recordDate: day('2026-03-04') },
    { name: 'Zhou Ning · sales kit', state: 'done', partner: 'Zhou Ning', owner: 'Jonah Ellis', notes: 'Price list and customer list handed over.', recordDate: day('2026-02-08') },
  ]),
  list('hr', 'appraisals', 'Appraisals', '考核', 'A review of the last quarter. Nothing is sent to a payroll bureau.', '上一季度的考核。不会提交给工资部门。', ['draft', 'submitted', 'done'], [
    { name: 'Jonah Ellis · Q1', state: 'done', partner: 'Jonah Ellis', owner: 'August', amount: 4, notes: 'Score out of 5. Pipeline held.', recordDate: day('2026-04-02') },
    { name: 'He Gong · Q1', state: 'submitted', partner: 'He Gong', owner: 'August', amount: 5, notes: 'Waiting on August’s sign-off.', recordDate: day('2026-04-10') },
    { name: 'Lin Xiao · Q1', state: 'draft', partner: 'Lin Xiao', owner: 'August', amount: 0, notes: 'Not started.', recordDate: day('2026-04-16') },
  ], false),
  list('hr', 'leave-types', 'Leave types', '假期类型', 'What a person can ask for.', '可以申请的假。', ['active'], [
    { name: 'Annual', state: 'active', amount: 10, notes: 'Days a year.', recordDate: day('2026-01-01') },
    { name: 'Sick', state: 'active', amount: 5, notes: 'A note is enough for one day.', recordDate: day('2026-01-01') },
    { name: 'Personal', state: 'active', amount: 2, notes: 'Needs cover on the shop floor.', recordDate: day('2026-01-01') },
  ], false),
  list('hr', 'approvals', 'Leave approvals', '请假审批', 'Requests still on someone’s desk, and the ones already decided this month.', '还在某人桌上的申请，以及本月已决定的。', ['waiting', 'approved', 'refused'], [
    { name: 'Zhou Ning · sick · 20 Apr', state: 'waiting', partner: 'Zhou Ning', owner: 'Jonah Ellis', bucket: 'Sick', amount: 1, notes: 'One day. Jonah has not answered.', recordDate: day('2026-04-20') },
    { name: 'He Gong · annual · 1–3 May', state: 'approved', partner: 'He Gong', owner: 'August', bucket: 'Annual', amount: 3, notes: 'Workshop cover is arranged.', recordDate: day('2026-05-01') },
    { name: 'Lin Xiao · personal · 28 Mar', state: 'refused', partner: 'Lin Xiao', owner: 'August', bucket: 'Personal', amount: 1, notes: 'Saturday shop had no cover.', recordDate: day('2026-03-28') },
  ]),
  report('hr', 'recruitment-report', 'Hiring report', '招聘报表', 'Applicants by stage.', '按阶段的应聘者。', [
    { name: 'New', state: 'open', bucket: 'New', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Screening', state: 'screening', bucket: 'Screening', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Interview', state: 'interview', bucket: 'Interview', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Offer', state: 'offer', bucket: 'Offer', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Hired', state: 'hired', bucket: 'Hired', amount: 1, recordDate: day('2026-04-16') },
  ]),
  report('hr', 'leave-report', 'Leave report', '请假报表', 'Days asked for this quarter, by type.', '本季度申请的天数，按类型。', [
    { name: 'Annual', state: 'approved', bucket: 'Annual', amount: 3, recordDate: day('2026-04-16') },
    { name: 'Sick', state: 'waiting', bucket: 'Sick', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Personal', state: 'refused', bucket: 'Personal', amount: 1, recordDate: day('2026-04-16') },
  ]),

  report('attendance', 'dashboard', 'Attendance dashboard', '考勤看板', 'Who is in, who is late, and overtime still to approve.', '谁到了、谁迟到，以及待批的加班。', [
    { name: 'Present today', state: 'present', bucket: 'Present', amount: 7, recordDate: day('2026-04-16') },
    { name: 'Late today', state: 'late', bucket: 'Late', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Absent today', state: 'absent', bucket: 'Absent', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Overtime hours', state: 'overtime', bucket: 'Overtime', amount: 6, recordDate: day('2026-04-16') },
  ]),
  list('attendance', 'check-in', 'Check-in', '打卡', 'A day on the clock. Notes hold the in and out times.', '一天的打卡。备注里是上下班时间。', ['present', 'late', 'absent'], [
    { name: 'August · 16 Apr', state: 'present', partner: 'August', owner: 'Office', bucket: 'Morning', notes: 'In 08:52, out 18:05.', recordDate: day('2026-04-16') },
    { name: 'Jonah Ellis · 16 Apr', state: 'present', partner: 'Jonah Ellis', owner: 'Sales', bucket: 'Morning', notes: 'In 09:01, out 17:40.', recordDate: day('2026-04-16') },
    { name: 'Lin Xiao · 16 Apr', state: 'late', partner: 'Lin Xiao', owner: 'Shop', bucket: 'Shop', notes: 'In 10:22. Shop opens at 10:00.', recordDate: day('2026-04-16') },
    { name: 'Zhou Ning · 16 Apr', state: 'absent', partner: 'Zhou Ning', owner: 'Sales', bucket: 'Morning', notes: 'Sick day, still waiting on approval.', recordDate: day('2026-04-16') },
    { name: 'He Gong · 15 Apr', state: 'present', partner: 'He Gong', owner: 'Workshop', bucket: 'Workshop', notes: 'In 07:28, out 16:40.', recordDate: day('2026-04-15') },
    { name: 'Amira Shah · 16 Apr', state: 'present', partner: 'Amira Shah', owner: 'Office', bucket: 'Morning', notes: 'Harbour desk. In 09:05, out 17:30.', recordDate: day('2026-04-16') },
  ], false),
  list('attendance', 'shifts', 'Shifts', '班次', 'The clocks people are meant to keep.', '应遵守的上下班时间。', ['active'], [
    { name: 'Morning', state: 'active', bucket: 'Office', notes: '08:00–17:00. Late after 08:10.', recordDate: day('2026-01-01') },
    { name: 'Shop', state: 'active', bucket: 'Shop', notes: '10:00–19:00. Late after 10:05.', recordDate: day('2026-01-01') },
    { name: 'Workshop', state: 'active', bucket: 'Workshop', notes: '07:30–16:30.', recordDate: day('2026-01-01') },
  ], false),
  list('attendance', 'rosters', 'Rosters', '排班', 'Who is on which shift this week.', '本周谁上哪个班。', ['draft', 'confirmed'], [
    { name: 'Week of 13 Apr · Morning', state: 'confirmed', partner: 'August, Jonah Ellis, Zhou Ning', owner: 'Office', bucket: 'Morning', notes: 'Zhou Ning out on the 16th if leave is approved.', recordDate: day('2026-04-13') },
    { name: 'Week of 13 Apr · Shop', state: 'confirmed', partner: 'Lin Xiao, Lin Qiao', owner: 'Shop', bucket: 'Shop', notes: 'Saturday is Lin Qiao.', recordDate: day('2026-04-13') },
    { name: 'Week of 20 Apr · Workshop', state: 'draft', partner: 'He Gong', owner: 'Workshop', bucket: 'Workshop', notes: 'Not published. He Gong is off 1–3 May.', recordDate: day('2026-04-20') },
  ], false),
  list('attendance', 'sheet', 'Monthly sheet', '月度考勤表', 'April, one row per person. The amount is days present.', '四月，每人一行。金额是出勤天数。', ['present', 'late', 'absent'], [
    { name: 'August · April', state: 'present', partner: 'August', owner: 'Office', bucket: 'April', amount: 12, notes: 'No absence.', recordDate: day('2026-04-16') },
    { name: 'Jonah Ellis · April', state: 'present', partner: 'Jonah Ellis', owner: 'Sales', bucket: 'April', amount: 12, notes: 'No absence.', recordDate: day('2026-04-16') },
    { name: 'Lin Xiao · April', state: 'late', partner: 'Lin Xiao', owner: 'Shop', bucket: 'April', amount: 11, notes: 'Late on the 15th and the 16th.', recordDate: day('2026-04-16') },
    { name: 'Zhou Ning · April', state: 'absent', partner: 'Zhou Ning', owner: 'Sales', bucket: 'April', amount: 10, notes: 'One sick day still open.', recordDate: day('2026-04-16') },
    { name: 'He Gong · April', state: 'present', partner: 'He Gong', owner: 'Workshop', bucket: 'April', amount: 12, notes: 'Overtime on the 14th.', recordDate: day('2026-04-16') },
    { name: 'Amira Shah · April', state: 'present', partner: 'Amira Shah', owner: 'Office', bucket: 'April', amount: 12, notes: 'Harbour desk. No absence.', recordDate: day('2026-04-16') },
    { name: 'Jordan Hale · April', state: 'present', partner: 'Jordan Hale', owner: 'Office', bucket: 'April', amount: 11, notes: 'Hudson desk. One remote day.', recordDate: day('2026-04-16') },
  ], false),
  list('attendance', 'late', 'Late', '迟到', 'Arrivals after the shift grace.', '超过宽限时间的到岗。', ['late'], [
    { name: 'Lin Xiao · 16 Apr', state: 'late', partner: 'Lin Xiao', owner: 'Shop', bucket: 'Shop', amount: 22, notes: '22 minutes. Shop opened late.', recordDate: day('2026-04-16') },
    { name: 'Lin Xiao · 15 Apr', state: 'late', partner: 'Lin Xiao', owner: 'Shop', bucket: 'Shop', amount: 20, notes: '20 minutes.', recordDate: day('2026-04-15') },
    { name: 'Sam Ortiz · 10 Apr', state: 'late', partner: 'Sam Ortiz', owner: 'Shop', bucket: 'Shop', amount: 15, notes: 'Hudson shop. Train delay.', recordDate: day('2026-04-10') },
  ], false),
  list('attendance', 'absent', 'Absent', '缺勤', 'A shift with no check-in and no approved leave.', '没有打卡、也没有已批假期的班次。', ['absent', 'approved'], [
    { name: 'Zhou Ning · 16 Apr', state: 'absent', partner: 'Zhou Ning', owner: 'Sales', bucket: 'Sick', notes: 'Leave request is still waiting.', recordDate: day('2026-04-16') },
    { name: 'He Gong · 2 May', state: 'approved', partner: 'He Gong', owner: 'Workshop', bucket: 'Annual', notes: 'Approved annual leave. Not an absence.', recordDate: day('2026-05-02') },
  ], false),
  list('attendance', 'overtime', 'Overtime', '加班', 'Hours past the shift. An admin approves them before payroll.', '超出班次的小时。管理员批准后才进入工资。', ['draft', 'approved', 'refused'], [
    { name: 'He Gong · 14 Apr', state: 'approved', partner: 'He Gong', owner: 'Workshop', bucket: 'Workshop', amount: 2, notes: 'Two hours on the spring tote cut.', recordDate: day('2026-04-14') },
    { name: 'Lin Qiao · 11 Apr', state: 'draft', partner: 'Lin Qiao', owner: 'Shop', bucket: 'Shop', amount: 3, notes: 'Saturday close. Not approved.', recordDate: day('2026-04-11') },
    { name: 'Jonah Ellis · 9 Apr', state: 'refused', partner: 'Jonah Ellis', owner: 'Sales', bucket: 'Morning', amount: 1, notes: 'A late email is not overtime.', recordDate: day('2026-04-09') },
  ]),
  list('attendance', 'calendar', 'Leave calendar', '假期日历', 'Approved leave on the days it falls. Open a row to see who is out.', '落在具体日期上的已批假期。打开一行可看谁不在。', ['approved', 'waiting'], [
    { name: '1 May · He Gong', state: 'approved', partner: 'He Gong', owner: 'Workshop', bucket: 'Annual', notes: 'First day of three.', recordDate: day('2026-05-01') },
    { name: '2 May · He Gong', state: 'approved', partner: 'He Gong', owner: 'Workshop', bucket: 'Annual', notes: 'Workshop closed to his bench.', recordDate: day('2026-05-02') },
    { name: '3 May · He Gong', state: 'approved', partner: 'He Gong', owner: 'Workshop', bucket: 'Annual', notes: 'Back on 4 May.', recordDate: day('2026-05-03') },
    { name: '20 Apr · Zhou Ning', state: 'waiting', partner: 'Zhou Ning', owner: 'Sales', bucket: 'Sick', notes: 'On the calendar only if Jonah approves it.', recordDate: day('2026-04-20') },
  ], false),
  report('attendance', 'rate', 'Attendance rate', '出勤率', 'Days present in April, by department.', '四月的出勤天数，按部门。', [
    { name: 'Office', state: 'present', bucket: 'Office', amount: 23, recordDate: day('2026-04-16') },
    { name: 'Sales', state: 'present', bucket: 'Sales', amount: 22, recordDate: day('2026-04-16') },
    { name: 'Workshop', state: 'present', bucket: 'Workshop', amount: 12, recordDate: day('2026-04-16') },
    { name: 'Shop', state: 'late', bucket: 'Shop', amount: 11, recordDate: day('2026-04-16') },
  ]),
  report('attendance', 'late-report', 'Late report', '迟到报表', 'Minutes late in April, by person.', '四月的迟到分钟，按人。', [
    { name: 'Lin Xiao', state: 'late', bucket: 'Lin Xiao', amount: 42, recordDate: day('2026-04-16') },
    { name: 'Sam Ortiz', state: 'late', bucket: 'Sam Ortiz', amount: 15, recordDate: day('2026-04-16') },
  ]),
  report('attendance', 'overtime-report', 'Overtime report', '加班报表', 'Overtime hours in April, by department.', '四月的加班小时，按部门。', [
    { name: 'Workshop', state: 'approved', bucket: 'Workshop', amount: 2, recordDate: day('2026-04-16') },
    { name: 'Shop', state: 'draft', bucket: 'Shop', amount: 3, recordDate: day('2026-04-16') },
    { name: 'Sales', state: 'refused', bucket: 'Sales', amount: 1, recordDate: day('2026-04-16') },
  ]),
  settings('attendance', 'Attendance settings', '考勤设置', 'When a day counts as late.', '何时算迟到。', [
    { key: 'grace', labelEn: 'Grace minutes', labelZh: '宽限分钟', value: '10' },
    { key: 'overtime', labelEn: 'Overtime needs approval', labelZh: '加班需要审批', value: 'Yes' },
  ]),

  report('accounting', 'dashboard', 'Finance dashboard', '财务看板', 'Cash, what customers still owe, and bills not yet paid.', '现金、客户未付，以及未付的账单。', [
    { name: 'Cash and bank', state: 'posted', bucket: 'Cash', amount: 84200, recordDate: day('2026-04-16') },
    { name: 'Receivable', state: 'open', bucket: 'Receivable', amount: 6400, recordDate: day('2026-04-16') },
    { name: 'Payable', state: 'open', bucket: 'Payable', amount: 2100, recordDate: day('2026-04-16') },
    { name: 'Budget left', state: 'active', bucket: 'Budget', amount: 12800, recordDate: day('2026-04-16') },
  ]),
  list('accounting', 'bank', 'Bank and cash', '银行和现金', 'Where money sits. Balances are a sample, not a bank feed.', '钱放在哪里。余额是示例，不是银行流水。', ['posted'], [
    { name: 'Operating account', state: 'posted', partner: 'City bank', owner: 'August', bucket: 'Bank', amount: 76400, notes: 'Main receipts and supplier payments.', recordDate: day('2026-04-16') },
    { name: 'Petty cash', state: 'posted', partner: 'Shop till', owner: 'Lin Xiao', bucket: 'Cash', amount: 380, notes: 'Counted on the 16th.', recordDate: day('2026-04-16') },
    { name: 'Harbour current', state: 'posted', partner: 'High street bank', owner: 'Amira Shah', bucket: 'Bank', amount: 6120, notes: 'Harbour & Line.', recordDate: day('2026-04-16') },
    { name: 'Hudson checking', state: 'posted', partner: 'Borough bank', owner: 'Jordan Hale', bucket: 'Bank', amount: 1300, notes: 'Hudson Yard Goods.', recordDate: day('2026-04-16') },
  ], false),
  list('accounting', 'budgets', 'Budgets', '预算', 'What the quarter was allowed to spend, and what it has used.', '本季度允许花的，以及已经花的。', ['active', 'done'], [
    { name: 'Sales travel · Q2', state: 'active', partner: 'Sales', owner: 'Jonah Ellis', bucket: 'Sales', amount: 4000, notes: 'Used 860.', recordDate: day('2026-04-01') },
    { name: 'Workshop cloth · Q2', state: 'active', partner: 'Workshop', owner: 'He Gong', bucket: 'Workshop', amount: 18000, notes: 'Used 6400 on the spring tote.', recordDate: day('2026-04-01') },
    { name: 'Shop rent · Q2', state: 'active', partner: 'Shop', owner: 'Lin Xiao', bucket: 'Shop', amount: 9000, notes: 'April paid. May and June open.', recordDate: day('2026-04-01') },
    { name: 'Q1 marketing', state: 'done', partner: 'Sales', owner: 'August', bucket: 'Sales', amount: 1500, notes: 'Closed under budget.', recordDate: day('2026-03-31') },
  ], false),
  list('accounting', 'cost-centres', 'Cost centres', '成本中心', 'Where a cost is charged. Expenses and bills can name one.', '费用记在哪里。报销和账单可以指定。', ['active'], [
    { name: 'Sales', state: 'active', owner: 'Jonah Ellis', notes: 'Travel, samples, customer meals.', recordDate: day('2026-01-01') },
    { name: 'Workshop', state: 'active', owner: 'He Gong', notes: 'Cloth, dye, machine time.', recordDate: day('2026-01-01') },
    { name: 'Shop', state: 'active', owner: 'Lin Xiao', notes: 'Rent, till, packaging.', recordDate: day('2026-01-01') },
    { name: 'Office', state: 'active', owner: 'August', notes: 'Payroll and the books.', recordDate: day('2026-01-01') },
  ], false),
  report('accounting', 'cash-flow', 'Cash flow', '现金流量', 'A sample of the quarter. Nothing is filed.', '本季度的示例。不会申报。', [
    { name: 'Collections', state: 'posted', bucket: 'Operating', amount: 28600, recordDate: day('2026-04-16') },
    { name: 'Suppliers and wages', state: 'posted', bucket: 'Operating', amount: -19400, recordDate: day('2026-04-16') },
    { name: 'Loom deposit', state: 'posted', bucket: 'Investing', amount: -2000, recordDate: day('2026-04-16') },
    { name: 'Owner draw', state: 'posted', bucket: 'Financing', amount: -1500, recordDate: day('2026-04-16') },
  ]),

  report('purchase', 'dashboard', 'Procurement dashboard', '采购看板', 'Requisitions, quotes, orders waiting for a yes, and bills still to match.', '请购、报价、待批的订单，以及尚未匹配的账单。', [
    { name: 'Requisitions open', state: 'submitted', bucket: 'Requisitions', amount: 2, recordDate: day('2026-04-16') },
    { name: 'Quotes to compare', state: 'open', bucket: 'Quotes', amount: 3, recordDate: day('2026-04-16') },
    { name: 'Orders to approve', state: 'waiting', bucket: 'Approvals', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Bills to match', state: 'draft', bucket: 'Bills', amount: 1, recordDate: day('2026-04-16') },
  ]),
  list('purchase', 'requisitions', 'Requisitions', '请购单', 'Someone asking to buy. An approver turns it into an order.', '有人申请采购。审批人把它变成订单。', ['draft', 'submitted', 'approved', 'refused', 'done'], [
    { name: 'RQ1044 canvas', state: 'approved', partner: 'He Gong', owner: 'August', bucket: 'Workshop', amount: 2400, notes: '200 metres for the spring tote. Approved 14 Apr.', recordDate: day('2026-04-12') },
    { name: 'RQ1046 dye lot', state: 'submitted', partner: 'Jonah Ellis', owner: 'August', bucket: 'Workshop', amount: 860, notes: 'Waiting on August.', recordDate: day('2026-04-15') },
    { name: 'RQ1047 shop bags', state: 'draft', partner: 'Lin Xiao', owner: 'Lin Xiao', bucket: 'Shop', amount: 120, notes: 'Not sent.', recordDate: day('2026-04-16') },
    { name: 'RQ1038 van tyres', state: 'refused', partner: 'Lin Xiao', owner: 'August', bucket: 'Shop', amount: 400, notes: 'Use the existing set.', recordDate: day('2026-03-22') },
    { name: 'RQ1031 buttons', state: 'done', partner: 'He Gong', owner: 'August', bucket: 'Workshop', amount: 90, notes: 'Became PO1041.', recordDate: day('2026-03-02') },
  ]),
  list('purchase', 'comparison', 'Quotation comparison', '报价比较', 'The same ask, priced by more than one vendor. Award one.', '同一需求，多家供应商报价。选定一家。', ['open', 'awarded', 'refused'], [
    { name: 'Harbour Dye · indigo', state: 'awarded', partner: 'Harbour Dye', owner: 'Jonah Ellis', bucket: 'Dye lot', amount: 860, notes: 'Lowest, and they held the shade last season.', recordDate: day('2026-04-14') },
    { name: 'Mill North · indigo', state: 'refused', partner: 'Mill North', owner: 'Jonah Ellis', bucket: 'Dye lot', amount: 940, notes: 'Higher, longer lead time.', recordDate: day('2026-04-14') },
    { name: 'Paper & Pine · bags', state: 'open', partner: 'Paper & Pine', owner: 'Lin Xiao', bucket: 'Shop bags', amount: 120, notes: 'One quote so far.', recordDate: day('2026-04-16') },
    { name: 'Field Office · canvas', state: 'open', partner: 'Field Office', owner: 'He Gong', bucket: 'Canvas', amount: 2500, notes: 'Against Harbour Cloth at 2400.', recordDate: day('2026-04-13') },
    { name: 'Harbour Cloth · canvas', state: 'awarded', partner: 'Harbour Cloth', owner: 'He Gong', bucket: 'Canvas', amount: 2400, notes: 'Awarded with RQ1044.', recordDate: day('2026-04-14') },
  ]),
  list('purchase', 'approvals', 'Approvals', '审批', 'Requisitions and orders sitting with an approver.', '停在审批人那里的请购和订单。', ['waiting', 'approved', 'refused'], [
    { name: 'RQ1046 dye lot', state: 'waiting', partner: 'Jonah Ellis', owner: 'August', bucket: 'Requisition', amount: 860, notes: 'Submitted yesterday.', recordDate: day('2026-04-15') },
    { name: 'PO1048 shop bags', state: 'waiting', partner: 'Lin Xiao', owner: 'August', bucket: 'Order', amount: 120, notes: 'Draft order, not confirmed.', recordDate: day('2026-04-16') },
    { name: 'RQ1044 canvas', state: 'approved', partner: 'He Gong', owner: 'August', bucket: 'Requisition', amount: 2400, notes: 'Approved. Order placed.', recordDate: day('2026-04-14') },
  ]),
  list('purchase', 'receipts', 'Goods receipt', '收货', 'What arrived against a purchase order.', '对照采购订单到达的货物。', ['draft', 'received', 'done'], [
    { name: 'GR105 canvas', state: 'received', partner: 'Harbour Cloth', owner: 'He Gong', bucket: 'PO1044', amount: 200, notes: '200 metres. Counted on the 16th.', recordDate: day('2026-04-16') },
    { name: 'GR102 buttons', state: 'done', partner: 'Mill North', owner: 'He Gong', bucket: 'PO1041', amount: 500, notes: 'Put away in March.', recordDate: day('2026-03-18') },
    { name: 'GR106 dye', state: 'draft', partner: 'Harbour Dye', owner: 'Jonah Ellis', bucket: 'RQ1046', amount: 0, notes: 'Not ordered yet. The requisition is still waiting.', recordDate: day('2026-04-16') },
  ], false),
  list('purchase', 'bills', 'Vendor bills', '供应商账单', 'Bills to match to a receipt. The books still live in Finance.', '要和收货匹配的账单。账仍在财务里。', ['draft', 'posted', 'paid'], [
    { name: 'BILL Harbour Cloth', state: 'posted', partner: 'Harbour Cloth', owner: 'August', bucket: 'GR105', amount: 2400, notes: 'Matched to the canvas receipt.', recordDate: day('2026-04-16') },
    { name: 'BILL Mill North', state: 'paid', partner: 'Mill North', owner: 'August', bucket: 'GR102', amount: 90, notes: 'Paid in March.', recordDate: day('2026-03-20') },
    { name: 'BILL Paper & Pine', state: 'draft', partner: 'Paper & Pine', owner: 'Lin Xiao', bucket: 'Shop bags', amount: 120, notes: 'No receipt yet.', recordDate: day('2026-04-16') },
  ], false),
  list('purchase', 'evaluation', 'Vendor evaluation', '供应商评估', 'A score out of 5 for the vendors you keep buying from.', '继续采购的供应商，5 分制。', ['active'], [
    { name: 'Harbour Cloth', state: 'active', partner: 'Harbour Cloth', owner: 'He Gong', bucket: 'Cloth', amount: 5, notes: 'On time. Shade holds.', recordDate: day('2026-04-16') },
    { name: 'Harbour Dye', state: 'active', partner: 'Harbour Dye', owner: 'Jonah Ellis', bucket: 'Dye', amount: 4, notes: 'Good price. One late lot last year.', recordDate: day('2026-04-16') },
    { name: 'Mill North', state: 'active', partner: 'Mill North', owner: 'He Gong', bucket: 'Notions', amount: 3, notes: 'Buttons were short by a box in March.', recordDate: day('2026-04-16') },
    { name: 'Paper & Pine', state: 'active', partner: 'Paper & Pine', owner: 'Lin Xiao', bucket: 'Packaging', amount: 4, notes: 'Fine for shop bags.', recordDate: day('2026-04-16') },
  ], false),
  report('purchase', 'spend', 'Spend by vendor', '供应商支出', 'What has been ordered this quarter.', '本季度已下单的金额。', [
    { name: 'Harbour Cloth', state: 'done', bucket: 'Harbour Cloth', amount: 2400, recordDate: day('2026-04-16') },
    { name: 'Harbour Dye', state: 'open', bucket: 'Harbour Dye', amount: 860, recordDate: day('2026-04-16') },
    { name: 'Mill North', state: 'paid', bucket: 'Mill North', amount: 90, recordDate: day('2026-04-16') },
    { name: 'Paper & Pine', state: 'draft', bucket: 'Paper & Pine', amount: 120, recordDate: day('2026-04-16') },
  ]),
  report('purchase', 'cycle', 'Requisition cycle', '请购周期', 'How many asks are at each step.', '每个步骤上有多少申请。', [
    { name: 'Draft', state: 'draft', bucket: 'Draft', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Waiting', state: 'submitted', bucket: 'Waiting', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Approved', state: 'approved', bucket: 'Approved', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Ordered', state: 'done', bucket: 'Ordered', amount: 1, recordDate: day('2026-04-16') },
    { name: 'Refused', state: 'refused', bucket: 'Refused', amount: 1, recordDate: day('2026-04-16') },
  ]),

  report('wastage', 'dashboard', 'Wastage dashboard', '损耗看板', 'Cost still waiting for a yes, and what was approved this month.', '还在等批准的成本，以及本月已批的。', [
    { name: 'Waiting', state: 'submitted', bucket: 'Waiting', amount: 46, recordDate: day('2026-04-16') },
    { name: 'Approved', state: 'approved', bucket: 'Approved', amount: 128, recordDate: day('2026-04-16') },
    { name: 'Refused', state: 'refused', bucket: 'Refused', amount: 12, recordDate: day('2026-04-16') },
  ]),
  list('wastage', 'records', 'Wastage', '损耗', 'Cloth, dye, and finished goods written off. Quantity is in the notes, cost is the amount.', '核销的布、染料和成品。备注里是数量，金额是成本。', ['draft', 'submitted', 'approved', 'refused'], [
    { name: 'WS110 canvas offcut', state: 'approved', partner: 'Inventory', owner: 'He Gong', bucket: 'Cutting waste', amount: 86, notes: '18 metres. Spring tote cut.', recordDate: day('2026-04-14') },
    { name: 'WS111 dye spill', state: 'submitted', partner: 'Inventory', owner: 'Jonah Ellis', bucket: 'Spillage', amount: 46, notes: '2 litres of indigo. Waiting on August.', recordDate: day('2026-04-16') },
    { name: 'WS108 failed totes', state: 'approved', partner: 'Manufacturing', owner: 'He Gong', bucket: 'Quality fail', amount: 42, notes: '6 totes. Seam opened. MO spring run.', recordDate: day('2026-04-11') },
    { name: 'WS109 shop sample', state: 'refused', partner: 'Inventory', owner: 'Lin Xiao', bucket: 'Shop use', amount: 12, notes: 'Refused. A sample is not wastage.', recordDate: day('2026-04-09') },
    { name: 'WS112 end of roll', state: 'draft', partner: 'Manufacturing', owner: 'He Gong', bucket: 'End of roll', amount: 15, notes: '4 metres. Not submitted.', recordDate: day('2026-04-16') },
  ]),
  list('wastage', 'inventory', 'From inventory', '库存损耗', 'Written off the shelf, before it reaches a manufacturing order.', '在进入生产订单之前，从货架上核销。', ['draft', 'submitted', 'approved', 'refused'], [
    { name: 'WS110 canvas offcut', state: 'approved', partner: 'Greige canvas', owner: 'He Gong', bucket: 'Cutting waste', amount: 86, notes: '18 metres.', recordDate: day('2026-04-14') },
    { name: 'WS111 dye spill', state: 'submitted', partner: 'Indigo dye', owner: 'Jonah Ellis', bucket: 'Spillage', amount: 46, notes: '2 litres.', recordDate: day('2026-04-16') },
    { name: 'WS109 shop sample', state: 'refused', partner: 'Tote sample', owner: 'Lin Xiao', bucket: 'Shop use', amount: 12, notes: 'Not wastage.', recordDate: day('2026-04-09') },
  ]),
  list('wastage', 'manufacturing', 'From manufacturing', '生产损耗', 'Lost on a manufacturing order.', '生产订单上损失的。', ['draft', 'submitted', 'approved'], [
    { name: 'WS108 failed totes', state: 'approved', partner: 'Spring tote run', owner: 'He Gong', bucket: 'Quality fail', amount: 42, notes: '6 pieces. MO spring run.', recordDate: day('2026-04-11') },
    { name: 'WS107 thread break', state: 'approved', partner: 'Spring tote run', owner: 'He Gong', bucket: 'Machine', amount: 8, notes: 'One cone. Loom 02.', recordDate: day('2026-04-08') },
    { name: 'WS112 end of roll', state: 'draft', partner: 'Spring tote run', owner: 'He Gong', bucket: 'End of roll', amount: 15, notes: '4 metres left on the roll.', recordDate: day('2026-04-16') },
  ]),
  report('wastage', 'by-product', 'Wastage by product', '按产品的损耗', 'Cost written off, by what was lost.', '核销成本，按损失的东西。', [
    { name: 'Greige canvas', state: 'approved', bucket: 'Greige canvas', amount: 101, recordDate: day('2026-04-16') },
    { name: 'Indigo dye', state: 'submitted', bucket: 'Indigo dye', amount: 46, recordDate: day('2026-04-16') },
    { name: 'Finished tote', state: 'approved', bucket: 'Finished tote', amount: 42, recordDate: day('2026-04-16') },
    { name: 'Thread', state: 'approved', bucket: 'Thread', amount: 8, recordDate: day('2026-04-16') },
  ]),
  report('wastage', 'by-reason', 'Wastage by reason', '按原因的损耗', 'Cost written off, by why.', '核销成本，按原因。', [
    { name: 'Cutting waste', state: 'approved', bucket: 'Cutting waste', amount: 86, recordDate: day('2026-04-16') },
    { name: 'Spillage', state: 'submitted', bucket: 'Spillage', amount: 46, recordDate: day('2026-04-16') },
    { name: 'Quality fail', state: 'approved', bucket: 'Quality fail', amount: 42, recordDate: day('2026-04-16') },
    { name: 'End of roll', state: 'draft', bucket: 'End of roll', amount: 15, recordDate: day('2026-04-16') },
    { name: 'Machine', state: 'approved', bucket: 'Machine', amount: 8, recordDate: day('2026-04-16') },
  ]),
  report('wastage', 'by-period', 'Wastage by period', '按期间的损耗', 'Approved and waiting cost, by month.', '已批和待批的成本，按月。', [
    { name: 'February', state: 'approved', bucket: 'February', amount: 22, recordDate: day('2026-02-28') },
    { name: 'March', state: 'approved', bucket: 'March', amount: 40, recordDate: day('2026-03-31') },
    { name: 'April', state: 'submitted', bucket: 'April', amount: 174, recordDate: day('2026-04-16') },
  ]),
  settings('wastage', 'Wastage settings', '损耗设置', 'Who can approve a write-off.', '谁可以批准核销。', [
    { key: 'approver', labelEn: 'Approver', labelZh: '审批人', value: 'August' },
    { key: 'limit', labelEn: 'Approval limit', labelZh: '审批上限', value: '500' },
  ]),
  list('wastage', 'reasons', 'Reasons', '原因', 'Why stock or a job was written off.', '为什么核销库存或工单。', ['active'], [
    { name: 'Cutting waste', state: 'active', notes: 'Offcuts that cannot be resewn.', recordDate: day('2026-01-01') },
    { name: 'Spillage', state: 'active', notes: 'Dye or finish lost on the floor.', recordDate: day('2026-01-01') },
    { name: 'Quality fail', state: 'active', notes: 'Finished goods that will not sell.', recordDate: day('2026-01-01') },
    { name: 'End of roll', state: 'active', notes: 'Too short for the next marker.', recordDate: day('2026-01-01') },
    { name: 'Machine', state: 'active', notes: 'Thread or parts lost to a stoppage.', recordDate: day('2026-01-01') },
  ], false),
]
