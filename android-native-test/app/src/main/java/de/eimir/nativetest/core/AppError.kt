package de.eimir.nativetest.core

import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException

/**
 * Failure categories the UI can explain without exposing backend details.
 *
 * A ProblemDetails `detail` may name internal reasons or resources, so it never
 * reaches a screen. 403 and 404 deliberately collapse into [Unavailable] so the
 * difference cannot disclose that a resource exists.
 */
sealed interface AppError {
    data object Offline : AppError
    data object SessionEnded : AppError
    data object Unavailable : AppError
    data object Conflict : AppError
    data object PremiumRequired : AppError
    data object RateLimited : AppError
    data object Maintenance : AppError
    data object Invalid : AppError
    data object Server : AppError
    data object Unexpected : AppError
}

class AppException(val error: AppError, cause: Throwable? = null) : Exception(error.toString(), cause)

/** Maps any failure to an [AppError]; coroutine cancellation is always rethrown. */
fun Throwable.toAppError(): AppError = when (this) {
    is CancellationException -> throw this
    is AppException -> error
    is HttpException -> httpError(code(), response()?.errorBody()?.let { runCatching { it.string() }.getOrNull() })
    is IOException -> AppError.Offline
    is SerializationException -> AppError.Unexpected
    else -> AppError.Unexpected
}

internal fun httpError(code: Int, body: String?): AppError = when {
    code == 401 -> AppError.SessionEnded
    code == 402 -> AppError.PremiumRequired
    code == 403 && body?.contains("PREMIUM", ignoreCase = true) == true -> AppError.PremiumRequired
    code == 403 || code == 404 || code == 410 -> AppError.Unavailable
    code == 409 || code == 412 || code == 428 -> AppError.Conflict
    code == 422 || code == 400 -> AppError.Invalid
    code == 429 -> AppError.RateLimited
    code == 503 && body?.contains("MAINTENANCE", ignoreCase = true) == true -> AppError.Maintenance
    code >= 500 -> AppError.Server
    else -> AppError.Unexpected
}

/** Runs a suspending call and reports either its value or a mapped [AppError]. */
suspend inline fun <T> attempt(block: () -> T): Result<T> = try {
    Result.success(block())
} catch (cancelled: CancellationException) {
    throw cancelled
} catch (failure: Throwable) {
    Result.failure(AppException(failure.toAppError(), failure))
}

val Throwable.appError: AppError get() = (this as? AppException)?.error ?: toAppError()
