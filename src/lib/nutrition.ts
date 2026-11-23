import type { Category } from '../types'

/**
 * Условные нормы «человеко-дня» для расчёта покрытия (демо-данные,
 * близкие к средним по продовольственной корзине):
 * суммарно ≈ 1,4 кг еды на человека в день.
 */
export const NORM_KG_PER_PERSON_DAY: Record<Category, number> = {
  meat: 0.16,
  dairy: 0.35,
  grocery: 0.25,
  veg: 0.3,
  bread: 0.2,
  canned: 0.15,
}

/** Условная калорийность на кг по категориям, ккал/кг. */
export const KCAL_PER_KG: Record<Category, number> = {
  meat: 1900,
  dairy: 1300,
  grocery: 3300,
  veg: 450,
  bread: 2500,
  canned: 1600,
}

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'meat', label: 'Мясо' },
  { id: 'dairy', label: 'Молочка' },
  { id: 'grocery', label: 'Бакалея' },
  { id: 'veg', label: 'Овощи/фрукты' },
  { id: 'bread', label: 'Хлеб' },
  { id: 'canned', label: 'Консервы' },
]

export const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
) as Record<Category, string>

export const SURPLUS_STATUS_LABEL: Record<string, string> = {
  available: 'Доступно',
  reserved: 'Зарезервировано',
  transferred: 'Передано',
}

export const PRIORITY_LABEL: Record<string, string> = {
  high: 'Высокий',
  medium: 'Средний',
}

/** Человек считает проще в человеко-днях: кг категории → человеко-дни. */
export function kgToPersonDays(category: Category, kg: number): number {
  return kg / NORM_KG_PER_PERSON_DAY[category]
}
