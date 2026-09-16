package de.eimir.app.reference

import eimir.api.models.MemoryDetail

/** Transient task state only: never written to saved state, routes, or persistent storage. */
data class MemoryTask(
    val generation: Long,
    val title: String = "",
    val body: String = "",
    val happenedOn: String = "",
    val phase: MemoryTaskPhase = MemoryTaskPhase.EDITING,
    val confirmedMemory: MemoryDetail? = null,
    val problem: UiMessage? = null,
) {
    val pending: Boolean get() = phase == MemoryTaskPhase.SUBMITTING
    val editable: Boolean get() = phase == MemoryTaskPhase.EDITING || phase == MemoryTaskPhase.REJECTED
    val hasText: Boolean get() = title.isNotEmpty() || body.isNotEmpty() || happenedOn.isNotEmpty()
}

enum class MemoryTaskPhase {
    EDITING,
    SUBMITTING,
    REJECTED,
    UNCERTAIN,
    ATTACHMENT_RECOVERY,
    CONFIRMED,
}

/** Only an explicit rejected request is safe to repeat without an idempotency contract. */
internal fun isKnownCreateRejection(failure: Throwable): Boolean =
    failure is ReferenceApiException && failure.status in setOf(400, 401, 403, 404, 409, 413, 422, 429)
