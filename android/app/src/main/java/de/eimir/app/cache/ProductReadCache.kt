package de.eimir.app.cache

import de.eimir.app.reference.ReferenceApiException
import java.io.IOException
import java.time.Instant
import java.util.Collections
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The shared Story kinds this cache covers, matching the Web client's own
 * `productReadCache.ts` (`ProductCacheKind`) rather than caching every
 * domain at once. `STORY` is the timeline list itself; the other three are
 * one open detail screen each.
 */
enum class ProductCacheKind(val segment: String) {
    MEMORY("memory"),
    MILESTONE("milestone"),
    HEART_MOMENT("heartMoment"),
    STORY("story"),
    COLLECTION("collection"),
    PLANNING("planning"),
    PLACE("place"),
    CHAPTER("chapter"),
    DASHBOARD("dashboard"),
}

/**
 * The unfiltered first Timeline page is cached per Account+Space under this
 * nil UUID. Scoped F2 Timeline reads remain in memory and must never use this
 * entry as a fallback for a different visible query.
 */
val StoryTimelineResourceId: UUID = UUID(0L, 0L)

/** Shared Collections have no filters either — one list per Account+Space. */
val CollectionListResourceId: UUID = UUID(0L, 0L)

/**
 * Wishes and Plans are fetched and cached together as one snapshot, matching
 * `loadPlanning()`'s existing combined fetch/combined error state — there is
 * one screen, one busy flag, one problem, so there is one cache entry too.
 */
val PlanningResourceId: UUID = UUID(0L, 0L)

/** Places and Chapters have no filters either — one list each per Account+Space. */
val PlaceListResourceId: UUID = UUID(0L, 0L)
val ChapterListResourceId: UUID = UUID(0L, 0L)

/** There is exactly one Today dashboard per Account+Space. */
val TodayDashboardResourceId: UUID = UUID(0L, 0L)

/**
 * The current-user Private Area lists this cache covers. `OWNER_ONLY`
 * content, unlike [ProductCacheKind]'s `SPACE_SHARED` kinds: server-side
 * filtering already scopes each list to its owner, and the cache namespace
 * additionally carries the owner per M2-D18's Android decision.
 */
enum class ProtectedCacheKind(val segment: String) {
    PRIVATE_NOTE("privateNote"),
    GIFT_IDEA("giftIdea"),
    PRIVATE_COLLECTION("privateCollection"),
}

/** Each Private Area surface here is one whole list, not a per-item resource. */
val PrivateAreaListResourceId: UUID = UUID(0L, 0L)

data class ProductReadResult<T>(
    val value: T,
    val fromCache: Boolean,
    val refreshedAt: Instant,
)

private const val MAX_AGE_MILLIS = 7L * 24 * 60 * 60 * 1000
private const val SCOPE = "SPACE_SHARED"
private const val PROTECTED_SCOPE = "OWNER_ONLY"

/**
 * The M2-D18 read cache for shared Story content and the current-user
 * Private Area, backed by Room.
 *
 * A cache attempt is only ever made after [isServerAvailabilityFailure]
 * accepts the failure — the same rule the Web client's
 * `mayUseOfflineProductCache` enforces — so a `401`/`403`/Privacy-safe
 * `404`/`409` is never silently papered over with a stale row.
 *
 * [protectedDao]/[protectedCipher] are both null unless the caller configures
 * `OWNER_ONLY` persistence; [loadProtectedWithFallback] then behaves as
 * memory-only (fresh reads succeed, nothing survives to fall back to), which
 * is also what M2-D18 requires when Keystore-backed encryption cannot be set
 * up safely on a given device.
 *
 * This class is the single authority for *when* either store may be touched.
 * Every read takes a [CacheLease] naming the Account+Space and the cache
 * generation it started under, and no row is written or served without that
 * lease still being the current one — so the invariant a caller can rely on
 * is: once a context has been invalidated, no read that began under it can
 * persist or return `SPACE_SHARED` or `OWNER_ONLY` data, however late it
 * finishes. Both stores share that one boundary rather than each being
 * cleared by whoever remembers to.
 */
