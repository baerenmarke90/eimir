package de.eimir.nativetest.ui.story

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.AppGraph
import de.eimir.nativetest.core.appError
import de.eimir.nativetest.media.PhotoLocation
import de.eimir.nativetest.media.UploadPhase
import eimir.api.models.MemoryCreate
import eimir.api.models.MemoryDetail
import eimir.api.models.MemoryUpdate
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

sealed interface DraftPhotoState {
    data class Uploading(val phase: UploadPhase, val progress: Float) : DraftPhotoState
    data object Ready : DraftPhotoState
    data class Failed(val error: AppError) : DraftPhotoState
}

/** One photo in the draft; [localUri] is set for new picks, [attachmentId] once uploaded or already bound. */
data class DraftPhoto(
    val key: String,
    val localUri: Uri?,
    val attachmentId: UUID?,
    val sensitive: Boolean,
    val state: DraftPhotoState,
    /** Server classification of an already bound photo, for its preview. */
    val bound: Boolean = false,
    val hasThumbnail: Boolean = true,
)

sealed interface SaveState {
    data object Idle : SaveState
    data object Saving : SaveState
    /** The Memory exists, but its photos are not confirmed bound; never create it again. */
    data class Partial(val memory: MemoryDetail, val error: AppError) : SaveState
    data class Failed(val error: AppError) : SaveState
    data class Saved(val memoryId: String) : SaveState
}

data class EditorUi(
    val loading: Boolean = false,
    val loadError: AppError? = null,
    val title: String = "",
    val body: String = "",
    val tags: String = "",
    val date: LocalDate = LocalDate.now(),
    val photos: List<DraftPhoto> = emptyList(),
    val save: SaveState = SaveState.Idle,
    val validation: Int? = null,
    val dirty: Boolean = false,
) {
    val uploading: Boolean get() = photos.any { it.state is DraftPhotoState.Uploading }
}

/** Saved-state shape: identifiers and the person's own typed text only, never tokens. */
@Serializable
private data class SavedPhoto(val key: String, val uri: String?, val attachmentId: String?, val sensitive: Boolean, val bound: Boolean)

/**
 * Create/edit task for one Memory (R1).
 *
 * The draft lives in this ViewModel (rotation, fold, navigation) and in saved
 * state (process death), is bound to its own task and is cleared only after a
 * confirmed save. Uploads start as soon as photos are picked. Saving creates
 * the Memory once (stable idempotency key), then binds the ordered photos;
 * a lost or failed bind becomes [SaveState.Partial] and is retried by
 * reconciling, never by creating a second Memory.
 */
