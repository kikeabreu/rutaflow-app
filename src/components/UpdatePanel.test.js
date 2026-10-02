import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { authorized } from '../updateClient';
import { UpdatePanel } from './UpdatePanel';

jest.mock('../updateClient', () => ({ authorized: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root, container;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  authorized.mockReset();
  authorized.mockImplementation(async (url, options) => options ? { eligible: 2 } : {
    releases: [{ id: 'release-1', platform: 'web', version_label: '2026-10-01', build_number: 100, minimum_build: 0, notes: 'Novedades', status: 'published', observed: 1 }],
    campaigns: [], audit: [],
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const click = async text => act(async () => {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent.includes(text));
  if (!button) throw new Error(`No aparece ${text}`);
  button.click();
});

test('explica cada paso y conserva una salida visible', async () => {
  const onClose = jest.fn();
  await act(async () => { root.render(<UpdatePanel onClose={onClose} />); });
  expect(container.textContent).toContain('Cómo funciona');
  expect(container.textContent).toContain('Mínimo admitido');
  expect(container.textContent).toContain('aunque ya estén actualizados');
  expect(container.textContent).toContain('no confirma entrega ni lectura');
  await click('Configuración');
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('la vista previa muestra el texto y el número de instalaciones', async () => {
  await act(async () => { root.render(<UpdatePanel onClose={() => {}} />); });
  await click('Vista previa y destinatarios');
  expect(container.textContent).toContain('Así se verá la notificación');
  expect(container.textContent).toContain('2 instalaciones con permiso push');
  expect(authorized).toHaveBeenCalledWith('/api/updates/admin', expect.objectContaining({ method: 'POST' }));
});

test('puede completar el borrador PWA con la compilación publicada', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ build_number: 123, version_label: '2026-10-01-07-00' }) });
  try {
    await act(async () => { root.render(<UpdatePanel onClose={() => {}} />); });
    await act(async () => { const select = container.querySelector('select'); select.value = 'web'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await click('Usar versión web publicada');
    expect(container.querySelectorAll('input')[0].value).toBe('2026-10-01-07-00');
    expect(container.querySelectorAll('input')[1].value).toBe('123');
    expect(global.fetch).toHaveBeenCalledWith('/build-info.json', { cache: 'no-store' });
  } finally { global.fetch = originalFetch; }
});