class ProductReadCache(
    private val productDao: ProductCacheDao,
    private val contextDao: CacheContextDao,
    private val protectedDao: ProtectedCacheDao? = null,
    private val protectedCipher: ProtectedPayloadCipher? = null,
) {
    private fun cacheKey(accountId: UUID, spaceId: UUID, kind: ProductCacheKind, resourceId: UUID): String =
        "$accountId:$spaceId:$SCOPE:${kind.segment}:$resourceId"

    private fun protectedCacheKey(
        accountId: UUID,
        spaceId: UUID,
        ownerId: UUID,
        kind: ProtectedCacheKind,
        resourceId: UUID,
    ): String = "$accountId:$spaceId:$PROTECTED_SCOPE:$ownerId:${kind.segment}:$resourceId"

    /**
     * The Account+Space context a read was started under, together with the
     * cache generation that context carried at the time. Captured before
     * network I/O and revalidated immediately before every persistence
     * decision, so a read that outlives its own context cannot write.
     */
    private data class CacheLease(val accountId: String, val spaceId: String, val generation: String)

    /**
     * Serializes every context transition and every persistence decision, so
     * "is this lease still current?" and the write it authorizes cannot be
     * separated by a wipe. Deliberately never held across [load] — network
     * I/O runs unlocked, between two short critical sections.
     */
    private val contextMutex = Mutex()

    /**
     * The generation currently published on disk, mirrored in memory so
     * [invalidateContextNow] can end it without suspending.
     */
    @Volatile
    private var activeGeneration: String? = null

    /**
     * Generations this instance has ended but whose on-disk wipe may not have
     * run yet, so a lease can be refused before [clearAll] gets its turn.
     * Emptied again as soon as the marker is provably gone, which is the
     * point from which the marker alone already refuses those leases.
     */
    private val endedGenerations: MutableSet<String> =
        Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())

    /**
     * Ends the current cache context at once, without waiting for the wipe
     * that follows it.
     *
     * Logout, Account switch, Space switch, membership loss and leaving the
     * demo all happen on a caller that cannot suspend, so they can only start
     * [clearAll] and move on. That leaves a window in which the marker on
     * disk still names the outgoing context — long enough for a read that was
     * already in flight to come back and persist into it. Calling this first
     * closes the window: the generation is dead from this line on, and the
     * wipe that follows is then only about removing rows, not about deciding
     * who may still write.
     */
    fun invalidateContextNow() {
        activeGeneration?.let { endedGenerations.add(it) }
        activeGeneration = null
    }

    /**
     * Establishes the caller's Account+Space as the cache context and returns
     * a lease for it, or `null` when nothing may be persisted or served.
     *
     * When the recorded marker names a different Account+Space — a context
     * change this instance never saw the matching [clearAll] for, e.g. after
     * process death — **both** persistent stores are wiped before the new
     * marker is published, which is the defensive half of M2-D18's clearing
     * rule. Publishing last is what makes the wipe atomic in effect: if any
     * step fails, the old marker stays, no lease is issued, and the cache
     * neither writes nor serves until a later attempt completes the wipe.
     */
    private suspend fun captureLease(accountId: UUID, spaceId: UUID): CacheLease? = contextMutex.withLock {
        val account = accountId.toString()
        val space = spaceId.toString()
        val current = runCatching { contextDao.get() }.getOrElse { return@withLock null }
        if (current != null &&
            current.accountId == account &&
            current.spaceId == space &&
            // A marker this instance already ended is not reusable, even for
            // the same Account+Space: its rows are still owed a wipe.
            current.generation !in endedGenerations
        ) {
            activeGeneration = current.generation
            return@withLock CacheLease(account, space, current.generation)
        }

        val next = CacheContextEntity(
            accountId = account,
            spaceId = space,
            // A fresh generation even when returning to a previously cached
            // Account+Space: leases from before the transition must not be
            // able to match the context again once it is re-established.
            generation = UUID.randomUUID().toString(),
        )
        val published = runCatching {
            productDao.clearAll()
            protectedDao?.clearAll()
            contextDao.set(next)
        }
        if (published.isFailure) return@withLock null
        activeGeneration = next.generation
        CacheLease(account, space, next.generation)
    }

    /**
     * Whether the on-disk marker still names exactly the context and
     * generation [lease] was captured under. The marker, not this instance's
     * memory, is the authority: a second [ProductReadCache] over the same
     * database (and a fresh process) reaches the same verdict.
     */
    private suspend fun isLeaseCurrent(lease: CacheLease): Boolean {
        if (lease.generation in endedGenerations) return false
        val current = runCatching { contextDao.get() }.getOrNull() ?: return false
        return current.accountId == lease.accountId &&
            current.spaceId == lease.spaceId &&
            current.generation == lease.generation
    }

    /**
     * Runs [block] only while [lease] is still the current context, with the
     * check and the work in one critical section so an invalidation cannot
     * land between them. Returns `null` when the lease has been invalidated,
     * which every caller treats as "no cache" rather than as an error.
     */
    private suspend fun <R> withCurrentLease(lease: CacheLease, block: suspend () -> R): R? =
        contextMutex.withLock { if (isLeaseCurrent(lease)) block() else null }

    /**
     * Runs [load]; on success, caches the result (unless [canPersist]
     * refuses it) and returns it fresh. On a server-availability failure,
     * falls back to an unexpired cached row for the same key when one
     * exists. Any other failure — including an expired or otherwise
     * unusable cached row — propagates the original network failure
     * unchanged, so the caller's existing error handling needs no cache-
     * specific branch.
     */
    suspend fun <T> loadWithFallback(
        accountId: UUID,
        spaceId: UUID,
        kind: ProductCacheKind,
        resourceId: UUID,
        canPersist: (T) -> Boolean = { true },
        load: suspend () -> T,
        serialize: (T) -> String,
        deserialize: (String) -> T,
    ): Result<ProductReadResult<T>> {
        val lease = captureLease(accountId, spaceId)
        val key = cacheKey(accountId, spaceId, kind, resourceId)

        // The network call runs without the context lock held: a slow or
        // hanging request must never block a logout/Space switch from wiping.
        val networkResult = runCatching { load() }
        val value = networkResult.getOrNull()
        if (value != null) {
            if (lease != null) {
                withCurrentLease(lease) {
                    if (canPersist(value)) {
                        productDao.put(
                            ProductCacheEntity(
                                cacheKey = key,
                                accountId = accountId.toString(),
                                spaceId = spaceId.toString(),
                                kind = kind.segment,
                                resourceId = resourceId.toString(),
                                payloadJson = serialize(value),
                                refreshedAtEpochMs = System.currentTimeMillis(),
                            ),
                        )
                    } else {
                        productDao.delete(key)
                    }
                }
            }
            return Result.success(ProductReadResult(value, fromCache = false, refreshedAt = Instant.now()))
        }

        val throwable = networkResult.exceptionOrNull()
            ?: return Result.failure(IllegalStateException("Neither a value nor a failure was produced."))
        if (!isServerAvailabilityFailure(throwable)) return Result.failure(throwable)
        // No lease means the context this read started under is gone, or the
        // wipe that a context change owes has not completed: fail closed onto
        // the original network failure rather than serve a row from either.
        if (lease == null) return Result.failure(throwable)

        val cached = withCurrentLease(lease) {
            val row = productDao.get(key)
            if (row == null || !isFresh(row.refreshedAtEpochMs)) {
                if (row != null) productDao.delete(key)
                return@withCurrentLease null
            }
            val cachedValue = deserialize(row.payloadJson)
            if (!canPersist(cachedValue)) {
                productDao.delete(key)
                return@withCurrentLease null
            }
            ProductReadResult(
                cachedValue,
                fromCache = true,
                refreshedAt = Instant.ofEpochMilli(row.refreshedAtEpochMs),
            )
        } ?: return Result.failure(throwable)

        return Result.success(cached)
    }

    /**
     * The `OWNER_ONLY` counterpart to [loadWithFallback]: same fallback
     * eligibility and freshness rule, but the cached bytes are encrypted with
     * [protectedCipher] before ever reaching [protectedDao], and a decrypt
     * failure — a corrupted row, or an unreadable key after e.g. a Keystore
     * reset — is treated as no usable cache rather than surfaced as a crash,
     * per M2-D18's "fail closed" requirement.
     */
    suspend fun <T> loadProtectedWithFallback(
        accountId: UUID,
        spaceId: UUID,
        ownerId: UUID,
        kind: ProtectedCacheKind,
        resourceId: UUID,
        load: suspend () -> T,
        serialize: (T) -> String,
        deserialize: (String) -> T,
    ): Result<ProductReadResult<T>> {
        val lease = captureLease(accountId, spaceId)
        val dao = protectedDao
        val cipher = protectedCipher
        val key = protectedCacheKey(accountId, spaceId, ownerId, kind, resourceId)

        // Unlocked for the same reason as the shared path: no lock over I/O.
        val networkResult = runCatching { load() }
        val value = networkResult.getOrNull()
        if (value != null) {
            if (lease != null && dao != null && cipher != null) {
                withCurrentLease(lease) {
                    // A failure here (e.g. the Keystore key became unusable)
                    // means falling back to memory-only owner content, per
                    // M2-D18 — not persisting the plaintext as a weaker
                    // substitute.
                    runCatching {
                        val encrypted = cipher.encrypt(serialize(value))
                        dao.put(
                            ProtectedCacheEntity(
                                cacheKey = key,
                                accountId = accountId.toString(),
                                spaceId = spaceId.toString(),
                                ownerId = ownerId.toString(),
                                kind = kind.segment,
                                resourceId = resourceId.toString(),
                                ciphertext = encrypted.ciphertext,
                                iv = encrypted.iv,
                                refreshedAtEpochMs = System.currentTimeMillis(),
                            ),
                        )
                    }
                }
            }
            return Result.success(ProductReadResult(value, fromCache = false, refreshedAt = Instant.now()))
        }

        val throwable = networkResult.exceptionOrNull()
            ?: return Result.failure(IllegalStateException("Neither a value nor a failure was produced."))
        if (!isServerAvailabilityFailure(throwable)) return Result.failure(throwable)
        // No persistence configured at all: there is nothing to fall back to.
        if (dao == null || cipher == null) return Result.failure(throwable)
        // Same fail-closed rule as the shared path — and it matters more here,
        // because what an invalidated lease would otherwise unlock is the
        // previous owner's `OWNER_ONLY` content.
        if (lease == null) return Result.failure(throwable)

        val cached = withCurrentLease(lease) {
            val row = dao.get(key)
            if (row == null || !isFresh(row.refreshedAtEpochMs)) {
                if (row != null) dao.delete(key)
                return@withCurrentLease null
            }
            val decrypted = runCatching {
                deserialize(cipher.decrypt(EncryptedPayload(row.ciphertext, row.iv)))
            }.getOrElse {
                dao.delete(key)
                return@withCurrentLease null
            }
            ProductReadResult(
                decrypted,
                fromCache = true,
                refreshedAt = Instant.ofEpochMilli(row.refreshedAtEpochMs),
            )
        } ?: return Result.failure(throwable)

        return Result.success(cached)
    }

    /**
     * The full wipe M2-D18 requires on logout, Account switch, Space switch,
     * membership loss and leaving the demo.
     *
     * The marker is dropped first and under the same lock every persistence
     * decision takes, so the moment this returns — and in fact the moment the
     * marker is gone — every lease captured before it has already stopped
     * being current. An in-flight read finishing afterwards therefore finds
     * no lease to write under, whichever of the two stores it belongs to.
     * Both row wipes are attempted even if an earlier step fails; the first
     * failure is rethrown once none of them can still be tried.
     */
    suspend fun clearAll() {
        invalidateContextNow()
        contextMutex.withLock {
            val markerCleared = runCatching { contextDao.clear() }
            if (markerCleared.isSuccess) {
                // With no marker on disk, no lease can pass the context check
                // any more, so the in-memory list of ended generations has
                // nothing left to refuse and does not need to keep growing.
                endedGenerations.clear()
            }
            val failures = listOf(
                markerCleared,
                runCatching { productDao.clearAll() },
                runCatching { protectedDao?.clearAll() },
            ).mapNotNull { it.exceptionOrNull() }
            val firstFailure = failures.firstOrNull()
            if (firstFailure != null) throw firstFailure
        }
    }
}

private fun isFresh(refreshedAtEpochMs: Long, now: Long = System.currentTimeMillis()): Boolean =
    refreshedAtEpochMs in 0..now && now - refreshedAtEpochMs <= MAX_AGE_MILLIS

/**
 * M2-D18's "transport/server availability failure" boundary: a network-level
 * [IOException] (timeout, connection refused, DNS failure, offline) or an
 * explicit maintenance/gateway status the issue names (502/503/504). A plain
 * `500` is deliberately excluded — that is more likely a real server bug
 * than a temporary unavailability, and M2-D18 requires the cache to never
 * mask an authoritative failure it is not confident is transient.
 */
fun isServerAvailabilityFailure(throwable: Throwable): Boolean = when (throwable) {
    is IOException -> true
    is ReferenceApiException -> throwable.status in SERVER_UNAVAILABLE_STATUSES
    else -> false
}

private val SERVER_UNAVAILABLE_STATUSES = setOf(502, 503, 504)
