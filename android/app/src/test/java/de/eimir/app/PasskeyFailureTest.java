package de.eimir.app;

import static org.junit.Assert.assertEquals;

import androidx.credentials.exceptions.CreateCredentialCancellationException;
import androidx.credentials.exceptions.CreateCredentialUnknownException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialUnknownException;
import androidx.credentials.exceptions.NoCredentialException;
import androidx.credentials.exceptions.domerrors.InvalidStateError;
import androidx.credentials.exceptions.domerrors.NotAllowedError;
import androidx.credentials.exceptions.domerrors.SecurityError;
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException;
import androidx.credentials.exceptions.publickeycredential.GetPublicKeyCredentialDomException;
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

    @Test public void anUntrustedAppIsToldApartFromOtherFailures() {
        assertEquals(PasskeyFailure.NOT_TRUSTED, PasskeyFailure.codeFor(
            new CreatePublicKeyCredentialDomException(new SecurityError(), "rp=app.eimir.de")));
        assertEquals(PasskeyFailure.NOT_TRUSTED, PasskeyFailure.codeFor(
            new GetPublicKeyCredentialDomException(new SecurityError(), "rp=app.eimir.de")));
    }

    @Test public void anExistingPasskeyIsToldApartFromOtherFailures() {
        assertEquals(PasskeyFailure.ALREADY_REGISTERED, PasskeyFailure.codeFor(
            new CreatePublicKeyCredentialDomException(new InvalidStateError(), "x")));
    }

    @Test public void otherDomErrorsStayGeneric() {
        assertEquals(PasskeyFailure.FAILED, PasskeyFailure.codeFor(
            new CreatePublicKeyCredentialDomException(new NotAllowedError(), "x")));
    }
}
