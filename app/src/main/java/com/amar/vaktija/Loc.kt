package com.amar.vaktija

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Location on demand only (no background tracking).
 * Coarse network location is enough for prayer times and qibla and costs almost no battery.
 */
object Loc {

    fun has(ctx: Context) =
        ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun lm(ctx: Context) = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    /** Last fix any app obtained – free, no radio use. */
    @SuppressLint("MissingPermission")
    fun lastKnown(ctx: Context): Location? {
        if (!has(ctx)) return null
        val lm = lm(ctx)
        return lm.getProviders(true).mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
            .maxByOrNull { it.time }
    }

    /** One fresh fix (network first), then stops. Falls back to the last known fix after 15 s. */
    @SuppressLint("MissingPermission")
    fun current(ctx: Context, callback: (Location?) -> Unit) {
        if (!has(ctx)) { callback(null); return }
        val lm = lm(ctx)
        val enabled = lm.getProviders(true)
        val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).firstOrNull { it in enabled }
        if (provider == null) { callback(lastKnown(ctx)); return }

        val handler = Handler(Looper.getMainLooper())
        var done = false
        var listener: LocationListener? = null
        fun finish(l: Location?) {
            if (done) return
            done = true
            handler.removeCallbacksAndMessages(null)
            listener?.let { lm.removeUpdates(it) }
            callback(l ?: lastKnown(ctx))
        }
        handler.postDelayed({ finish(null) }, 15_000)

        if (Build.VERSION.SDK_INT >= 30) {
            lm.getCurrentLocation(provider, null, ctx.mainExecutor) { finish(it) }
        } else {
            val l = object : LocationListener {
                override fun onLocationChanged(location: Location) = finish(location)
                override fun onProviderEnabled(provider: String) {}
                override fun onProviderDisabled(provider: String) {}
                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            }
            listener = l
            @Suppress("DEPRECATION")
            lm.requestSingleUpdate(provider, l, Looper.getMainLooper())
        }
    }

    fun distanceKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = Math::toRadians
        val h = sin(r(lat2 - lat1) / 2).pow(2) + cos(r(lat1)) * cos(r(lat2)) * sin(r(lng2 - lng1) / 2).pow(2)
        return 2 * 6371.0 * asin(sqrt(h.coerceAtMost(1.0)))
    }
}
