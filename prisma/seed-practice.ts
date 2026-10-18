import type { PrismaClient } from '@prisma/client'
import { importMapped, createRule } from '../server/services/bank.ts'
import { sampleStatementCsv } from '../shared/sample-statement.ts'

const statementName = 'Jiangbei October statement'
const projectName = 'Shop fit-out'
const pointName = 'Linen receipt width'

export async function seedPracticeDesk(client: PrismaClient) {
  const admin = await client.user.findUnique({ where: { email: 'maya@northline.example' }, select: { companyId: true } })
  if (!admin) throw new Error('Jiangbei admin is missing.')
  const companyId = admin.companyId
  const company = await client.company.findUniqueOrThrow({ where: { id: companyId } })
  await client.employee.updateMany({
    where: { companyId, name: 'Zhou Ning' },
    data: { hourlyCost: 48, hourlyRate: 160 },
  })

  const linen = await client.product.upsert({
    where: { companyId_sku: { companyId, sku: 'QC-LINEN' } },
    update: {},
    create: {
      companyId,
      name: 'Inspection linen',
      sku: 'QC-LINEN',
      type: 'product',
      kind: 'raw',
      listPrice: 12,
      costPrice: 8,
      purchasable: true,
    },
  })
  const vendor = await client.contact.findFirst({ where: { companyId, name: 'Suhang Weaving' } })
  let point = await client.qualityPoint.findFirst({ where: { companyId, name: pointName } })
  if (!point) {
    point = await client.qualityPoint.create({
      data: {
        companyId,
        name: pointName,
        productId: linen.id,
        trigger: 'receipt',
        checkType: 'measure',
        minValue: 140,
        maxValue: 150,
      },
    })
  }
  const existingCheck = await client.qualityCheck.findFirst({ where: { companyId, pointId: point.id } })
  if (!existingCheck) {
    const quarantine = await client.stockLocation.create({ data: { companyId, name: 'Quarantine', type: 'quarantine' } })
    const check = await client.qualityCheck.create({
      data: {
        companyId,
        pointId: point.id,
        productId: linen.id,
        trigger: 'receipt',
        status: 'fail',
        measured: 132,
        quantity: 2,
        vendorId: vendor?.id,
        notes: 'Width came in under the tolerance.',
      },
    })
    await client.qualityAlert.create({
      data: {
        companyId,
        checkId: check.id,
        productId: linen.id,
        vendorId: vendor?.id,
        quantity: 2,
        heldFrom: 'none',
        value: 0,
        note: 'Held for review. No journal until the alert is resolved.',
      },
    })
    await client.stockQuant.create({ data: { productId: linen.id, locationId: quarantine.id, quantity: 2 } })
  }

  const project = await client.project.findFirst({ where: { companyId, name: projectName } })
  if (!project) {
    const partner = await client.contact.findFirst({ where: { companyId, name: 'Cedar & Co' } })
    const zhou = await client.employee.findFirst({ where: { companyId, name: 'Zhou Ning' } })
    if (!zhou) throw new Error('Zhou Ning is missing.')
    const created = await client.project.create({
      data: {
        companyId,
        name: projectName,
        partnerId: partner?.id,
        billingType: 'time',
        hourlyRate: 120,
        stages: {
          create: [
            { companyId, name: 'Prepare', sequence: 1 },
            { companyId, name: 'Build', sequence: 2 },
            { companyId, name: 'Review', sequence: 3 },
          ],
        },
      },
      include: { stages: true },
    })
    const prepare = created.stages.find((stage) => stage.name === 'Prepare')
    const build = created.stages.find((stage) => stage.name === 'Build')
    const review = created.stages.find((stage) => stage.name === 'Review')
    if (!prepare || !build || !review) throw new Error('Project stages were not created.')
    const measure = await client.projectTask.create({
      data: {
        companyId,
        projectId: created.id,
        stageId: prepare.id,
        name: 'Measure the shop floor',
        assigneeId: zhou.id,
        startDate: new Date('2026-10-06'),
        endDate: new Date('2026-10-08'),
        deadline: new Date('2026-10-08'),
      },
    })
    const shelves = await client.projectTask.create({
      data: {
        companyId,
        projectId: created.id,
        stageId: build.id,
        name: 'Fit the shelves',
        assigneeId: zhou.id,
        startDate: new Date('2026-10-09'),
        endDate: new Date('2026-10-14'),
        deadline: new Date('2026-10-14'),
      },
    })
    const walk = await client.projectTask.create({
      data: {
        companyId,
        projectId: created.id,
        stageId: review.id,
        name: 'Walk the finished shop',
        assigneeId: zhou.id,
        startDate: new Date('2026-10-15'),
        endDate: new Date('2026-10-16'),
        deadline: new Date('2026-10-16'),
      },
    })
    await client.taskDependency.createMany({
      data: [
        { companyId, taskId: shelves.id, dependsOnId: measure.id },
        { companyId, taskId: walk.id, dependsOnId: shelves.id },
      ],
    })
    await client.timesheet.create({
      data: {
        companyId,
        projectId: created.id,
        taskId: shelves.id,
        employeeId: zhou.id,
        workDate: new Date('2026-10-10'),
        hours: 6,
        state: 'approved',
        description: 'Shelf frames along the west wall',
      },
    })
    await client.expenseClaim.create({
      data: {
        companyId,
        projectId: created.id,
        employeeId: zhou.id,
        name: 'EX-FIT-1',
        merchant: 'Hardware stall',
        description: 'Brackets for the shop fit-out',
        receiptRef: 'FIT-80',
        amount: 80,
        spentOn: new Date('2026-10-10'),
        state: 'approved',
      },
    })
  }

  const charges = await client.account.findFirst({ where: { companyId, code: '6607' } })
  if (!charges) await client.account.create({ data: { companyId, code: '6607', name: 'Bank charges', type: 'expense' } })
  let account = await client.bankAccount.findFirst({ where: { companyId, name: 'Jiangbei operating' } })
  if (!account) {
    account = await client.bankAccount.create({
      data: { companyId, name: 'Jiangbei operating', accountCode: '1002', currency: company.currency },
    })
  }
  const rule = await client.reconcileRule.findFirst({ where: { companyId, name: 'Bank fee' } })
  if (!rule) {
    await createRule(companyId, { name: 'Bank fee', matchText: 'FEE', action: 'fee', accountCode: '6607' })
  }
  const statement = await client.bankStatement.findFirst({ where: { companyId, name: statementName } })
  if (!statement) {
    await importMapped(companyId, statementName, {
      csv: sampleStatementCsv,
      mapping: { date: 'date', description: 'description', amount: 'amount', reference: 'reference' },
      bankAccountId: account.id,
      openingBalance: 0,
    })
  }
}
