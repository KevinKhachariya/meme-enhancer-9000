import { derived, writable } from 'svelte/store';
import type { AppAction } from '../domain/actions';
import { createInitialState } from '../domain/initial-state';
import { appReducer } from '../domain/reducer';
import type { AppState } from '../domain/types';

function readInitialTheme(): AppState['theme'] {
  if (typeof localStorage === 'undefined') return 'dark';
  return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
}

function createAppStore() {
  const store = writable<AppState>(createInitialState(readInitialTheme()));

  function dispatch(action: AppAction): void {
    store.update((state) => {
      const next = appReducer(state, action);

      if (typeof localStorage !== 'undefined' && next.theme !== state.theme) {
        localStorage.setItem('theme', next.theme);
      }

      return next;
    });
  }

  return {
    subscribe: store.subscribe,
    dispatch,
  };
}

export const appStore = createAppStore();

export const selectedLayer = derived(appStore, ($state) => (
  $state.layers.find((layer) => layer.id === $state.selectedLayerId) ?? null
));
