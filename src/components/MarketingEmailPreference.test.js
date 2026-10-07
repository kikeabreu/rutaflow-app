import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MarketingEmailChoice, MarketingEmailPreference } from './MarketingEmailPreference';
import { loadEmailPreference, saveEmailPreference } from '../marketingEmail';

jest.mock('../marketingEmail', () => ({
  EMAIL_CONSENT_LABEL: 'Quiero recibir consejos, novedades y ofertas (opcional).',
  EMAIL_CONSENT_HELP: 'Puedes darte de baja fácilmente en cualquier momento desde cualquier correo o en Configuración.',
  loadEmailPreference: jest.fn(), saveEmailPreference: jest.fn(),
}));
global.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); jest.clearAllMocks(); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
test('la casilla es opcional, desmarcada y explica beneficios y baja', () => {
  act(() => root.render(<MarketingEmailChoice checked={false} onChange={() => {}} />));
  const input = container.querySelector('input');
  expect(input.checked).toBe(false); expect(input.required).toBe(false);
  expect(container.textContent).toMatch(/consejos, novedades y ofertas/);
  expect(container.textContent).toMatch(/darte de baja.*cualquier momento/);
});
test('desactivar guarda false y actualiza la preferencia visible', async () => {
  loadEmailPreference.mockResolvedValue(true); saveEmailPreference.mockResolvedValue();
  await act(async () => root.render(<MarketingEmailPreference userId="one" />));
  expect(container.querySelector('input').checked).toBe(true);
  await act(async () => container.querySelector('input').click());
  expect(saveEmailPreference).toHaveBeenCalledWith(false);
  expect(container.querySelector('input').checked).toBe(false);
  expect(container.textContent).toMatch(/Te diste de baja/);
});
test('un fallo al guardar no muestra un consentimiento que no se guardó', async () => {
  loadEmailPreference.mockResolvedValue(false); saveEmailPreference.mockRejectedValue(new Error('Sin conexión'));
  await act(async () => root.render(<MarketingEmailPreference userId="one" />));
  await act(async () => container.querySelector('input').click());
  expect(container.querySelector('input').checked).toBe(false);
  expect(container.querySelector('[role="alert"]').textContent).toMatch(/Sin conexión/);
});
