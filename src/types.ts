/** Типы предметной области «Фуд-мост». Данные лежат в JSON-моках (src/data). */

export type Category = 'meat' | 'dairy' | 'grocery' | 'veg' | 'bread' | 'canned'

export interface Product {
  id: string
  name: string
  category: Category
  /** единица измерения для витрины: «упак.», «пак.», «банка»… */
  unit: string
  /** вес одной единицы, кг */
  unitWeightKg: number
  /** срок хранения товара, дней */
  shelfLifeDays: number
}

export type SurplusStatus = 'available' | 'reserved' | 'transferred'

export interface Surplus {
  id: string
  storeId: string
  productId: string
  /** количество в единицах товара */
  qty: number
  /** дней до истечения срока годности (от «сегодня», для свежести демо) */
  expiresInDays: number
  status: SurplusStatus
}

export type Priority = 'high' | 'medium'

export interface Need {
  id: string
  recipientId: string
  productId: string
  /** желаемое количество, единиц товара */
  desiredQty: number
  /** уже получено, единиц товара */
  fulfilledQty: number
  priority: Priority
}

export interface Store {
  id: string
  name: string
  chain: string
  address: string
  district: string
}

export interface Recipient {
  id: string
  name: string
  address: string
  district: string
}
