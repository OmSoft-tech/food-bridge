import productsJson from './products.json'
import storesJson from './stores.json'
import recipientsJson from './recipients.json'
import surplusesJson from './surpluses.json'
import needsJson from './needs.json'
import type { Need, Product, Recipient, Store, Surplus } from '../types'

/** Моковые данные MVP. Позже на их месте появится REST API. */

export const products = productsJson as Product[]
export const stores = storesJson as Store[]
export const recipients = recipientsJson as Recipient[]
export const surpluses = surplusesJson as Surplus[]
export const needs = needsJson as Need[]
