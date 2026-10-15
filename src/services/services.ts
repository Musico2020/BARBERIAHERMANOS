import { supabase } from '../lib/supabase';
import type { Service } from '../types';

interface ServiceRow {
  id: string;
  name: string;
  category: string;
  duration: number;
  price: number;
  description: string;
  popular: boolean;
  active: boolean;
}

function rowToService(row: ServiceRow): Service {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Service['category'],
    duration: row.duration,
    price: row.price,
    description: row.description,
    popular: row.popular,
  };
}

export async function getServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data as ServiceRow[]).map(rowToService);
}

export async function getAllServices(): Promise<(Service & { active: boolean })[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data as ServiceRow[]).map((row) => ({ ...rowToService(row), active: row.active }));
}

export async function createService(service: Omit<Service, 'id'> & { active?: boolean }): Promise<Service> {
  const { data, error } = await supabase
    .from('services')
    .insert({
      name: service.name,
      category: service.category,
      duration: service.duration,
      price: service.price,
      description: service.description,
      popular: service.popular ?? false,
      active: service.active ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToService(data as ServiceRow);
}

export async function updateService(id: string, updates: Partial<Service & { active: boolean }>): Promise<void> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
  if (updates.price !== undefined) dbUpdates.price = updates.price;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.popular !== undefined) dbUpdates.popular = updates.popular;
  if (updates.active !== undefined) dbUpdates.active = updates.active;

  const { error } = await supabase
    .from('services')
    .update(dbUpdates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
