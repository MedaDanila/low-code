const DADATA_TOKEN = '8e2ccba08e94387ace109bf66fa6a6745b727dbb'
const DADATA_ADDRESS_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address'

export interface DadataAddressSuggestion {
  value: string
  unrestrictedValue: string
  geoLat?: number
  geoLon?: number
  qcGeo?: string
}

interface DadataAddressResponse {
  suggestions?: Array<{
    value?: string
    unrestricted_value?: string
    data?: {
      geo_lat?: string | null
      geo_lon?: string | null
      qc_geo?: string | null
    }
  }>
}

export async function suggestAddresses(query: string, signal?: AbortSignal): Promise<DadataAddressSuggestion[]> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []

  const response = await fetch(DADATA_ADDRESS_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Token ${DADATA_TOKEN}`,
    },
    body: JSON.stringify({ query: trimmed, count: 6 }),
  })

  if (!response.ok) return []

  const payload = await response.json() as DadataAddressResponse
  return (payload.suggestions ?? [])
    .map(normalizeAddressSuggestion)
    .filter((suggestion) => suggestion.value)
}

export async function geocodeAddress(query: string, signal?: AbortSignal): Promise<DadataAddressSuggestion | null> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return null

  const response = await fetch(DADATA_ADDRESS_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Token ${DADATA_TOKEN}`,
    },
    body: JSON.stringify({ query: trimmed, count: 1 }),
  })

  if (!response.ok) return null

  const payload = await response.json() as DadataAddressResponse
  return (payload.suggestions ?? [])
    .map(normalizeAddressSuggestion)
    .find((suggestion) => Number.isFinite(suggestion.geoLat) && Number.isFinite(suggestion.geoLon)) ?? null
}

function normalizeAddressSuggestion(suggestion: NonNullable<DadataAddressResponse['suggestions']>[number]): DadataAddressSuggestion {
  const geoLat = Number(suggestion.data?.geo_lat)
  const geoLon = Number(suggestion.data?.geo_lon)
  return {
    value: suggestion.value ?? '',
    unrestrictedValue: suggestion.unrestricted_value ?? suggestion.value ?? '',
    geoLat: Number.isFinite(geoLat) ? geoLat : undefined,
    geoLon: Number.isFinite(geoLon) ? geoLon : undefined,
    qcGeo: suggestion.data?.qc_geo ?? undefined,
  }
}
