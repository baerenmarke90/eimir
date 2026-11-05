package de.eimir.nativetest.ui.more

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import de.eimir.nativetest.BuildConfig
import de.eimir.nativetest.R
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.AppGraph
import de.eimir.nativetest.core.appError
import de.eimir.nativetest.data.Change
import de.eimir.nativetest.ui.common.ConfirmDelete
import de.eimir.nativetest.ui.common.ContextPill
import de.eimir.nativetest.ui.common.Dates
import de.eimir.nativetest.ui.common.ErrorState
import de.eimir.nativetest.ui.common.FullScreenLoading
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.PageSkeleton
import de.eimir.nativetest.ui.common.PersonAvatar
import de.eimir.nativetest.ui.common.ReadingColumn
import de.eimir.nativetest.ui.common.SecondaryButton
import de.eimir.nativetest.ui.common.SectionTitle
import de.eimir.nativetest.ui.common.StateMessage
import de.eimir.nativetest.ui.common.TaskScaffold
import de.eimir.nativetest.ui.common.appGraph
import de.eimir.nativetest.ui.common.currentLocale
import de.eimir.nativetest.ui.common.failedWith
import de.eimir.nativetest.ui.common.graphViewModel
import de.eimir.nativetest.ui.common.message
import de.eimir.nativetest.ui.common.refreshing
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.shell.AppNavigator
import de.eimir.nativetest.ui.story.DetailTopBar
import de.eimir.nativetest.ui.story.MomentPlacesViewModel
import de.eimir.nativetest.ui.story.openMap
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import eimir.api.models.EntitlementStatus
import eimir.api.models.EntitlementTier
import eimir.api.models.PartnerProfileView
import eimir.api.models.PersonRelationship
import eimir.api.models.PhotoLocationPreference
import eimir.api.models.PlaceDetail
import eimir.api.models.PreferenceCategory
import eimir.api.models.PreferenceSentiment
import eimir.api.models.PrivateNoteDetail
import eimir.api.models.ProfilePreferenceView
import eimir.api.models.ProfileVisibility
import eimir.api.models.RelatedPersonView
import eimir.api.models.SpaceEntitlementView
import java.net.URI
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Generic read-and-reload holder for small lists and single projections. */
class ValueViewModel<T>(
    private val graph: AppGraph,
    private val loader: suspend () -> Result<T>,
    private val refreshOn: (Change) -> Boolean = { false },
) : ViewModel() {
    private val _state = MutableStateFlow<Load<T>>(Load.Loading)
    val state: StateFlow<Load<T>> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch { graph.changes.events.collect { if (refreshOn(it)) load() } }
    }

    fun load() {
        _state.update { it.refreshing() }
        viewModelScope.launch {
            loader().onSuccess { _state.value = Load.Ready(it) }.onFailure { failure -> _state.update { it.failedWith(failure.appError) } }
        }
    }
}

// ---- Profile ----------------------------------------------------------------------------------------

data class ProfilePair(val own: PartnerProfileView, val partner: PartnerProfileView?)

