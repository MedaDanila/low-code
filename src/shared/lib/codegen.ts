const dictionary: Record<string, string> = {
  адрес: 'address',
  администрация: 'administration',
  активен: 'active',
  активная: 'active',
  активный: 'active',
  в: '',
  благоустройство: 'landscape',
  гарантийные: 'warranty',
  гарантийный: 'warranty',
  гарантия: 'warranty',
  дата: 'date',
  детские: 'playground',
  детская: 'playground',
  значение: 'value',
  значения: 'values',
  закрыт: 'closed',
  количество: 'count',
  код: 'code',
  карта: 'map',
  места: 'places',
  мест: 'places',
  название: 'name',
  начало: 'start',
  номер: 'number',
  на: '',
  новая: 'new',
  новое: 'new',
  новый: 'new',
  объект: 'object',
  окончание: 'end',
  описание: 'description',
  ордера: 'orders',
  ордер: 'order',
  парковки: 'parkings',
  парковка: 'parking',
  платная: 'paid',
  площадки: 'playgrounds',
  поле: 'field',
  пользователь: 'user',
  проверке: 'review',
  проверка: 'review',
  процесс: 'workflow',
  ремонт: 'repair',
  работе: 'active',
  роли: 'roles',
  роль: 'role',
  сети: 'network',
  состояние: 'condition',
  справочник: 'dictionary',
  статус: 'status',
  согласование: 'approval',
  сущности: 'entities',
  сущность: 'entity',
  тип: 'type',
  участки: 'areas',
  участок: 'area',
  черновик: 'draft',
}

const translit: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

export function generateSystemCode(value: string, fallback = 'item'): string {
  const words = value
    .trim()
    .toLowerCase()
    .replace(/[ъь]/g, '')
    .split(/[^a-zа-яё0-9]+/i)
    .filter(Boolean)
    .map((word) => dictionary[word] ?? transliterateWord(word))
    .filter(Boolean)

  const code = words
    .join('_')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return code || fallback
}

export function uniqueSystemCode(baseValue: string, usedCodes: Iterable<string>, fallback = 'item'): string {
  const used = new Set(Array.from(usedCodes).filter(Boolean))
  const base = generateSystemCode(baseValue, fallback)
  if (!used.has(base)) return base

  let index = 2
  while (used.has(`${base}_${index}`)) index += 1
  return `${base}_${index}`
}

function transliterateWord(word: string): string {
  return word
    .split('')
    .map((char) => translit[char] ?? char)
    .join('')
}
