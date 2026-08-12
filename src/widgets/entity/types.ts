import type { DomainGeometry, EntityObjectValues } from '../../shared/types/domain'

export interface EntityFormPayload {
  values: EntityObjectValues
  geometry?: DomainGeometry
}
