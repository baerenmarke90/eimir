# Google and passkey sign-in: operator set-up (#58, #630)

What an operator of eimir. Cloud configures so that "Continue with Google" and passkeys work in
the browser and in the Android app. The code is ready; nothing below can be done from the
repository because it lives at Google, in the Play Console, or in the hosting layer.

## 1. Google (OpenID Connect)

1. In the Google Cloud console create a project and an OAuth consent screen for eimir.
   Scopes: `openid`, `email`, `profile` only.
2. Create an OAuth client of type **Web application**.
   - Authorized redirect URI: `https://<managed origin>/auth/oidc/google` (for example
     `https://app.eimir.de/auth/oidc/google`).
   - The Android app uses the **same** address. It is a verified Android App Link
     (`/auth/oidc/` is registered in the manifest), so the app needs no custom URI scheme and no
     second Google client.
3. Put the client into `EIMIR_OIDC_CONNECTIONS` (see `deploy/cloud-managed.env.example`):
   `provider` `google`, `issuer` `https://accounts.google.com`, `client_id`, `client_secret`,
   `redirect_uri` and `android_redirect_uri` both the address above. Without
   `android_redirect_uri` the app does not offer Google.
4. Restart the backend. The sign-in screen shows the Google button once
   `GET /api/v1/instance/status` lists the connection.

Google signup on Cloud needs `account_creation` self-service (the default on Cloud); a new Account
needs the verified address Google reports and the accepted terms of use. An address that already
has an Account is never merged: the person signs in another way and links Google in Settings.

## 2. Passkeys in the browser

Set `EIMIR_WEBAUTHN_RP_ID` to the registrable domain of the managed origin (for example
`eimir.de`) when passkeys should work on more than one host, otherwise the host of
`EIMIR_PUBLIC_BASE_URL` is used. List every web origin in `EIMIR_WEBAUTHN_ORIGINS`.

## 3. Passkeys in the Android app (Credential Manager)

The app asks Android Credential Manager directly, so the relying party must trust the app:

1. **Digital Asset Links.** The file `https://<rp id host>/.well-known/assetlinks.json` must
   contain, besides the existing `delegate_permission/common.handle_all_urls` statement, a
   statement with the relation `delegate_permission/common.get_login_creds` for the same
   package (`de.eimir.app`) and the same signing-certificate SHA-256 fingerprints. Use the Play App
   Signing certificate for store builds and the test-channel certificate for test builds.
2. **Accepted origin.** A ceremony started by a native app carries the origin
   `android:apk-key-hash:<base64url of the SHA-256 of the signing certificate>`. Add that origin
   for each signing certificate to `EIMIR_WEBAUTHN_ORIGINS`, next to the web origin(s):
   `["https://app.eimir.de","android:apk-key-hash:<hash>"]`.
3. Credential Manager needs a credential provider: Android 14 and newer ship one, older versions
   use Google Play services. Where none is present the app hides the passkey buttons.

When adding a passkey in the app fails, Settings tells the causes apart (message keys in
`web/src/i18n/locales/accountSettings.ts`):

- `accountSettings.passkeyAppNotLinked` (bridge code `NOT_TRUSTED`): Android refused the ceremony
  because `assetlinks.json` has no `get_login_creds` statement for the installed package and
  signing certificate (step 1).
- `accountSettings.passkeyServerRejected` (`PASSKEY_CEREMONY_INVALID` from the finish call): the
  platform created the passkey, but the origin is not in `EIMIR_WEBAUTHN_ORIGINS` (step 2).
- `accountSettings.passkeyAlreadyOnDevice` (`ALREADY_REGISTERED`): this device already stores a
  passkey of the Account.
- The generic `accountSettings.methodFailed` remains for every other failure.

Passkeys created in the browser and in the app use the same relying party and are listed together
in Settings, Sign-in methods.

## Not covered by CI

A real Google round trip and a real passkey ceremony need a configured client, a verified
`assetlinks.json` and a device. Verify on the Pixel: sign in with Google from a cold start of the
app, link and unlink Google in Settings, add a passkey, sign in with it after signing out.
