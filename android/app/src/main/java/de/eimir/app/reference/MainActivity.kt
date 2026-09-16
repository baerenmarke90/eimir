package de.eimir.app.reference

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.key
import androidx.compose.foundation.lazy.rememberLazyListState
import de.eimir.app.story.MemoryCreateScreen
import de.eimir.app.story.TimelineScopeControls
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import de.eimir.app.account.AccountSettingsContent
import de.eimir.app.demo.DemoBanner
import de.eimir.app.demo.DemoPersona
import de.eimir.app.invitation.AwaitingSpaceScreen
import de.eimir.app.invitation.InvitationsScreen
import de.eimir.app.design.MinimumTouchTarget
import de.eimir.app.design.EimirDisplayFamily
import de.eimir.app.design.EimirTheme
import de.eimir.app.people.ImportantDatesScreen
import de.eimir.app.people.RelatedPersonsScreen
import de.eimir.app.profile.ProfilePreferencesScreen
import de.eimir.app.profile.ProfileSettingsContent
import de.eimir.app.relationship.SpaceOffboardingContent
import de.eimir.app.shell.AppDestination
import de.eimir.app.shell.AppNavigation
import de.eimir.app.shell.QuickCreateFab
import de.eimir.app.shell.navigateToPrimary
import de.eimir.app.chapter.ChapterContentScreen
import de.eimir.app.chapter.ChaptersScreen
import de.eimir.app.collection.CollectionDetailScreen
import de.eimir.app.collection.CollectionsScreen
import de.eimir.app.place.PlaceRelationsScreen
import de.eimir.app.place.PlacesScreen
import de.eimir.app.notifications.NotificationsScreen
import de.eimir.app.privatearea.GiftIdeasScreen
import de.eimir.app.privatearea.PrivateAreaScreen
import de.eimir.app.privatearea.PrivateCollectionDetailScreen
import de.eimir.app.privatearea.PrivateCollectionsScreen
import de.eimir.app.privatearea.PrivateNotesScreen
import de.eimir.app.search.SearchScreen
import de.eimir.app.plan.PlanScreen
import de.eimir.app.activity.ActivityScreen
import de.eimir.app.today.TodayScreen
import de.eimir.app.shell.MoreScreen
import de.eimir.app.shell.ShellSurface
import de.eimir.app.shell.secureWindowUntilNavigationIsKnown
import de.eimir.app.story.HeartMomentsScreen
import de.eimir.app.story.MemoryComments
import de.eimir.app.story.MemoryScreen
import de.eimir.app.story.MilestoneCreateScreen
import de.eimir.app.story.MilestoneScreen
import de.eimir.app.story.SharedHeartMomentScreen
import de.eimir.app.story.StoryScreen
import kotlinx.coroutines.launch
import eimir.api.models.EngagementTarget
import eimir.api.models.ProfileVisibility

