package de.eimir.nativetest.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** The persisted device session. Plaintext exists only in memory. */
@Serializable
data class StoredSession(
    /** Sessions are bound to the origin that issued them and never replayed elsewhere. */
    val origin: String,
    val accountId: String,
    val displayName: String,
    val accessToken: String,
    val accessExpiresAtEpochSeconds: Long,
    val refreshToken: String,
    val refreshExpiresAtEpochSeconds: Long,
    val activeSpaceId: String? = null,
    /**
     * Identity of one sign-in. Token rotation keeps it; any new sign-in, even
     * to the same Account, replaces it, so caches can never cross logins.
     */
    val loginId: String = "",
)

/** Abstraction so session logic can be unit-tested without the Android Keystore. */
interface SessionPersistence {
    fun read(): StoredSession?
    fun write(session: StoredSession)
    fun clear()
}

/**
 * Stores the session as one AES-GCM sealed file.
 *
 * The key is generated inside the Android Keystore and never leaves it. The
 * file lives in `noBackupFilesDir`, and the manifest additionally disables
 * backup and device transfer, so tokens never reach a cloud backup or another
 * device. A key that the system invalidated (for example after a lock-screen
 * reset) yields "signed out" rather than a crash.
 */
class KeystoreSessionPersistence(context: Context) : SessionPersistence {
    private val file = File(context.noBackupFilesDir, "session.sealed")
    private val json = Json { ignoreUnknownKeys = true }

    @Synchronized
    override fun read(): StoredSession? {
        if (!file.exists()) return null
        return runCatching {
            val sealed = file.readBytes()
            val ivLength = sealed[0].toInt()
            val iv = sealed.copyOfRange(1, 1 + ivLength)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
            val plain = cipher.doFinal(sealed, 1 + ivLength, sealed.size - 1 - ivLength)
            json.decodeFromString(StoredSession.serializer(), plain.decodeToString())
        }.getOrElse {
            // Undecryptable state is unusable; drop it instead of retrying forever.
            file.delete()
            null
        }
    }

    @Synchronized
    override fun write(session: StoredSession) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val iv = cipher.iv
        val encrypted = cipher.doFinal(json.encodeToString(StoredSession.serializer(), session).encodeToByteArray())
        val temp = File(file.parentFile, file.name + ".tmp")
        temp.writeBytes(byteArrayOf(iv.size.toByte()) + iv + encrypted)
        // Rename is atomic on the same filesystem: a crash never leaves half a session.
        if (!temp.renameTo(file)) {
            file.delete()
            temp.renameTo(file)
        }
    }

    @Synchronized
    override fun clear() {
        file.delete()
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "eimir-native-test-session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val TAG_BITS = 128
    }
}
