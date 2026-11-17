package de.eimir.app;

import static org.junit.Assert.assertEquals;

import androidx.credentials.exceptions.CreateCredentialCancellationException;
import androidx.credentials.exceptions.CreateCredentialUnknownException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialUnknownException;
import androidx.credentials.exceptions.NoCredentialException;
import org.junit.Test;

public class PasskeyFailureTest {
    @Test public void aClosedSheetIsACancellation() {
        assertEquals(PasskeyFailure.CANCELLED,
            PasskeyFailure.codeFor(new GetCredentialCancellationException()));
        assertEquals(PasskeyFailure.CANCELLED,
            PasskeyFailure.codeFor(new CreateCredentialCancellationException()));
    }

    @Test public void aDeviceWithoutAPasskeyIsReportedAsSuch() {
        assertEquals(PasskeyFailure.NO_CREDENTIAL,
            PasskeyFailure.codeFor(new NoCredentialException()));
    }

    @Test public void aMissingProviderIsUnavailable() {
        assertEquals(PasskeyFailure.UNAVAILABLE,
            PasskeyFailure.codeFor(new GetCredentialProviderConfigurationException()));
    }

    @Test public void anythingElseFailsWithoutLeakingTheMessage() {
        assertEquals(PasskeyFailure.FAILED,
            PasskeyFailure.codeFor(new GetCredentialUnknownException("rp=app.eimir.de")));
        assertEquals(PasskeyFailure.FAILED,
            PasskeyFailure.codeFor(new CreateCredentialUnknownException()));
        assertEquals(PasskeyFailure.FAILED, PasskeyFailure.codeFor(new IllegalStateException("x")));
    }
}