class MainActivity : ComponentActivity() {
    private val oidcCallback = mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        // Declared rather than inherited: targetSdk 36 draws edge to edge
        // anyway, and stating it keeps the behaviour explicit for the shell
        // that consumes the insets.
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // The destination restored by Navigation is not known until Compose
        // builds the graph. Protect the new Activity window before setContent
        // so recreation cannot expose an owner-only Recents or display frame.
        secureWindowUntilNavigationIsKnown(window)
        oidcCallback.value = intent?.data?.takeIf(::isRecentAuthenticationOidcCallback)
        setContent {
            EimirTheme {
                ReferenceFlowRoute(
                    oidcCallback = oidcCallback.value,
                    onOidcCallbackConsumed = { oidcCallback.value = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        oidcCallback.value = intent.data?.takeIf(::isRecentAuthenticationOidcCallback)
    }

    private fun isRecentAuthenticationOidcCallback(uri: Uri): Boolean =
        uri.scheme == "de.eimir.app" &&
            uri.host == "recent-authentication" &&
            uri.path == "/oidc"
}

/**
 * Wires a real, Context-backed [SharedPreferencesSpaceStore] into the
 * ViewModel default construction path used by `viewModel()`, which — unlike
 * every other constructor default here — cannot be a plain default parameter
 * because it needs a [Context] the ViewModel class itself never holds.
 */
private fun referenceViewModelFactory(context: Context): ViewModelProvider.Factory =
    viewModelFactory {
        initializer {
            val database = de.eimir.app.cache.ReadCacheDatabase.getInstance(context)
            val connectivityTracker = de.eimir.app.connectivity.ConnectivityTracker()
            ReferenceViewModel(
                spaceStore = SharedPreferencesSpaceStore(context),
                productReadCache = de.eimir.app.cache.ProductReadCache(
                    database.productCacheDao(),
                    database.cacheContextDao(),
                    database.protectedCacheDao(),
                    de.eimir.app.cache.AndroidKeystoreProtectedPayloadCipher(),
                ),
                connectivityTracker = connectivityTracker,
                apiFactory = { baseUrl -> OkHttpReferenceApi(baseUrl, connectivityTracker = connectivityTracker) },
            )
        }
    }

@Composable
internal fun ReferenceFlowRoute(
    oidcCallback: Uri? = null,
    onOidcCallbackConsumed: () -> Unit = {},
    referenceViewModel: ReferenceViewModel = viewModel(factory = referenceViewModelFactory(LocalContext.current)),
    navigationController: androidx.navigation.NavHostController? = null,
) {
    val state by referenceViewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val credentialManager = remember(context) { CredentialManager.create(context) }
    var imageSelectionEpoch by rememberSaveable { mutableStateOf<Long?>(null) }
    var profileAvatarSelectionEpoch by remember { mutableStateOf<Long?>(null) }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        val selectionEpoch = imageSelectionEpoch
        imageSelectionEpoch = null
        if (uris.isNotEmpty() && selectionEpoch != null) {
            scope.launch {
                val images = mutableListOf<SelectedImage>()
                var firstFailure: Throwable? = null
                uris.forEach { uri ->
                    runCatching { loadSelectedImage(context, uri) }
                        .onSuccess(images::add)
                        .onFailure { throwable ->
                            if (firstFailure == null) firstFailure = throwable
                        }
                }
                if (images.isNotEmpty()) {
                    referenceViewModel.selectImages(images, selectionEpoch)
                }
                firstFailure?.let { throwable ->
                    referenceViewModel.setImageSelectionError(throwable, selectionEpoch)
                }
            }
        }
    }
    val profileAvatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val selectionEpoch = profileAvatarSelectionEpoch
        profileAvatarSelectionEpoch = null
        if (uri != null && selectionEpoch != null) {
            scope.launch {
                runCatching { loadSelectedImage(context, uri) }
                    .onSuccess { image ->
                        referenceViewModel.setProfileAvatar(image, selectionEpoch)
                    }
                    .onFailure { throwable ->
                        referenceViewModel.setProfileAvatarSelectionError(throwable, selectionEpoch)
                    }
            }
        }
    }

    LaunchedEffect(state.accountDeletionPasskeyRequest) {
        val requestJson = state.accountDeletionPasskeyRequest ?: return@LaunchedEffect
        runCatching {
            val result = credentialManager.getCredential(
                context = context,
                request = GetCredentialRequest(
                    credentialOptions = listOf(
                        GetPublicKeyCredentialOption(requestJson = requestJson),
                    ),
                ),
            )
            val credential = result.credential as? PublicKeyCredential
                ?: error("Credential Manager returned a non-passkey credential")
            credential.authenticationResponseJson
        }.onSuccess(referenceViewModel::finishAccountDeletionPasskey)
            .onFailure(referenceViewModel::failAccountDeletionRecentAuthentication)
    }

    LaunchedEffect(state.accountDeletionOidcPending?.authorizationUrl) {
        state.accountDeletionOidcPending?.authorizationUrl?.let { authorizationUrl ->
            runCatching {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(authorizationUrl)))
            }.onFailure(referenceViewModel::failAccountDeletionRecentAuthentication)
        }
    }

    LaunchedEffect(oidcCallback) {
        val callback = oidcCallback ?: return@LaunchedEffect
        val code = callback.getQueryParameter("code")
        val stateParameter = callback.getQueryParameter("state")
        if (code != null && stateParameter != null) {
            referenceViewModel.finishAccountDeletionOidc(code, stateParameter)
        } else {
            referenceViewModel.failAccountDeletionRecentAuthentication(
                IllegalArgumentException("OIDC recent authentication did not return code and state"),
            )
        }
        onOidcCallbackConsumed()
    }

    val signOut = {
        imageSelectionEpoch = null
        profileAvatarSelectionEpoch = null
        referenceViewModel.logout()
    }

    // Shared by the reference flow and the Story's capture step, so a picked
    // image is bound to the same session epoch either way.
    val pickImage = {
        referenceViewModel.beginImageSelection()?.let { selectionEpoch ->
            imageSelectionEpoch = selectionEpoch
            imagePicker.launch(
                PickVisualMediaRequest.Builder()
                    .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    .setOrderedSelection(true)
                    .build(),
            )
        }
        Unit
    }
    val pickProfileAvatar = {
        referenceViewModel.beginProfileAvatarSelection()?.let { selectionEpoch ->
            profileAvatarSelectionEpoch = selectionEpoch
            profileAvatarPicker.launch(
                PickVisualMediaRequest.Builder()
                    .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    .build(),
            )
        }
        Unit
    }

    val storyFlow = @Composable {
        ReferenceFlowScreen(
            state = state,
            onLogin = referenceViewModel::signIn,
            onLogout = signOut,
            onPickImage = pickImage,
            onCreateMemory = referenceViewModel::createMemory,
            onRefreshStory = referenceViewModel::refreshStory,
            onRetryImage = referenceViewModel::retryImage,
            onRemoveImage = referenceViewModel::removeImage,
            onEnterDemo = referenceViewModel::enterDemo,
        )
    }

    // An authenticated account with no Space yet is neither signed out nor
    // signed in in the sense the rest of the shell means; it gets its own
    // surface rather than falling into the entry form or the navigated shell.
    if (state.awaitingSpace) {
        ShellSurface {
            AwaitingSpaceScreen(
                busy = state.invitationBusy,
                problem = state.invitationProblem,
                onAcceptInvitation = referenceViewModel::acceptInvitation,
                onSignOut = signOut,
                spaces = state.availableSpaces,
                onSelectSpace = referenceViewModel::selectSpace,
            )
        }
        return
    }

    // Signed out there is nothing to navigate between, but the surface still
    // needs the window insets the shell owns.
    if (!state.loggedIn) {
        ShellSurface { storyFlow() }
        return
    }

    val demoPersona = state.demoPersona
    if (state.demoMode && demoPersona != null) {
        // The inset is consumed once, here, for the banner and the shell
        // together. Applied to the banner alone it would be padding for the
        // banner and then again for the shell beside it.
        Column(
            modifier = Modifier.windowInsetsPadding(
                WindowInsets.safeDrawing.only(WindowInsetsSides.Top),
            ),
        ) {
            DemoBanner(
                persona = demoPersona,
                onLeave = referenceViewModel::leaveDemo,
            )
            key(state.accountId, state.activeSpaceId) {
                DemoShell(
                    navController = navigationController ?: rememberNavController(),
                    state = state,
                    viewModel = referenceViewModel,
                    onSignOut = signOut,
                    onSelectSpace = referenceViewModel::selectSpace,
                    onPickProfileAvatar = pickProfileAvatar,
                    onPickImage = pickImage,
                ) { openMemory, openMilestone, openHeartMoment, createMemory ->
                    StoryDestination(
                        state = state,
                        viewModel = referenceViewModel,
                        onCreateMemory = createMemory,
                        onOpenMemory = openMemory,
                        onOpenMilestone = openMilestone,
                        onOpenHeartMoment = openHeartMoment,
                    )
                }
            }
        }
        return
    }

    key(state.accountId, state.activeSpaceId) {
        DemoShell(
            navController = navigationController ?: rememberNavController(),
            state = state,
            viewModel = referenceViewModel,
            onSignOut = signOut,
            onSelectSpace = referenceViewModel::selectSpace,
            onPickProfileAvatar = pickProfileAvatar,
            onPickImage = pickImage,
        ) { openMemory, openMilestone, openHeartMoment, createMemory ->
            StoryDestination(
                state = state,
                viewModel = referenceViewModel,
                onCreateMemory = createMemory,
                onOpenMemory = openMemory,
                onOpenMilestone = openMilestone,
                onOpenHeartMoment = openHeartMoment,
            )
        }
    }
}

/**
 * The signed-in shell.
 *
 * Only destinations that have something to show are rendered; the slice
 * contract forbids dead navigation. Heute and Planen join in their slices.
 */
