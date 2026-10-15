import type { Warehouse } from '../lib/types.ts'
import { Field } from './field.tsx'

export function defaultWarehouseId(warehouses: Warehouse[] | undefined) {
  const row = warehouses?.find((warehouse) => warehouse.isDefault) ?? warehouses?.[0]
  return row ? String(row.id) : ''
}

export function locationChoices(warehouses: Warehouse[] | undefined) {
  return (warehouses ?? []).flatMap((warehouse) =>
    warehouse.locations.map((location) => ({
      id: location.id,
      isDefault: location.isDefault && warehouse.isDefault,
      label: `${warehouse.name} · ${location.name}`,
    })),
  )
}

export function WarehouseField({
  label,
  value,
  onChange,
  warehouses,
  choose,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  warehouses: Warehouse[] | undefined
  choose: string
}) {
  return (
    <Field label={label}>
      <select
        className="h-10 rounded-md border border-border bg-card px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      >
        <option value="">{choose}</option>
        {warehouses?.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name}
          </option>
        ))}
      </select>
    </Field>
  )
}