@Composable
fun ProfileScreen(nav: AppNavigator) {
    val model = graphViewModel(key = "profile") { g ->
        ValueViewModel(g, {
            runCatching {
                val partnerId = g.repository.space().getOrThrow().partners.firstOrNull { it.id.toString() != g.repository.accountId }?.id
                val own = g.viewModelProfile(g.repository.accountId)
                ProfilePair(own, partnerId?.let { g.viewModelProfile(it.toString()) })
            }
        })
    }
    val load by model.state.collectAsStateWithLifecycle()
    val locale = currentLocale()
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        PageTopBar(stringResource(R.string.profile_title), nav::back)
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> ReadingColumn { gutter ->
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = gutter)) {
                    val own = state.value.own
                    Row(Modifier.padding(vertical = Space.md), verticalAlignment = Alignment.CenterVertically) {
                        PersonAvatar(own.displayName, own.accountId, own.profileAttachmentId, size = 72.dp)
                        Column(Modifier.padding(start = Space.md)) {
                            Text(own.displayName, style = EimirType.editorial, modifier = Modifier.semantics { heading() })
                            own.birthday?.let { Text(stringResource(R.string.profile_birthday, Dates.long(it, locale)), style = EimirType.bodySmall, color = Eimir.colors.textSecondary) }
                        }
                    }
                    SectionTitle(stringResource(R.string.profile_preferences))
                    Preferences(own.preferences.filter { it.visibility == ProfileVisibility.SELF_PROFILE })
                    state.value.partner?.let { partner ->
                        SectionTitle(stringResource(R.string.profile_partner))
                        Row(Modifier.padding(vertical = Space.sm), verticalAlignment = Alignment.CenterVertically) {
                            PersonAvatar(partner.displayName, partner.accountId, partner.profileAttachmentId, size = 52.dp)
                            Column(Modifier.padding(start = Space.sm)) {
                                Text(partner.displayName, style = EimirType.editorialSmall)
                                partner.birthday?.let { Text(stringResource(R.string.profile_birthday, Dates.long(it, locale)), style = EimirType.bodySmall, color = Eimir.colors.textSecondary) }
                            }
                        }
                        Text(stringResource(R.string.profile_partner_preferences, partner.displayName), style = EimirType.label, color = Eimir.colors.textSecondary)
                        // Only the partner's self-authored profile is shown; private partner notes stay owner-only.
                        Preferences(partner.preferences.filter { it.visibility == ProfileVisibility.SELF_PROFILE })
                    }
                    Text(
                        stringResource(R.string.profile_web_edit),
                        style = EimirType.meta,
                        color = Eimir.colors.textMuted,
                        modifier = Modifier.padding(vertical = Space.lg),
                    )
                }
            }
        }
    }
}

private suspend fun AppGraph.viewModelProfile(accountId: String): PartnerProfileView = repository.personProfile(accountId).getOrThrow()

@Composable
private fun Preferences(items: List<ProfilePreferenceView>) {
    if (items.isEmpty()) {
        Text(stringResource(R.string.profile_no_preferences), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
        return
    }
    items.groupBy { it.category }.forEach { (category, entries) ->
        Text(categoryLabel(category), style = EimirType.label, color = Eimir.colors.textPrimary, modifier = Modifier.padding(top = Space.sm))
        entries.forEach { entry ->
            Row(Modifier.fillMaxWidth().padding(vertical = Space.xxs), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(entry.value, style = EimirType.body)
                    if (entry.topic.isNotBlank() && entry.topic != entry.value) Text(entry.topic, style = EimirType.meta, color = Eimir.colors.textSecondary)
                }
                ContextPill(sentimentLabel(entry.sentiment))
            }
        }
    }
}

@Composable
private fun categoryLabel(category: PreferenceCategory): String = stringResource(
    when (category) {
        PreferenceCategory.FOOD -> R.string.pref_category_food
        PreferenceCategory.DRINK -> R.string.pref_category_drink
        PreferenceCategory.FLOWERS -> R.string.pref_category_flowers
        PreferenceCategory.MOVIES -> R.string.pref_category_movies
        PreferenceCategory.SERIES -> R.string.pref_category_series
        PreferenceCategory.MUSIC -> R.string.pref_category_music
        PreferenceCategory.HOBBIES -> R.string.pref_category_hobbies
        PreferenceCategory.ACTIVITIES -> R.string.pref_category_activities
        PreferenceCategory.TRAVEL -> R.string.pref_category_travel
        PreferenceCategory.RESTAURANTS -> R.string.pref_category_restaurants
        PreferenceCategory.COLORS -> R.string.pref_category_colors
        PreferenceCategory.OTHER -> R.string.pref_category_other
    },
)