class MemoryEditorViewModel(
    private val graph: AppGraph,
    private val saved: SavedStateHandle,
    private val appContext: Context,
    val memoryId: String?,
) : ViewModel() {
    private val repository = graph.repository
    private val _ui = MutableStateFlow(EditorUi(loading = memoryId != null))
    val ui: StateFlow<EditorUi> = _ui.asStateFlow()

    private var original: MemoryDetail? = null
    private val uploads = mutableMapOf<String, Job>()
    private val uploadSlots = Semaphore(2)
    private val createKey: String = saved.get<String>(KEY_IDEMPOTENCY) ?: UUID.randomUUID().toString().also { saved[KEY_IDEMPOTENCY] = it }
    private val json = Json { ignoreUnknownKeys = true }

    init {
        val restored = restore()
        if (memoryId != null && !restored) load() else if (memoryId != null) loadOriginalOnly()
    }

    private fun restore(): Boolean {
        val title = saved.get<String>(KEY_TITLE) ?: return false
        val photos = saved.get<String>(KEY_PHOTOS)?.let { runCatching { json.decodeFromString<List<SavedPhoto>>(it) }.getOrNull() }.orEmpty()
        _ui.value = EditorUi(
            title = title,
            body = saved.get<String>(KEY_BODY).orEmpty(),
            tags = saved.get<String>(KEY_TAGS).orEmpty(),
            date = saved.get<String>(KEY_DATE)?.let(LocalDate::parse) ?: LocalDate.now(),
            dirty = true,
            photos = photos.map { photo ->
                DraftPhoto(
                    key = photo.key,
                    localUri = photo.uri?.let(Uri::parse),
                    attachmentId = photo.attachmentId?.let(UUID::fromString),
                    sensitive = photo.sensitive,
                    bound = photo.bound,
                    state = if (photo.attachmentId != null) DraftPhotoState.Ready else DraftPhotoState.Failed(AppError.Offline),
                )
            },
        )
        return true
    }

    private fun persist() {
        val ui = _ui.value
        saved[KEY_TITLE] = ui.title
        saved[KEY_BODY] = ui.body
        saved[KEY_TAGS] = ui.tags
        saved[KEY_DATE] = ui.date.toString()
        saved[KEY_PHOTOS] = json.encodeToString(
            ui.photos.map { SavedPhoto(it.key, it.localUri?.toString(), it.attachmentId?.toString(), it.sensitive, it.bound) },
        )
    }

    private fun loadOriginalOnly() {
        viewModelScope.launch { repository.memory(memoryId!!).onSuccess { original = it } }
    }

    fun load() {
        val id = memoryId ?: return
        _ui.update { it.copy(loading = true, loadError = null) }
        viewModelScope.launch {
            repository.memory(id)
                .onSuccess { memory ->
                    original = memory
                    _ui.value = EditorUi(
                        title = memory.title,
                        body = memory.body,
                        tags = memory.tags.joinToString(", "),
                        date = memory.happenedOn ?: LocalDate.now(),
                        photos = memory.attachments.sortedBy { it.position }.map {
                            DraftPhoto(
                                key = it.id.toString(),
                                localUri = null,
                                attachmentId = it.id,
                                sensitive = it.isSensitive == true,
                                state = DraftPhotoState.Ready,
                                bound = true,
                                hasThumbnail = it.hasThumbnail,
                            )
                        },
                    )
                }
                .onFailure { failure -> _ui.update { it.copy(loading = false, loadError = failure.appError) } }
        }
    }

    private fun edit(block: (EditorUi) -> EditorUi) {
        _ui.update { block(it).copy(dirty = true, validation = null) }
        persist()
    }

    fun setTitle(value: String) = edit { it.copy(title = value.take(200)) }
    fun setBody(value: String) = edit { it.copy(body = value.take(20_000)) }
    fun setTags(value: String) = edit { it.copy(tags = value.take(500)) }
    fun setDate(value: LocalDate) = edit { it.copy(date = value) }

    fun addPhotos(uris: List<Uri>) {
        val room = MAX_PHOTOS - _ui.value.photos.size
        if (room <= 0) return
        val added = uris.take(room).map { picked ->
            DraftPhoto(
                key = UUID.randomUUID().toString(),
                localUri = PhotoLocation.uploadUri(appContext, picked),
                attachmentId = null,
                sensitive = false,
                state = DraftPhotoState.Uploading(UploadPhase.Uploading, 0f),
            )
        }
        edit { it.copy(photos = it.photos + added) }
        added.forEach(::startUpload)
    }

    private fun startUpload(photo: DraftPhoto) {
        val uri = photo.localUri ?: return
        uploads[photo.key]?.cancel()
        uploads[photo.key] = viewModelScope.launch {
            uploadSlots.withPermit {
                runCatching {
                    graph.uploader.upload(repository.spaceId, uri) { phase, progress ->
                        updatePhoto(photo.key) { it.copy(state = DraftPhotoState.Uploading(phase, progress)) }
                    }
                }.onSuccess { id ->
                    updatePhoto(photo.key) { it.copy(attachmentId = id, state = DraftPhotoState.Ready) }
                    persist()
                }.onFailure { failure ->
                    if (failure is kotlinx.coroutines.CancellationException) throw failure
                    updatePhoto(photo.key) { it.copy(state = DraftPhotoState.Failed(failure.appError)) }
                }
            }
        }
    }

    fun retryUpload(key: String) {
        val photo = _ui.value.photos.firstOrNull { it.key == key } ?: return
        updatePhoto(key) { it.copy(state = DraftPhotoState.Uploading(UploadPhase.Uploading, 0f)) }
        startUpload(photo)
    }

    fun removePhoto(key: String) {
        uploads.remove(key)?.cancel()
        edit { ui -> ui.copy(photos = ui.photos.filterNot { it.key == key }) }
    }

    fun toggleSensitive(key: String) = edit { ui ->
        ui.copy(photos = ui.photos.map { if (it.key == key) it.copy(sensitive = !it.sensitive) else it })
    }

    fun move(key: String, delta: Int) = edit { ui ->
        val index = ui.photos.indexOfFirst { it.key == key }
        val target = (index + delta).coerceIn(0, ui.photos.lastIndex)
        if (index < 0 || index == target) return@edit ui
        val list = ui.photos.toMutableList()
        list.add(target, list.removeAt(index))
        ui.copy(photos = list)
    }

    private fun updatePhoto(key: String, change: (DraftPhoto) -> DraftPhoto) {
        _ui.update { ui -> ui.copy(photos = ui.photos.map { if (it.key == key) change(it) else it }) }
    }

    /** The backend requires a title; an untitled capture gets the same dated fallback as on the Web. */
    private fun titleFor(ui: EditorUi): String = ui.title.trim().ifEmpty {
        val date = ui.date.format(
            java.time.format.DateTimeFormatter.ofLocalizedDate(java.time.format.FormatStyle.MEDIUM)
                .withLocale(appContext.resources.configuration.locales[0]),
        )
        appContext.getString(de.eimir.nativetest.R.string.editor_fallback_title, date)
    }

    private fun tagList(): List<String> =
        _ui.value.tags.split(',').map { it.trim() }.filter { it.isNotEmpty() }.distinct().take(20)

    fun save() {
        val ui = _ui.value
        if (ui.save == SaveState.Saving) return
        (ui.save as? SaveState.Partial)?.let { return bind(it.memory, reconcile = true) }
        if (ui.uploading) return _ui.update { it.copy(validation = de.eimir.nativetest.R.string.editor_wait_uploads) }
        val readyPhotos = ui.photos.filter { it.attachmentId != null && it.state == DraftPhotoState.Ready }
        if (ui.title.isBlank() && ui.body.isBlank() && readyPhotos.isEmpty()) {
            return _ui.update { it.copy(validation = de.eimir.nativetest.R.string.editor_needs_content) }
        }
        _ui.update { it.copy(save = SaveState.Saving, validation = null) }
        viewModelScope.launch {
            val existing = original
            val result = if (memoryId == null) {
                repository.createMemory(
                    createKey,
                    MemoryCreate(title = titleFor(ui), body = ui.body.trim(), happenedOn = ui.date, tags = tagList()),
                )
            } else if (existing != null) {
                repository.updateMemory(
                    existing,
                    MemoryUpdate(title = titleFor(ui), body = ui.body.trim(), happenedOn = ui.date, tags = tagList()),
                )
            } else {
                Result.failure(de.eimir.nativetest.core.AppException(AppError.Conflict))
            }
            result
                .onSuccess { memory ->
                    original = memory
                    val wanted = readyPhotos.map { it.attachmentId!! to it.sensitive }
                    val current = memory.attachments.sortedBy { it.position }.map { it.id to (it.isSensitive == true) }
                    if (wanted == current) finish(memory) else bind(memory, reconcile = false)
                }
                .onFailure { failure -> _ui.update { it.copy(save = SaveState.Failed(failure.appError)) } }
        }
    }

    private fun bind(memory: MemoryDetail, reconcile: Boolean) {
        val wanted = _ui.value.photos.filter { it.attachmentId != null && it.state == DraftPhotoState.Ready }
            .map { it.attachmentId!! to it.sensitive }
        _ui.update { it.copy(save = SaveState.Saving) }
        viewModelScope.launch {
            repository.bindMemoryAttachments(memory, wanted, reconcile)
                .onSuccess(::finish)
                .onFailure { failure -> _ui.update { it.copy(save = SaveState.Partial(memory, failure.appError)) } }
        }
    }

    private fun finish(memory: MemoryDetail) {
        repository.announceMemory(memory.id.toString())
        listOf(KEY_TITLE, KEY_BODY, KEY_TAGS, KEY_DATE, KEY_PHOTOS, KEY_IDEMPOTENCY).forEach { saved.remove<Any>(it) }
        _ui.update { it.copy(save = SaveState.Saved(memory.id.toString()), dirty = false) }
    }

    /** Discarding cancels running uploads; their pending attachments are deleted by the uploader. */
    fun discard() {
        uploads.values.forEach { it.cancel() }
        listOf(KEY_TITLE, KEY_BODY, KEY_TAGS, KEY_DATE, KEY_PHOTOS, KEY_IDEMPOTENCY).forEach { saved.remove<Any>(it) }
    }

    companion object {
        /** Mirrors MAX_MEMORY_ATTACHMENTS of the backend and Web client. */
        const val MAX_PHOTOS = 20
        private const val KEY_TITLE = "draft.title"
        private const val KEY_BODY = "draft.body"
        private const val KEY_TAGS = "draft.tags"
        private const val KEY_DATE = "draft.date"
        private const val KEY_PHOTOS = "draft.photos"
        private const val KEY_IDEMPOTENCY = "draft.idempotency"
    }
}
