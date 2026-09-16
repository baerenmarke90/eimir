package de.eimir.app.reference

import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.delay
import eimir.api.models.AttachmentReadRequest
import eimir.api.models.AttachmentUploadCreate
import eimir.api.models.MediaType
import eimir.api.models.MemoryAttachmentEntry
import eimir.api.models.MemoryAttachmentSet
import eimir.api.models.MemoryCreate
import eimir.api.models.MemoryDetail

data class PreparedAttachment(
    val attachmentId: UUID,
)

enum class AttachmentPreparationPhase {
    UPLOADING,
    VALIDATING,
    READY,
}

suspend fun prepareAttachment(
    api: ReferenceContract,
    spaceId: UUID,
    accessToken: String,
    image: SelectedImage,
    onPhase: (AttachmentPreparationPhase) -> Unit = {},
): PreparedAttachment {
    require(image.mimeType.startsWith("image/")) { "S8 accepts images only." }
    require(image.bytes.isNotEmpty()) { "The selected image is empty." }

    onPhase(AttachmentPreparationPhase.UPLOADING)
    val upload = api.createAttachmentUpload(
        spaceId,
        accessToken,
        AttachmentUploadCreate(
            expectedMimeType = image.mimeType,
            expectedSize = image.bytes.size,
            mediaType = MediaType.IMAGE,
            originalName = image.displayName,
        ),
    )

    api.uploadAttachmentBytes(accessToken, upload, image)
    onPhase(AttachmentPreparationPhase.VALIDATING)
    api.finalizeAttachment(spaceId, accessToken, upload.attachment.id)
    waitUntilReady(api, spaceId, accessToken, upload.attachment.id)
    onPhase(AttachmentPreparationPhase.READY)
    return PreparedAttachment(upload.attachment.id)
}

suspend fun createMemoryWithPreparedAttachments(
    api: ReferenceContract,
    spaceId: UUID,
    accessToken: String,
    title: String,
    body: String,
    happenedOn: LocalDate?,
    attachments: List<PreparedAttachment>,
): ReferenceFlowResult {
    val memory = saveMemoryWithPreparedAttachments(
        api, spaceId, accessToken, title, body, happenedOn, attachments,
    )
    val story = api.getTimeline(spaceId, accessToken)
    val imageBytes = attachments.firstOrNull()?.let { attachment ->
        val descriptor = api.createReadAccess(
            spaceId, accessToken, attachment.attachmentId,
            AttachmentReadRequest(parentId = memory.id, parentType = AttachmentReadRequest.ParentType.MEMORY),
        )
        api.readImageBytes(accessToken, descriptor)
    }
    return ReferenceFlowResult(memory, story, imageBytes)
}

/** Confirmation is independent of optional Timeline and image reads. */
suspend fun saveMemoryWithPreparedAttachments(
    api: ReferenceContract,
    spaceId: UUID,
    accessToken: String,
    title: String,
    body: String,
    happenedOn: LocalDate?,
    attachments: List<PreparedAttachment>,
    onCreated: (MemoryDetail) -> Unit = {},
): MemoryDetail {
    val memory = api.createMemory(
        spaceId,
        accessToken,
        MemoryCreate(body = body, title = title, happenedOn = happenedOn),
    )
    onCreated(memory)
    return if (attachments.isEmpty()) memory else bindMemoryAttachments(
        api, spaceId, accessToken, memory, attachments,
    )
}

/** Uses the supplied object's current version; never creates another Memory. */
suspend fun bindMemoryAttachments(
    api: ReferenceContract,
    spaceId: UUID,
    accessToken: String,
    memory: MemoryDetail,
    attachments: List<PreparedAttachment>,
): MemoryDetail = api.replaceMemoryAttachments(
        spaceId = spaceId,
        accessToken = accessToken,
        memoryId = memory.id,
        ifMatch = memory.version,
        attachments = MemoryAttachmentSet(
            attachments = attachments.mapIndexed { position, attachment ->
                MemoryAttachmentEntry(attachment.attachmentId, position = position)
            },
        ),
    )

suspend fun runMemoryMediaStoryFlow(
    api: ReferenceContract,
    spaceId: UUID,
    accessToken: String,
    title: String,
    body: String,
    happenedOn: LocalDate?,
    image: SelectedImage?,
): ReferenceFlowResult {
    if (image == null) {
        return createMemoryWithPreparedAttachments(
            api = api,
            spaceId = spaceId,
            accessToken = accessToken,
            title = title,
            body = body,
            happenedOn = happenedOn,
            attachments = emptyList(),
        )
    }

    val memory = api.createMemory(
        spaceId,
        accessToken,
        MemoryCreate(body = body, title = title, happenedOn = happenedOn),
    )
    val prepared = prepareAttachment(api, spaceId, accessToken, image)
    val boundMemory = api.replaceMemoryAttachments(
        spaceId = spaceId,
        accessToken = accessToken,
        memoryId = memory.id,
        ifMatch = memory.version,
        attachments = MemoryAttachmentSet(
            attachments = listOf(MemoryAttachmentEntry(prepared.attachmentId, position = 0)),
        ),
    )
    val story = api.getTimeline(spaceId, accessToken)
    val readDescriptor = api.createReadAccess(
        spaceId,
        accessToken,
        prepared.attachmentId,
        AttachmentReadRequest(
            parentId = boundMemory.id,
            parentType = AttachmentReadRequest.ParentType.MEMORY,
        ),
    )
    val imageBytes = api.readImageBytes(accessToken, readDescriptor)

    return ReferenceFlowResult(
        memory = boundMemory,
        story = story,
        imageBytes = imageBytes,
    )
}

private suspend fun waitUntilReady(
    api: ReferenceContract,
    spaceId: UUID,
    accessToken: String,
    attachmentId: UUID,
) {
    val deadlineNanos = System.nanoTime() + 30_000_000_000L
    while (System.nanoTime() < deadlineNanos) {
        val attachment = api.getAttachment(spaceId, accessToken, attachmentId)
        when (attachment.status) {
            "READY" -> return
            "FAILED", "DELETE_FAILED", "DELETING" -> {
                throw IllegalStateException("Media processing ended with status ${attachment.status}.")
            }
        }
        delay(500)
    }
    throw IllegalStateException("Media processing did not reach READY before the deadline.")
}