@Composable
private fun sentimentLabel(sentiment: PreferenceSentiment): String = stringResource(
    when (sentiment) {
        PreferenceSentiment.LOVE -> R.string.pref_sentiment_love
        PreferenceSentiment.LIKE -> R.string.pref_sentiment_like
        PreferenceSentiment.NEUTRAL -> R.string.pref_sentiment_neutral
        PreferenceSentiment.DISLIKE -> R.string.pref_sentiment_dislike
        PreferenceSentiment.AVOID -> R.string.pref_sentiment_avoid
    },
)

// ---- Places -------------------------------------------------------------------------------------------

@Composable
fun PlacesScreen(nav: AppNavigator) {
    val model = graphViewModel(key = "places") { g -> ValueViewModel(g, { g.repository.places() }, { it == Change.Places }) }
    val load by model.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        PageTopBar(stringResource(R.string.places_title), nav::back)
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> ReadingColumn { gutter ->
                if (state.value.isEmpty()) {
                    StateMessage(stringResource(R.string.places_empty), icon = EimirIcons.Places)
                } else {
                    LazyColumn(contentPadding = PaddingValues(start = gutter, end = gutter, bottom = Space.xxl)) {
                        items(state.value.size, key = { state.value[it].id.toString() }) { index ->
                            PlaceRow(state.value[index]) { nav.openPlace(state.value[index].id.toString()) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun placeName(place: PlaceDetail): String =
    if (MomentPlacesViewModel.isPlaceholder(place.name)) stringResource(R.string.place_fallback) else place.name

@Composable
private fun PlaceRow(place: PlaceDetail, onOpen: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(Radii.medium).clickable(onClick = onOpen).heightIn(min = 60.dp).padding(vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EimirIcon(EimirIcons.Places, size = 24.dp)
        Column(Modifier.padding(start = Space.sm)) {
            Text(placeName(place), style = EimirType.title)
            place.address?.takeIf { it.isNotBlank() }?.let { Text(it, style = EimirType.bodySmall, color = Eimir.colors.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
    }
}

@Composable
fun PlaceScreen(nav: AppNavigator, placeId: String) {
    val graph = appGraph()
    val model = graphViewModel(key = "place-$placeId") { g -> ValueViewModel(g, { g.repository.place(placeId) }, { it == Change.Places }) }
    val load by model.state.collectAsStateWithLifecycle()
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    var deleteError by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val unavailable = stringResource(R.string.place_map_unavailable)
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        val place = load.valueOrNull
        DetailTopBar(nav::back, canEdit = false, canDelete = place?.capabilities?.canDelete == true, onEdit = {}, onDelete = { confirmDelete = true })
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> ReadingColumn { gutter ->
                val current = state.value
                Column(Modifier.padding(horizontal = gutter), verticalArrangement = Arrangement.spacedBy(Space.md)) {
                    EimirIcon(EimirIcons.Places, size = 32.dp)
                    Text(placeName(current), style = EimirType.editorialLarge, modifier = Modifier.semantics { heading() })
                    current.address?.takeIf { it.isNotBlank() }?.let { Text(it, style = EimirType.body, color = Eimir.colors.textSecondary) }
                    current.description?.takeIf { it.isNotBlank() }?.let { Text(it, style = EimirType.reading) }
                    if (current.latitude != null || !current.address.isNullOrBlank()) {
                        SecondaryButton(stringResource(R.string.action_open_map), {
                            openMap(context, current) { Toast.makeText(context, unavailable, Toast.LENGTH_SHORT).show() }
                        })
                    } else {
                        Text(stringResource(R.string.place_no_coordinates), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
                    }
                    if (current.geocodingSource == "openstreetmap") {
                        Text(stringResource(R.string.memory_place_source), style = EimirType.meta, color = Eimir.colors.textMuted)
                    }
                    if (deleteError) Text(stringResource(R.string.error_conflict), style = EimirType.bodySmall, color = Eimir.colors.error)
                }
            }
        }
    }
    if (confirmDelete) {
        ConfirmDelete(stringResource(R.string.place_delete_title), { confirmDelete = false }) {
            val place = load.valueOrNull ?: return@ConfirmDelete
            scope.launch {
                graph.repository.deletePlace(place).onSuccess { nav.back() }.onFailure { deleteError = true }
            }
        }
    }
}

// ---- People --------------------------------------------------------------------------------------------

@Composable
fun PeopleScreen(nav: AppNavigator) {
    val model = graphViewModel(key = "people") { g -> ValueViewModel(g, { g.repository.relatedPersons() }) }
    val load by model.state.collectAsStateWithLifecycle()
    val locale = currentLocale()
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        PageTopBar(stringResource(R.string.people_title), nav::back)
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> ReadingColumn { gutter ->
                if (state.value.isEmpty()) {
                    StateMessage(stringResource(R.string.people_empty), icon = EimirIcons.Together)
                } else {
                    LazyColumn(contentPadding = PaddingValues(start = gutter, end = gutter, bottom = Space.xxl)) {
                        items(state.value.size, key = { state.value[it].id.toString() }) { index ->
                            PersonRow(state.value[index], locale)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PersonRow(person: RelatedPersonView, locale: java.util.Locale) {
    Row(Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(vertical = Space.xs), verticalAlignment = Alignment.CenterVertically) {
        PersonAvatar(person.displayName, null, null, size = 44.dp)
        Column(Modifier.padding(start = Space.sm).weight(1f)) {
            Text(person.displayName, style = EimirType.title)
            val relation = stringResource(
                when (person.relationship) {
                    PersonRelationship.CHILD -> R.string.relationship_child
                    PersonRelationship.PARENT -> R.string.relationship_parent
                    PersonRelationship.SIBLING -> R.string.relationship_sibling
                    PersonRelationship.FRIEND -> R.string.relationship_friend
                    PersonRelationship.OTHER -> R.string.relationship_other
                },
            )
            val birthday = person.birthday?.let {
                stringResource(
                    R.string.people_birthday,
                    if (person.birthdayYearKnown) Dates.long(it, locale) else Dates.dayMonth(it, locale),
                )
            }
            Text(listOfNotNull(relation, birthday).joinToString(" · "), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
        }
        if (person.visibility == eimir.api.models.ContentVisibility.PRIVATE) ContextPill(stringResource(R.string.audience_private), icon = EimirIcons.Private)
    }
}

// ---- Private notes ---------------------------------------------------------------------------------------

@Composable
fun PrivateNotesScreen(nav: AppNavigator) {
    val model = graphViewModel(key = "private-notes") { g -> ValueViewModel(g, { g.repository.privateNotes() }, { it == Change.PrivateNotes }) }
    val load by model.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(Eimir.colors.pageTintBrand.copy(alpha = 0.35f))) {
        PageTopBar(stringResource(R.string.private_title), nav::back) {
            TextButton(onClick = nav::createPrivateNote) { Text(stringResource(R.string.private_new)) }
        }
        ReadingColumn { gutter ->
            Column(Modifier.fillMaxSize()) {
                // Owner-only context comes before any sensitive content.
                Row(Modifier.padding(horizontal = gutter, vertical = Space.xs), verticalAlignment = Alignment.CenterVertically) {
                    EimirIcon(EimirIcons.Private, size = 20.dp)
                    Text(
                        stringResource(R.string.private_owner_only),
                        style = EimirType.bodySmall,
                        color = Eimir.colors.private,
                        modifier = Modifier.padding(start = Space.xs),
                    )
                }
                when (val state = load) {
                    Load.Loading -> PageSkeleton()
                    is Load.Failed -> ErrorState(state.error, model::load)
                    is Load.Ready -> if (state.value.isEmpty()) {
                        StateMessage(stringResource(R.string.private_empty), icon = EimirIcons.Notes, action = stringResource(R.string.private_new), onAction = nav::createPrivateNote)
                    } else {
                        val notes = state.value.sortedWith(compareByDescending<PrivateNoteDetail> { it.pinned }.thenByDescending { it.updatedAt })
                        LazyColumn(contentPadding = PaddingValues(start = gutter, end = gutter, bottom = Space.xxl)) {
                            items(notes.size, key = { notes[it].id.toString() }) { index ->
                                val note = notes[index]
                                Surface(
                                    onClick = { nav.editPrivateNote(note.id.toString()) },
                                    shape = Radii.card,
                                    color = Eimir.colors.surfaceRaised,
                                    modifier = Modifier.fillMaxWidth().padding(vertical = Space.xs),
                                ) {
                                    Column(Modifier.padding(Space.md), verticalArrangement = Arrangement.spacedBy(Space.xxs)) {
                                        if (note.pinned) ContextPill(stringResource(R.string.private_pinned))
                                        Text(note.title, style = EimirType.title)
                                        if (note.body.isNotBlank()) {
                                            Text(note.body, style = EimirType.bodySmall, color = Eimir.colors.textSecondary, maxLines = 3, overflow = TextOverflow.Ellipsis)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

data class NoteEditorUi(
    val loading: Boolean = false,
    val loadError: AppError? = null,
    val title: String = "",
    val body: String = "",
    val pinned: Boolean = false,
    val saving: Boolean = false,
    val error: AppError? = null,
    val done: Boolean = false,
    val dirty: Boolean = false,
    val canDelete: Boolean = false,
)

class PrivateNoteEditorViewModel(private val graph: AppGraph, private val saved: SavedStateHandle, private val noteId: String?) : ViewModel() {
    private val _ui = MutableStateFlow(NoteEditorUi(loading = noteId != null, title = saved["title"] ?: "", body = saved["body"] ?: ""))
    val ui: StateFlow<NoteEditorUi> = _ui.asStateFlow()
    private var original: PrivateNoteDetail? = null

    init {
        if (noteId != null) {
            viewModelScope.launch {
                graph.repository.privateNote(noteId)
                    .onSuccess { note ->
                        original = note
                        val restored = saved.contains("title")
                        _ui.update {
                            it.copy(
                                loading = false,
                                title = if (restored) it.title else note.title,
                                body = if (restored) it.body else note.body,
                                pinned = note.pinned,
                                dirty = restored,
                                canDelete = note.capabilities.canDelete,
                            )
                        }
                    }
                    .onFailure { failure -> _ui.update { it.copy(loading = false, loadError = failure.appError) } }
            }
        }
    }

    fun setTitle(value: String) = edit { it.copy(title = value.take(200)) }
    fun setBody(value: String) = edit { it.copy(body = value.take(20_000)) }
    fun setPinned(value: Boolean) = edit { it.copy(pinned = value) }

    private fun edit(block: (NoteEditorUi) -> NoteEditorUi) {
        _ui.update { block(it).copy(dirty = true, error = null) }
        saved["title"] = _ui.value.title
        saved["body"] = _ui.value.body
    }

    fun save() {
        val ui = _ui.value
        if (ui.saving || ui.title.isBlank()) return
        _ui.update { it.copy(saving = true) }
        viewModelScope.launch {
            val existing = original
            val result = if (existing != null) {
                graph.repository.updatePrivateNote(existing, ui.title.trim(), ui.body, ui.pinned)
            } else {
                graph.repository.createPrivateNote(ui.title.trim(), ui.body)
            }
            result.onSuccess {
                saved.remove<String>("title")
                saved.remove<String>("body")
                _ui.update { it.copy(saving = false, done = true, dirty = false) }
            }.onFailure { failure -> _ui.update { it.copy(saving = false, error = failure.appError) } }
        }
    }

    fun delete() {
        val note = original ?: return
        viewModelScope.launch {
            graph.repository.deletePrivateNote(note)
                .onSuccess { _ui.update { it.copy(done = true, dirty = false) } }
                .onFailure { failure -> _ui.update { it.copy(error = failure.appError) } }
        }
    }
}

@Composable
fun PrivateNoteEditorScreen(nav: AppNavigator, noteId: String?) {
    val graph = appGraph()
    val model: PrivateNoteEditorViewModel = viewModel(key = "note-${noteId ?: "new"}") {
        PrivateNoteEditorViewModel(graph, createSavedStateHandle(), noteId)
    }
    val ui by model.ui.collectAsStateWithLifecycle()
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(ui.done) { if (ui.done) nav.back() }
    if (ui.loading) return FullScreenLoading()
    ui.loadError?.let { return ErrorState(it, nav::back) }
    TaskScaffold(
        title = stringResource(if (noteId == null) R.string.private_new else R.string.private_edit),
        saveLabel = stringResource(R.string.action_save),
        dirty = ui.dirty,
        saving = ui.saving,
        saveEnabled = ui.title.isNotBlank(),
        error = ui.error,
        onClose = nav::back,
        onSave = model::save,
    ) {
        ContextPill(stringResource(R.string.audience_private), icon = EimirIcons.Private)
        OutlinedTextField(
            value = ui.title,
            onValueChange = model::setTitle,
            label = { Text(stringResource(R.string.private_title_label)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = ui.body,
            onValueChange = model::setBody,
            label = { Text(stringResource(R.string.private_body_label)) },
            minLines = 6,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            textStyle = EimirType.reading,
            modifier = Modifier.fillMaxWidth(),
        )
        if (noteId != null) {
            SettingSwitch(stringResource(R.string.private_pinned), null, ui.pinned, enabled = true, onChange = model::setPinned)
            if (ui.canDelete) TextButton(onClick = { confirmDelete = true }) { Text(stringResource(R.string.action_delete), color = Eimir.colors.error) }
        }
    }
    if (confirmDelete) ConfirmDelete(stringResource(R.string.private_delete_title), { confirmDelete = false }, model::delete)
}

// ---- Settings and About -----------------------------------------------------------------------------------

data class SettingsData(val photoLocation: PhotoLocationPreference?, val entitlement: SpaceEntitlementView?)

class SettingsViewModel(private val graph: AppGraph) : ViewModel() {
    private val _state = MutableStateFlow<Load<SettingsData>>(Load.Loading)
    val state: StateFlow<Load<SettingsData>> = _state.asStateFlow()
    private val _saving = MutableStateFlow(false)
    val saving: StateFlow<Boolean> = _saving.asStateFlow()
    private val _error = MutableStateFlow<AppError?>(null)
    val error: StateFlow<AppError?> = _error.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            val location = async { graph.repository.photoLocationPreference() }
            val entitlement = async { graph.repository.entitlements() }
            val locationResult = location.await()
            locationResult.onFailure { failure -> _state.update { it.failedWith(failure.appError) } }
            locationResult.onSuccess { _state.value = Load.Ready(SettingsData(it, entitlement.await().getOrNull())) }
        }
    }

    /** Applied immediately and confirmed by the server version; a conflict reloads the current value. */
    fun setPhotoLocation(enabled: Boolean) {
        val data = _state.value.valueOrNull ?: return
        val current = data.photoLocation ?: return
        if (_saving.value) return
        _saving.value = true
        _error.value = null
        viewModelScope.launch {
            graph.repository.setPhotoLocationPreference(current, enabled)
                .onSuccess { _state.value = Load.Ready(data.copy(photoLocation = it)) }
                .onFailure {
                    _error.value = it.appError
                    load()
                }
            _saving.value = false
        }
    }
}

@Composable
fun SettingSwitch(title: String, body: String?, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radii.medium)
            .clickable(enabled = enabled, role = Role.Switch) { onChange(!checked) }
            .semantics(mergeDescendants = true) { toggleableState = ToggleableState(checked) }
            .heightIn(min = 56.dp)
            .padding(vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = Space.sm)) {
            Text(title, style = EimirType.title)
            if (body != null) Text(body, style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
        }
        Switch(checked = checked, onCheckedChange = null, enabled = enabled)
    }
}

@Composable
fun SettingsScreen(nav: AppNavigator, onSignOut: () -> Unit, onSwitchSpace: () -> Unit) {
    val graph = appGraph()
    val model = graphViewModel { SettingsViewModel(it) }
    val load by model.state.collectAsStateWithLifecycle()
    val saving by model.saving.collectAsStateWithLifecycle()
    val error by model.error.collectAsStateWithLifecycle()
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        PageTopBar(stringResource(R.string.settings_title), nav::back)
        ReadingColumn { gutter ->
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = gutter)) {
                SectionTitle(stringResource(R.string.nav_moments))
                when (val state = load) {
                    Load.Loading -> PageSkeleton()
                    is Load.Failed -> ErrorState(state.error, model::load)
                    is Load.Ready -> {
                        state.value.photoLocation?.let { preference ->
                            SettingSwitch(
                                stringResource(R.string.settings_photo_location),
                                stringResource(R.string.settings_photo_location_body),
                                preference.enabled,
                                enabled = !saving,
                                onChange = model::setPhotoLocation,
                            )
                        }
                        error?.let { Text(it.message(), style = EimirType.bodySmall, color = Eimir.colors.error) }
                        SectionTitle(stringResource(R.string.settings_pro))
                        val entitlement = state.value.entitlement
                        val active = entitlement?.tier == EntitlementTier.PREMIUM &&
                            entitlement.status in setOf(EntitlementStatus.ACTIVE, EntitlementStatus.TRIAL, EntitlementStatus.GRACE_PERIOD, EntitlementStatus.GRANDFATHERED)
                        Text(stringResource(if (active) R.string.settings_pro_active else R.string.settings_pro_inactive), style = EimirType.body)
                    }
                }
                SectionTitle(stringResource(R.string.settings_appearance))
                Text(stringResource(R.string.settings_appearance_body), style = EimirType.body, color = Eimir.colors.textSecondary)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    SectionTitle(stringResource(R.string.settings_open_link_settings))
                    Text(stringResource(R.string.settings_open_link_settings_body), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
                    SecondaryButton(stringResource(R.string.settings_open_link_settings), {
                        context.startActivity(
                            Intent(Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS, Uri.parse("package:${context.packageName}")),
                        )
                    }, modifier = Modifier.padding(vertical = Space.xs))
                }
                SectionTitle(stringResource(R.string.settings_account))
                Text(stringResource(R.string.settings_signed_in_as, graph.sessions.session?.displayName.orEmpty()), style = EimirType.body)
                Spacer(Modifier.height(Space.xs))
                Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                    SecondaryButton(stringResource(R.string.settings_switch_space), onSwitchSpace)
                    SecondaryButton(stringResource(R.string.action_sign_out), onSignOut)
                }
                Text(
                    stringResource(R.string.settings_web_only),
                    style = EimirType.meta,
                    color = Eimir.colors.textMuted,
                    modifier = Modifier.padding(vertical = Space.lg),
                )
            }
        }
    }
}

@Composable
fun AboutScreen(nav: AppNavigator) {
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        PageTopBar(stringResource(R.string.about_title), nav::back)
        ReadingColumn { gutter ->
            Column(Modifier.padding(horizontal = gutter), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                Text(stringResource(R.string.about_body), style = EimirType.body)
                Text(stringResource(R.string.about_version, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE), style = EimirType.bodySmall)
                Text(stringResource(R.string.about_package, BuildConfig.APPLICATION_ID), style = EimirType.bodySmall)
                Text(stringResource(R.string.about_source, BuildConfig.SOURCE_REVISION), style = EimirType.bodySmall)
                Text(stringResource(R.string.about_server, URI(BuildConfig.API_ORIGIN).host), style = EimirType.bodySmall)
                Text(stringResource(R.string.about_licenses), style = EimirType.meta, color = Eimir.colors.textMuted)
            }
        }
    }
}
