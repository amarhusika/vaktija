package com.amar.vaktija

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import java.time.LocalDate
import java.time.ZoneId
import java.time.chrono.HijrahDate
import java.util.Locale
import java.time.temporal.ChronoField

object Ui {

    /** Draws behind the status/navigation bars and pads [target] so nothing hides under them. */
    @Suppress("DEPRECATION")
    fun edgeToEdge(activity: Activity, root: View, target: View) {
        val w = activity.window
        // dark icons on light bars, light icons in dark mode
        val dark = (activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false)
            val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            w.insetsController?.setSystemBarsAppearance(if (dark) 0 else light, light)
        } else {
            var flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            if (!dark) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            w.decorView.systemUiVisibility = flags
        }
        val l = target.paddingLeft; val t = target.paddingTop
        val r = target.paddingRight; val b = target.paddingBottom
        root.setOnApplyWindowInsetsListener { _, insets ->
            val top: Int
            val bottom: Int
            if (Build.VERSION.SDK_INT >= 30) {
                val i = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                top = i.top; bottom = i.bottom
            } else {
                top = insets.systemWindowInsetTop; bottom = insets.systemWindowInsetBottom
            }
            target.setPadding(l, t + top, r, b + bottom)
            insets
        }
        root.requestApplyInsets()
    }

    private val DAYS = arrayOf("Ponedjeljak", "Utorak", "Srijeda", "Četvrtak", "Petak", "Subota", "Nedjelja")
    private val MONTHS = arrayOf("januara", "februara", "marta", "aprila", "maja", "juna",
        "jula", "augusta", "septembra", "oktobra", "novembra", "decembra")
    val HIJRI_MONTHS = arrayOf("muharrem", "safer", "rebiu-l-evvel", "rebiu-l-ahir", "džumade-l-ula",
        "džumade-l-uhra", "redžeb", "ša'ban", "ramazan", "ševval", "zu-l-ka'de", "zu-l-hidždže")

    fun formatDate(d: LocalDate) =
        "${DAYS[d.dayOfWeek.value - 1]}, ${d.dayOfMonth}. ${MONTHS[d.monthValue - 1]} ${d.year}."

    fun formatShort(d: LocalDate) = "${d.dayOfMonth}. ${MONTHS[d.monthValue - 1]} ${d.year}."

    /** Hijri date [day, month, year] (Umm al-Qura, built into Android) – may differ by a day from the local announcement. */
    fun hijri(d: LocalDate): IntArray? = try {
        val h = HijrahDate.from(d)
        intArrayOf(h.get(ChronoField.DAY_OF_MONTH), h.get(ChronoField.MONTH_OF_YEAR), h.get(ChronoField.YEAR))
    } catch (e: Exception) {
        null
    }

    fun formatHijri(d: LocalDate): String? = hijri(d)?.let { (day, month, year) ->
        "$day. ${HIJRI_MONTHS[month - 1]} $year. h."
    }

    fun isRamazan(d: LocalDate) = hijri(d)?.get(1) == 9

    fun dp(ctx: Context, v: Int) = (v * ctx.resources.displayMetrics.density + 0.5f).toInt()
}

/** A place used for the calculations. */
data class City(val name: String, val country: String, val lat: Double, val lng: Double, val zone: String) {
    val id: String get() = String.format(Locale.US, "%s|%.4f|%.4f", name, lat, lng)

    fun encode() = listOf(name, country, lat.toString(), lng.toString(), zone).joinToString("\t")

    companion object {
        fun decode(s: String): City? {
            val p = s.split('\t')
            if (p.size != 5) return null
            return City(p[0], p[1], p[2].toDoubleOrNull() ?: return null, p[3].toDoubleOrNull() ?: return null, p[4])
        }
    }
}

object Prefs {
    private const val FILE = "vaktija"

    val DEFAULT = City("Sarajevo", "Bosna i Hercegovina", 43.8563, 18.4131, "Europe/Sarajevo")

    /** Times that beep – everything except sunrise and the middle of the night. */
    val BEEP = setOf("fajr", "dhuhr", "asr", "maghrib", "isha", "ishaiz", "lastthird")

    private fun p(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun city(ctx: Context): City {
        val p = p(ctx)
        val c = p.getString("place", null)?.let(City::decode) ?: return DEFAULT
        // "my location" always follows the phone's own time zone
        return if (p.getBoolean("gps", false)) c.copy(zone = ZoneId.systemDefault().id) else c
    }

    fun usesGps(ctx: Context) = p(ctx).getBoolean("gps", false)

    fun setCity(ctx: Context, city: City) {
        val recent = (listOf(city) + recent(ctx).filter { it.id != city.id }).take(6)
        p(ctx).edit()
            .putString("place", city.encode())
            .putBoolean("gps", false)
            .putString("recent", recent.joinToString("\n") { it.encode() })
            .apply()
    }

    /** Saves the phone's position. [name] null keeps the previous name if we're still nearby. */
    fun setGps(ctx: Context, lat: Double, lng: Double, name: String?) {
        val old = if (usesGps(ctx)) city(ctx) else null
        val n = name ?: old?.takeIf { Loc.distanceKm(it.lat, it.lng, lat, lng) < 5 }?.name ?: "Moja lokacija"
        val c = City(n, "Trenutna lokacija", lat, lng, ZoneId.systemDefault().id)
        p(ctx).edit().putString("place", c.encode()).putBoolean("gps", true).apply()
    }

    fun recent(ctx: Context): List<City> =
        p(ctx).getString("recent", "").orEmpty().split('\n').mapNotNull { City.decode(it) }


    /** True only the very first time (used to ask for permissions once). */
    fun firstRun(ctx: Context): Boolean {
        val first = !p(ctx).getBoolean("asked", false)
        if (first) p(ctx).edit().putBoolean("asked", true).apply()
        return first
    }
}
