package de.eimir.app;

import android.os.Build;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.PublicKeyCredential;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge from the Web layer to Android Credential Manager (#630).
 *
 * The server's WebAuthn options travel to the platform as JSON and the
 * platform's JSON response travels back unchanged; this class never reads
 * credential material. The relying party must trust this app through Digital
 * Asset Links ({@code delegate_permission/common.get_login_creds}) and the
 * server must accept the app's {@code android:apk-key-hash:} origin.
 */
@CapacitorPlugin(name = "Passkeys")
public class PasskeysPlugin extends Plugin {
    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean available = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getActivity() != null) {
            try {
                available = CredentialManager.create(getContext()) != null;
            } catch (RuntimeException unavailable) {
                available = false;
            }
        }
        call.resolve(new JSObject().put("available", available));
    }

    @PluginMethod
    public void create(PluginCall call) {
        String requestJson = call.getString("requestJson");
        if (requestJson == null || requestJson.isEmpty() || getActivity() == null) {
            call.reject("Passkey request is missing", PasskeyFailure.FAILED);
            return;
        }
        try {
            CredentialManager.create(getContext()).createCredentialAsync(
                getActivity(),
                new CreatePublicKeyCredentialRequest(requestJson),
                null,
                getContext().getMainExecutor(),
                new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                    @Override
                    public void onResult(CreateCredentialResponse result) {
                        if (result instanceof CreatePublicKeyCredentialResponse) {
                            call.resolve(new JSObject().put(
                                "responseJson",
                                ((CreatePublicKeyCredentialResponse) result)
                                    .getRegistrationResponseJson()));
                        } else {
                            call.reject("Unexpected credential response", PasskeyFailure.FAILED);
                        }
                    }

                    @Override
                    public void onError(CreateCredentialException error) {
                        call.reject("Passkey could not be created", PasskeyFailure.codeFor(error));
                    }
                });
        } catch (RuntimeException failure) {
            call.reject("Passkey could not be created", PasskeyFailure.FAILED);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String requestJson = call.getString("requestJson");
        if (requestJson == null || requestJson.isEmpty() || getActivity() == null) {
            call.reject("Passkey request is missing", PasskeyFailure.FAILED);
            return;
        }
        try {
            GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(new GetPublicKeyCredentialOption(requestJson))
                .build();
            CredentialManager.create(getContext()).getCredentialAsync(
                getActivity(),
                request,
                null,
                getContext().getMainExecutor(),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse result) {
                        Credential credential = result.getCredential();
                        if (credential instanceof PublicKeyCredential) {
                            call.resolve(new JSObject().put(
                                "responseJson",
                                ((PublicKeyCredential) credential).getAuthenticationResponseJson()));
                        } else {
                            call.reject("Unexpected credential response", PasskeyFailure.FAILED);
                        }
                    }

                    @Override
                    public void onError(GetCredentialException error) {
                        call.reject("Passkey could not be used", PasskeyFailure.codeFor(error));
                    }
                });
        } catch (RuntimeException failure) {
            call.reject("Passkey could not be used", PasskeyFailure.FAILED);
        }
    }
}
