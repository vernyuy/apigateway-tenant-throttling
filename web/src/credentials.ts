import type { Credentials } from './api';

// DEMO ONLY: tenant credentials kept in sessionStorage so the traffic simulator can sign in and call the API.
// A real platform shows them once and never stores them in a browser.
const KEY = 'tenant-demo.credentials';

type Store = Record<string, Credentials>;

const read = (): Store => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
};

const write = (store: Store) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // storage unavailable: credentials only live for this page view
  }
};

export const credentials = {
  all: read,
  save(tenantId: string, creds: Partial<Credentials>) {
    const store = read();
    store[tenantId] = { ...store[tenantId], ...creds } as Credentials;
    write(store);
  },
  remove(tenantId: string) {
    const store = read();
    delete store[tenantId];
    write(store);
  },
};
