import { useQuery } from '@tanstack/react-query'
import { apiList } from '../lib/api'
import type { Contract, Invoice, Property, Room, Tenant } from '../types'

export function usePropertyOptions() {
  return useQuery({
    queryKey: ['properties', 'options'],
    queryFn: () => apiList<Property>('/properties', { limit: 100 }),
    staleTime: 5 * 60_000,
  })
}

export function useRoomOptions(propertyId?: string) {
  return useQuery({
    queryKey: ['rooms', 'options', propertyId ?? 'all'],
    queryFn: () => apiList<Room>('/rooms', { limit: 100, properti_id: propertyId || undefined }),
    staleTime: 60_000,
  })
}

export function useTenantOptions() {
  return useQuery({
    queryKey: ['tenants', 'options'],
    queryFn: () => apiList<Tenant>('/tenants', { limit: 100 }),
    staleTime: 60_000,
  })
}

export function useInvoiceOptions() {
  return useQuery({
    queryKey: ['invoices', 'options'],
    queryFn: () => apiList<Invoice>('/invoices', { limit: 100 }),
    staleTime: 60_000,
  })
}

export function useContractOptions() {
  return useQuery({
    queryKey: ['contracts', 'options'],
    queryFn: () => apiList<Contract>('/contracts', { limit: 100 }),
    staleTime: 60_000,
  })
}
