package com.amar.vaktija

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * One exact alarm at a time: the next prayer time. When it fires, the phone wakes for ~2 s,
 * plays the beep, (at ikindija) checks tomorrow's date, schedules the next alarm and sleeps again.
 * No services, no wake locks held, no location in the background.
 */
object Scheduler {

    private fun pending(ctx: Context, key: String?, at: Long): PendingIntent {
        val i = Intent(ctx, AlarmReceiver::class.java).putExtra("key", key).putExtra("at", at)
        return PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun schedule(ctx: Context, after: Long = System.currentTimeMillis()) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return

        val city = Prefs.city(ctx)
        val zone = ZoneId.of(city.zone)
        val today = LocalDate.now(zone)
        var bestAt = Long.MAX_VALUE
        var bestKey: String? = null
        for (offset in -1L..1L) {
            val date = today.plusDays(offset)
            val day = Vakat.compute(city.lat, city.lng, zone, date)
            val fajr = day["fajr"].minutes ?: continue
            val ramazanNight = Ui.isRamazan(date.plusDays(1))   // same rule as the screen
            for (t in day.times) {
                val m = t.minutes ?: continue
                if (t.key !in Prefs.BEEP) continue
                if (ramazanNight && t.key == "ishaiz") continue    // hidden on Ramazan nights → no beep
                // night times after midnight belong to the next calendar day
                val d = if ((t.key == "lastthird" || t.key == "midnight") && m < fajr) date.plusDays(1) else date
                val at = ZonedDateTime.of(d.atStartOfDay(), zone).plusMinutes(m.toLong()).toInstant().toEpochMilli()
                if (at > after + 30_000 && at < bestAt) { bestAt = at; bestKey = t.key }
            }
        }
        if (bestKey == null) return

        val pi = pending(ctx, bestKey, bestAt)
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, bestAt, pi)
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, bestAt, pi)   // fallback: may be a few minutes late
        }
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val key = intent.getStringExtra("key")
        val at = intent.getLongExtra("at", System.currentTimeMillis())
        val onTime = System.currentTimeMillis() - at < 10 * 60_000      // never beep for a long-missed time

        if (key == "asr") Events.notifyIfTomorrow(ctx)
        Scheduler.schedule(ctx, after = maxOf(at, System.currentTimeMillis()))

        if (onTime && key in Prefs.BEEP) {
            val result = goAsync()
            Beep.play(ctx) { result.finish() }
        }
    }
}

/** Re-creates the alarm after a reboot, an app update or a clock / time-zone change. */
class SystemReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) = Scheduler.schedule(ctx)
}

object Beep {
    fun play(ctx: Context, done: () -> Unit) {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)       // follows the ringer: silent mode = no beep
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val mp = try {
            MediaPlayer.create(ctx, R.raw.beep, attrs, 0)
        } catch (e: Exception) {
            null
        }
        if (mp == null) { done(); return }
        var finished = false
        val handler = Handler(Looper.getMainLooper())
        fun finish() {
            if (finished) return
            finished = true
            handler.removeCallbacksAndMessages(null)
            runCatching { mp.release() }
            done()
        }
        mp.setVolume(0.5f, 0.5f)                                    // half of the phone's notification volume
        mp.setOnCompletionListener { finish() }
        mp.setOnErrorListener { _, _, _ -> finish(); true }
        handler.postDelayed({ finish() }, 8_000)
        mp.start()
    }
}

/** Important Islamic dates (Umm al-Qura calendar). */
object Events {
    data class Event(val month: Int, val day: Int, val name: String, val note: String? = null)

    val ALL = listOf(
        Event(9, 1, "Prvi dan ramazana"),
        Event(10, 1, "Ramazanski bajram"),
        Event(12, 1, "Prvi dan zu-l-hidždžeta"),
        Event(12, 9, "Dan Arefata"),
        Event(12, 10, "Kurban-bajram"),
        Event(1, 10, "Ašura"),
    )

    data class Upcoming(val event: Event, val date: LocalDate, val days: Long)

    fun on(date: LocalDate): Event? {
        val h = Ui.hijri(date) ?: return null
        return ALL.firstOrNull { it.month == h[1] && it.day == h[0] }
    }

    /** The next occurrence of every event, nearest first. */
    fun upcoming(today: LocalDate): List<Upcoming> {
        val found = LinkedHashMap<Event, Upcoming>()
        var i = 0L
        while (i <= 400 && found.size < ALL.size) {
            val d = today.plusDays(i)
            on(d)?.let { e -> if (e !in found) found[e] = Upcoming(e, d, i) }
            i++
        }
        return found.values.sortedBy { it.days }
    }

    private const val CHANNEL = "dates"

    fun notifyIfTomorrow(ctx: Context) {
        val zone = ZoneId.of(Prefs.city(ctx).zone)
        val tomorrow = LocalDate.now(zone).plusDays(1)
        val e = on(tomorrow) ?: return
        if (Build.VERSION.SDK_INT >= 33 &&
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Važni datumi", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Dan prije bajrama, ramazana, Arefata i Ašure"
            setSound(null, null)    // the ikindija beep is the sound
        })
        val open = PendingIntent.getActivity(ctx, 1, Intent(ctx, CalendarActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val text = listOfNotNull(e.note, Ui.formatHijri(tomorrow)).joinToString(" · ")
        val n = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_notif)
            .setContentTitle("Sutra je: ${e.name}")
            .setContentText(text)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(100, n)
    }
}
