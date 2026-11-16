package com.amar.vaktija

import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * Prayer times – a faithful Kotlin port of the PrayTimes.js variant from vaktija-android.html:
 * fajr & isha 14.6°, "Jacija IZ" 16°, Asr standard, NightMiddle high-latitude rule,
 * midnight = sunset→fajr, last third = maghrib→fajr.
 * The time zone comes from java.time, so DST is always correct for each city.
 */
object Vakat {

    /** One computed time: minutes after local midnight (null if the sun never reaches that angle). */
    data class Time(val key: String, val label: String, val minutes: Int?) {
        val text: String get() = minutes?.let { "%02d:%02d".format(it / 60, it % 60) } ?: "-----"
    }

    data class Day(
        val date: LocalDate,
        val times: List<Time>,      // the main list, in display order
        val sabahIZ: Time,          // fajr at 18° + 15 min (shown in Ramazan)
        val jacijaIZ: Time,         // maghrib + 126 min (shown in Ramazan)
    ) {
        operator fun get(key: String) = times.first { it.key == key }
    }

    val LABELS = linkedMapOf(
        "fajr" to "Zora",
        "sunrise" to "Izlazak sunca",
        "dhuhr" to "Podne",
        "asr" to "Ikindija",
        "maghrib" to "Akšam",
        "isha" to "Jacija",
        "ishaiz" to "Jacija IZ",
        "midnight" to "Polovina noći",
        "lastthird" to "Zadnja trećina noći",
    )

    private const val FAJR_ANGLE = 14.6
    private const val ISHA_ANGLE = 14.6
    private const val ISHA_IZ_ANGLE = 16.0
    private const val IMSAK_MIN = 10.0

    // ---- degree math (DMath) ----
    private fun dtr(d: Double) = d * PI / 180
    private fun rtd(r: Double) = r * 180 / PI
    private fun dsin(d: Double) = sin(dtr(d))
    private fun dcos(d: Double) = cos(dtr(d))
    private fun dtan(d: Double) = tan(dtr(d))
    private fun darcsin(x: Double) = rtd(asin(x))
    private fun darccos(x: Double) = rtd(acos(x))
    private fun darccot(x: Double) = rtd(atan(1 / x))
    private fun darctan2(y: Double, x: Double) = rtd(atan2(y, x))
    private fun fix(a: Double, b: Double): Double { val r = a - b * floor(a / b); return if (r < 0) r + b else r }
    private fun fixAngle(a: Double) = fix(a, 360.0)
    private fun fixHour(a: Double) = fix(a, 24.0)
    private fun timeDiff(t1: Double, t2: Double) = fixHour(t2 - t1)

    private fun julianDay(year0: Int, month0: Int, day: Int): Double {
        var year = year0; var month = month0
        if (month <= 2) { year--; month += 12 }
        val a = floor(year / 100.0)
        val b = 2 - a + floor(a / 4)
        return floor(365.25 * (year + 4716)) + floor(30.6001 * (month + 1)) + day + b - 1524.5
    }

    /** Sun position helpers bound to one place and date. */
    private class Sun(private val lat: Double, private val jDate: Double) {
        private fun parts(time: Double): DoubleArray {
            val d = jDate + time - 2451545
            val g = fixAngle(357.529 + 0.98560028 * d)
            val q = fixAngle(280.459 + 0.98564736 * d)
            val l = fixAngle(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g))
            val e = 23.439 - 0.00000036 * d
            return doubleArrayOf(q, l, e)
        }

        fun midDay(time: Double): Double {
            val (q, l, e) = parts(time)
            val ra = darctan2(dcos(e) * dsin(l), dcos(l)) / 15
            val eqt = q / 15 - fixHour(ra)
            return fixHour(12 - eqt)
        }

        fun declination(time: Double): Double {
            val (_, l, e) = parts(time)
            return darcsin(dsin(e) * dsin(l))
        }

