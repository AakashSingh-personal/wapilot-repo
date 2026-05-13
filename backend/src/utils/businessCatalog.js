const EMPTY_CLIENT_PROFILE = {
  business_name: '',
  business_phone: '',
  business_owner_name: '',
  business_support_number: '',
};

function normalizeClientProfile(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CLIENT_PROFILE };
  return {
    business_name: String(raw.business_name ?? '').trim(),
    business_phone: String(raw.business_phone ?? '').trim(),
    business_owner_name: String(raw.business_owner_name ?? '').trim(),
    business_support_number: String(raw.business_support_number ?? '').trim(),
  };
}

export function parseCatalog(value) {
  if (Array.isArray(value)) {
    return { services: value, products: [], clientDetails: '', clientProfile: { ...EMPTY_CLIENT_PROFILE } };
  }
  if (value && typeof value === 'object') {
    return {
      services: Array.isArray(value.services) ? value.services : [],
      products: Array.isArray(value.products) ? value.products : [],
      clientDetails: typeof value.clientDetails === 'string' ? value.clientDetails : '',
      clientProfile: normalizeClientProfile(value.clientProfile),
    };
  }
  return { services: [], products: [], clientDetails: '', clientProfile: { ...EMPTY_CLIENT_PROFILE } };
}

export function mergeCatalog(existingValue, incoming) {
  const current = parseCatalog(existingValue);
  if (incoming.services != null) current.services = incoming.services;
  if (incoming.products != null) current.products = incoming.products;
  if (incoming.clientDetails !== undefined) {
    current.clientDetails = incoming.clientDetails == null ? '' : String(incoming.clientDetails);
  }
  if (incoming.clientProfile !== undefined && incoming.clientProfile !== null) {
    current.clientProfile = normalizeClientProfile({
      ...current.clientProfile,
      ...(typeof incoming.clientProfile === 'object' ? incoming.clientProfile : {}),
    });
  }
  return current;
}

export function serializeConfig(config) {
  if (!config) return config;
  const catalog = parseCatalog(config.services);
  return {
    ...config,
    services: catalog.services,
    products: catalog.products,
    clientDetails: catalog.clientDetails,
    clientProfile: catalog.clientProfile,
  };
}
