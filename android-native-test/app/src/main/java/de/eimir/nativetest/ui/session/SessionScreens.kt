package de.eimir.nativetest.ui.session

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.eimir.nativetest.BuildConfig
import de.eimir.nativetest.R
import de.eimir.nativetest.auth.SignOutReason
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.ui.common.ErrorState
import de.eimir.nativetest.ui.common.PersonAvatar
import de.eimir.nativetest.ui.common.PrimaryButton
import de.eimir.nativetest.ui.common.ReadingColumn
import de.eimir.nativetest.ui.common.SecondaryButton
import de.eimir.nativetest.ui.common.StateMessage
import de.eimir.nativetest.ui.common.message
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import eimir.api.models.SpaceView
import java.net.URI

@Composable
private fun BrandHeader() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        EimirIcon(EimirIcons.Wir, size = 32.dp)
        Spacer(Modifier.size(Space.xs))
        Text(stringResource(R.string.brand_name), style = EimirType.heading3.copy(fontFamily = de.eimir.nativetest.ui.theme.Literata))
        Spacer(Modifier.size(Space.xs))
        Surface(shape = Radii.pill, color = Eimir.colors.successSurface) {
            Text(
                stringResource(R.string.test_build_badge),
                style = EimirType.meta,
                color = Eimir.colors.success,
                modifier = Modifier.padding(horizontal = Space.xs, vertical = 2.dp),
            )
        }
    }
}

/**
 * Magic Link sign-in. The pinned test instance offers Magic Link and Passkey;
 * native passkeys need server-side Digital Asset Links and an Android WebAuthn
 * origin for this package, which the instance does not have, so only the
 * Magic Link path is offered (see docs in android-native-test/README.md).
 */