        fun angleTime(angle: Double, time: Double, ccw: Boolean = false): Double {
            val decl = declination(time)
            val noon = midDay(time)
            val t = (1.0 / 15) * darccos((-dsin(angle) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat)))
            return noon + if (ccw) -t else t
        }

        fun asrTime(factor: Double, time: Double): Double {
            val decl = declination(time)
            val angle = -darccot(factor + dtan(abs(lat - decl)))
            return angleTime(angle, time)
        }
    }

    /** UTC offset in hours of [zone] on [date] (DST included). */
    fun offsetHours(zone: ZoneId, date: LocalDate): Double =
        zone.rules.getOffset(date.atTime(12, 0)).totalSeconds / 3600.0

    fun compute(lat: Double, lng: Double, zone: ZoneId, date: LocalDate): Day =
        compute(lat, lng, offsetHours(zone, date), date)

    fun compute(lat: Double, lng: Double, tz: Double, date: LocalDate): Day {
        val jDate = julianDay(date.year, date.monthValue, date.dayOfMonth) - lng / (15 * 24)
        val sun = Sun(lat, jDate)
        val riseSet = 0.833   // + 0.0347 * sqrt(elevation), elevation = 0
        val adj = tz - lng / 15

        // first pass (initial guesses as day portions), then shift to local time
        var fajr = sun.angleTime(FAJR_ANGLE, 5 / 24.0, true) + adj
        val sunrise = sun.angleTime(riseSet, 6 / 24.0, true) + adj
        val dhuhr = sun.midDay(12 / 24.0) + adj
        val asr = sun.asrTime(1.0, 13 / 24.0) + adj
        val sunset = sun.angleTime(riseSet, 18 / 24.0) + adj
        var maghrib = sun.angleTime(0.0, 18 / 24.0) + adj
        var isha = sun.angleTime(ISHA_ANGLE, 18 / 24.0) + adj
        var ishaIz = sun.angleTime(ISHA_IZ_ANGLE, 18 / 24.0) + adj

        // high latitudes: NightMiddle
        val night = timeDiff(sunset, sunrise)
        fun adjustHL(time: Double, base: Double, ccw: Boolean): Double {
            val portion = night / 2
            val diff = if (ccw) timeDiff(time, base) else timeDiff(base, time)
            return if (time.isNaN() || diff > portion) base + (if (ccw) -portion else portion) else time
        }
        fajr = adjustHL(fajr, sunrise, true)
        isha = adjustHL(isha, sunset, false)
        ishaIz = adjustHL(ishaIz, sunset, false)
        maghrib = adjustHL(maghrib, sunset, false)
        maghrib = sunset + 0.0                      // maghrib = '0 min' after sunset
        @Suppress("UNUSED_VARIABLE") val imsak = fajr - IMSAK_MIN / 60

        val midnight = sunset + timeDiff(sunset, fajr) / 2
        val lastThird = maghrib + (2.0 / 3) * timeDiff(maghrib, fajr)

        val raw = mapOf(
            "fajr" to fajr, "sunrise" to sunrise, "dhuhr" to dhuhr, "asr" to asr,
            "maghrib" to maghrib, "isha" to isha, "ishaiz" to ishaIz,
            "midnight" to midnight, "lastthird" to lastThird,
        )
        val times = LABELS.map { (k, label) -> Time(k, label, toMinutes(raw.getValue(k))) }

        // Sabah IZ: fajr at 18°, NightMiddle limit, + 15 min
        val sunriseF = sun.angleTime(0.833, 6 / 24.0, true) + adj
        val sunsetF = sun.angleTime(0.833, 18 / 24.0) + adj
        var fajr18 = sun.angleTime(18.0, 5 / 24.0, true) + adj
        val portion = 0.5 * fixHour(sunriseF - sunsetF)
        if (fajr18.isNaN() || fixHour(sunriseF - fajr18) > portion) fajr18 = sunriseF - portion
        val sabahIZ = Time("sabahiz", "Sabah IZ", toMinutes(fajr18 + 15.0 / 60))

        val mg = times.first { it.key == "maghrib" }.minutes
        val jacijaIZ = Time("jacijaiz", "Jacija IZ", mg?.let { (it + 126) % 1440 })

        return Day(date, times, sabahIZ, jacijaIZ)
    }

    /** Same rounding as PrayTimes.fmt: nearest minute, wrapped into 0..24 h. */
    private fun toMinutes(time: Double): Int? {
        if (time.isNaN()) return null
        val t = fixHour(time + 0.5 / 60)
        val h = floor(t).toInt()
        val m = floor((t - h) * 60).toInt()
        return h * 60 + m
    }
}
