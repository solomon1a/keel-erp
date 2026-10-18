import type { PrismaClient } from '@prisma/client'

async function deleteCompany(client: PrismaClient, companyId: number) {
  await client.$transaction(async (tx) => {
    await tx.company.update({ where: { id: companyId }, data: { onlineWarehouseId: null } })
    await tx.chatterMessage.deleteMany({ where: { companyId } })
    await tx.savedFilter.deleteMany({ where: { companyId } })
    await tx.reconcileMatch.deleteMany({ where: { companyId } })
    await tx.bankStatementLine.deleteMany({ where: { companyId } })
    await tx.bankStatement.deleteMany({ where: { companyId } })
    await tx.valuationLayer.deleteMany({ where: { companyId } })
    await tx.stockLedger.deleteMany({ where: { companyId } })
    await tx.stockBatch.deleteMany({ where: { companyId } })
    await tx.stockSerial.deleteMany({ where: { companyId } })
    await tx.deskRecord.deleteMany({ where: { companyId } })
    await tx.moduleSetting.deleteMany({ where: { companyId } })
    await tx.payslipLine.deleteMany({ where: { payslip: { run: { companyId } } } })
    await tx.payslip.deleteMany({ where: { run: { companyId } } })
    await tx.payrollRun.deleteMany({ where: { companyId } })
    await tx.expenseClaim.deleteMany({ where: { companyId } })
    await tx.salaryStructure.deleteMany({ where: { companyId } })
    await tx.journalItem.deleteMany({ where: { entry: { companyId } } })
    await tx.journalEntry.deleteMany({ where: { companyId } })
    await tx.invoice.updateMany({ where: { companyId }, data: { reversalOfId: null } })
    await tx.invoicePayment.deleteMany({ where: { invoice: { companyId } } })
    await tx.invoiceLine.deleteMany({ where: { invoice: { companyId } } })
    await tx.invoice.deleteMany({ where: { companyId } })
    await tx.posPayment.deleteMany({ where: { order: { companyId } } })
    await tx.posOrderLine.deleteMany({ where: { order: { companyId } } })
    await tx.stockMove.deleteMany({ where: { product: { companyId } } })
    await tx.stockQuant.deleteMany({ where: { product: { companyId } } })
    await tx.deliveryNoteLine.deleteMany({ where: { note: { companyId } } })
    await tx.deliveryNote.deleteMany({ where: { companyId } })
    await tx.purchaseReceiptLine.deleteMany({ where: { receipt: { companyId } } })
    await tx.purchaseReceipt.deleteMany({ where: { companyId } })
    await tx.quotationLine.deleteMany({ where: { quotation: { companyId } } })
    await tx.quotation.deleteMany({ where: { companyId } })
    await tx.supplierQuotationLine.deleteMany({ where: { quote: { companyId } } })
    await tx.supplierQuotation.deleteMany({ where: { companyId } })
    await tx.materialRequestLine.deleteMany({ where: { request: { companyId } } })
    await tx.materialRequest.deleteMany({ where: { companyId } })
    await tx.pricingRule.deleteMany({ where: { companyId } })
    await tx.priceListItem.deleteMany({ where: { priceList: { companyId } } })
    await tx.priceList.deleteMany({ where: { companyId } })
    await tx.contact.updateMany({ where: { companyId }, data: { customerGroupId: null, parentId: null } })
    await tx.customerGroup.deleteMany({ where: { companyId } })
    await tx.stockTransferLine.deleteMany({ where: { transfer: { companyId } } })
    await tx.stockTransfer.deleteMany({ where: { companyId } })
    await tx.stockRoute.deleteMany({ where: { companyId } })
    await tx.reorderRule.deleteMany({ where: { companyId } })
    await tx.manufacturingComponent.deleteMany({ where: { order: { companyId } } })
    await tx.manufacturingOrder.deleteMany({ where: { companyId } })
    await tx.bomLine.deleteMany({ where: { bom: { companyId } } })
    await tx.billOfMaterials.deleteMany({ where: { companyId } })
    await tx.salesOrderLine.deleteMany({ where: { order: { companyId } } })
    await tx.salesOrder.deleteMany({ where: { companyId } })
    await tx.purchaseOrderLine.deleteMany({ where: { order: { companyId } } })
    await tx.purchaseOrder.deleteMany({ where: { companyId } })
    await tx.activity.deleteMany({ where: { lead: { companyId } } })
    await tx.lead.deleteMany({ where: { companyId } })
    await tx.attendance.deleteMany({ where: { employee: { companyId } } })
    await tx.leaveRequest.deleteMany({ where: { employee: { companyId } } })
    await tx.employee.deleteMany({ where: { companyId } })
    await tx.department.deleteMany({ where: { companyId } })
    await tx.shopSession.deleteMany({ where: { customer: { companyId } } })
    await tx.shopCustomer.deleteMany({ where: { companyId } })
    await tx.posOrder.deleteMany({ where: { companyId } })
    await tx.posSession.deleteMany({ where: { companyId } })
    await tx.product.deleteMany({ where: { companyId } })
    await tx.productCategory.deleteMany({ where: { companyId } })
    await tx.stockLocation.deleteMany({ where: { companyId } })
    await tx.warehouse.deleteMany({ where: { companyId } })
    await tx.contact.deleteMany({ where: { companyId } })
    await tx.account.deleteMany({ where: { companyId } })
    await tx.journal.deleteMany({ where: { companyId } })
    await tx.fiscalYear.deleteMany({ where: { companyId } })
    await tx.costCentre.deleteMany({ where: { companyId } })
    await tx.chargeTemplate.deleteMany({ where: { companyId } })
    await tx.accessGroup.deleteMany({ where: { companyId } })
    await tx.session.deleteMany({ where: { user: { companyId } } })
    await tx.exchangeRate.deleteMany({ where: { companyId } })
    await tx.demoRun.deleteMany({ where: { companyId } })
    await tx.user.deleteMany({ where: { companyId } })
    await tx.sequence.deleteMany({
      where: {
        name: {
          in: [
            `account.out.${companyId}`,
            `account.in.${companyId}`,
            `account.out_refund.${companyId}`,
            `account.in_refund.${companyId}`,
            `account.entry.${companyId}`,
          ],
        },
      },
    })
    await tx.company.delete({ where: { id: companyId } })
  }, { maxWait: 20000, timeout: 120000 })
}

export async function removeStrayCompanies(client: PrismaClient) {
  // A company with at least one user is a real tenant (demo or self-serve).
  // Only empty leftovers from a partial seed are removed.
  const empty = await client.company.findMany({
    where: { users: { none: {} } },
    select: { id: true },
  })
  for (const company of empty) {
    await deleteCompany(client, company.id)
  }
}
