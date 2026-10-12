jest.mock('./supabaseClient', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock('./offlineStore', () => ({ pendingFor: jest.fn() }));
jest.mock('./storage/db', () => ({ db: {} }));
jest.mock('@capacitor/browser', () => ({ Browser: { open: jest.fn() } }));
jest.mock('@capacitor/push-notifications', () => ({ PushNotifications: {} }));

import { consentKey, markAskedUpdates, shouldAskUpdates } from './updateClient';

const setPush = permission => {
  window.PushManager = function PushManager() {};
  window.Notification = { permission };
  window.matchMedia = () => ({ matches: false });
};

beforeEach(() => { localStorage.clear(); setPush('default'); });
afterEach(() => { delete window.PushManager; delete window.Notification; });

describe('shouldAskUpdates', () => {
  it('pregunta a quien todavía no ha decidido', () => {
    expect(shouldAskUpdates('u1')).toBe(true);
  });

  it('pregunta una sola vez, aunque diga "Ahora no"', () => {
    markAskedUpdates('u1');
    expect(shouldAskUpdates('u1')).toBe(false);
    expect(shouldAskUpdates('u2')).toBe(true);
  });

  it('no pregunta a quien ya tiene los avisos activados', () => {
    localStorage.setItem(consentKey('u1'), 'yes');
    expect(shouldAskUpdates('u1')).toBe(false);
  });

  it('no pregunta si el navegador ya bloqueó las notificaciones', () => {
    setPush('denied');
    expect(shouldAskUpdates('u1')).toBe(false);
  });

  it('no pregunta si el navegador no admite notificaciones', () => {
    delete window.PushManager;
    expect(shouldAskUpdates('u1')).toBe(false);
  });

  it('sin sesión no pregunta', () => {
    expect(shouldAskUpdates(undefined)).toBe(false);
  });
});
