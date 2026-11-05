package de.eimir.nativetest.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EntryLinkParserTest {
    private val origin = "https://demo.eimir.ur-cloud.de"

    @Test
    fun `magic link from the pinned origin is recognized`() {
        val link = EntryLinkParser.parse("https://demo.eimir.ur-cloud.de/auth/magic-link?token=abc%2B123", origin)
        assertEquals(EntryLink.MagicLink("abc+123"), link)
    }

    @Test
    fun `shared mail text containing the link is accepted`() {
        val text = "Hier ist dein Anmeldelink:\n\nhttps://demo.eimir.ur-cloud.de/auth/magic-link?token=t0k3n.\n\nEr gilt 15 Minuten."
        assertEquals(EntryLink.MagicLink("t0k3n"), EntryLinkParser.parse(text, origin))
    }

    @Test
    fun `links from other hosts are never treated as proofs`() {
        assertNull(EntryLinkParser.parse("https://evil.example/auth/magic-link?token=x", origin))
        assertNull(EntryLinkParser.parse("https://demo.eimir.ur-cloud.de.evil.example/auth/magic-link?token=x", origin))
        assertNull(EntryLinkParser.parse("http://demo.eimir.ur-cloud.de/auth/magic-link?token=x", origin))
        assertNull(EntryLinkParser.parse("https://demo.eimir.ur-cloud.de:8443/auth/magic-link?token=x", origin))
    }

    @Test
    fun `unknown paths and missing tokens are rejected`() {
        assertNull(EntryLinkParser.parse("https://demo.eimir.ur-cloud.de/auth/recovery?token=x", origin))
        assertNull(EntryLinkParser.parse("https://demo.eimir.ur-cloud.de/auth/magic-link", origin))
        assertNull(EntryLinkParser.parse("https://demo.eimir.ur-cloud.de/auth/magic-link?token=", origin))
        assertNull(EntryLinkParser.parse("not a link", origin))
        assertNull(EntryLinkParser.parse(null, origin))
    }

    @Test
    fun `signup proof keeps the invitation token from the fragment`() {
        val link = EntryLinkParser.parse("https://demo.eimir.ur-cloud.de/auth/signup?token=s1#invitationToken=i2", origin)
        assertEquals(EntryLink.Signup("s1", "i2"), link)
    }

    @Test
    fun `invitation and verification links map to their own kinds`() {
        assertEquals(EntryLink.Invitation("i"), EntryLinkParser.parse("https://demo.eimir.ur-cloud.de/auth/invitation?token=i", origin))
        assertEquals(EntryLink.EmailVerification("v"), EntryLinkParser.parse("https://demo.eimir.ur-cloud.de/auth/verify-email/?token=v", origin))
    }
}
