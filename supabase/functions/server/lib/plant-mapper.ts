function uniqueStrings(values: any[] = []) {
  return Array.from(
    new Set(
      values.filter((value) => typeof value === "string" && value.trim()).map((
        value,
      ) => value.trim()),
    ),
  );
}

export function pickFirstString(...values: any[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function toIsoString(value: any) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function toDateOnly(value: any) {
  const iso = toIsoString(value);
  return iso.split("T")[0];
}

function normalizeDimensions(value: any) {
  if (!value || typeof value !== "object") return undefined;
  return {
    healing: Number(value.healing || 0),
    companion: Number(value.companion || 0),
    vitality: Number(value.vitality || 0),
  };
}

export function normalizeLibraryItem(item: any) {
  if (!item || typeof item !== "object") return item;

  const id = String(item.id || item.libraryId || item.originalId || "").trim();
  const imageUrl = pickFirstString(
    item.imageUrl,
    item.image,
    item.coverImage,
    item.cover,
  );
  const createdAt = pickFirstString(
    item.created_at,
    item.createdAt,
    item.addedDate,
  );
  /** 品种：目录分类，与认领后用户填的「名称」隔离；兼容旧数据用 name */
  const species = pickFirstString(item.species, item.name);

  return {
    ...item,
    id,
    libraryId: id,
    originalId: id,
    plantId: item.plantId || undefined,
    species,
    imageUrl,
    image: imageUrl,
    coverImage: imageUrl,
    addedDate: pickFirstString(item.addedDate, toDateOnly(createdAt)),
    created_at: toIsoString(createdAt),
    createdAt: toIsoString(createdAt),
    tags: Array.isArray(item.tags) ? item.tags : [],
    dimensions: normalizeDimensions(item.dimensions),
  };
}

export function normalizePlantRecord(plant: any) {
  if (!plant || typeof plant !== "object") return plant;

  const plantId = pickFirstString(plant.id, plant.plantId);
  const libraryId = pickFirstString(
    plant.libraryId,
    plant.originalId,
    plant.sourcePlantId,
  );
  const imageUrl = pickFirstString(
    plant.imageUrl,
    plant.image,
    plant.coverImage,
    plant.cover,
  );
  const cartoonImageUrl = pickFirstString(plant.cartoonImageUrl);
  const createdAt = pickFirstString(
    plant.created_at,
    plant.createdAt,
    plant.adoptedAt,
    plant.timestamp,
  );
  /** 品种：创建植物时在目录中固定，不可变更；仅来自库，与用户命名的「名称」隔离 */
  const species = pickFirstString(plant.species, plant.name);
  /** 名称：认领后用户给该棵植物起的名字（昵称）；空表示未单独命名，前端可用品种回退展示 */
  const nameVal = plant.name;
  const name =
    nameVal !== undefined && nameVal !== null && String(nameVal).trim() === ""
      ? ""
      : (pickFirstString(plant.name) || species);

  return {
    ...plant,
    id: plantId,
    plantId,
    libraryId,
    originalId: libraryId,
    sourcePlantId: libraryId,
    name,
    species,
    imageUrl,
    image: imageUrl,
    coverImage: imageUrl,
    cartoonImageUrl: cartoonImageUrl || undefined,
    adoptedAt: toIsoString(createdAt),
    created_at: toIsoString(createdAt),
    createdAt: toIsoString(createdAt),
    addedDate: pickFirstString(plant.addedDate, toDateOnly(createdAt)),
    ownerEmails: uniqueStrings(
      (plant.ownerEmails || []).map((email: string) =>
        String(email).toLowerCase()
      ),
    ),
    ownerIds: uniqueStrings(plant.ownerIds || []),
    owners: uniqueStrings(plant.owners || []),
    tags: Array.isArray(plant.tags) ? plant.tags : [],
    dimensions: normalizeDimensions(plant.dimensions),
  };
}

export function getPlantIdentifiers(input: any) {
  if (!input || typeof input !== "object") return [];

  return uniqueStrings([
    input.id,
    input.plantId,
    input.libraryId,
    input.originalId,
    input.sourcePlantId,
  ]);
}

export function matchesPlantIdentifier(input: any, identifier?: string) {
  const normalizedIdentifier = pickFirstString(identifier);
  if (!normalizedIdentifier) return false;
  return getPlantIdentifiers(input).includes(normalizedIdentifier);
}

export function resolvePlantFromCollection(
  plants: any[] = [],
  identifier?: string,
) {
  const normalizedIdentifier = pickFirstString(identifier);
  if (!normalizedIdentifier) return null;

  return plants
    .map(normalizePlantRecord)
    .find((plant) => matchesPlantIdentifier(plant, normalizedIdentifier)) ||
    null;
}

export function buildAdoptedPlant({
  libraryItem,
  requestBody,
  user,
  plantKey,
}: {
  libraryItem?: any;
  requestBody?: any;
  user: any;
  plantKey: string;
}) {
  const normalizedLibrary = normalizeLibraryItem(
    libraryItem || requestBody || {},
  );
  const normalizedRequest = normalizeLibraryItem(requestBody || {});
  const now = new Date().toISOString();
  const userEmail = String(user?.email || "").toLowerCase();
  const ownerName = pickFirstString(
    requestBody?.ownerName,
    requestBody?.userName,
    user?.user_metadata?.name,
    userEmail.split("@")[0],
    "用户",
  );

  /** 品种：优先植物库；库缺失时用请求里的 species（前端传品种），避免用 name 当品种 */
  const species = pickFirstString(
    normalizedLibrary.species,
    normalizedLibrary.name,
    requestBody?.species,
  );
  /** 名称：认领时用户给该植物起的名字（昵称）；若与品种相同则存空，避免名称/品种一致，展示时由前端用品种回退 */
  let name = pickFirstString(
    requestBody?.name,
    normalizedRequest.name,
    normalizedLibrary.name,
    species,
    "我的植物",
  );
  if (name && String(name).trim() === String(species).trim()) {
    name = "";
  }

  return normalizePlantRecord({
    ...normalizedLibrary,
    ...normalizedRequest,
    ...requestBody,
    id: plantKey,
    plantId: plantKey,
    libraryId: normalizedRequest.libraryId || normalizedLibrary.libraryId,
    originalId: normalizedRequest.libraryId || normalizedLibrary.libraryId,
    sourcePlantId: normalizedRequest.libraryId || normalizedLibrary.libraryId,
    species,
    name,
    ownerEmails: [userEmail],
    ownerIds: [user?.id].filter(Boolean),
    owners: [ownerName],
    adoptedAt: now,
    created_at: now,
    createdAt: now,
  });
}
