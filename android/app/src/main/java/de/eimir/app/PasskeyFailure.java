package de.eimir.app;

import androidx.credentials.exceptions.CreateCredentialCancellationException;
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException;
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialUnsupportedException;
import androidx.credentials.exceptions.NoCredentialException;
import androidx.credentials.exceptions.domerrors.DomError;
import androidx.credentials.exceptions.domerrors.InvalidStateError;
import androidx.credentials.exceptions.domerrors.SecurityError;
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException;
import androidx.credentials.exceptions.publickeycredential.GetPublicKeyCredentialDomException;

/**
 * Maps Credential Manager failures to the stable codes the Web layer
 * understands. Messages never leave the device: they can name the relying
 * party and the credential provider.
 */
final class PasskeyFailure {
    static final String CANCELLED = "CANCELLED";
    static final String NO_CREDENTIAL = "NO_CREDENTIAL";
    static final String UNAVAILABLE = "UNAVAILABLE";
    /** The relying party does not trust this app (Digital Asset Links). */
    static final String NOT_TRUSTED = "NOT_TRUSTED";
    /** The device already stores a passkey of the Account for the relying party. */
    static final String ALREADY_REGISTERED = "ALREADY_REGISTERED";
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
        DomError dom = domErrorOf(failure);
        if (dom instanceof SecurityError) {
            return NOT_TRUSTED;
        }
        if (dom instanceof InvalidStateError) {
            return ALREADY_REGISTERED;
        }
        return FAILED;
    }

    private static DomError domErrorOf(Exception failure) {
        if (failure instanceof CreatePublicKeyCredentialDomException) {
            return ((CreatePublicKeyCredentialDomException) failure).getDomError();
        }
        if (failure instanceof GetPublicKeyCredentialDomException) {
            return ((GetPublicKeyCredentialDomException) failure).getDomError();
        }
        return null;
    }
}
