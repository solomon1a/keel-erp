import type { WorkflowModel } from '../../shared/workflow.ts'
import { canTransition } from '../../shared/workflow.ts'
import type { Tx } from '../db.ts'
import { AppError } from '../errors.ts'

export async function guardWorkflow(
  tx: Tx,
  input: {
    companyId: number
    model: WorkflowModel
    recordId: number
    from: string
    to: string
    label: string
    userId?: number
  },
) {
  if (input.from === input.to) return
  if (!canTransition(input.model, input.from, input.to)) {
    throw new AppError(409, `${input.label} cannot move from ${input.from} to ${input.to}.`)
  }
  await tx.chatterMessage.create({
    data: {
      companyId: input.companyId,
      model: input.model,
      recordId: input.recordId,
      userId: input.userId,
      kind: 'transition',
      summary: `${input.label}: ${input.from} → ${input.to}`,
    },
  })
}
