export const deskListMeta = {
  model: 'desk.record',
  pageSize: 40,
  columns: ['name', 'partner', 'owner', 'state', 'recordDate', 'amount'] as const,
  groupBy: ['none', 'state', 'partner', 'owner', 'bucket'] as const,
}

export type DeskGroupBy = (typeof deskListMeta.groupBy)[number]
