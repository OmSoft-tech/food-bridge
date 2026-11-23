import type { Need, Product } from '../types'
import { computeUncovered } from './uncovered'
import type { MatchPlan, MatchStrategy } from './matching'

/** Сценарные параметры что-если (сессионные, в localStorage не пишутся). */
export interface ScenarioParams {
  strategy: MatchStrategy
  /** лимит веса вывоза в день, кг; 0 = без лимита (база) */
  dailyLimitKg: number
}

export const BASE_SCENARIO: ScenarioParams = { strategy: 'expiry', dailyLimitKg: 0 }

export const STRATEGIES: { id: MatchStrategy; label: string; hint: string }[] = [
  {
    id: 'expiry',
    label: 'Сроки годности',
    hint: 'базовый: сначала то, что скоро испортится',
  },
  {
    id: 'distance',
    label: 'Расстояние',
    hint: 'излишки из ближайших к пункту магазинов — меньше транспорт',
  },
  {
    id: 'priority',
    label: 'Приоритет нужд',
    hint: 'сначала все высокие нужды, в порядке списка фонда',
  },
]

export function isBaseScenario(params: ScenarioParams): boolean {
  return (
    params.strategy === BASE_SCENARIO.strategy && params.dailyLimitKg === BASE_SCENARIO.dailyLimitKg
  )
}

export interface PlanDelta {
  transfers: number
  kg: number
  personDays: number
  /** изменение стоимости докупки непокрытых нужд, ₽ */
  deficitCost: number
}

/** Дельта сценария против базового плана: + значит «сценарий лучше/больше». */
export function buildPlanDelta(
  base: MatchPlan,
  scenario: MatchPlan,
  products: Product[],
  needs: Need[],
): PlanDelta {
  const baseDeficit = computeUncovered(products, needs, base).totalCost
  const scenarioDeficit = computeUncovered(products, needs, scenario).totalCost
  return {
    transfers: scenario.transfers.length - base.transfers.length,
    kg: scenario.totalKg - base.totalKg,
    personDays: scenario.personDays - base.personDays,
    deficitCost: scenarioDeficit - baseDeficit,
  }
}

/** «+3 передач» / «−12 кг» — со знаком и типографским минусом. */
export function formatDelta(n: number, unit: string): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  const value = Math.abs(n).toLocaleString('ru-RU', { maximumFractionDigits: 1 })
  return `${sign}${value} ${unit}`
}