@Composable
fun SignInScreen(session: SessionViewModel, reason: SignOutReason?) {
    val ui by session.signIn.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var pasted by rememberSaveable { mutableStateOf("") }
    ReadingColumn(Modifier.safeDrawingPadding().imePadding(), maxWidth = 520.dp) { gutter ->
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = gutter, vertical = Space.xl),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            BrandHeader()
            Spacer(Modifier.height(Space.lg))
            if (reason == SignOutReason.SessionEnded && ui.sentTo == null) {
                Surface(color = Eimir.colors.warningSurface, shape = Radii.medium) {
                    Text(stringResource(R.string.signin_ended), style = EimirType.bodySmall, modifier = Modifier.padding(Space.md))
                }
            }
            if (ui.consuming) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.size(Space.sm))
                    Text(stringResource(R.string.signin_consuming), style = EimirType.body)
                }
            }
            AnimatedContent(ui.sentTo, label = "signin-step") { sentTo ->
                Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
                    if (sentTo == null) {
                        Text(stringResource(R.string.signin_eyebrow), style = EimirType.label, color = Eimir.colors.textSecondary)
                        Text(
                            stringResource(R.string.signin_title),
                            style = EimirType.editorialLarge,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(stringResource(R.string.signin_body), style = EimirType.body, color = Eimir.colors.textSecondary)
                        OutlinedTextField(
                            value = ui.email,
                            onValueChange = session::updateEmail,
                            label = { Text(stringResource(R.string.signin_email_label)) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
                            keyboardActions = KeyboardActions(onSend = { session.requestLink() }),
                            isError = ui.error == AppError.Invalid,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        PrimaryButton(
                            text = stringResource(if (ui.sending) R.string.signin_requesting else R.string.signin_request),
                            onClick = session::requestLink,
                            pending = ui.sending,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        Text(
                            stringResource(R.string.signin_sent_title),
                            style = EimirType.editorialLarge,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(stringResource(R.string.signin_sent_body, sentTo), style = EimirType.body, color = Eimir.colors.textSecondary)
                        TextButton(onClick = session::editEmail) { Text(stringResource(R.string.signin_other_address)) }
                    }
                }
            }
            ui.error?.let { error ->
                Text(
                    if (ui.consuming || error == AppError.Invalid && ui.sentTo != null) stringResource(R.string.signin_link_failed) else error.message(),
                    style = EimirType.bodySmall,
                    color = Eimir.colors.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                )
            }
            Spacer(Modifier.height(Space.md))
            Surface(color = Eimir.colors.surface, shape = Radii.card) {
                Column(Modifier.padding(Space.md), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                    Text(stringResource(R.string.signin_open_link_title), style = EimirType.title)
                    Text(stringResource(R.string.signin_open_link_body), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
                    OutlinedTextField(
                        value = pasted,
                        onValueChange = { pasted = it },
                        label = { Text(stringResource(R.string.signin_paste_label)) },
                        singleLine = true,
                        isError = ui.linkError,
                        supportingText = if (ui.linkError) {
                            { Text(stringResource(R.string.signin_link_invalid)) }
                        } else {
                            null
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                        keyboardActions = KeyboardActions(onGo = { if (session.submitLinkText(pasted)) pasted = "" }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                        SecondaryButton(stringResource(R.string.signin_paste_action), onClick = {
                            val clip = (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip
                            val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)?.toString()
                            if (text != null && session.submitLinkText(text)) pasted = ""
                        })
                        if (pasted.isNotBlank()) {
                            SecondaryButton(stringResource(R.string.signin_use_link), onClick = {
                                if (session.submitLinkText(pasted)) pasted = ""
                            })
                        }
                    }
                }
            }
            Text(
                stringResource(R.string.signin_instance, URI(BuildConfig.API_ORIGIN).host),
                style = EimirType.meta,
                color = Eimir.colors.textMuted,
            )
        }
    }
}

@Composable
fun ChooseSpaceScreen(spaces: List<SpaceView>, onSelect: (String) -> Unit, onSignOut: () -> Unit) {
    ReadingColumn(Modifier.safeDrawingPadding(), maxWidth = 520.dp) { gutter ->
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = gutter, vertical = Space.xl),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            BrandHeader()
            Text(stringResource(R.string.space_choose_title), style = EimirType.editorial, modifier = Modifier.semantics { heading() })
            spaces.forEach { space ->
                val partner = space.partners.firstOrNull()
                Surface(onClick = { onSelect(space.id.toString()) }, shape = Radii.card, color = Eimir.colors.surfaceRaised) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(Space.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        PersonAvatar(partner?.displayName ?: "?", null, null, size = 40.dp)
                        Spacer(Modifier.size(Space.sm))
                        Text(
                            if (partner != null) stringResource(R.string.space_with, partner.displayName) else stringResource(R.string.space_alone),
                            style = EimirType.title,
                        )
                    }
                }
            }
            TextButton(onClick = onSignOut) { Text(stringResource(R.string.action_sign_out)) }
        }
    }
}

@Composable
fun AwaitingSpaceScreen(onRetry: () -> Unit, onSignOut: () -> Unit) {
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(Space.xl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        StateMessage(
            title = stringResource(R.string.space_awaiting_title),
            body = stringResource(R.string.space_awaiting_body),
            icon = EimirIcons.Together,
            action = stringResource(R.string.space_check_again),
            onAction = onRetry,
        )
        TextButton(onClick = onSignOut) { Text(stringResource(R.string.action_sign_out)) }
    }
}

@Composable
fun SpaceProblemScreen(error: AppError, onRetry: () -> Unit, onSignOut: () -> Unit) {
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(Space.xl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ErrorState(error, onRetry)
        TextButton(onClick = onSignOut) { Text(stringResource(R.string.action_sign_out)) }
    }
}

@Composable
fun PendingEntryDialogs(session: SessionViewModel) {
    val pending by session.pending.collectAsStateWithLifecycle()
    when (val entry = pending) {
        is PendingEntry.ReplaceLogin -> AlertDialog(
            onDismissRequest = session::dismissPending,
            title = { Text(stringResource(R.string.signin_replace_title)) },
            text = { Text(stringResource(R.string.signin_replace_body)) },
            confirmButton = { TextButton(onClick = session::confirmReplaceLogin) { Text(stringResource(R.string.signin_replace_confirm)) } },
            dismissButton = { TextButton(onClick = session::dismissPending) { Text(stringResource(R.string.action_cancel)) } },
        )
        is PendingEntry.SignupName -> {
            var name by rememberSaveable(entry) { mutableStateOf("") }
            AlertDialog(
                onDismissRequest = session::dismissPending,
                title = { Text(stringResource(R.string.signin_signup_title)) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                        Text(stringResource(R.string.signin_signup_body))
                        OutlinedTextField(
                            value = name,
                            onValueChange = { name = it.take(80) },
                            label = { Text(stringResource(R.string.signin_signup_name)) },
                            singleLine = true,
                        )
                    }
                },
                confirmButton = { TextButton(onClick = { session.confirmSignup(name) }) { Text(stringResource(R.string.signin_signup_confirm)) } },
                dismissButton = { TextButton(onClick = session::dismissPending) { Text(stringResource(R.string.action_cancel)) } },
            )
        }
        null -> Unit
    }
}
