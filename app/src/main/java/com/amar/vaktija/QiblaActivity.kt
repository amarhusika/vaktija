package com.amar.vaktija

import android.app.Activity
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.view.HapticFeedbackConstants
import android.view.View
import android.widget.TextView
import java.util.Locale
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/** Qibla compass. Sensors run only while this screen is visible. */
class QiblaActivity : Activity(), SensorEventListener {

    private lateinit var compass: CompassView
    private lateinit var angle: TextView
    private lateinit var hint: TextView
    private lateinit var accuracy: View
    private lateinit var sm: SensorManager
    private var rotation: Sensor? = null
    private var accel: Sensor? = null
    private var magnet: Sensor? = null

    private val gravity = FloatArray(3)
    private val geomag = FloatArray(3)
    private var hasG = false
    private var hasM = false
    private val rot = FloatArray(9)
    private val orient = FloatArray(3)
    private var declination = 0f
    private var qibla = 0f
    private var smoothed = Float.NaN
    private var wasAligned = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_qibla)
        Ui.edgeToEdge(this, findViewById(R.id.root), findViewById(R.id.root))
        findViewById<View>(R.id.back).setOnClickListener { finish() }
        compass = findViewById(R.id.compass)
        angle = findViewById(R.id.angle)
        hint = findViewById(R.id.hint)
        accuracy = findViewById(R.id.accuracy)

        val c = Prefs.city(this)
        qibla = bearing(c.lat, c.lng, KAABA_LAT, KAABA_LNG).toFloat()
        declination = GeomagneticField(c.lat.toFloat(), c.lng.toFloat(), 0f, System.currentTimeMillis()).declination
        compass.qibla = qibla
        val km = Loc.distanceKm(c.lat, c.lng, KAABA_LAT, KAABA_LNG).roundToInt()
        findViewById<TextView>(R.id.info1).text = "Kibla: ${qibla.roundToInt()}° od sjevera (${cardinal(qibla)})"
        findViewById<TextView>(R.id.info2).text = "Do Kabe: ${String.format(Locale.GERMANY, "%,d", km)} km"
        findViewById<TextView>(R.id.info3).text = "Lokacija: ${c.name}"

        sm = getSystemService(SensorManager::class.java)
        rotation = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        magnet = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
        if (rotation == null && (accel == null || magnet == null)) {
            hint.text = "Telefon nema kompas. Kibla je ${qibla.roundToInt()}° od sjevera."
        }
    }

    override fun onResume() {
        super.onResume()
        if (rotation != null) {
            sm.registerListener(this, rotation, SensorManager.SENSOR_DELAY_UI)
            magnet?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }   // only for the accuracy warning
        } else {
            accel?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
            magnet?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
        }
    }

    override fun onPause() {
        sm.unregisterListener(this)
        super.onPause()
    }

    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR -> SensorManager.getRotationMatrixFromVector(rot, e.values)
            Sensor.TYPE_ACCELEROMETER -> {
                for (i in 0..2) gravity[i] = 0.85f * gravity[i] + 0.15f * e.values[i]
                hasG = true
                if (rotation != null || !hasM || !SensorManager.getRotationMatrix(rot, null, gravity, geomag)) return
            }
            Sensor.TYPE_MAGNETIC_FIELD -> {
                if (rotation != null) return
                for (i in 0..2) geomag[i] = 0.85f * geomag[i] + 0.15f * e.values[i]
                hasM = true
                if (!hasG || !SensorManager.getRotationMatrix(rot, null, gravity, geomag)) return
            }
            else -> return
        }
        SensorManager.getOrientation(rot, orient)
        val az = (Math.toDegrees(orient[0].toDouble()).toFloat() + declination + 360f) % 360f
        smoothed = if (smoothed.isNaN()) az else smooth(smoothed, az, 0.15f)
        compass.heading = smoothed
        angle.text = "${smoothed.roundToInt() % 360}°"

        val diff = ((qibla - smoothed + 540f) % 360f) - 180f
        val aligned = abs(diff) < 3f
        compass.aligned = aligned
        if (aligned && !wasAligned) {
            compass.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
        }
        wasAligned = aligned
        hint.setTextColor(getColor(if (aligned) R.color.text else R.color.text2))
        hint.text = when {
            aligned -> "✓ Okrenuti ste prema kibli"
            diff > 0 -> "Okrenite se desno ${abs(diff).roundToInt()}°"
            else -> "Okrenite se lijevo ${abs(diff).roundToInt()}°"
        }
    }

    override fun onAccuracyChanged(sensor: Sensor, acc: Int) {
        if (sensor.type == Sensor.TYPE_MAGNETIC_FIELD) {
            accuracy.visibility = if (acc <= SensorManager.SENSOR_STATUS_ACCURACY_LOW) View.VISIBLE else View.GONE
        }
    }

    private fun smooth(from: Float, to: Float, a: Float): Float {
        val d = ((to - from + 540f) % 360f) - 180f
        return (from + d * a + 360f) % 360f
    }

    companion object {
        const val KAABA_LAT = 21.422487
        const val KAABA_LNG = 39.826206

        fun bearing(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
            val f1 = Math.toRadians(lat1); val f2 = Math.toRadians(lat2); val dl = Math.toRadians(lng2 - lng1)
            val y = sin(dl) * cos(f2)
            val x = cos(f1) * sin(f2) - sin(f1) * cos(f2) * cos(dl)
            return (Math.toDegrees(atan2(y, x)) + 360) % 360
        }

        fun cardinal(deg: Float) = arrayOf("sjever", "sjeveroistok", "istok", "jugoistok", "jug", "jugozapad", "zapad", "sjeverozapad")[(((deg + 22.5f) / 45).toInt()) % 8]
    }
}
