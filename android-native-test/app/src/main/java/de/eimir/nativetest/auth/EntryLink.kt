package de.eimir.nativetest.auth

import java.net.URI
import java.net.URLDecoder

/** A mailbox or invitation proof delivered to the app. Kept in memory only. */
sealed interface EntryLink {
    val token: String

    data class MagicLink(override val token: String) : EntryLink
    data class Signup(override val token: String, val invitationToken: String?) : EntryLink
    data class Invitation(override val token: String) : EntryLink
    data class EmailVerification(override val token: String) : EntryLink
}

/**
 * Recognizes the backend's mailed links (`<origin>/auth/<kind>?token=...`).
 *
 * Only links from the pinned origin are accepted, mirroring the Web intake
 * (#1375): a link from another host is never treated as a proof for this
 * instance. Shared text may contain the link inside a sentence, so the first
 * matching URL in the text is used. Recovery links are not handled because the
 * test instance has no password authentication.
 */
object EntryLinkParser {
    private val urlPattern = Regex("""https?://[^\s<>"']+""")

    fun parse(text: String?, origin: String): EntryLink? {
        if (text.isNullOrBlank()) return null
        return urlPattern.findAll(text.trim()).firstNotNullOfOrNull { parseUrl(it.value.trimEnd('.', ',', ')'), origin) }
            ?: parseUrl(text.trim(), origin)
    }

    private fun parseUrl(value: String, origin: String): EntryLink? {
        val uri = runCatching { URI(value) }.getOrNull() ?: return null
        val expected = runCatching { URI(origin) }.getOrNull() ?: return null
        if (!uri.scheme.equals(expected.scheme, ignoreCase = true)) return null
        if (!uri.host.equals(expected.host, ignoreCase = true) || uri.port != expected.port) return null
        val token = query(uri.rawQuery)["token"]?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return when (uri.rawPath?.trimEnd('/')) {
            "/auth/magic-link" -> EntryLink.MagicLink(token)
            "/auth/signup" -> EntryLink.Signup(token, query(uri.rawFragment)["invitationToken"]?.trim()?.ifEmpty { null })
            "/auth/invitation" -> EntryLink.Invitation(token)
            "/auth/verify-email" -> EntryLink.EmailVerification(token)
            else -> null
        }
    }

    private fun query(raw: String?): Map<String, String> =
        raw.orEmpty().split('&').filter { it.contains('=') }.associate { pair ->
            val (key, value) = pair.split('=', limit = 2)
            URLDecoder.decode(key, Charsets.UTF_8.name()) to URLDecoder.decode(value, Charsets.UTF_8.name())
        }
}
