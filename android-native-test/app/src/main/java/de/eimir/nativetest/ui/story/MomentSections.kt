package de.eimir.nativetest.ui.story

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import de.eimir.nativetest.R
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.AppGraph
import de.eimir.nativetest.core.appError
import de.eimir.nativetest.data.Change
import de.eimir.nativetest.data.MomentKind
import de.eimir.nativetest.ui.common.Dates
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.PersonAvatar
import de.eimir.nativetest.ui.common.SectionTitle
import de.eimir.nativetest.ui.common.currentLocale
import de.eimir.nativetest.ui.common.failedWith
import de.eimir.nativetest.ui.common.graphViewModel
import de.eimir.nativetest.ui.common.message
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import eimir.api.models.CommentDetail
import eimir.api.models.PlaceDetail
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---- Comments ----------------------------------------------------------------------------

data class CommentsState(
    val comments: Load<List<CommentDetail>> = Load.Loading,
    val sending: Boolean = false,
    val sendError: AppError? = null,
    val actionError: AppError? = null,
)

class CommentsViewModel(private val graph: AppGraph, private val kind: MomentKind, private val targetId: String) : ViewModel() {
    private val repository = graph.repository
    private val _state = MutableStateFlow(CommentsState())
    val state: StateFlow<CommentsState> = _state.asStateFlow()

    /** One key per draft: a retry after a lost response cannot post twice. */
    private var draftKey = UUID.randomUUID().toString()
    val accountId: String = graph.sessions.session?.accountId.orEmpty()

    init {
        load()
        viewModelScope.launch {
            graph.changes.events.collect { if (it is Change.Comments && it.targetId == targetId) load() }
        }
    }

    fun load() {
        viewModelScope.launch {
            repository.comments(kind, targetId)
                .onSuccess { page -> _state.update { it.copy(comments = Load.Ready(page.items)) } }
                .onFailure { failure -> _state.update { it.copy(comments = it.comments.failedWith(failure.appError)) } }
        }
    }

    fun send(body: String, onSent: () -> Unit) {
        val text = body.trim()
        if (text.isEmpty() || _state.value.sending) return
        _state.update { it.copy(sending = true, sendError = null) }
        viewModelScope.launch {
            repository.addComment(kind, targetId, draftKey, text)
                .onSuccess {
                    draftKey = UUID.randomUUID().toString()
                    _state.update { it.copy(sending = false) }
                    onSent()
                }
                .onFailure { failure -> _state.update { it.copy(sending = false, sendError = failure.appError) } }
        }
    }

    fun edit(comment: CommentDetail, body: String) {
        viewModelScope.launch {
            repository.editComment(comment, body.trim(), targetId)
                .onFailure { failure -> _state.update { it.copy(actionError = failure.appError) } }
        }
    }

    fun delete(comment: CommentDetail) {
        viewModelScope.launch {
            repository.deleteComment(comment, targetId)
                .onFailure { failure -> _state.update { it.copy(actionError = failure.appError) } }
        }
    }
}

@Composable
fun CommentsSection(kind: MomentKind, targetId: String, canComment: Boolean, modifier: Modifier = Modifier) {
    val model = graphViewModel(key = "comments-$targetId") { CommentsViewModel(it, kind, targetId) }
    val state by model.state.collectAsStateWithLifecycle()
    // The unsent draft survives rotation and process death but never leaves this screen.
    var draft by rememberSaveable(targetId) { mutableStateOf("") }
    var editing by remember { mutableStateOf<CommentDetail?>(null) }
    var deleting by remember { mutableStateOf<CommentDetail?>(null) }
    val locale = currentLocale()

    Column(modifier.fillMaxWidth().animateContentSize()) {
        SectionTitle(stringResource(R.string.memory_comments))
        when (val load = state.comments) {
            Load.Loading -> Unit
            is Load.Failed -> TextButton(onClick = model::load) { Text(load.error.message()) }
            is Load.Ready -> {
                if (load.value.isEmpty()) {
                    Text(stringResource(R.string.memory_comment_empty), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
                }
                load.value.forEach { comment ->
                    CommentRow(
                        comment = comment,
                        own = comment.authorId.toString() == model.accountId,
                        locale = locale,
                        onEdit = { editing = comment },
                        onDelete = { deleting = comment },
                    )
                }
            }
        }
        state.actionError?.let { Text(it.message(), style = EimirType.bodySmall, color = Eimir.colors.error) }
        if (canComment) {
            Row(Modifier.fillMaxWidth().padding(top = Space.sm), verticalAlignment = Alignment.Bottom) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it.take(4000) },
                    placeholder = { Text(stringResource(R.string.memory_comment_placeholder)) },
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    modifier = Modifier.weight(1f),
                    maxLines = 6,
                    shape = Radii.large,
                )
                IconButton(
                    onClick = { model.send(draft) { draft = "" } },
                    enabled = draft.isNotBlank() && !state.sending,
                ) {
                    Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = stringResource(R.string.action_send), tint = Eimir.colors.brandStrong)
                }
            }
            state.sendError?.let {
                Text(
                    it.message(),
                    style = EimirType.bodySmall,
                    color = Eimir.colors.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
    }

    editing?.let { comment ->
        var text by rememberSaveable(comment.id) { mutableStateOf(comment.body) }
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text(stringResource(R.string.memory_comment_edit)) },
            text = { OutlinedTextField(value = text, onValueChange = { text = it.take(4000) }, maxLines = 8) },
            confirmButton = {
                TextButton(enabled = text.isNotBlank(), onClick = {
                    model.edit(comment, text)
                    editing = null
                }) { Text(stringResource(R.string.action_save)) }
            },
            dismissButton = { TextButton(onClick = { editing = null }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
    deleting?.let { comment ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text(stringResource(R.string.memory_comment_delete)) },
            text = { Text(stringResource(R.string.delete_confirm_body)) },
            confirmButton = {
                TextButton(onClick = {
                    model.delete(comment)
                    deleting = null
                }) { Text(stringResource(R.string.action_delete), color = Eimir.colors.error) }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}

@Composable
private fun CommentRow(comment: CommentDetail, own: Boolean, locale: Locale, onEdit: () -> Unit, onDelete: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(vertical = Space.xs), verticalAlignment = Alignment.Top) {
        PersonAvatar(comment.author.displayName, comment.author.id, comment.author.profileAttachmentId, size = 32.dp)
        Spacer(Modifier.width(Space.sm))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(authorName(comment.author), style = EimirType.label)
                Spacer(Modifier.width(Space.xs))
                Text(
                    Dates.dateTime(comment.createdAt, locale) +
                        if (comment.updatedAt.isAfter(comment.createdAt.plusSeconds(5))) " · " + stringResource(R.string.memory_comment_edited) else "",
                    style = EimirType.meta,
                    color = Eimir.colors.textSecondary,
                )
            }
            Text(comment.body, style = EimirType.body, color = Eimir.colors.textPrimary)
        }
        if (own) {
            Column {
                IconButton(onClick = { menu = true }) {
                    Icon(Icons.Rounded.MoreVert, contentDescription = stringResource(R.string.action_more), tint = Eimir.colors.textSecondary)
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.action_edit)) }, onClick = {
                        menu = false
                        onEdit()
                    })
                    DropdownMenuItem(text = { Text(stringResource(R.string.action_delete)) }, onClick = {
                        menu = false
                        onDelete()
                    })
                }
            }
        }
    }
}