@Composable
private fun DemoShell(
    state: ReferenceUiState,
    viewModel: ReferenceViewModel,
    onSignOut: () -> Unit,
    onSelectSpace: (java.util.UUID) -> Unit,
    onPickProfileAvatar: () -> Unit,
    onPickImage: () -> Unit,
    navController: androidx.navigation.NavHostController = rememberNavController(),
    story: @Composable (
        onOpenMemory: (java.util.UUID) -> Unit,
        onOpenMilestone: (java.util.UUID) -> Unit,
        onOpenHeartMoment: (java.util.UUID) -> Unit,
        onCreateMemory: () -> Unit,
    ) -> Unit,
) {
    val snackbarHostState = remember { SnackbarHostState() }
    val createMemory = {
        viewModel.beginMemoryTask()
        navController.navigate(MEMORY_CREATE_ROUTE) { launchSingleTop = true }
    }
    val returnFromMemory = {
        if (!navController.popBackStack()) navController.navigateToPrimary(AppDestination.Story)
    }
    // Resolved here, in composition, since UiMessage.resolve() calls the
    // @Composable stringResource() — the LaunchedEffect body below cannot
    // call it itself. Keyed on the event's own id, not its text, so the
    // exact same message posted twice in a row is still shown twice.
    val pendingSnackbar = state.snackbarMessage
    val pendingSnackbarText = pendingSnackbar?.text?.resolve()
    LaunchedEffect(pendingSnackbar?.id) {
        if (pendingSnackbar != null && pendingSnackbarText != null) {
            snackbarHostState.showSnackbar(pendingSnackbarText)
            viewModel.snackbarShown(pendingSnackbar.id)
        }
    }
    AppNavigation(
        // Planen joins now that #419 put something behind it; a destination
        // with nothing behind it would be dead navigation.
        // Heute leads, as the Information Architecture has it; #421 put
        // something behind it.
        destinations = listOf(
            AppDestination.Today,
            AppDestination.Story,
            AppDestination.Plan,
            AppDestination.More,
        ),
        navController = navController,
        secureWhen = ::isSecureRoute,
        focusedTaskWhen = { it == MEMORY_CREATE_ROUTE },
        snackbarHostState = snackbarHostState,
        banner = {
            de.eimir.app.shell.OfflineStatusBanner(
                offline = state.offline,
                lastSyncedAt = state.lastSyncedAt,
            )
        },
        floatingActionButton = {
            QuickCreateFab(
                onCreateMemory = createMemory,
                onCreateHeartMoment = { navController.navigate(HEART_MOMENTS_ROUTE) },
                onCreateMilestone = { navController.navigate(MILESTONE_CREATE_ROUTE) },
                onCreatePrivateNote = { navController.navigate(PRIVATE_NOTES_ROUTE) },
            )
        },
        detailRoutes = { controller ->
            composable(MEMORY_CREATE_ROUTE) {
                LaunchedEffect(Unit) { viewModel.beginMemoryTask() }
                val task = state.memoryTask
                LaunchedEffect(task?.generation, task?.phase) {
                    if (task?.phase == MemoryTaskPhase.CONFIRMED && controller.currentDestination?.route == MEMORY_CREATE_ROUTE) {
                        val memory = checkNotNull(task.confirmedMemory)
                        controller.navigate("story/memories/${memory.id}") {
                            popUpTo(MEMORY_CREATE_ROUTE) { inclusive = true }
                            launchSingleTop = true
                        }
                        viewModel.consumeMemoryResult(task.generation)
                    }
                }
                MemoryCreateScreen(
                    state = state, onDraftChange = viewModel::updateMemoryTask,
                    onPickImage = onPickImage, onRetryImage = viewModel::retryImage,
                    onRemoveImage = viewModel::removeImage, onSave = viewModel::submitMemoryTask,
                    onRetryAttachments = viewModel::retryMemoryAttachments,
                    onViewPartialResult = viewModel::viewPartiallySavedMemory,
                    onExit = { if (viewModel.discardMemoryTask()) returnFromMemory() },
                )
            }
            composable(
                route = MEMORY_ROUTE,
                arguments = listOf(navArgument(MEMORY_ID_ARGUMENT) { type = NavType.StringType }),
            ) { entry ->
                val memoryId = entry.arguments?.getString(MEMORY_ID_ARGUMENT)
                    ?.let { runCatching { java.util.UUID.fromString(it) }.getOrNull() }

                // Loading is tied to the route rather than to the tap, so
                // returning to this screen after process death still shows the
                // memory instead of an empty one.
                LaunchedEffect(memoryId, state.activeSpaceId, state.reconnectEpoch) {
                    memoryId?.let(viewModel::openMemory)
                    memoryId?.let { viewModel.loadComments(MEMORY_COMMENTS, it) }
                }
                DisposableEffect(memoryId) {
                    onDispose {
                        viewModel.closeMemory()
                        viewModel.clearComments()
                    }
                }

                BackHandler(onBack = returnFromMemory)
                MemoryScreen(
                    memory = state.openMemory,
                    imageStore = viewModel.storyImages,
                    generation = viewModel.storyGeneration,
                    busy = state.memoryBusy,
                    problem = state.memoryProblem,
                    gone = state.openMemoryGone,
                    editing = state.editingMemory,
                    savedMessage = state.memoryStatus
                        ?.let { stringResource(it.resourceId, *it.args.toTypedArray()) },
                    onBack = returnFromMemory,
                    onBeginEditing = viewModel::beginEditingMemory,
                    onCancelEditing = viewModel::cancelEditingMemory,
                    onSave = viewModel::saveMemory,
                    onDelete = viewModel::deleteMemory,
                    cachedAt = state.openMemoryCachedAt,
                    comments = memoryId?.let { id ->
                        {
                            MemoryComments(
                                comments = state.comments,
                                accountId = state.accountId,
                                busy = state.commentsBusy,
                                problem = state.commentsProblem,
                                onAdd = { body ->
                                    viewModel.addComment(MEMORY_COMMENTS, id, body)
                                },
                                onEdit = { commentId, body ->
                                    viewModel.editComment(MEMORY_COMMENTS, id, commentId, body)
                                },
                                onDelete = { commentId ->
                                    viewModel.removeComment(MEMORY_COMMENTS, id, commentId)
                                },
                                onLoadMore = { viewModel.loadMoreComments(MEMORY_COMMENTS, id) }
                                    .takeIf { state.commentsHaveMore },
                            )
                        }
                    },
                )
            }

            composable(MILESTONE_CREATE_ROUTE) {
                LaunchedEffect(state.milestoneCreated) {
                    if (state.milestoneCreated) {
                        controller.popBackStack()
                        viewModel.clearMilestoneCreated()
                    }
                }

                MilestoneCreateScreen(
                    busy = state.memoryBusy,
                    problem = state.memoryProblem,
                    onBack = { controller.popBackStack() },
                    onCreate = viewModel::createMilestone,
                )
            }

            composable(
                route = MILESTONE_ROUTE,
                arguments = listOf(navArgument(ITEM_ID_ARGUMENT) { type = NavType.StringType }),
            ) { entry ->
                val id = entry.arguments?.getString(ITEM_ID_ARGUMENT)
                    ?.let { runCatching { java.util.UUID.fromString(it) }.getOrNull() }

                LaunchedEffect(id, state.activeSpaceId, state.reconnectEpoch) {
                    id?.let(viewModel::openMilestone)
                    id?.let { viewModel.loadComments(MILESTONE_COMMENTS, it) }
                }
                DisposableEffect(id) {
                    onDispose {
                        viewModel.closeStoryItem()
                        viewModel.clearComments()
                    }
                }

                MilestoneScreen(
                    milestone = state.openMilestone,
                    busy = state.memoryBusy,
                    problem = state.memoryProblem,
                    gone = state.openMemoryGone,
                    editing = state.editingMemory,
                    savedMessage = state.memoryStatus
                        ?.let { stringResource(it.resourceId, *it.args.toTypedArray()) },
                    onBack = { controller.popBackStack() },
                    onBeginEditing = viewModel::beginEditingMemory,
                    onCancelEditing = viewModel::cancelEditingMemory,
                    onSave = viewModel::saveMilestone,
                    onDelete = viewModel::deleteMilestone,
                    cachedAt = state.openMilestoneCachedAt,
                    comments = id?.let { parentId ->
                        {
                            MemoryComments(
                                comments = state.comments,
                                accountId = state.accountId,
                                busy = state.commentsBusy,
                                problem = state.commentsProblem,
                                onAdd = { body ->
                                    viewModel.addComment(MILESTONE_COMMENTS, parentId, body)
                                },
                                onEdit = { commentId, body ->
                                    viewModel.editComment(
                                        MILESTONE_COMMENTS,
                                        parentId,
                                        commentId,
                                        body,
                                    )
                                },
                                onDelete = { commentId ->
                                    viewModel.removeComment(
                                        MILESTONE_COMMENTS,
                                        parentId,
                                        commentId,
                                    )
                                },
                                onLoadMore = {
                                    viewModel.loadMoreComments(MILESTONE_COMMENTS, parentId)
                                }.takeIf { state.commentsHaveMore },
                            )
                        }
                    },
                )
            }

            composable(
                route = HEART_MOMENT_ROUTE,
                arguments = listOf(navArgument(ITEM_ID_ARGUMENT) { type = NavType.StringType }),
            ) { entry ->
                val id = entry.arguments?.getString(ITEM_ID_ARGUMENT)
                    ?.let { runCatching { java.util.UUID.fromString(it) }.getOrNull() }

                LaunchedEffect(id, state.activeSpaceId, state.reconnectEpoch) {
                    id?.let(viewModel::openSharedHeartMoment)
                    id?.let { viewModel.loadComments(HEART_MOMENT_COMMENTS, it) }
                }
                DisposableEffect(id) {
                    onDispose {
                        viewModel.closeStoryItem()
                        viewModel.clearComments()
                    }
                }

                SharedHeartMomentScreen(
                    moment = state.openSharedHeartMoment,
                    imageStore = viewModel.storyImages,
                    generation = viewModel.storyGeneration,
                    problem = state.memoryProblem,
                    onBack = { controller.popBackStack() },
                    cachedAt = state.openSharedHeartMomentCachedAt,
                    comments = id?.let { parentId ->
                        {
                            MemoryComments(
                                comments = state.comments,
                                accountId = state.accountId,
                                busy = state.commentsBusy,
                                problem = state.commentsProblem,
                                onAdd = { body ->
                                    viewModel.addComment(HEART_MOMENT_COMMENTS, parentId, body)
                                },
                                onEdit = { commentId, body ->
                                    viewModel.editComment(
                                        HEART_MOMENT_COMMENTS,
                                        parentId,
                                        commentId,
                                        body,
                                    )
                                },
                                onDelete = { commentId ->
                                    viewModel.removeComment(
                                        HEART_MOMENT_COMMENTS,
                                        parentId,
                                        commentId,
                                    )
                                },
                                onLoadMore = {
                                    viewModel.loadMoreComments(HEART_MOMENT_COMMENTS, parentId)
                                }.takeIf { state.commentsHaveMore },
                            )
                        }
                    },
                )
            }

            composable(INVITATIONS_ROUTE) {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadInvitations() }
                DisposableEffect(Unit) { onDispose(viewModel::clearInvitations) }

                InvitationsScreen(
                    invitations = state.issuedInvitations,
                    issuedToken = state.issuedInvitationToken,
                    busy = state.invitationBusy,
                    problem = state.invitationProblem,
                    onBack = { controller.popBackStack() },
                    onCreate = viewModel::createInvitation,
                    onDismissToken = viewModel::dismissIssuedInvitationToken,
                    onRevoke = viewModel::revokeInvitation,
                )
            }

            composable(HEART_MOMENTS_ROUTE) {
                // Tied to the route, so returning here after process death
                // loads again instead of showing an empty list.
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadHeartMoments() }
                DisposableEffect(Unit) { onDispose(viewModel::clearHeartMoments) }

                HeartMomentsScreen(
                    moments = state.heartMoments,
                    busy = state.heartMomentsBusy,
                    problem = state.heartMomentsProblem,
                    statusMessage = state.heartMomentStatus
                        ?.let { stringResource(it.resourceId, *it.args.toTypedArray()) },
                    onBack = { controller.popBackStack() },
                    onCreate = viewModel::createHeartMoment,
                    onEdit = viewModel::updateHeartMoment,
                    onChangeVisibility = viewModel::changeHeartMomentVisibility,
                    onDelete = viewModel::deleteHeartMoment,
                )
            }

            composable(RELATED_PERSONS_ROUTE) {
                // Deliberately no dispose-time clear here, unlike HeartMoments:
                // opening a person's ImportantDates navigates forward to a
                // child route that reads this same list for the person's
                // name, and clearing on leave wiped it before that screen
                // could render. Every session-changing event already calls
                // clearRelatedPersons() directly, so nothing leaks across
                // sign-in/demo/Space boundaries without this.
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadRelatedPersons() }

                RelatedPersonsScreen(
                    people = state.relatedPersons,
                    busy = state.relatedPersonsBusy,
                    problem = state.relatedPersonsProblem,
                    onBack = { controller.popBackStack() },
                    onAdd = viewModel::addRelatedPerson,
                    onEdit = viewModel::updateRelatedPerson,
                    onOpenDates = { personId ->
                        controller.navigate("people/related-persons/$personId/important-dates")
                    },
                    onDelete = viewModel::deleteRelatedPerson,
                )
            }

            composable(
                route = IMPORTANT_DATES_ROUTE,
                arguments = listOf(navArgument(PERSON_ID_ARGUMENT) { type = NavType.StringType }),
            ) { entry ->
                val personId = entry.arguments?.getString(PERSON_ID_ARGUMENT)
                    ?.let { runCatching { java.util.UUID.fromString(it) }.getOrNull() }
                val person = state.relatedPersons.firstOrNull { it.id == personId }

                LaunchedEffect(personId, state.activeSpaceId, state.reconnectEpoch) {
                    personId?.let(viewModel::loadImportantDates)
                }

                ImportantDatesScreen(
                    personName = person?.displayName.orEmpty(),
                    dates = state.personImportantDates,
                    busy = state.relatedPersonsBusy,
                    problem = state.relatedPersonsProblem,
                    onBack = { controller.popBackStack() },
                    onAdd = { label, type, date, repeats, visibility ->
                        personId?.let {
                            viewModel.addImportantDate(it, label, type, date, repeats, visibility)
                        }
                    },
                    onDelete = { dateId ->
                        personId?.let { viewModel.deleteImportantDate(it, dateId) }
                    },
                )
            }

            composable(PREFERENCES_ROUTE) {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadProfilePreferences() }

                val selfId = state.accountId
                val partnerAccountId = state.profile.partner?.accountId

                ProfilePreferencesScreen(
                    selfPreferences = state.profile.self?.preferences.orEmpty(),
                    partnerPreferences = state.profile.partner?.preferences.orEmpty(),
                    privateNotes = state.profile.preferences.filter {
                        it.visibility == ProfileVisibility.PRIVATE_PARTNER_NOTE
                    },
                    partnerName = state.profile.partner?.displayName,
                    busy = state.profile.preferencesBusy,
                    problem = state.profile.preferencesProblem,
                    onBack = { controller.popBackStack() },
                    onAddSelf = { category, topic, sentiment, value ->
                        selfId?.let {
                            viewModel.addProfilePreference(
                                it,
                                ProfileVisibility.SELF_PROFILE,
                                category,
                                topic,
                                sentiment,
                                value,
                            )
                        }
                    },
                    onAddPrivateNote = { category, topic, sentiment, value ->
                        partnerAccountId?.let {
                            viewModel.addProfilePreference(
                                it,
                                ProfileVisibility.PRIVATE_PARTNER_NOTE,
                                category,
                                topic,
                                sentiment,
                                value,
                            )
                        }
                    },
                    onEdit = { preference, category, topic, sentiment, value ->
                        viewModel.updateProfilePreference(preference, category, topic, sentiment, value)
                    },
                    onDelete = viewModel::deleteProfilePreference,
                )
            }

            composable(PLACES_ROUTE) {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadPlaces() }

                PlacesScreen(
                    places = state.places,
                    busy = state.placesBusy,
                    problem = state.placesProblem,
                    onBack = { controller.popBackStack() },
                    onAdd = { name, description, address, latitude, longitude ->
                        viewModel.addPlace(name, description, address, latitude, longitude)
                    },
                    onEdit = { place, name, description, address, latitude, longitude ->
                        viewModel.updatePlace(place, name, description, address, latitude, longitude)
                    },
                    onDelete = viewModel::deletePlace,
                    onOpenRelations = { place ->
                        controller.navigate("planning/places/${place.id}/relations")
                    },
                    cachedAt = state.placesCachedAt,
                )
            }

            composable(
                route = PLACE_RELATIONS_ROUTE,
                arguments = listOf(navArgument(PLACE_ID_ARGUMENT) { type = NavType.StringType }),
            ) { entry ->
                val placeId = entry.arguments?.getString(PLACE_ID_ARGUMENT)
                    ?.let { runCatching { java.util.UUID.fromString(it) }.getOrNull() }
                val place = state.places.firstOrNull { it.id == placeId }

                LaunchedEffect(placeId, state.activeSpaceId, state.reconnectEpoch) {
                    placeId?.let(viewModel::loadPlaceRelations)
                }

                PlaceRelationsScreen(
                    placeName = place?.name.orEmpty(),
                    targets = state.placeRelationTargets,
                    linkedIds = state.placeLinkedTargetIds,
                    busy = state.placeRelationsBusy,
                    problem = state.placeRelationsProblem,
                    onBack = { controller.popBackStack() },
                    onLink = { target ->
                        placeId?.let { viewModel.linkPlaceRelation(it, target.kind, target.id) }
                    },
                    onUnlink = { target ->
                        placeId?.let { viewModel.unlinkPlaceRelation(it, target.kind, target.id) }
                    },
                )
            }

            composable(COLLECTIONS_ROUTE) {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadCollections() }

                CollectionsScreen(
                    collections = state.collections,
                    busy = state.collectionsBusy,
                    problem = state.collectionsProblem,
                    onBack = { controller.popBackStack() },
                    onOpen = { collection ->
                        controller.navigate("planning/collections/${collection.id}")
                    },
                    onAdd = viewModel::addCollection,
                    onEdit = viewModel::updateCollection,
                    onDelete = viewModel::deleteCollection,
                    cachedAt = state.collectionsCachedAt,
                )
            }

            composable(
                route = COLLECTION_DETAIL_ROUTE,
                arguments = listOf(navArgument(COLLECTION_ID_ARGUMENT) { type = NavType.StringType }),
            ) { entry ->
                val collectionId = entry.arguments?.getString(COLLECTION_ID_ARGUMENT)
                    ?.let { runCatching { java.util.UUID.fromString(it) }.getOrNull() }
                val collection = state.collections.firstOrNull { it.id == collectionId }

                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadCollections() }

                CollectionDetailScreen(
                    collection = collection,
                    busy = state.collectionsBusy,
                    problem = state.collectionsProblem,
                    onBack = { controller.popBackStack() },
                    onAddItem = { title -> collection?.let { viewModel.addCollectionItem(it, title) } },
                    onRenameItem = { item, title ->
                        collection?.let { viewModel.renameCollectionItem(it, item, title) }
                    },
                    onToggleCompleted = { item ->
                        collection?.let { viewModel.toggleCollectionItemCompleted(it, item) }
                    },
                    onDeleteItem = { item ->
                        collection?.let { viewModel.deleteCollectionItem(it, item) }
                    },
                    onMoveUp = { item -> collection?.let { viewModel.moveCollectionItemUp(it, item) } },
                    onMoveDown = { item -> collection?.let { viewModel.moveCollectionItemDown(it, item) } },
                )
            }

            composable(CHAPTERS_ROUTE) {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) {
                    viewModel.loadChapters()
                    viewModel.loadPlaces()
                }

                ChaptersScreen(
                    chapters = state.chapters,
                    places = state.places,
                    busy = state.chaptersBusy,
                    problem = state.chaptersProblem,
                    onBack = { controller.popBackStack() },
                    onOpen = { chapter -> controller.navigate("planning/chapters/${chapter.id}/content") },
                    onAdd = { title, description, startOn, endOn, placeId ->
                        viewModel.addChapter(title, description, startOn, endOn, placeId)
                    },
                    onEdit = { chapter, title, description, startOn, endOn, placeId ->
                        viewModel.updateChapter(chapter, title, description, startOn, endOn, placeId)
                    },
                    onDelete = viewModel::deleteChapter,
                    cachedAt = state.chaptersCachedAt,
                )
            }

            composable(
                route = CHAPTER_CONTENT_ROUTE,
                arguments = listOf(navArgument(CHAPTER_ID_ARGUMENT) { type = NavType.StringType }),
            ) { entry ->
                val chapterId = entry.arguments?.getString(CHAPTER_ID_ARGUMENT)
                    ?.let { runCatching { java.util.UUID.fromString(it) }.getOrNull() }
                val chapter = state.chapters.firstOrNull { it.id == chapterId }

                LaunchedEffect(chapterId, state.activeSpaceId, state.reconnectEpoch) {
                    chapterId?.let(viewModel::loadChapterContent)
                }

                ChapterContentScreen(
                    chapterTitle = chapter?.title.orEmpty(),
                    candidates = state.chapterContentCandidates,
                    linked = state.chapterLinkedContent,
                    busy = state.chapterContentBusy,
                    problem = state.chapterContentProblem,
                    onBack = { controller.popBackStack() },
                    onLink = { target ->
                        chapterId?.let { viewModel.linkChapterContent(it, target) }
                    },
                    onUnlink = { target ->
                        chapterId?.let { viewModel.unlinkChapterContent(it, target) }
                    },
                )
            }

            composable(PRIVATE_AREA_ROUTE) {
                PrivateAreaScreen(
                    onBack = { controller.popBackStack() },
                    onOpenNotes = { controller.navigate(PRIVATE_NOTES_ROUTE) },
                    onOpenGiftIdeas = { controller.navigate(GIFT_IDEAS_ROUTE) },
                    onOpenCollections = { controller.navigate(PRIVATE_COLLECTIONS_ROUTE) },
                )
            }

            composable(PRIVATE_NOTES_ROUTE) {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadPrivateNotes() }

                PrivateNotesScreen(
                    notes = state.privateNotes,
                    busy = state.privateNotesBusy,
                    problem = state.privateNotesProblem,
                    onBack = { controller.popBackStack() },
                    onAdd = viewModel::addPrivateNote,
                    onEdit = viewModel::updatePrivateNote,
                    onDelete = viewModel::deletePrivateNote,
                    cachedAt = state.privateNotesCachedAt,
                )
            }

            composable(GIFT_IDEAS_ROUTE) {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadGiftIdeas() }

                GiftIdeasScreen(
                    ideas = state.giftIdeas,
                    busy = state.giftIdeasBusy,
                    problem = state.giftIdeasProblem,
                    onBack = { controller.popBackStack() },
                    onAdd = viewModel::addGiftIdea,
                    onEdit = viewModel::updateGiftIdea,
                    onChangeStatus = viewModel::changeGiftIdeaStatus,
                    onDelete = viewModel::deleteGiftIdea,
                    cachedAt = state.giftIdeasCachedAt,
                )
            }

            composable(PRIVATE_COLLECTIONS_ROUTE) {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadPrivateCollections() }

                PrivateCollectionsScreen(
                    collections = state.privateCollections,
                    busy = state.privateCollectionsBusy,
                    problem = state.privateCollectionsProblem,
                    onBack = { controller.popBackStack() },
                    onOpen = { collection ->
                        controller.navigate("more/private/collections/${collection.id}")
                    },
                    onAdd = viewModel::addPrivateCollection,
                    onEdit = viewModel::updatePrivateCollection,
                    onDelete = viewModel::deletePrivateCollection,
                    cachedAt = state.privateCollectionsCachedAt,
                )
            }

            composable(
                route = PRIVATE_COLLECTION_DETAIL_ROUTE,
                arguments = listOf(navArgument(COLLECTION_ID_ARGUMENT) { type = NavType.StringType }),
            ) { entry ->
                val collectionId = entry.arguments?.getString(COLLECTION_ID_ARGUMENT)
                    ?.let { runCatching { java.util.UUID.fromString(it) }.getOrNull() }
                val collection = state.privateCollections.firstOrNull { it.id == collectionId }

                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadPrivateCollections() }

                PrivateCollectionDetailScreen(
                    collection = collection,
                    busy = state.privateCollectionsBusy,
                    problem = state.privateCollectionsProblem,
                    onBack = { controller.popBackStack() },
                    onAddItem = { title -> collection?.let { viewModel.addPrivateCollectionItem(it, title) } },
                    onRenameItem = { item, title ->
                        collection?.let { viewModel.renameCollectionItem(it, item, title) }
                    },
                    onToggleCompleted = { item ->
                        collection?.let { viewModel.toggleCollectionItemCompleted(it, item) }
                    },
                    onDeleteItem = { item ->
                        collection?.let { viewModel.deletePrivateCollectionItem(it, item) }
                    },
                    onMoveUp = { item -> collection?.let { viewModel.moveCollectionItemUp(it, item) } },
                    onMoveDown = { item -> collection?.let { viewModel.moveCollectionItemDown(it, item) } },
                )
            }

            composable(NOTIFICATIONS_ROUTE) {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) {
                    viewModel.loadNotifications()
                    viewModel.loadUnreadNotificationCount()
                }

                NotificationsScreen(
                    notifications = state.notifications,
                    unreadCount = state.unreadNotificationCount,
                    busy = state.notificationsBusy,
                    problem = state.notificationsProblem,
                    onBack = { controller.popBackStack() },
                    onMarkRead = viewModel::markNotificationRead,
                    onMarkAllRead = viewModel::markAllNotificationsRead,
                    onOpen = { notification ->
                        engagementTargetRoute(notification.targetType, notification.targetId)?.let {
                            viewModel.markNotificationRead(notification)
                            controller.navigate(it)
                        }
                    },
                    onLoadMore = viewModel::loadMoreNotifications.takeIf { state.notificationsHasMore },
                    loadingMore = state.notificationsLoadingMore,
                )
            }

            composable(ACTIVITY_ROUTE) {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadActivity() }

                ActivityScreen(
                    entries = state.activity,
                    busy = state.activityBusy,
                    problem = state.activityProblem,
                    onBack = { controller.popBackStack() },
                    onOpen = { entry ->
                        engagementTargetRoute(entry.targetType, entry.targetId)?.let { controller.navigate(it) }
                    },
                    currentAccountId = state.accountId,
                    onLoadMore = viewModel::loadMoreActivity.takeIf { state.activityHasMore },
                    loadingMore = state.activityLoadingMore,
                )
            }

            composable(DATA_EXPORT_ROUTE) {
                val exportContext = LocalContext.current
                val exportScope = rememberCoroutineScope()
                val exportDownloadLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.CreateDocument("application/zip"),
                ) { uri ->
                    if (uri != null) {
                        exportScope.launch {
                            exportContext.contentResolver.openOutputStream(uri)?.use { stream ->
                                viewModel.downloadExport(stream)
                            }
                        }
                    }
                }

                de.eimir.app.transfer.DataExportScreen(
                    export = state.export,
                    busy = state.exportBusy,
                    problem = state.exportProblem,
                    downloaded = state.exportDownloaded,
                    onBack = { controller.popBackStack() },
                    onCreateExport = viewModel::createExport,
                    onRefreshExport = viewModel::refreshExport,
                    onDownloadExport = {
                        val exportId = state.export?.id
                        if (exportId != null) {
                            exportDownloadLauncher.launch("eimir-export-$exportId.zip")
                        }
                    },
                )
            }

            composable(DATA_IMPORT_ROUTE) {
                val importContext = LocalContext.current
                val importScope = rememberCoroutineScope()
                val importPickerLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument(),
                ) { uri ->
                    if (uri != null) {
                        importScope.launch {
                            val size = importContext.contentResolver
                                .openFileDescriptor(uri, "r")
                                ?.use { it.statSize } ?: -1L
                            importContext.contentResolver.openInputStream(uri)?.use { stream ->
                                viewModel.uploadImport(size, stream)
                            }
                        }
                    }
                }

                de.eimir.app.transfer.DataImportScreen(
                    import = state.import,
                    busy = state.importBusy,
                    problem = state.importProblem,
                    onBack = { controller.popBackStack() },
                    onPickArchive = { importPickerLauncher.launch(arrayOf("application/zip")) },
                    onRefreshImport = viewModel::refreshImport,
                    onApplyImport = viewModel::applyImport,
                    onStartOver = viewModel::clearImport,
                )
            }

            composable(SEARCH_ROUTE) {
                DisposableEffect(Unit) { onDispose(viewModel::clearSearch) }

                SearchScreen(
                    results = state.searchResults,
                    busy = state.searchBusy,
                    problem = state.searchProblem,
                    onBack = { controller.popBackStack() },
                    onSearch = viewModel::search,
                    onLoadMore = viewModel::loadMoreSearch.takeIf { state.searchHasMore },
                    loadingMore = state.searchLoadingMore,
                )
            }
        },
    ) { destination ->
        when (destination) {
            AppDestination.Today -> {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadToday() }
                val userName = if (state.demoMode) {
                    when (state.demoPersona) {
                        DemoPersona.Alex -> stringResource(R.string.demo_persona_alex)
                        else -> stringResource(R.string.demo_persona_lea)
                    }
                } else {
                    state.profile.self?.displayName?.takeIf { it.isNotBlank() }
                        ?: state.accountDisplayName?.takeIf { it.isNotBlank() }
                        ?: stringResource(R.string.activity_you)
                }
                TodayScreen(
                    dashboard = state.dashboard,
                    busy = state.todayBusy,
                    problem = state.todayProblem,
                    gestureSent = state.thinkingOfYouSent,
                    onSendThinkingOfYou = viewModel::sendThinkingOfYou,
                    onAcknowledgeThinkingOfYou = viewModel::acknowledgeThinkingOfYou,
                    onOpenActivity = {
                        viewModel.acknowledgeThinkingOfYou()
                        navController.navigate(ACTIVITY_ROUTE)
                    },
                    cachedAt = state.todayCachedAt,
                    userName = userName,
                )
            }

            AppDestination.Plan -> {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) {
                    viewModel.loadPlanning()
                    viewModel.loadPlaces()
                }
                PlanScreen(
                    wishes = state.openWishes,
                    plans = state.plans,
                    places = state.places,
                    busy = state.planningBusy,
                    problem = state.planningProblem,
                    onAddWish = viewModel::addWish,
                    onEditWish = viewModel::updateWish,
                    onPlanWish = viewModel::planWish,
                    onRemoveWish = viewModel::removeWish,
                    onCreatePlan = viewModel::createPlan,
                    onEditPlan = viewModel::updatePlan,
                    onSchedule = viewModel::schedulePlan,
                    onUnschedule = viewModel::unschedulePlan,
                    onComplete = viewModel::completePlan,
                    onReturnToWish = viewModel::returnPlanToWish,
                    onDeletePlan = viewModel::deletePlan,
                    onCreatePlace = { name -> viewModel.addPlace(name, "", "", "", "") },
                    onOpenPlaces = { navController.navigate(PLACES_ROUTE) },
                    onOpenCollections = { navController.navigate(COLLECTIONS_ROUTE) },
                    onOpenChapters = { navController.navigate(CHAPTERS_ROUTE) },
                    cachedAt = state.planningCachedAt,
                )
            }

            AppDestination.More -> {
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) {
                    if (state.activeSpaceId != null) viewModel.refreshProfile()
                }
                LaunchedEffect(state.availableSpaces) { viewModel.loadSpaceNames() }
                LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.loadUnreadNotificationCount() }
                MoreScreen(
                    onSignOut = onSignOut,
                    onOpenHeartMoments = { navController.navigate(HEART_MOMENTS_ROUTE) },
                    onOpenInvitations = { navController.navigate(INVITATIONS_ROUTE) },
                    onOpenRelatedPersons = { navController.navigate(RELATED_PERSONS_ROUTE) },
                    onOpenPreferences = { navController.navigate(PREFERENCES_ROUTE) },
                    onOpenPrivateArea = { navController.navigate(PRIVATE_AREA_ROUTE) },
                    onOpenDataExport = { navController.navigate(DATA_EXPORT_ROUTE) },
                    onOpenDataImport = { navController.navigate(DATA_IMPORT_ROUTE) },
                    onOpenNotifications = { navController.navigate(NOTIFICATIONS_ROUTE) },
                    onOpenSearch = { navController.navigate(SEARCH_ROUTE) },
                    unreadNotificationCount = state.unreadNotificationCount,
                    signOutEnabled = !state.busy && !state.profile.busy,
                    spaces = state.availableSpaces,
                    spacePartnerNames = state.spacePartnerNames,
                    activeSpaceId = state.activeSpaceId,
                    onSelectSpace = onSelectSpace,
                    identityContent = {
                        ProfileSettingsContent(
                            state = state.profile,
                            onRetry = viewModel::refreshProfile,
                            onSaveDisplayName = viewModel::saveProfileDisplayName,
                            onChooseAvatar = onPickProfileAvatar,
                            onRemoveAvatar = viewModel::removeProfileAvatar,
                        )
                    },
                    sensitiveContent = {
                        if (state.activeSpaceId != null) {
                            SpaceOffboardingContent(
                                demoMode = state.demoMode,
                                busy = state.spaceOffboardingBusy,
                                problem = state.spaceOffboardingProblem,
                                onOpenDataExport = { navController.navigate(DATA_EXPORT_ROUTE) },
                                onLeaveSpace = viewModel::leaveActiveSpace,
                            )
                        }
                        AccountSettingsContent(
                            demoMode = state.demoMode,
                            busy = state.accountDeletionBusy,
                            problem = state.accountDeletionProblem,
                            recentAuthenticationCapabilities =
                                state.accountDeletionRecentAuthenticationCapabilities,
                            recentAuthenticationBusy = state.accountDeletionRecentAuthenticationBusy,
                            recentAuthenticationProblem = state.accountDeletionRecentAuthenticationProblem,
                            recentAuthenticationComplete = state.accountDeletionRecentAuthenticationComplete,
                            onLoadRecentAuthentication = viewModel::loadAccountDeletionRecentAuthentication,
                            onRecentAuthenticationPassword = viewModel::authenticateAccountDeletionPassword,
                            onRecentAuthenticationPasskey = viewModel::startAccountDeletionPasskey,
                            onRecentAuthenticationOidc = viewModel::startAccountDeletionOidc,
                            onResetRecentAuthentication = viewModel::resetAccountDeletionRecentAuthentication,
                            onOpenDataExport = { navController.navigate(DATA_EXPORT_ROUTE) },
                            onDeleteAccount = viewModel::deleteOwnAccount,
                        )
                    },
                )
            }

            else -> story(
                { memoryId -> navController.navigate("story/memories/$memoryId") },
                { id -> navController.navigate("story/milestones/$id") },
                { id -> navController.navigate("story/heart-moments/$id") },
                createMemory,
            )
        }
    }
}

