package de.eimir.app;

import androidx.credentials.exceptions.CreateCredentialCancellationException;
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException;
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialUnsupportedException;
import androidx.credentials.exceptions.NoCredentialException;

/**
 * Maps Credential Manager failures to the stable codes the Web layer
 * understands. Messages never leave the device: they can name the relying
 * party and the credential provider.
 */
final class PasskeyFailure {
    static final String CANCELLED = "CANCELLED";
    static final String NO_CREDENTIAL = "NO_CREDENTIAL";
    static final String UNAVAILABLE = "UNAVAILABLE";
    static final String FAILED = "FAILED";

    private PasskeyFailure() {}

    static String codeFor(Exception failure) {
        if (failure instanceof GetCredentialCancellationException
            || failure instanceof CreateCredentialCancellationException) {
            return CANCELLED;
        }
        if (failure instanceof NoCredentialException) {
            return NO_CREDENTIAL;
        }
        if (failure instanceof GetCredentialProviderConfigurationException
            || failure instanceof CreateCredentialProviderConfigurationException
            || failure instanceof GetCredentialUnsupportedException
            || failure instanceof CreateCredentialNoCreateOptionException) {
            return UNAVAILABLE;
        }
        return FAILED;
    }
}
