import { generateStoreName } from "./dataHelpers";

function requiredStoreValue(value, fieldLabel) {
  const normalized = (value || "").trim();
  if (!normalized) throw new Error(`${fieldLabel}不能为空`);
  return normalized;
}

function storeIdentity(city, brand, mall) {
  return {
    city: requiredStoreValue(city, "城市"),
    brand: requiredStoreValue(brand, "品牌方"),
    mall: requiredStoreValue(mall, "商场"),
  };
}

function isUniqueViolation(error) {
  return error?.code === "23505"
    || /duplicate key|unique constraint/i.test(error?.message || "");
}

async function findStoreByIdentity(supabase, identity) {
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("city", identity.city)
    .eq("brand", identity.brand)
    .eq("mall", identity.mall)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Find an existing store by its business identity, or create it when absent.
 *
 * Store identity is city + brand + mall. The generated store_name is only a
 * display value and is not used as part of the lookup identity.
 */
export async function findOrCreateStore(supabase, { city, brand, mall, ...storeFields }) {
  if (!supabase) throw new Error("缺少 Supabase 客户端");

  const identity = storeIdentity(city, brand, mall);
  const existing = await findStoreByIdentity(supabase, identity);
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from("stores")
    .insert({
      ...storeFields,
      ...identity,
      store_name: storeFields.store_name?.trim() || generateStoreName(identity.city, identity.brand, identity.mall),
    })
    .select()
    .single();

  if (!createError) return created;

  // Another request may have created the same identity after the first lookup.
  // Re-read after a unique-key conflict so callers still receive its store row.
  if (isUniqueViolation(createError)) {
    const concurrentStore = await findStoreByIdentity(supabase, identity);
    if (concurrentStore) return concurrentStore;
  }

  throw createError;
}

export { storeIdentity };