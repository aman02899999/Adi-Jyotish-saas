import "server-only";

import { query, queryModel, queryModels } from "@/lib/postgres";

/**
 * Supabase data access for the service catalogue.
 *
 * `services` is keyed by slug, as the Firestore collection was, so `id` and `slug` carry
 * the same value and the caller supplies both.
 *
 * `price` is numeric, which node-postgres returns as a string, so it is listed in the
 * coercion set — against a raw string every discount calculation would concatenate.
 */

export type ServiceRow = {
  id: string;
  title: string;
  slug: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  icon: string;
  active: boolean;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const SERVICE_COLUMNS = `id, title, slug, category, description, price, duration, icon,
       active, featured, created_at, updated_at`;
const NUMERIC = ["price"] as const;

/** Featured first, then by title — the ordering the catalogue pages have always shown. */
export async function getAllServicesFromSupabase(): Promise<ServiceRow[]> {
  return queryModels<ServiceRow>(
    `select ${SERVICE_COLUMNS} from public.services order by featured desc, title asc`,
    [],
    NUMERIC,
  );
}

export async function getPublishedServicesFromSupabase(): Promise<ServiceRow[]> {
  return queryModels<ServiceRow>(
    `select ${SERVICE_COLUMNS} from public.services where active order by featured desc, title asc`,
    [],
    NUMERIC,
  );
}

export type ServiceSeedInput = {
  slug: string;
  title: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  icon?: string;
  active?: boolean;
  featured?: boolean;
};

/** Inserts a starter service unless the slug is already taken. Idempotent, as the
 * Firestore get-then-set was, but decided by the primary key rather than a read. */
export async function seedServiceInSupabase(input: ServiceSeedInput): Promise<boolean> {
  const result = await query(
    `insert into public.services (id, slug, title, category, description, price, duration, icon, active, featured, created_at, updated_at)
     values ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
     on conflict do nothing`,
    [
      input.slug, input.title, input.category, input.description, input.price, input.duration,
      input.icon ?? "sparkles", input.active ?? true, input.featured ?? false,
    ],
  );
  return (result.rowCount ?? 0) === 1;
}

export async function getServiceByIdInSupabase(id: string): Promise<ServiceRow | null> {
  return queryModel<ServiceRow>(
    `select ${SERVICE_COLUMNS} from public.services where id = $1`,
    [id],
    NUMERIC,
  );
}

export async function createServiceInSupabase(input: ServiceSeedInput): Promise<boolean> {
  return seedServiceInSupabase(input);
}

export type ServicePatch = {
  title: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  icon: string;
  active: boolean;
  featured: boolean;
};

export async function updateServiceInSupabase(id: string, patch: ServicePatch): Promise<boolean> {
  const result = await query(
    `update public.services
        set title = $2, category = $3, description = $4, price = $5, duration = $6,
            icon = $7, active = $8, featured = $9, updated_at = now()
      where id = $1`,
    [id, patch.title, patch.category, patch.description, patch.price, patch.duration, patch.icon, patch.active, patch.featured],
  );
  return (result.rowCount ?? 0) === 1;
}

/**
 * Bookings that still point at this service.
 *
 * `bookings.service_id` is a foreign key with NO ACTION, so deleting a referenced service
 * fails with 23503. A Firestore document delete had no such constraint and simply orphaned
 * every booking that named it — which is how a booking ends up pointing at a service that
 * no longer exists. Callers turn a non-zero count into a 409 rather than a 500.
 */
export async function countBookingsForServiceInSupabase(serviceId: string): Promise<number> {
  const result = await query<{ n: number }>(
    `select count(*)::int as n from public.bookings where service_id = $1`,
    [serviceId],
  );
  return result.rows[0]?.n ?? 0;
}

export async function deleteServiceInSupabase(id: string): Promise<boolean> {
  const result = await query(`delete from public.services where id = $1`, [id]);
  return (result.rowCount ?? 0) === 1;
}
