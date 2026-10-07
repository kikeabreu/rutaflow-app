import { registrationEmailPreference, EMAIL_CONSENT_VERSION } from './marketingEmail';
jest.mock('./supabaseClient', () => ({ supabase: {} }));
test('solo una elección booleana explícita habilita marketing al registrarse', () => {
  for (const value of [undefined, null, false, 'true', 1]) expect(registrationEmailPreference(value).lifecycle_email_enabled).toBe(false);
  expect(registrationEmailPreference(true)).toEqual({ lifecycle_email_enabled: true, lifecycle_email_consent_version: EMAIL_CONSENT_VERSION });
});