/**
 * The M2-D18 cross-client Deep Link contract's "small logical target
 * tuple... maps to the current client's canonical route," applied to
 * Notifications and Activity: each entry names a resource kind and id
 * rather than a client-specific path, and this is where that tuple becomes
 * an actual in-app route. Reuses the route templates above rather than a
 * second copy of the same path shapes.
 *
 * `null` for [targetId] being absent, or for a kind with no per-resource
 * route on Android yet — Wish and Plan both live in one shared list screen,
 * not a route of their own. A caller's tap on such an entry does nothing
 * rather than navigating to a route that cannot be built.
 */
internal fun engagementTargetRoute(targetType: EngagementTarget?, targetId: java.util.UUID?): String? {
    if (targetId == null) return null
    return when (targetType) {
        EngagementTarget.MEMORY -> MEMORY_ROUTE.replace("{$MEMORY_ID_ARGUMENT}", targetId.toString())
        EngagementTarget.MILESTONE -> MILESTONE_ROUTE.replace("{$ITEM_ID_ARGUMENT}", targetId.toString())
        EngagementTarget.HEART_MOMENT -> HEART_MOMENT_ROUTE.replace("{$ITEM_ID_ARGUMENT}", targetId.toString())
        EngagementTarget.PLACE -> PLACE_RELATIONS_ROUTE.replace("{$PLACE_ID_ARGUMENT}", targetId.toString())
        EngagementTarget.CHAPTER -> CHAPTER_CONTENT_ROUTE.replace("{$CHAPTER_ID_ARGUMENT}", targetId.toString())
        EngagementTarget.COLLECTION -> COLLECTION_DETAIL_ROUTE.replace("{$COLLECTION_ID_ARGUMENT}", targetId.toString())
        EngagementTarget.WISH, EngagementTarget.PLAN, null -> null
    }
}