// ---- Photo places ---------------------------------------------------------------------------

class MomentPlacesViewModel(private val graph: AppGraph, private val kind: MomentKind, private val targetId: String) : ViewModel() {
    private val _places = MutableStateFlow<List<PlaceDetail>?>(null)
    val places: StateFlow<List<PlaceDetail>?> = _places.asStateFlow()
    private var reads = 0

    init {
        viewModelScope.launch {
            // Mirrors the Web contract (#1478): poll while an automatic Place
            // is still unnamed, at most 20 reads per screen lifetime. Reading
            // never triggers geocoding; the backend worker resolves names.
            while (reads < MAX_READS) {
                reads++
                graph.repository.momentPlaces(kind, targetId).onSuccess { _places.value = it }
                val pending = _places.value?.any { isPlaceholder(it.name) && it.address.isNullOrBlank() } == true
                if (!pending) break
                delay(3_000)
            }
        }
    }

    companion object {
        const val MAX_READS = 20
        fun isPlaceholder(name: String) = name == "Foto-Ort" || name == "Photo location"
    }
}

@Composable
fun MomentPlacesSection(kind: MomentKind, targetId: String, modifier: Modifier = Modifier) {
    val model = graphViewModel(key = "places-$targetId") { MomentPlacesViewModel(it, kind, targetId) }
    val places by model.places.collectAsStateWithLifecycle()
    val list = places ?: return
    if (list.isEmpty()) return
    val context = LocalContext.current
    val unavailable = stringResource(R.string.place_map_unavailable)
    Column(modifier.fillMaxWidth()) {
        SectionTitle(stringResource(R.string.memory_places))
        list.forEach { place ->
            val placeholder = MomentPlacesViewModel.isPlaceholder(place.name)
            Surface(
                onClick = { openMap(context, place) { Toast.makeText(context, unavailable, Toast.LENGTH_SHORT).show() } },
                enabled = place.latitude != null && place.longitude != null || !place.address.isNullOrBlank(),
                shape = Radii.medium,
                color = Eimir.colors.surface,
                modifier = Modifier.fillMaxWidth().padding(vertical = Space.xxs),
            ) {
                Row(Modifier.heightIn(min = 56.dp).padding(Space.sm), verticalAlignment = Alignment.CenterVertically) {
                    EimirIcon(EimirIcons.Places, size = 22.dp)
                    Spacer(Modifier.width(Space.sm))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(if (placeholder) stringResource(R.string.place_fallback) else place.name, style = EimirType.title)
                        when {
                            !place.address.isNullOrBlank() -> Text(place.address!!, style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
                            placeholder -> Text(stringResource(R.string.memory_place_resolving), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
                            else -> Text(stringResource(R.string.place_view_map), style = EimirType.bodySmall, color = Eimir.colors.link)
                        }
                        if (place.geocodingSource == "openstreetmap") {
                            Text(stringResource(R.string.memory_place_source), style = EimirType.meta, color = Eimir.colors.textMuted)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Opens the person's maps app through a standard `geo:` intent; no map SDK,
 * tile provider or request happens before this deliberate action.
 */
fun openMap(context: android.content.Context, place: PlaceDetail, onUnavailable: () -> Unit) {
    val lat = place.latitude?.toDouble()
    val lng = place.longitude?.toDouble()
    val label = Uri.encode(place.address?.takeIf { it.isNotBlank() } ?: place.name)
    val uri = if (lat != null && lng != null && lat.isFinite() && lng.isFinite() && kotlin.math.abs(lat) <= 90 && kotlin.math.abs(lng) <= 180) {
        Uri.parse("geo:$lat,$lng?q=$lat,$lng($label)")
    } else {
        Uri.parse("geo:0,0?q=$label")
    }
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    } catch (_: ActivityNotFoundException) {
        onUnavailable()
    }
}
