import '@testing-library/jest-dom/vitest';

const installStoragePolyfill = (key: 'localStorage' | 'sessionStorage') => {
	const target = globalThis.window as Window | undefined;
	if (!target) {
		return;
	}

	const existing = target[key] as Storage | undefined;
	if (
		existing &&
		typeof existing.getItem === 'function' &&
		typeof existing.setItem === 'function' &&
		typeof existing.removeItem === 'function' &&
		typeof existing.clear === 'function'
	) {
		return;
	}

	const store = new Map<string, string>();
	const storage: Storage = {
		get length() {
			return store.size;
		},
		clear() {
			store.clear();
		},
		getItem(itemKey: string) {
			return store.has(itemKey) ? store.get(itemKey) ?? null : null;
		},
		key(index: number) {
			const keys = Array.from(store.keys());
			return keys[index] ?? null;
		},
		removeItem(itemKey: string) {
			store.delete(itemKey);
		},
		setItem(itemKey: string, value: string) {
			store.set(itemKey, String(value));
		},
	};

	Object.defineProperty(target, key, {
		configurable: true,
		writable: true,
		value: storage,
	});
};

installStoragePolyfill('localStorage');
installStoragePolyfill('sessionStorage');
