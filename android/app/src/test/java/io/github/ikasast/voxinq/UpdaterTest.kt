package io.github.ikasast.voxinq

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpdaterTest {
    @Test
    fun buildsTheReleaseAssetForAVersion() {
        assertEquals(
            "https://github.com/ikasast/voxinq-meeting/releases/download/v4.0.0-beta.3/voxinq-4.0.0-beta.3.apk",
            Updater.apkUrl("4.0.0-beta.3"),
        )
        assertEquals(
            "https://github.com/ikasast/voxinq-meeting/releases/download/v4.0.0/voxinq-4.0.0.apk",
            Updater.apkUrl("4.0.0"),
        )
    }

    @Test
    fun refusesAnythingThatIsNotAVersion() {
        // The address is built here from a version, never taken from the page.
        assertNull(Updater.apkUrl("4.0.0/../../evil"))
        assertNull(Updater.apkUrl("https://example.com/x.apk"))
        assertNull(Updater.apkUrl(""))
        assertNull(Updater.apkUrl("4.0"))
    }
}