private val MEMORY_COMMENTS = ReferenceContract.CommentParent.MEMORY
private val MILESTONE_COMMENTS = ReferenceContract.CommentParent.MILESTONE
private val HEART_MOMENT_COMMENTS = ReferenceContract.CommentParent.HEART_MOMENT

/**
 * The Story destination.
 *
 * Reading is the default and capturing is a deliberate step away from it,
 * because a couple opens their history far more often than they add to it.
 * The capture form is still the M2 reference form; giving it a product shape
 * belongs to the authoring slice.
 */
@Composable
private fun StoryDestination(
    state: ReferenceUiState,
    viewModel: ReferenceViewModel,
    onCreateMemory: () -> Unit,
    onOpenMemory: (java.util.UUID) -> Unit,
    onOpenMilestone: (java.util.UUID) -> Unit,
    onOpenHeartMoment: (java.util.UUID) -> Unit,
) {
    LaunchedEffect(state.activeSpaceId, state.reconnectEpoch) { viewModel.ensureStoryLoaded() }
    val listState = key(state.storyScope) { rememberLazyListState() }

    StoryScreen(
        items = state.storyItems,
        imageStore = viewModel.storyImages,
        generation = viewModel.storyGeneration,
        onOpenMemory = onOpenMemory,
        onOpenMilestone = onOpenMilestone,
        onOpenHeartMoment = onOpenHeartMoment,
        onLoadMore = viewModel::loadMoreStory.takeIf { state.storyHasMore },
        loadingMore = state.storyLoadingMore,
        cachedAt = state.storyCachedAt,
        listState = listState, scope = state.storyScope,
        loaded = state.storyLoaded, loading = state.storyLoading, problem = state.storyProblem,
        onRetry = viewModel::retryStory,
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3),
        ) {
            Text(
                text = stringResource(R.string.story_title),
                // An editorial moment, which is what the delivered display face
                // is for. The size stays the token scale's; only the family
                // changes.
                style = MaterialTheme.typography.headlineMedium
                    .copy(fontFamily = EimirDisplayFamily),
                color = EimirTheme.colors.textPrimary,
                modifier = Modifier.semantics { heading() },
            )
            // Below the title rather than beside it: the action's label is a
            // whole phrase, and squeezing it next to a headline wrapped both.
            FilledTonalButton(
                onClick = onCreateMemory,
                enabled = !state.busy,
                modifier = Modifier.heightIn(min = MinimumTouchTarget),
            ) {
                Text(stringResource(R.string.ref_memory_heading))
            }
            TimelineScopeControls(state.storyScope, state.storyAvailableYears, viewModel::applyStoryScope)
            androidx.compose.material3.TextButton(
                colors = androidx.compose.material3.ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText),
                onClick = viewModel::refreshStory,
                enabled = !state.storyLoading, modifier = Modifier.heightIn(min = MinimumTouchTarget)) {
                Text(stringResource(R.string.ref_refresh))
            }
        }
    }
}
