package de.eimir.nativetest.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import de.eimir.nativetest.R
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Locale-aware date formatting through java.time; no hand-written patterns. */
object Dates {
    fun long(date: LocalDate, locale: Locale): String =
        date.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale))

    fun medium(date: LocalDate, locale: Locale): String =
        date.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale))

    fun monthYear(date: LocalDate, locale: Locale): String =
        date.format(DateTimeFormatter.ofPattern("LLLL yyyy", locale))

    fun dayMonth(date: LocalDate, locale: Locale): String =
        date.format(DateTimeFormatter.ofPattern("d. MMM", locale))

    fun weekday(date: LocalDate, locale: Locale): String =
        date.format(DateTimeFormatter.ofPattern("EEE", locale))

    fun time(dateTime: OffsetDateTime, locale: Locale): String =
        dateTime.atZoneSameInstant(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))

    fun dateTime(dateTime: OffsetDateTime, locale: Locale): String =
        dateTime.atZoneSameInstant(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale))

    fun today(): LocalDate = LocalDate.now(ZoneId.systemDefault())
}

@Composable
fun currentLocale(): Locale = LocalConfiguration.current.locales[0] ?: Locale.GERMAN

/** "Heute", "Morgen", "In 5 Tagen" or the date itself for upcoming items. */
@Composable
fun relativeDay(date: LocalDate): String {
    val days = ChronoUnit.DAYS.between(Dates.today(), date)
    return when {
        days == 0L -> stringResource(R.string.plan_today)
        days == 1L -> stringResource(R.string.plan_tomorrow)
        days in 2..13 -> stringResource(R.string.plan_in_days, days.toInt())
        else -> Dates.medium(date, currentLocale())
    }
}
